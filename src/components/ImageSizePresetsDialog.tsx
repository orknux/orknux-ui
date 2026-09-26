import { useEffect, useRef, useState } from 'react';

import { ConfirmDialog } from './ConfirmDialog';
import dialogStyles from './Dialog.module.css';
import { FieldHint } from './FieldHint';
import styles from './ImageSizePresetsDialog.module.css';
import {
  addImageSizePreset,
  fetchImageSizePresets,
  removeImageSizePreset,
  reorderImageSizePresets,
  updateImageSizePreset,
} from '../api/imagePresets';
import type { ImageSizePreset } from '../api/imagePresets';
import { t } from '../i18n';

export interface ImageSizePresetsDialogProps {
  open: boolean;
  workspaceId: string;
  /** The menu as the panel holds it; every change here is handed back so the menu follows. */
  presets: ImageSizePreset[];
  onChange: (presets: ImageSizePreset[]) => void;
  onClose: () => void;
}

/** The largest side the server takes, mirrored so the box refuses it before the round trip. */
const MAX_SIDE = 8192;

/** A side as typed, or null where it is not a whole number of pixels the server would take. */
function sideOf(typed: string): number | null {
  const value = Number(typed);
  return /^\d+$/.test(typed.trim()) && value >= 1 && value <= MAX_SIDE ? value : null;
}

/**
 * The workspace's size presets, managed where they are used.
 *
 * Opened from the image node's panel rather than from the workspace settings
 * page, because the moment somebody wants a 600x400 in the menu is the moment
 * they are typing 600 and 400 into a node - and the settings page is two
 * screens away. The list is the same shape the issue statuses take on that
 * page: a row each with its name and size, the name and the sides editable in
 * place, move up and down, and a remove that asks first. Issue #431.
 *
 * Every change goes to the server as it is made, the way the statuses do,
 * because this is a workspace setting and not a form: closing the dialog is
 * not a Cancel, and a Save button on a list would be a promise the page could
 * not keep once the first row had already gone.
 */
