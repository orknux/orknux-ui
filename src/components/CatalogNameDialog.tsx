import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import styles from './Dialog.module.css';
import { t } from '../i18n';

export interface CatalogNameDialogProps {
  open: boolean;
  title: string;
  /** One short line under the title saying what is being named. */
  message: string;
  submitLabel: string;
  /** The name to start from; empty when a new catalog is being made. */
  initialName?: string;
  onClose: () => void;
  /** Throwing shows the reason in the dialog and leaves it open. */
  onSubmit: (name: string) => Promise<void>;
}

/**
 * Asks for a catalog's name, and nothing else.
 *
 * A catalog is a name and its contents — there is no description to give it —
 * so this is the whole of the create and rename step the Variables and Skills
 * pages used a browser prompt for. The app has its own dialog everywhere else a
 * thing is named, and this is that dialog for the one place it was missing.
 */
export function CatalogNameDialog({
  open,
  title,
  message,
  submitLabel,
  initialName = '',
  onClose,
  onSubmit,
}: CatalogNameDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [name, setName] = useState(initialName);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;

    if (open && !dialog.open) {
      setName(initialName);
      setError(null);
      setSubmitting(false);
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, initialName]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === '' || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(trimmed);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('That did not work.'));
      setSubmitting(false);
    }
  }

  return (
    <dialog ref={dialogRef} className={styles.dialog} onCancel={onClose} onClose={onClose}>
      <form className={styles.body} onSubmit={handleSubmit}>
        <header className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
        </header>

        <p className={styles.dialogMessage}>{message}</p>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="catalog-name">
            {t('Name')}
          </label>
          <div className={styles.inputWrapper}>
            <input
              id="catalog-name"
              name="name"
              className={styles.input}
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
              required
            />
          </div>
        </div>

        {error !== null && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <div className={styles.actions}>
          <button type="button" className={styles.ghost} onClick={onClose} disabled={submitting}>
            {t('Cancel')}
          </button>
          <button type="submit" className={styles.filled} disabled={name.trim() === '' || submitting}>
            {submitting ? t('Saving…') : submitLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
