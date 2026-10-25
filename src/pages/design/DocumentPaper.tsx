import { useEditor, EditorContent } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { DesignDocument } from '../../api/documents';
import { contentOf } from '../../api/documents';
import { documentExtensions } from './documentExtensions';
import type { GrammarMark } from './documentExtensions';
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
}

/**
 * One TipTap editor over a document, for the editor and the view alike: the
 * same extensions, so a page is drawn the same in both and the view is what
 * the editor will save.
 */
export function useDocumentEditor({ document, geometry, editable, onChange, onGrammarPick, onFiles }: DocumentEditorOptions) {
  const [pages, setPages] = useState(1);
  const held = useRef({ geometry, onChange, onGrammarPick, onFiles });
  held.current = { geometry, onChange, onGrammarPick, onFiles };

  const extensions = useMemo(
    () =>
      documentExtensions({
        geometry: () => held.current.geometry,
        onPages: (count) => setPages(count),
        onGrammarPick: (mark, at) => held.current.onGrammarPick?.(mark, at),
      }),
    [],
  );

  const editor = useEditor(
    {
      extensions,
      editable,
      content: document === null ? undefined : contentOf(document),
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

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  // A page of another size changes where every block falls.
  useEffect(() => {
    if (editor !== null && !editor.isDestroyed) relayPages(editor.view);
  }, [editor, geometry.width, geometry.height, geometry.margin]);

  return { editor, pages };
}

export interface DocumentPaperProps {
  editor: Editor | null;
  geometry: PageGeometry;
  pages: number;
}

/**
 * The sheets the document is drawn on: one box per page, as tall and wide as
 * the paper it is set to, behind one flow of text that starts inside the
 * first sheet's margins. `documentPages` keeps the flow's blocks off the gaps.
 */
export function DocumentPaper({ editor, geometry, pages }: DocumentPaperProps) {
  const stride = geometry.height + geometry.gap;
  return (
    <div
      className={styles.paper}
      style={{ width: geometry.width, minHeight: pages * stride - geometry.gap }}
      data-testid="document-paper"
      data-pages={pages}
    >
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
    </div>
  );
}
