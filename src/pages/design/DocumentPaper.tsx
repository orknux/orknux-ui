import { useEditor, EditorContent } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';

import type { DesignDocument } from '../../api/documents';
import { contentOf } from '../../api/documents';
import { documentExtensions } from './documentExtensions';
import type { DocumentLinkOptions, GrammarMark } from './documentExtensions';
import { mmToPx, relayPages } from './documentPages';
import type { PageGeometry } from './documentPages';
import styles from './DocumentPaper.module.css';

/** How far apart two sheets are drawn, in pixels. A layout, not a behaviour. */
const SHEET_GAP = 24;

/** The page a document is set to, in pixels. */
export function geometryOf(document: Pick<DesignDocument, 'page'>): PageGeometry {
  return { width: mmToPx(document.page.widthMm), height: mmToPx(document.page.heightMm), margin: mmToPx(document.page.marginMm), gap: SHEET_GAP };
}

export interface DocumentEditorOptions {
  document: DesignDocument | null;
  geometry: PageGeometry;
  editable: boolean;
  onChange?: (editor: Editor) => void;
  onGrammarPick?: (mark: GrammarMark, at: { left: number; top: number; bottom: number }) => void;
  /** Files pasted or dropped in: kept, and put in where they landed. */
  onFiles?: (files: File[], at: number | null) => void;
  /** Where a link to another document goes, and what following it does. */
  documentLinks?: DocumentLinkOptions;
}

/**
 * One TipTap editor over a document, for the editor and the view alike: the
 * same extensions, so a page is drawn the same in both and the view is what
 * the editor will save.
 */
export function useDocumentEditor({ document, geometry, editable, onChange, onGrammarPick, onFiles, documentLinks }: DocumentEditorOptions) {
  const [pages, setPages] = useState(1);
  const held = useRef({ geometry, onChange, onGrammarPick, onFiles, documentLinks });
  held.current = { geometry, onChange, onGrammarPick, onFiles, documentLinks };

  const extensions = useMemo(
    () =>
      documentExtensions({
        geometry: () => held.current.geometry,
        onPages: (count) => setPages(count),
        onGrammarPick: (mark, at) => held.current.onGrammarPick?.(mark, at),
        documentLinks: {
          href: (id, editing) => held.current.documentLinks?.href(id, editing) ?? '#',
          open: (id, editing) => held.current.documentLinks?.open(id, editing),
        },
      }),
    [],
  );

  /**
   * Which document the editor in hand was made for. A new document makes a
   * new editor, but only after the render that brought it - and in that render
   * the editor is still the old one, empty. Handed out only once it holds the
   * document, so nothing reads the empty one as the document's content.
   */
  const [madeFor, setMadeFor] = useState<string | null>(null);
  const editor = useEditor(
    {
      extensions,
      editable,
      content: document === null ? undefined : contentOf(document),
      onCreate: () => setMadeFor(document?.id ?? null),
      onUpdate: ({ editor: changed }) => held.current.onChange?.(changed),
      editorProps: {
        attributes: { class: styles.prose, 'data-testid': 'document-prose', spellcheck: 'false' },
        handlePaste: (_view, event) => {
          const files = [...(event.clipboardData?.files ?? [])].filter((file) => file.type.startsWith('image/'));
          if (files.length === 0 || held.current.onFiles === undefined) return false;
          event.preventDefault();
          held.current.onFiles(files, null);
          return true;
        },
        handleDrop: (view, event) => {
          const files = [...(event.dataTransfer?.files ?? [])].filter((file) => file.type.startsWith('image/'));
          if (files.length === 0 || held.current.onFiles === undefined) return false;
          event.preventDefault();
          const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? null;
          held.current.onFiles(files, at);
          return true;
        },
      },
    },
    [document?.id],
  );

  const ready = editor !== null && document !== null && madeFor === document.id ? editor : null;

  useEffect(() => {
    ready?.setEditable(editable);
  }, [ready, editable]);

  // A page of another size changes where every block falls.
  useEffect(() => {
    if (ready !== null && !ready.isDestroyed) relayPages(ready.view);
  }, [ready, geometry.width, geometry.height, geometry.margin]);

  return { editor: ready, pages };
}