export function ImageSizePresetsDialog({ open, workspaceId, presets, onChange, onClose }: ImageSizePresetsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The row being edited in place, with what has been typed so far. */
  const [editing, setEditing] = useState<{ id: string; name: string; width: string; height: string } | null>(null);
  const [removing, setRemoving] = useState<ImageSizePreset | null>(null);
  const [newName, setNewName] = useState('');
  const [newWidth, setNewWidth] = useState('');
  const [newHeight, setNewHeight] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open && !dialog.open) {
      setError(null);
      setEditing(null);
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  /** One change to the menu, and the menu read back afterwards so the order is the server's. */
  async function change(act: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await act();
      onChange(await fetchImageSizePresets(workspaceId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not apply the change.'));
    } finally {
      setBusy(false);
    }
  }

  function add() {
    const width = sideOf(newWidth);
    const height = sideOf(newHeight);
    if (newName.trim() === '' || width === null || height === null) return;
    void change(async () => {
      await addImageSizePreset(workspaceId, newName.trim(), width, height);
      setNewName('');
      setNewWidth('');
      setNewHeight('');
    });
  }

  function move(at: number, by: -1 | 1) {
    const ids = presets.map((one) => one.id);
    const to = at + by;
    if (to < 0 || to >= ids.length) return;
    [ids[at], ids[to]] = [ids[to], ids[at]];
    void change(() => reorderImageSizePresets(workspaceId, ids));
  }

  /** What was typed into a row, written if it changed and is a size the server would take. */
  function commit() {
    if (editing === null) return;
    const was = presets.find((one) => one.id === editing.id);
    const held = editing;
    setEditing(null);
    if (was === undefined) return;
    const name = held.name.trim();
    const width = sideOf(held.width);
    const height = sideOf(held.height);
    if (name === '' || width === null || height === null) {
      setError(t('A preset needs a name and two sides from 1 to 8192 pixels.'));
      return;
    }
    if (name === was.name && width === was.width && height === was.height) return;
    void change(() => updateImageSizePreset(was.id, { name, width, height }));
  }

  const canAdd = newName.trim() !== '' && sideOf(newWidth) !== null && sideOf(newHeight) !== null && !busy;

  /*
   * The confirm is a sibling of the dialog, not a child. React hands a
   * `close` or `cancel` fired on an inner <dialog> to every ancestor's handler
   * as well, though the DOM event never bubbles - so a confirm nested inside
   * this one closed both the moment it was answered.
   */
  return (
    <>
      <dialog
        ref={dialogRef}
        className={`${dialogStyles.dialog} ${dialogStyles.dialogWide}`}
        onCancel={onClose}
        onClose={onClose}
        data-testid="image-size-presets"
      >
        <div className={dialogStyles.body}>
          <header className={dialogStyles.header}>
            <span className={dialogStyles.titleRow}>
              <h2 className={dialogStyles.title}>{t('Size presets')}</h2>
              <FieldHint label={t('Size presets')}>
                {t('The sizes every image node in this workspace offers in its Preset menu. Picking one fills the node’s width and height; the node keeps the numbers, so renaming or removing a preset changes no saved node. Each side is 1 to 8192 pixels; a model that cannot draw a preset shows it greyed out.')}
              </FieldHint>
            </span>
          </header>

          <ul className={styles.list}>
            {presets.map((one, at) => {
              const row = editing?.id === one.id ? editing : null;
              return (
                <li key={one.id} className={styles.row}>
                  {row !== null ? (
                    <>
                      <input
                        className={`${styles.input} ${styles.name}`}
                        aria-label={`Rename ${one.name}`}
                        value={row.name}
                        maxLength={60}
                        autoFocus
                        onChange={(event) => setEditing({ ...row, name: event.target.value })}
                        onKeyDown={(event) => {
                          // Its own Escape: the default would also cancel the whole dialog.
                          if (event.key === 'Escape') {
                            event.preventDefault();
                            setEditing(null);
                          }
                          if (event.key === 'Enter') commit();
                        }}
                      />
                      <input
                        className={`${styles.input} ${styles.side}`}
                        type="number"
                        min={1}
                        max={MAX_SIDE}
                        aria-label={`Width of ${one.name}`}
                        value={row.width}
                        onChange={(event) => setEditing({ ...row, width: event.target.value })}
                        onKeyDown={(event) => {
                          // Its own Escape: the default would also cancel the whole dialog.
                          if (event.key === 'Escape') {
                            event.preventDefault();
                            setEditing(null);
                          }
                          if (event.key === 'Enter') commit();
                        }}
                      />
                      <span className={styles.by} aria-hidden="true">
                        ×
                      </span>
                      <input
                        className={`${styles.input} ${styles.side}`}
                        type="number"
                        min={1}
                        max={MAX_SIDE}
                        aria-label={`Height of ${one.name}`}
                        value={row.height}
                        onChange={(event) => setEditing({ ...row, height: event.target.value })}
                        onKeyDown={(event) => {
                          // Its own Escape: the default would also cancel the whole dialog.
                          if (event.key === 'Escape') {
                            event.preventDefault();
                            setEditing(null);
                          }
                          if (event.key === 'Enter') commit();
                        }}
                      />
                      <button type="button" className={styles.done} disabled={busy} onClick={commit}>
                        {t('Done')}
                      </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className={styles.nameButton}
                      title={t('Edit')}
                      disabled={busy}
                      onClick={() =>
                        setEditing({ id: one.id, name: one.name, width: String(one.width), height: String(one.height) })
                      }
                    >
                      {one.name}
                    </button>
                    <span className={styles.size}>
                      {one.width}×{one.height}
                    </span>
                  </>
                )}
                <button
                  type="button"
                  className={styles.move}
                  title={t('Move up')}
                  aria-label={`Move ${one.name} up`}
                  disabled={busy || at === 0}
                  onClick={() => move(at, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className={styles.move}
                  title={t('Move down')}
                  aria-label={`Move ${one.name} down`}
                  disabled={busy || at === presets.length - 1}
                  onClick={() => move(at, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className={styles.remove}
                  title={t('Remove')}
                  aria-label={`Remove ${one.name}`}
                  disabled={busy}
                  onClick={() => setRemoving(one)}
                >
                  ×
                </button>
              </li>
            );
          })}
          {presets.length === 0 && <li className={styles.none}>{t('None yet.')}</li>}
        </ul>

        <div className={dialogStyles.field}>
          <label className={dialogStyles.label} htmlFor="new-image-size-preset">
            {t('Add a preset')}
          </label>
          <div className={styles.add}>
            <input
              id="new-image-size-preset"
              className={`${styles.input} ${styles.name}`}
              type="text"
              value={newName}
              maxLength={60}
              placeholder={t('Thumbnail')}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                add();
              }}
            />
            <input
              className={`${styles.input} ${styles.side}`}
              type="number"
              min={1}
              max={MAX_SIDE}
              aria-label={t('Width')}
              placeholder={t('Width')}
              value={newWidth}
              onChange={(event) => setNewWidth(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                add();
              }}
            />
            <span className={styles.by} aria-hidden="true">
              ×
            </span>
            <input
              className={`${styles.input} ${styles.side}`}
              type="number"
              min={1}
              max={MAX_SIDE}
              aria-label={t('Height')}
              placeholder={t('Height')}
              value={newHeight}
              onChange={(event) => setNewHeight(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                add();
              }}
            />
            <button type="button" className={dialogStyles.filled} disabled={!canAdd} onClick={add}>
              {t('Add')}
            </button>
          </div>
        </div>

        {error !== null && (
          <p className={dialogStyles.error} role="alert">
            {error}
          </p>
        )}

        <div className={dialogStyles.actions}>
          <button type="button" className={dialogStyles.ghost} onClick={onClose}>
            {t('Close')}
          </button>
        </div>
      </div>
    </dialog>

    <ConfirmDialog
      subject={removing?.name ?? null}
      kind="removeImageSizePreset"
      onClose={() => setRemoving(null)}
      onConfirm={async () => {
        if (removing === null) return;
        await removeImageSizePreset(removing.id);
        onChange(await fetchImageSizePresets(workspaceId));
        setRemoving(null);
      }}
    />
    </>
  );
}
