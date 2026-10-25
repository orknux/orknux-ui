import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorView } from '@tiptap/pm/view';

/**
 * Pages, drawn: the document flowing onto A4 or Letter sheets as a word
 * processor shows it, with no pagination library.
 *
 * TipTap's own pagination is a paid Pro extension, and the free ones change the
 * schema - a `page` node around the content - which would put the layout into
 * the stored document and every model's Markdown. So the document stays one
 * flow and the pages are drawn behind it: after every change the blocks are
 * measured, and where a block would cross the foot of a page a spacer widget is
 * put before it, as tall as the rest of that page, its bottom margin, the gap
 * between sheets and the next one's top margin. A page break node does the
 * same for the block after it. Spacers are decorations, so they are never in
 * the document, never in its history and never sent anywhere.
 *
 * The unit that moves is a top-level block, or an item of a list or a quote at
 * the top level, so a long list breaks between its items. A block taller than
 * a page - a large table - runs across the gap rather than being cut.
 */
export interface PageGeometry {
  /** The sheet, in CSS pixels. */
  width: number;
  height: number;
  /** The white round the text, each side. */
  margin: number;
  /** The space between two sheets on the screen. */
  gap: number;
}

export const documentPagesKey = new PluginKey<DecorationSet>('documentPages');

/** Millimetres as CSS pixels: the 96 to the inch a browser draws at. */
export const mmToPx = (mm: number) => (mm * 96) / 25.4;

export interface DocumentPagesOptions {
  geometry: () => PageGeometry;
  /** Told how many pages the document now takes, whenever that changes. */
  onPages: (count: number) => void;
}

interface Gap {
  pos: number;
  height: number;
}

/** Where the blocks that may move to a new page are, in document order, with their DOM. */
function units(view: EditorView): { pos: number; dom: HTMLElement; breaks: boolean }[] {
  const found: { pos: number; dom: HTMLElement; breaks: boolean }[] = [];
  view.state.doc.forEach((node, offset) => {
    const dom = view.nodeDOM(offset);
    if (!(dom instanceof HTMLElement)) return;
    const splits = (node.type.name === 'bulletList' || node.type.name === 'orderedList' || node.type.name === 'blockquote') && node.childCount > 1;
    if (!splits) {
      found.push({ pos: offset, dom, breaks: node.type.name === 'pageBreak' });
      return;
    }
    node.forEach((child, inner) => {
      const pos = offset + 1 + inner;
      const childDom = view.nodeDOM(pos);
      if (childDom instanceof HTMLElement) found.push({ pos, dom: childDom, breaks: false });
      void child;
    });
  });
  return found;
}

/** The spacers the blocks need, worked out from where they stand without any. */
function layout(view: EditorView, geometry: PageGeometry): { gaps: Gap[]; pages: number } {
  const origin = view.dom.getBoundingClientRect().top;
  const spacers = [...view.dom.querySelectorAll<HTMLElement>('[data-page-gap]')].map((one) => {
    const box = one.getBoundingClientRect();
    return { top: box.top - origin, height: box.height };
  });
  const stride = geometry.height + geometry.gap;
  const usable = geometry.height - 2 * geometry.margin;
  // In the editor's own coordinates the first page's text starts at 0.
  const contentTop = (page: number) => page * stride;
  const contentBottom = (page: number) => page * stride + usable;

  const gaps: Gap[] = [];
  let page = 0;
  let shift = 0;
  let breakPending = false;
  for (const unit of units(view)) {
    const box = unit.dom.getBoundingClientRect();
    const drawn = box.top - origin;
    const natural = drawn - spacers.filter((one) => one.top < drawn - 0.5).reduce((sum, one) => sum + one.height, 0);
    let top = natural + shift;
    const height = box.height;
    if (unit.breaks) {
      breakPending = true;
      continue;
    }
    let target = page;
    if (breakPending) target = page + 1;
    // Past the foot of the page it is on: onto the page whose text it falls in, or the next.
    while (top >= contentBottom(target)) target += 1;
    if (target === page && top + height > contentBottom(page) && top > contentTop(page) + 1 && height <= usable) target = page + 1;
    if (target !== page || top < contentTop(target) - 0.5) {
      const move = contentTop(target) - top;
      if (move > 0.5) {
        gaps.push({ pos: unit.pos, height: Math.round(move) });
        shift += Math.round(move);
        top += Math.round(move);
      }
      page = target;
    }
    breakPending = false;
    // A block taller than a page runs on: what follows starts after it.
    while (top + height > contentBottom(page) + 0.5 && height > usable) page += 1;
  }
  return { gaps, pages: page + 1 + (breakPending ? 1 : 0) };
}

function decorations(state: EditorState, gaps: Gap[]): DecorationSet {
  return DecorationSet.create(
    state.doc,
    gaps.map((gap) =>
      Decoration.widget(
        gap.pos,
        () => {
          const spacer = document.createElement('div');
          spacer.setAttribute('data-page-gap', '');
          spacer.setAttribute('contenteditable', 'false');
          spacer.style.height = `${gap.height}px`;
          return spacer;
        },
        { side: -1, key: `gap-${gap.pos}-${gap.height}`, ignoreSelection: true },
      ),
    ),
  );
}

export const DocumentPages = Extension.create<DocumentPagesOptions>({
  name: 'documentPages',

  addOptions() {
    return { geometry: () => ({ width: 794, height: 1123, margin: 94, gap: 24 }), onPages: () => undefined };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    let held: Gap[] = [];
    let pages = 1;
    return [
      new Plugin<DecorationSet>({
        key: documentPagesKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, old, _before, after) {
            const laid = tr.getMeta(documentPagesKey) as Gap[] | undefined;
            if (laid !== undefined) return decorations(after, laid);
            return old.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations: (state) => documentPagesKey.getState(state),
        },
        view(view) {
          let frame = 0;
          const measure = () => {
            frame = 0;
            if (view.isDestroyed) return;
            const { gaps, pages: count } = layout(view, options.geometry());
            const same = gaps.length === held.length && gaps.every((gap, at) => gap.pos === held[at].pos && Math.abs(gap.height - held[at].height) <= 1);
            if (!same) {
              held = gaps;
              view.dispatch(view.state.tr.setMeta(documentPagesKey, gaps).setMeta('addToHistory', false));
            }
            if (count !== pages) {
              pages = count;
              options.onPages(count);
            }
          };
          const schedule = () => {
            if (frame === 0) frame = window.requestAnimationFrame(measure);
          };
          // Pictures change height when they load; the window changes the text's width.
          const loaded = (event: Event) => {
            if ((event.target as HTMLElement | null)?.tagName === 'IMG') schedule();
          };
          view.dom.addEventListener('load', loaded, true);
          view.dom.addEventListener(RELAYOUT, schedule);
          const resized = new ResizeObserver(schedule);
          resized.observe(view.dom);
          schedule();
          options.onPages(pages);
          return {
            update(_view, before) {
              if (!before.doc.eq(view.state.doc) || documentPagesKey.getState(before) === undefined) schedule();
            },
            destroy() {
              if (frame !== 0) window.cancelAnimationFrame(frame);
              view.dom.removeEventListener('load', loaded, true);
              view.dom.removeEventListener(RELAYOUT, schedule);
              resized.disconnect();
            },
          };
        },
      }),
    ];
  },
});

const RELAYOUT = 'documentpages-relayout';

/** Asks the pages to be laid out again, after something outside the document changed their size. */
export function relayPages(view: EditorView) {
  view.dom.dispatchEvent(new Event(RELAYOUT));
}
