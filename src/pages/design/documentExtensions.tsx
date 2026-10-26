import { Extension, Mark, Node, mergeAttributes } from '@tiptap/core';
import type { AnyExtension, Editor } from '@tiptap/core';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { Color, TextStyle } from '@tiptap/extension-text-style';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorState } from '@tiptap/pm/state';
import type { Node as PmNode } from '@tiptap/pm/model';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import type { ReactNodeViewProps } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { common, createLowlight } from 'lowlight';
import { search } from 'prosemirror-search';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PointerEvent as ReactPointerEvent } from 'react';

import { fetchDocument } from '../../api/documents';
import type { DesignDocument } from '../../api/documents';
import fileTextIcon from '../../assets/file-text.svg';
import { t, tf } from '../../i18n';
import { DocumentPages } from './documentPages';
import type { PageGeometry } from './documentPages';
import styles from './DocumentPaper.module.css';

/**
 * The editor's vocabulary: what a document can hold, and the parts of the
 * editor that are not the document - pages, the inline suggestion, grammar
 * marks, find. The server checks a saved document against the same node names
 * (`DocumentContent`), so a node added here is a node added there.
 */

/** highlight.js's common languages: every one the picker offers is among them. */
export const lowlight = createLowlight(common);

/** The languages a code block's picker offers, by highlight.js's names; the server's exports know the same. */
export const CODE_LANGUAGES: { value: string; label: string }[] = [
  { value: 'plaintext', label: 'Plain text' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'java', label: 'Java' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'python', label: 'Python' },
  { value: 'sql', label: 'SQL' },
  { value: 'json', label: 'JSON' },
  { value: 'yaml', label: 'YAML' },
  { value: 'bash', label: 'Bash' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
  { value: 'csharp', label: 'C#' },
  { value: 'xml', label: 'XML' },
  { value: 'markdown', label: 'Markdown' },
];

/** A code block, with its language picked above it and a copy of its text a press away. */
function CodeBlockView({ node, updateAttributes, editor }: ReactNodeViewProps) {
  const [copied, setCopied] = useState(false);
  const language = (node.attrs.language as string | null) ?? 'plaintext';
  return (
    <NodeViewWrapper className={styles.codeBlock} data-testid="document-code-block" data-language={language}>
      <div className={styles.codeBar} contentEditable={false}>
        <select
          className={styles.codeLanguage}
          value={CODE_LANGUAGES.some((one) => one.value === language) ? language : 'plaintext'}
          onChange={(event) => updateAttributes({ language: event.target.value })}
          disabled={!editor.isEditable}
          aria-label={t('Language')}
          data-testid="document-code-language"
        >
          {CODE_LANGUAGES.map((one) => (
            <option key={one.value} value={one.value}>
              {one.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={styles.codeCopy}
          onClick={() => {
            void navigator.clipboard?.writeText(node.textContent).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            });
          }}
          data-testid="document-code-copy"
        >
          {copied ? t('Copied') : t('Copy')}
        </button>
      </div>
      <pre className={styles.codePre}>
        {/* NodeViewContent writes white-space: pre-wrap on itself unless told otherwise; code scrolls, it does not wrap. */}
        <NodeViewContent<'code'> as="code" className={`hljs language-${language}`} style={{ whiteSpace: 'pre' }} />
      </pre>
    </NodeViewWrapper>
  );
}

/** Where a picture's bytes are, for whoever may see the workspace: the server says the same of a saved one. */
export function documentImageSource(workspaceId: string, artifact: string): string {
  return `/api/workspaces/${workspaceId}/document-images/${artifact}`;
}

/** A picture: drawn at a width in percent of the page's text, dragged wider or narrower, with a caption under it. */
function ImageView({ node, updateAttributes, selected, editor }: ReactNodeViewProps) {
  const figure = useRef<HTMLElement | null>(null);
  const width = (node.attrs.width as number | null) ?? null;
  const [dragging, setDragging] = useState<number | null>(null);
  const shown = dragging ?? width;

  function down(event: ReactPointerEvent<HTMLSpanElement>) {
    event.preventDefault();
    event.stopPropagation();
    const holder = figure.current?.parentElement?.closest('.ProseMirror') as HTMLElement | null;
    const room = holder?.getBoundingClientRect().width ?? 600;
    const left = figure.current?.querySelector('img')?.getBoundingClientRect().left ?? 0;
    const move = (moving: PointerEvent) => setDragging(Math.max(5, Math.min(100, Math.round(((moving.clientX - left) / room) * 100))));
    const up = (ending: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const done = Math.max(5, Math.min(100, Math.round(((ending.clientX - left) / room) * 100)));
      setDragging(null);
      updateAttributes({ width: done });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  return (
    <NodeViewWrapper
      as="figure"
      ref={figure}
      className={`${styles.figure} ${selected ? styles.figureSelected : ''}`}
      data-testid="document-image"
      data-artifact={node.attrs.artifact as string}
      data-drag-handle=""
    >
      <span className={styles.pictureFrame} style={shown === null ? undefined : { width: `${shown}%` }}>
        <img src={node.attrs.src as string} alt={(node.attrs.alt as string | null) ?? ''} className={styles.picture} draggable={false} />
        {editor.isEditable && (
          <span
            className={styles.resize}
            onPointerDown={down}
            role="separator"
            aria-label={t('Resize the picture')}
            title={t('Resize the picture')}
            data-testid="document-image-resize"
          />
        )}
      </span>
      {editor.isEditable ? (
        <input
          className={styles.captionInput}
          value={(node.attrs.caption as string | null) ?? ''}
          placeholder={t('Caption')}
          onChange={(event) => updateAttributes({ caption: event.target.value === '' ? null : event.target.value })}
          onKeyDown={(event) => event.stopPropagation()}
          aria-label={t('Caption')}
          data-testid="document-image-caption"
        />
      ) : (
        (node.attrs.caption as string | null) && <figcaption className={styles.caption}>{node.attrs.caption as string}</figcaption>
      )}
    </NodeViewWrapper>
  );
}

const DocumentImage = Node.create({
  name: 'image',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      artifact: { default: null },
      src: { default: null },
      alt: { default: null },
      caption: { default: null },
      width: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'figure[data-artifact]', getAttrs: (dom) => ({ artifact: (dom as HTMLElement).getAttribute('data-artifact') }) }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['figure', mergeAttributes({ 'data-artifact': HTMLAttributes.artifact }), ['img', { src: HTMLAttributes.src, alt: HTMLAttributes.alt ?? '' }]];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageView, {
      // The caption is typed in its own box, which the editor leaves alone.
      stopEvent: ({ event }) => (event.target as HTMLElement | null)?.tagName === 'INPUT',
    });
  },
});

/** A document this one links to, once each, in the order first linked. */
export interface LinkedDocument {
  id: string;
  name: string;
  missing: boolean;
}

/** The documents a document links to, read off its own links, each named as the server last named it. */
export function linksOf(doc: PmNode): LinkedDocument[] {
  const seen = new Map<string, LinkedDocument>();
  doc.descendants((node) => {
    if (node.type.name !== 'documentLink') return;
    const id = String(node.attrs.document ?? '');
    if (id === '' || seen.has(id)) return;
    seen.set(id, {
      id,
      name: (node.attrs.name as string | null) || tf('Document {id}', { id }),
      missing: node.attrs.missing === true,
    });
  });
  return [...seen.values()];
}

/** What a link to another document is followed with: the page it opens, from the editor or from the view. */
export interface DocumentLinkOptions {
  href: (id: string, editing: boolean) => string;
  open: (id: string, editing: boolean) => void;
}

/**
 * A link to another of the workspace's documents, drawn with that document's
 * name. Followed on Ctrl+click while editing - a plain click puts the caret
 * there, as on any link a word processor holds - and on a click in the view.
 */
function DocumentLinkView({ node, editor, extension }: ReactNodeViewProps) {
  const id = String(node.attrs.document ?? '');
  const missing = node.attrs.missing === true;
  const name = (node.attrs.name as string | null) || tf('Document {id}', { id });
  const links = (extension.options as { links?: DocumentLinkOptions }).links;
  const editing = editor.isEditable;
  const anchor = useRef<HTMLAnchorElement>(null);
  const [card, setCard] = useState<{ document: DesignDocument; at: DOMRect; editing: boolean } | null>(null);
  const waiting = useRef<number | null>(null);
  const hide = () => {
    if (waiting.current !== null) window.clearTimeout(waiting.current);
    waiting.current = null;
    setCard(null);
  };
  useEffect(() => hide, []);
  return (
    <NodeViewWrapper as="span" className={styles.documentLinkHolder}>
      <a
        ref={anchor}
        onMouseEnter={() => {
          if (missing || id === '') return;
          waiting.current = window.setTimeout(() => {
            void cardOf(id).then((document) => {
              const at = anchor.current?.getBoundingClientRect();
              if (document !== null && at !== undefined && waiting.current !== null) setCard({ document, at, editing });
            });
          }, CARD_DELAY);
        }}
        onMouseLeave={hide}
        href={missing || links === undefined ? undefined : links.href(id, editing)}
        className={`${styles.documentLink} ${missing ? styles.documentLinkGone : ''}`}
        // The card below says what a live link would; only a link to a deleted document has nothing else to say it.
        title={missing ? t('This document was deleted') : undefined}
        onClick={(event) => {
          event.preventDefault();
          if (missing || links === undefined) return;
          if (editing && !(event.ctrlKey || event.metaKey)) return;
          links.open(id, editing);
        }}
        data-testid="document-doc-link"
        data-document={id}
        data-missing={missing ? '' : undefined}
      >
        {name}
      </a>
      {card !== null &&
        createPortal(
          <span
            className={styles.documentLinkCard}
            style={{ left: card.at.left, top: card.at.bottom + 6 }}
            role="tooltip"
            data-testid="document-link-card"
          >
            <img src={fileTextIcon} alt="" width={14} height={14} className={styles.documentLinkCardIcon} />
            <span className={styles.documentLinkCardText}>
              <span className={styles.documentLinkCardHead}>
                <span className={styles.documentLinkCardName}>{card.document.name}</span>
                <span className={styles.documentLinkCardWhere}>{tf('Document in {catalog}', { catalog: card.document.catalogName })}</span>
              </span>
              {card.document.excerpt !== '' && <span className={styles.documentLinkCardExcerpt}>{card.document.excerpt}</span>}
              {card.editing && <span className={styles.documentLinkCardHow}>{t('Ctrl+click to open')}</span>}
            </span>
          </span>,
          document.body,
        )}
    </NodeViewWrapper>
  );
}

/** How long the pointer rests on a link before its card is shown, in milliseconds: a pass across one shows nothing. */
const CARD_DELAY = 300;

/** Each linked document read once per page, however many links name it. */
const cards = new Map<string, Promise<DesignDocument | null>>();
function cardOf(id: string): Promise<DesignDocument | null> {
  let held = cards.get(id);
  if (held === undefined) {
    held = fetchDocument(id).catch(() => null);
    cards.set(id, held);
  }
  return held;
}

/** A link to another document, by its id; the server puts the document's current name on it. */
export const DocumentLink = Node.create<{ links?: DocumentLinkOptions }>({
  name: 'documentLink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return { links: undefined };
  },

  addAttributes() {
    return {
      document: {
        default: null,
        parseHTML: (element) => Number(element.getAttribute('data-document')) || null,
        renderHTML: (attributes) => ({ 'data-document': String(attributes.document ?? '') }),
      },
      name: {
        default: '',
        parseHTML: (element) => element.textContent ?? '',
        renderHTML: () => ({}),
      },
      // Said by the server of a link whose document is gone; never saved.
      missing: { default: false, rendered: false },
    };
  },

  parseHTML() {
    return [{ tag: 'a[data-document-link]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['a', mergeAttributes(HTMLAttributes, { 'data-document-link': '' }), (node.attrs.name as string) || ''];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DocumentLinkView, { as: 'span' });
  },
});

/** A page break: what follows starts on a new page, in the editor and in every export. */
const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: 'div[data-page-break]' }];
  },

  renderHTML() {
    return ['div', { 'data-page-break': '', class: styles.pageBreak, 'data-testid': 'document-page-break' }];
  },

  addCommands() {
    return {
      setPageBreak:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: 'pageBreak' }),
    };
  },

  addKeyboardShortcuts() {
    return { 'Mod-Enter': () => this.editor.commands.setPageBreak() };
  },
});

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pageBreak: {
      setPageBreak: () => ReturnType;
    };
  }
}

