import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { FormEvent } from 'react';

import { DrawerEdge } from './DrawerWidth';
import { PanelClose, panelEscape } from './PanelClose';
import styles from './Dialog.module.css';
import { t } from '../i18n';

export interface NameDialogProps {
  /**
   * Whether this stands over the page or beside it.
   *
   * A modal is right when what somebody is doing has nothing to do with what
   * is behind it; making a component for the node they are editing is the
   * opposite, so the workflow editor asks for a panel and keeps its graph.
   */
  placement?: 'modal' | 'panel';
  open: boolean;
  title: string;
  /** One line under the title saying what is being made. */
  message: string;
  nameLabel: string;
  namePlaceholder: string;
  descriptionPlaceholder: string;
  submitLabel: string;
  onClose: () => void;
  /** Throwing shows the reason in the dialog and leaves it open. */
  onSubmit: (name: string, description: string) => Promise<void>;
  /** Another way to make the thing, offered at the foot beside Cancel: a button that opens its own dialog. */
  extra?: ReactNode;
  /** What the Name box holds when it opens; empty where nothing would be accepted as a start. */
  initialName?: string;
  /**
   * For a panel: how far from the window's right edge it stands, in pixels.
   * Unset, it stands beside the workflow editor's node panel. Set, beside
   * whatever else the form it was opened from sits in - another drawer, say.
   */
  besideRight?: number;
}

/**
 * Asks for a name and a description, and nothing else.
 *
 * Tools and skills are both edited on a page of their own, but they need a name
 * before there is anything to open — the name is the identity. So this is the
 * step between the list's Create button and the editor.
 */
export function NameDialog({
  open,
  title,
  message,
  nameLabel,
  namePlaceholder,
  descriptionPlaceholder,
  submitLabel,
  onClose,
  onSubmit, placement = 'modal', extra, initialName = '', besideRight }: NameDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;

    if (open && !dialog.open) {
      setName(initialName);
      setDescription('');
      setError(null);
      setSubmitting(false);
      if (placement === 'panel') dialog.show();
      else dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim() === '' || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(name.trim(), description.trim());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not create it.'));
      setSubmitting(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className={`${styles.dialog} ${placement === 'panel' ? styles.dialogPanel : ''}`}
      // The drawer and its widening edge are both placed from this one value.
      style={besideRight === undefined ? undefined : ({ '--node-panel-width': `${besideRight}px` } as CSSProperties)}
      onCancel={onClose}
      onClose={onClose}
      onKeyDown={panelEscape(placement, onClose)}
    >
      <DrawerEdge placement={placement} />
      <form className={styles.body} onSubmit={handleSubmit}>
        <header className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          {placement === 'panel' && <PanelClose onClose={onClose} />}
        </header>

        <p className={styles.dialogMessage}>{message}</p>

        <div className={styles.fields}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="new-name">
              {nameLabel}
            </label>
            <div className={styles.inputWrapper}>
              <input
                id="new-name"
                name="name"
                className={`${styles.input} ${styles.inputMono}`}
                type="text"
                placeholder={namePlaceholder}
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  // A refusal of the name typed before says nothing about this one.
                  setError(null);
                }}
                autoFocus
                required
              />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="new-description">{t('Description')}</label>
            <div className={styles.inputWrapper}>
              <input
                id="new-description"
                name="description"
                className={styles.input}
                type="text"
                placeholder={descriptionPlaceholder}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
          </div>
        </div>

        {error !== null && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        {/* A third way in, a button on a line of its own above the confirming pair: in a narrow panel three in a row broke apart. */}
        {extra !== undefined && <div className={styles.lead}>{extra}</div>}
        <div className={styles.actions}>
          <button type="button" className={styles.ghost} onClick={onClose} disabled={submitting}>
            {t('Cancel')}
          </button>
          <button type="submit" className={styles.filled} disabled={name.trim() === '' || submitting}>
            {submitting ? t('Creating…') : submitLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
