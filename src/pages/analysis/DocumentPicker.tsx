import { useEffect, useRef, useState } from 'react';

import { fetchResearchDocuments, uploadResearchDocuments } from '../../api/research';
import type { ResearchDocument } from '../../api/research';
import dialog from '../../components/Dialog.module.css';
import { Select } from '../../components/Select';
import { FieldHint } from '../../components/FieldHint';
import { t, tf } from '../../i18n';
import styles from './ResearchPage.module.css';

/** What a picked document is to the research. */
export type DocumentUse = 'INCLUDE' | 'EXCLUDE';

/** A document picked for a research, and whether it is a source or off limits. */
export interface PickedDocument {
  document: ResearchDocument;
  use: DocumentUse;
}

/** How long the typing rests before the workspace is asked. */
const ASK_AFTER_MS = 250;

/** What a research can read, as the server takes it; the file picker offers these first. */
const READABLE = '.txt,.md,.markdown,.csv,.json,.xml,.html,.htm,.pdf,text/*,application/pdf,application/json';

export interface DocumentPickerProps {
  workspaceId: string;
  picked: PickedDocument[];
  onChange: (picked: PickedDocument[]) => void;
}

/**
 * The documents a research reads or avoids, picked rather than listed.
 *
 * A workspace's Artifacts page can hold thousands of files, so the dialog draws
 * only the ones chosen: a box finds documents by a word in their name or what
 * they are, a few at a time, and each one picked becomes a row of its own -
 * included unless somebody says exclude, and removable. A document not yet in
 * the workspace is uploaded here, lands on the Artifacts page like any other,
 * and arrives picked.
 */
export function DocumentPicker({ workspaceId, picked, onChange }: DocumentPickerProps) {
  const [typed, setTyped] = useState('');
  const [open, setOpen] = useState(false);
  const [found, setFound] = useState<ResearchDocument[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const files = useRef<HTMLInputElement>(null);
  const asked = useRef(0);

  useEffect(() => {
    if (!open) return;
    const mine = ++asked.current;
    const waiting = window.setTimeout(() => {
      fetchResearchDocuments(workspaceId, typed)
        .then((answer) => {
          if (mine === asked.current) setFound(answer);
        })
        .catch(() => {
          if (mine === asked.current) setFound([]);
        });
    }, ASK_AFTER_MS);
    return () => window.clearTimeout(waiting);
  }, [open, typed, workspaceId]);

  const chosen = new Set(picked.map((one) => one.document.id));
  const offered = found.filter((one) => !chosen.has(one.id));

  function pick(document: ResearchDocument) {
    if (chosen.has(document.id)) return;
    onChange([...picked, { document, use: 'INCLUDE' }]);
    setTyped('');
  }

  async function upload(list: FileList | null) {
    if (list === null || list.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const made = await uploadResearchDocuments(workspaceId, Array.from(list));
      const fresh = made.filter((one) => !chosen.has(one.id)).map((document) => ({ document, use: 'INCLUDE' as DocumentUse }));
      onChange([...picked, ...fresh]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Those files could not be uploaded.'));
    } finally {
      setUploading(false);
      if (files.current !== null) files.current.value = '';
    }
  }

  return (
    <fieldset className={styles.group} data-documents>
      <legend className={dialog.labelWithHint}>
        <span className={dialog.label}>{t('Documents')}</span>
        <FieldHint label={t('Documents')}>{t("The workspace's documents, or files uploaded here, read as sources alongside what the search finds.")}</FieldHint>
      </legend>

      <div className={styles.withButton}>
        <div className={`${dialog.inputWrapper} ${styles.finder}`}>
          <input
            id="research-document-search"
            className={dialog.input}
            value={typed}
            placeholder={t('Find a document')}
            onChange={(event) => setTyped(event.target.value)}
            onFocus={() => setOpen(true)}
            // Late enough for a click on a result to land first.
            onBlur={() => window.setTimeout(() => setOpen(false), 150)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              if (offered[0] !== undefined) pick(offered[0]);
            }}
            role="combobox"
            aria-expanded={open && offered.length > 0}
            aria-controls="research-document-results"
            autoComplete="off"
          />
          {open && (
            <ul className={styles.results} id="research-document-results" role="listbox" data-document-results>
              {offered.length === 0 ? (
                <li className={styles.resultsNone}>{t('Nothing matches that.')}</li>
              ) : (
                offered.map((document) => (
                  <li key={document.id} role="option" aria-selected={false}>
                    <button
                      type="button"
                      className={styles.result}
                      // Before the box loses focus and closes the list.
                      onMouseDown={(event) => {
                        event.preventDefault();
                        pick(document);
                      }}
                      title={document.description}
                    >
                      {document.name}
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
        <button type="button" className={dialog.ghost} onClick={() => files.current?.click()} disabled={uploading}>
          {uploading ? t('Uploading…') : t('Upload')}
        </button>
        <input
          ref={files}
          type="file"
          multiple
          accept={READABLE}
          hidden
          data-document-upload
          onChange={(event) => void upload(event.target.files)}
        />
      </div>

      {error !== null && (
        <span className={dialog.error} role="alert">
          {error}
        </span>
      )}

      {picked.length > 0 && (
        <ul className={styles.documents} data-picked-documents>
          {picked.map(({ document, use }) => (
            <li key={document.id} className={styles.documentRow} data-picked={document.name}>
              <span className={styles.documentName} title={document.description}>{document.name}</span>
              <span className={styles.documentControls}>
                <Select
                  className={styles.documentUse}
                  value={use}
                  onChange={(value) =>
                    onChange(picked.map((one) => (one.document.id === document.id ? { ...one, use: value as DocumentUse } : one)))
                  }
                  aria-label={document.name}
                >
                  <option value="INCLUDE">{t('Include')}</option>
                  <option value="EXCLUDE">{t('Exclude')}</option>
                </Select>
                <button
                  type="button"
                  className={styles.chipRemove}
                  onClick={() => onChange(picked.filter((one) => one.document.id !== document.id))}
                  aria-label={tf('Remove {name}', { name: document.name })}
                  title={tf('Remove {name}', { name: document.name })}
                >
                  ×
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