// -- Highlights with a note --------------------------------------------------

/**
 * A highlight with a note written on it: a mark, so it is part of the document
 * and saved with it, carrying the note and an id that tells two highlights
 * apart - a highlight across a bold word is three runs of text, and the id is
 * what makes them one highlight in the side panel and in the note's card. Not
 * inclusive: typing at its edge writes ordinary text, as a word processor's
 * comment does. The server keeps the same two attributes (`DocumentContent`).
 */
export const Note = Mark.create({
  name: 'note',
  inclusive: false,

  addAttributes() {
    return {
      note: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-note') ?? '',
        renderHTML: (attributes) => ({ 'data-note': attributes.note as string }),
      },
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-note-id'),
        renderHTML: (attributes) => (attributes.id ? { 'data-note-id': attributes.id as string } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'mark[data-note-id]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['mark', mergeAttributes(HTMLAttributes, { class: styles.note, 'data-testid': 'document-note' }), 0];
  },
});

/** One highlight in the document: its words, its note, and where it is. */
export interface Highlight {
  id: string;
  note: string;
  text: string;
  from: number;
  to: number;
}

/** Every highlight in the document, in reading order, each once however many runs of text it spans. */
export function highlightsOf(doc: PmNode): Highlight[] {
  const found = new Map<string, Highlight>();
  doc.descendants((node, pos) => {
    if (!node.isText) return true;
    const mark = node.marks.find((one) => one.type.name === 'note');
    if (mark === undefined) return false;
    // A highlight saved without an id is told apart by where it starts.
    const id = (mark.attrs.id as string | null) ?? `at-${pos}`;
    const held = found.get(id);
    if (held !== undefined && held.to === pos) {
      held.to = pos + node.nodeSize;
      held.text += node.text ?? '';
    } else if (held === undefined) {
      found.set(id, { id, note: (mark.attrs.note as string | null) ?? '', text: node.text ?? '', from: pos, to: pos + node.nodeSize });
    } else {
      // The same id further on - a highlight split by something that is not text - reads as one, ending there.
      held.text += ` ${node.text ?? ''}`;
      held.to = pos + node.nodeSize;
    }
    return false;
  });
  return [...found.values()];
}

/** A new highlight's id: short, and only letters, digits and dashes, which is what the server keeps. */
export function newNoteId(): string {
  return `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Writes [note] on every run of the highlight [id], as one step undo goes back over. */
export function setNote(editor: Editor, id: string, note: string) {
  const type = editor.schema.marks.note;
  const tr = editor.state.tr;
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText) return true;
    const mark = node.marks.find((one) => one.type === type && one.attrs.id === id);
    if (mark !== undefined) tr.addMark(pos, pos + node.nodeSize, type.create({ ...mark.attrs, note }));
    return false;
  });
  if (tr.docChanged) editor.view.dispatch(tr);
}

/** Takes the highlight [id] off its words, which stay. */
export function removeNote(editor: Editor, id: string) {
  const type = editor.schema.marks.note;
  const tr = editor.state.tr;
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText) return true;
    if (node.marks.some((one) => one.type === type && one.attrs.id === id)) tr.removeMark(pos, pos + node.nodeSize, type);
    return false;
  });
  if (tr.docChanged) editor.view.dispatch(tr);
}

// -- The document's headings, for the outline ---------------------------------

export interface OutlineHeading {
  /** Where the heading node starts. */
  pos: number;
  level: number;
  text: string;
}

export function headingsOf(doc: PmNode): OutlineHeading[] {
  const found: OutlineHeading[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      found.push({ pos, level: (node.attrs.level as number | undefined) ?? 1, text: node.textContent });
      return false;
    }
    // Headings are blocks; nothing inline holds one.
    return !node.isTextblock;
  });
  return found;
}

// -- The inline suggestion ---------------------------------------------------

export const suggestionKey = new PluginKey<{ words: string | null; at: number }>('documentSuggestion');

/**
 * The words the completion model suggests, drawn grey after the caret for Tab
 * to take - the chat composer's suggestion, in a page. The asking is
 * `useInlineCompletion`'s; this only draws what it was given and takes it.
 */
const InlineSuggestion = Extension.create({
  name: 'inlineSuggestion',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: suggestionKey,
        state: {
          init: () => ({ words: null as string | null, at: 0 }),
          apply(tr, held) {
            const given = tr.getMeta(suggestionKey) as { words: string | null; at: number } | undefined;
            if (given !== undefined) return given;
            // Anything typed or moved takes it away: it was for the text as it stood.
            if (tr.docChanged || tr.selectionSet) return { words: null, at: 0 };
            return held;
          },
        },
        props: {
          decorations(state) {
            const held = suggestionKey.getState(state);
            if (held?.words == null || held.at !== state.selection.head) return null;
            return DecorationSet.create(state.doc, [
              Decoration.widget(
                held.at,
                () => {
                  const ghost = document.createElement('span');
                  ghost.className = styles.ghost;
                  ghost.setAttribute('data-testid', 'document-suggestion');
                  ghost.textContent = held.words;
                  return ghost;
                },
                { side: 1, key: `ghost-${held.at}-${held.words}` },
              ),
            ]);
          },
          handleKeyDown(view, event) {
            const held = suggestionKey.getState(view.state);
            if (held?.words == null || held.at !== view.state.selection.head) return false;
            if (event.key === 'Tab' && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
              event.preventDefault();
              view.dispatch(view.state.tr.insertText(held.words, held.at).setMeta(suggestionKey, { words: null, at: 0 }));
              return true;
            }
            if (event.key === 'Escape') {
              view.dispatch(view.state.tr.setMeta(suggestionKey, { words: null, at: 0 }));
              return true;
            }
            return false;
          },
        },
      }),
    ];
  },
});

/** Puts a suggestion after the caret, or takes it away with null. */
export function suggest(editor: Editor, words: string | null) {
  editor.view.dispatch(editor.state.tr.setMeta(suggestionKey, { words, at: editor.state.selection.head }));
}

// -- Grammar -----------------------------------------------------------------

/** One mistake in the document, at document positions. */
export interface GrammarMark {
  from: number;
  to: number;
  message: string;
  replacements: string[];
  rule: string;
  spelling: boolean;
}

export const grammarKey = new PluginKey<{ marks: GrammarMark[]; set: DecorationSet }>('documentGrammar');

export interface GrammarOptions {
  /** A mark was pressed: show what is wrong, where. */
  onPick: (mark: GrammarMark, at: { left: number; top: number; bottom: number }) => void;
}

/** The grammar check's findings, underlined; the asking is the page's. */
const Grammar = Extension.create<GrammarOptions>({
  name: 'documentGrammar',

  addOptions() {
    return { onPick: () => undefined };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    return [
      new Plugin({
        key: grammarKey,
        state: {
          init: () => ({ marks: [] as GrammarMark[], set: DecorationSet.empty }),
          apply(tr, held, _before, after) {
            const given = tr.getMeta(grammarKey) as GrammarMark[] | undefined;
            if (given !== undefined) {
              return {
                marks: given,
                set: DecorationSet.create(
                  after.doc,
                  given
                    .filter((mark) => mark.to <= after.doc.content.size && mark.from < mark.to)
                    .map((mark) =>
                      Decoration.inline(mark.from, mark.to, {
                        class: mark.spelling ? styles.spelling : styles.grammar,
                        'data-testid': 'document-grammar-mark',
                      }),
                    ),
                ),
              };
            }
            if (!tr.docChanged) return held;
            const marks = held.marks
              .map((mark) => ({ ...mark, from: tr.mapping.map(mark.from, 1), to: tr.mapping.map(mark.to, -1) }))
              .filter((mark) => mark.from < mark.to);
            return { marks, set: held.set.map(tr.mapping, tr.doc) };
          },
        },
        props: {
          decorations: (state) => grammarKey.getState(state)?.set,
          handleClick(view, pos) {
            const held = grammarKey.getState(view.state);
            const mark = held?.marks.find((one) => pos >= one.from && pos <= one.to);
            if (mark === undefined) return false;
            const start = view.coordsAtPos(mark.from);
            options.onPick(mark, { left: start.left, top: start.top, bottom: start.bottom });
            return false;
          },
        },
      }),
    ];
  },
});

/** A paragraph's words, and the document position of each, for turning a check's offsets into places. */
export interface Textblock {
  text: string;
  /** The document position of each character of [text]. */
  positions: number[];
  /** Which characters of [text] are an inline item's stand-in - a document link's name - rather than words that can be changed in place. */
  standIns: boolean[];
}

/** Every block of words a grammar check reads: paragraphs and headings, wherever they are, but no code. */
export function textblocks(doc: PmNode): Textblock[] {
  const found: Textblock[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'codeBlock') return false;
    if (!node.isTextblock) return true;
    let text = '';
    const positions: number[] = [];
    const standIns: boolean[] = [];
    node.forEach((child, offset) => {
      if (child.isText) {
        const words = child.text ?? '';
        for (let at = 0; at < words.length; at += 1) {
          positions.push(pos + 1 + offset + at);
          standIns.push(false);
        }
        text += words;
      } else if (child.type.name === 'documentLink') {
        // A link to another document reads as the name the reader sees: as a space it left
        // "see  here" with two, and every link was underlined for repeated whitespace.
        const name = String(child.attrs.name ?? '').trim() || 'document';
        for (let at = 0; at < name.length; at += 1) {
          positions.push(pos + 1 + offset);
          standIns.push(true);
        }
        text += name;
      } else {
        // A line break or anything else inline reads as a space, at its own place.
        positions.push(pos + 1 + offset);
        standIns.push(true);
        text += ' ';
      }
    });
    if (text.trim() !== '') found.push({ text, positions, standIns });
    return false;
  });
  return found;
}

/** Puts the grammar check's findings on the document, replacing what was there. */
export function markGrammar(editor: Editor, marks: GrammarMark[]) {
  editor.view.dispatch(editor.state.tr.setMeta(grammarKey, marks).setMeta('addToHistory', false));
}

/** The text before the caret and after it, as the completion model is shown them. */
export function aroundCaret(state: EditorState): { before: string; after: string; inBlock: string; atEnd: boolean; blockStart: number } {
  const { $head } = state.selection;
  const block = $head.parent;
  const blockStart = $head.start();
  const before = state.doc.textBetween(0, $head.pos, '\n', ' ');
  const after = state.doc.textBetween($head.pos, state.doc.content.size, '\n', ' ');
  const inBlock = block.textBetween(0, $head.parentOffset, undefined, ' ');
  const atEnd = $head.parentOffset === block.content.size;
  return { before, after, inBlock, atEnd, blockStart };
}

/** Every extension a document is edited and viewed with. */
export function documentExtensions(options: {
  geometry: () => PageGeometry;
  onPages: (count: number) => void;
  onGrammarPick: GrammarOptions['onPick'];
  documentLinks?: DocumentLinkOptions;
}): AnyExtension[] {
  return [
    StarterKit.configure({
      codeBlock: false,
      link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' } },
      heading: { levels: [1, 2, 3, 4, 5, 6] },
    }),
    CodeBlockLowlight.extend({
      addNodeView() {
        return ReactNodeViewRenderer(CodeBlockView);
      },
      addKeyboardShortcuts() {
        return {
          ...this.parent?.(),
          // Tab indents inside a block of code, rather than leaving it.
          Tab: () => (this.editor.isActive('codeBlock') ? this.editor.commands.insertContent('    ') : false),
        };
      },
    }).configure({ lowlight, defaultLanguage: 'plaintext' }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    // A colour on the words, and nothing else TextStyle could carry: the server keeps the colour alone.
    TextStyle,
    Color,
    Note,
    DocumentImage,
    DocumentLink.configure({ links: options.documentLinks }),
    PageBreak,
    DocumentPages.configure({ geometry: options.geometry, onPages: options.onPages }),
    InlineSuggestion,
    Grammar.configure({ onPick: options.onGrammarPick }),
    Extension.create({
      name: 'documentFind',
      addProseMirrorPlugins: () => [search()],
    }),
  ];
}