/** Where in the document a model's change landed: positions in the document as it now is. */
export interface ChangedRange {
  from: number;
  to: number;
}

export interface DocumentPaperProps {
  editor: Editor | null;
  geometry: PageGeometry;
  pages: number;
  /** Drawn while a model writes: centred on the sheet in view, over an outline of where it works. */
  writing?: ReactNode;
  /** What the model has changed so far, marked in place of the whole text. */
  changed?: ChangedRange | null;
}

interface Band {
  top: number;
  height: number;
}

/**
 * The sheets the document is drawn on: one box per page, as tall and wide as
 * the paper it is set to, behind one flow of text that starts inside the
 * first sheet's margins. `documentPages` keeps the flow's blocks off the gaps.
 */
export function DocumentPaper({ editor, geometry, pages, writing, changed }: DocumentPaperProps) {
  const stride = geometry.height + geometry.gap;
  const paper = useRef<HTMLDivElement>(null);
  const [band, setBand] = useState<Band | null>(null);
  const marking = writing !== undefined && writing !== null;

  /**
   * The band the model is working in, measured off what is drawn: the blocks
   * it changed once a save has shown them, the whole text until then - it is
   * not told a selection, so it may write anywhere.
   */
  useLayoutEffect(() => {
    if (!marking || editor === null || editor.isDestroyed || paper.current === null) {
      setBand(null);
      return;
    }
    const origin = paper.current.getBoundingClientRect();
    const prose = editor.view.dom.getBoundingClientRect();
    if (changed === null || changed === undefined) {
      setBand({ top: prose.top - origin.top, height: Math.max(prose.height, 24) });
      return;
    }
    const size = editor.state.doc.content.size;
    const from = editor.view.coordsAtPos(Math.min(Math.max(changed.from, 0), size));
    const to = editor.view.coordsAtPos(Math.min(Math.max(changed.to, 0), size));
    setBand({ top: from.top - origin.top, height: Math.max(to.bottom - from.top, 24) });
  }, [marking, editor, changed, pages, geometry.width, geometry.height, geometry.margin]);

  /**
   * A press on the paper outside the words puts the caret where a word
   * processor would: on the nearest line, or after the last one when below
   * it. The editable flow is only as tall as its text, so an empty document
   * was one line at the top of a sheet that took no other press at all.
   */
  const place = (event: MouseEvent<HTMLDivElement>) => {
    if (editor === null || editor.isDestroyed || !editor.isEditable || event.button !== 0) return;
    const prose = editor.view.dom;
    if (prose.contains(event.target as Node)) return;
    event.preventDefault();
    const box = prose.getBoundingClientRect();
    const left = Math.min(Math.max(event.clientX, box.left + 1), box.right - 1);
    const below = event.clientY >= box.bottom;
    const at = below ? null : editor.view.posAtCoords({ left, top: Math.max(event.clientY, box.top + 1) });
    const pos = at?.pos ?? editor.state.doc.content.size;
    editor.chain().focus().setTextSelection(pos).run();
  };

  return (
    <div
      ref={paper}
      className={styles.paper}
      onMouseDown={place}
      style={{ width: geometry.width, minHeight: pages * stride - geometry.gap }}
      data-testid="document-paper"
      data-pages={pages}
    >
      {/* First, so that sticky has somewhere above the view to pull it down from. */}
      {marking && (
        <div className={styles.writingHold}>
          <div className={styles.writing} data-testid="document-writing">
            {writing}
          </div>
        </div>
      )}
      {Array.from({ length: pages }, (_, at) => (
        <div
          key={at}
          className={styles.sheet}
          style={{ top: at * stride, width: geometry.width, height: geometry.height }}
          data-testid="document-page"
          aria-hidden="true"
        />
      ))}
      <div className={styles.flow} style={{ padding: `${geometry.margin}px ${geometry.margin}px` }}>
        <EditorContent editor={editor} />
      </div>
      {marking && band !== null && (
        <div
          className={styles.writingArea}
          style={{ top: band.top - 6, height: band.height + 12, left: geometry.margin - 8, width: geometry.width - 2 * geometry.margin + 16 }}
          data-testid="document-writing-area"
          data-changed={changed === null || changed === undefined ? undefined : ''}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
