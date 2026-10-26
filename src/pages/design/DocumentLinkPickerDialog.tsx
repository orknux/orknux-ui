import { useEffect, useRef, useState } from 'react';

import { fetchDocuments } from '../../api/documents';
import type { DesignDocument } from '../../api/documents';
import dialog from '../../components/Dialog.module.css';
import { t } from '../../i18n';
import styles from './DocumentLinkPickerDialog.module.css';

export interface DocumentLinkPickerDialogProps {
  open: boolean;
  workspaceId: string;
  /** The document being edited, left off the list: a document does not link to itself. */
  exceptId: string;
  onClose: () => void;
  onPick: (document: DesignDocument) => void;
}

/**
 * Another of the workspace's documents, chosen by name, to put a link to in
 * the one being edited. Asked of the server as the person types, the same
 * search the documents list makes.
 */
export function DocumentLinkPickerDialog({ open, workspaceId, exceptId, onClose, onPick }: DocumentLinkPickerDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<DesignDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const shown = dialogRef.current;
    if (shown === null) return;
    if (open && !shown.open) shown.showModal();
    else if (!open && shown.open) shown.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let left = false;
    const asked = window.setTimeout(() => {
      fetchDocuments(workspaceId, null, search)
        .then((answer) => {
          if (left) return;
          setFound(answer.filter((one) => one.id !== exceptId));
          setError(null);
        })
        .catch((cause) => {
          if (left) return;
          setFound([]);
          setError(cause instanceof Error ? cause.message : t('Could not list the documents.'));
        });
    }, 200);
    return () => {
      left = true;
      window.clearTimeout(asked);
    };
  }, [open, workspaceId, exceptId, search]);

  return (
    <dialog ref={dialogRef} className={`${dialog.dialog} ${styles.picker}`} onCancel={onClose} onClose={onClose} data-testid="document-link-picker">
      <div className={dialog.body}>
        <header className={dialog.header}>
          <h2 className={dialog.title}>{t('Link a document')}</h2>
        </header>
        <div className={dialog.inputWrapper}>
          <input
            className={dialog.input}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('Search')}
            aria-label={t('Search')}
            autoFocus
            data-testid="document-link-picker-search"
          />
        </div>
        {found === null ? (
          <p className={dialog.dialogMessage}>{t('Loading…')}</p>
        ) : found.length === 0 ? (
          <p className={dialog.dialogMessage} data-testid="document-link-picker-none">
            {error ?? t('No documents found.')}
          </p>
        ) : (
          <ul className={styles.list} data-testid="document-link-picker-list">
            {found.map((one) => (
              <li key={one.id}>
                <button
                  type="button"
                  className={styles.item}
                  onClick={() => onPick(one)}
                  title={one.name}
                  data-testid="document-link-picker-item"
                  data-id={one.id}
                >
                  <span className={styles.name}>{one.name}</span>
                  <span className={styles.catalog}>{one.catalogName}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className={dialog.actions}>
          <button type="button" className={dialog.ghost} onClick={onClose}>
            {t('Cancel')}
          </button>
        </div>
      </div>
    </dialog>
  );
}
