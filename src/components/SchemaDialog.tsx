import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import styles from './Dialog.module.css';
import { t } from '../i18n';

export interface SchemaDialogProps {
  open: boolean;
  onClose: () => void;
  /** Makes the object; a refusal thrown here is shown under the form. */
  onSubmit: (name: string, description: string, schema: string) => Promise<void>;
}

/**
 * An object from a JSON Schema somebody pastes: a name for it, and the schema.
 *
 * The schema is read on the server, which knows what a property here can hold
 * and refuses what is not a schema of an object; this only collects it. The
 * box takes the whole document, so a schema with definitions in it reads as
 * one piece.
 */
export function SchemaDialog({ open, onClose, onSubmit }: SchemaDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [schema, setSchema] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open && !dialog.open) {
      setName('');
      setDescription('');
      setSchema('');
      setError(null);
      setSubmitting(false);
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim() === '' || schema.trim() === '' || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(name.trim(), description.trim(), schema);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not create it.'));
      setSubmitting(false);
    }
  }

  return (
    <dialog ref={dialogRef} className={`${styles.dialog} ${styles.dialogWide}`} onCancel={onClose} onClose={onClose} data-testid="schema-dialog">
      <form className={styles.body} onSubmit={handleSubmit}>
        <header className={styles.header}>
          <h2 className={styles.title}>{t('Object from JSON Schema')}</h2>
        </header>
        <p className={styles.dialogMessage}>
          {t('Its properties become the object\'s; an object inside it is defined in place. Types and descriptions are kept, the rest of the schema is not.')}
        </p>

        <div className={styles.fields}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="schema-object-name">{t('Name')}</label>
            <div className={styles.inputWrapper}>
              <input
                id="schema-object-name"
                className={`${styles.input} ${styles.inputMono}`}
                type="text"
                placeholder="Order"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoFocus
                required
              />
            </div>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="schema-object-description">{t('Description')}</label>
            <div className={styles.inputWrapper}>
              <input
                id="schema-object-description"
                className={styles.input}
                type="text"
                placeholder={t('What this shape is, for whoever points at it.')}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="schema-object-schema">{t('JSON Schema')}</label>
            <div className={`${styles.inputWrapper} ${styles.inputWrapperTall}`}>
              <textarea
                id="schema-object-schema"
                className={`${styles.textarea} ${styles.inputMono}`}
                rows={12}
                spellCheck={false}
                placeholder={'{ "type": "object", "properties": { ... } }'}
                value={schema}
                onChange={(event) => setSchema(event.target.value)}
                required
              />
            </div>
          </div>
        </div>

        {error !== null && (
          <p className={styles.error} role="alert">{error}</p>
        )}

        <div className={styles.actions}>
          <button type="button" className={styles.ghost} onClick={onClose} disabled={submitting}>{t('Cancel')}</button>
          <button type="submit" className={styles.filled} disabled={submitting || name.trim() === '' || schema.trim() === ''}>
            {submitting ? t('Creating…') : t('Create Object')}
          </button>
        </div>
      </form>
    </dialog>
  );
}
