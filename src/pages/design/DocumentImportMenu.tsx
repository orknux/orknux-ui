import type { Editor, JSONContent } from '@tiptap/core';
import { useEffect, useRef, useState } from 'react';

import { importDocumentFile } from '../../api/documents';
import { refuseOversized } from '../../api/uploads';
import form from '../../components/Dialog.module.css';
import { t, tf } from '../../i18n';
import shell from './DesignImageEditorPage.module.css';
import styles from './WireframeExport.module.css';

/** Where an imported file goes: over the whole document, or where the caret is. */
type Into = 'replace' | 'insert';

/** What the file picker offers: what the server reads, and Export's zip of Markdown with its pictures. */
const ACCEPTED = '.pdf,.md,.markdown,.zip,.odt,.docx,.html,.htm,.txt,text/plain,text/markdown,text/html,application/pdf';

/** A picked file as a data URL, which the server's import takes. */
function dataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('unreadable'));
    reader.readAsDataURL(file);
  });
}

/**
 * A document's Import menu, beside Export: a file read on the server into the
 * editor's vocabulary, then put on the page by the editor itself - in place of
 * the whole document, or at the caret. Either way it is one change the editor
 * made, so Undo takes it back and nothing is saved until Save; the pictures it
 * carries are kept as the workspace's pictures, as a pasted one is. The
 * wireframe editor's menu and classes, as Export's are.
 */
export function DocumentImportMenu({
  documentId,
  editor,
  onImported,
}: {
  documentId: string | null;
  editor: Editor | null;
  /** Told when a file is on the page, so the save that keeps it can say it was an import. */
  onImported?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const into = useRef<Into>('replace');
  const picker = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || event.target.closest('[data-testid="document-import-menu"], [data-testid="document-import"]') === null) {
        setOpen(false);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', away);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('mousedown', away);
      window.removeEventListener('keydown', escape);
    };
  }, [open]);

  function choose(where: Into) {
    into.current = where;
    setOpen(false);
    picker.current?.click();
  }

  async function bringIn(file: File) {
    if (documentId === null || editor === null) return;
    setBusy(true);
    setError(null);
    try {
      await refuseOversized([file]);
      const read = await importDocumentFile(documentId, file.name, await dataUrl(file));
      const doc = JSON.parse(read.content) as JSONContent;
      // Through the editor, so it is a step Undo goes back over and a change Save writes.
      if (into.current === 'replace') editor.chain().focus().setContent(doc, { emitUpdate: true }).run();
      else editor.chain().focus().insertContent(doc.content ?? []).run();
      onImported?.();
      if (read.picturesLeftOut > 0) setError(tf('{count} pictures were left out.', { count: read.picturesLeftOut }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not import the file.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={shell.exportMenu}>
      <button
        type="button"
        className={`${form.ghost} ${shell.toolbarButton}`}
        onClick={() => {
          setError(null);
          setOpen((held) => !held);
        }}
        disabled={documentId === null || editor === null || busy}
        aria-haspopup="menu"
        aria-expanded={open}
        title={error ?? t('Read a PDF, Markdown, ODT, DOCX, HTML or text file into the document')}
        data-testid="document-import"
      >
        {busy ? t('Importing…') : t('Import')} ▾
      </button>
      {open && (
        <div className={shell.exportItems} role="menu" data-testid="document-import-menu">
          <button type="button" role="menuitem" onClick={() => choose('replace')} data-testid="document-import-replace">
            {t('Replace the document…')}
          </button>
          <button type="button" role="menuitem" onClick={() => choose('insert')} data-testid="document-import-insert">
            {t('Insert at the caret…')}
          </button>
        </div>
      )}
      <input
        ref={picker}
        type="file"
        accept={ACCEPTED}
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file !== undefined) void bringIn(file);
        }}
        data-testid="document-import-file"
      />
      {error !== null && (
        <span className={styles.error} role="alert" data-testid="document-import-error">
          {error}
        </span>
      )}
    </div>
  );
}
