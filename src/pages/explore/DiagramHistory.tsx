import { useEffect, useRef, useState } from 'react';

import { fetchComponentCurrentVersion, fetchComponentRevision, fetchComponentRevisions, restoreComponentRevision } from '../../api/revisions';
import type { RevisionChange } from '../../api/revisions';
import { timeAgo } from '../../api/tools';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import form from '../../components/Dialog.module.css';
import { Loader } from '../../components/Loader';
import { t, tf } from '../../i18n';
import { doorLabel } from '../design/DocumentHistory';
import styles from './DiagramHistory.module.css';

/** One line of a diagram's history: a version kept, or the live one on top. */
interface Entry {
  /** The revision's id; the live state has none. */
  id: string | null;
  savedAt: string;
  savedBy: string;
  door: string | null;
  changes: RevisionChange[] | null | undefined;
}

/** As many versions as the server reads in one list. */
const LISTED = 200;

/** What a save changed, on one line: the drawing, and how many boxes and lines it went from and to. */
function summary(changes: RevisionChange[] | null | undefined): string | null {
  if (changes === null || changes === undefined) return null;
  if (changes.length === 0) return t('No change');
  return changes
    .map((change) => {
      switch (change.field) {
        case 'document':
          return t('Drawing changed');
        case 'nodeCount':
          return tf('Nodes: {before} → {after}', { before: change.before ?? '—', after: change.after ?? '—' });
        case 'edgeCount':
          return tf('Connections: {before} → {after}', { before: change.before ?? '—', after: change.after ?? '—' });
        case 'description':
          return t('Description changed');
        case 'name':
          return `${t('Name')}: ${change.before ?? '—'} → ${change.after ?? '—'}`;
        default:
          return change.field;
      }
    })
    .join('; ');
}

/** An SVG the server drew, as a picture: an `<img>` runs nothing that is in it. */
function pictureOf(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export interface DiagramHistoryProps {
  /** The diagram whose history is open; null keeps the dialog closed. */
  diagramId: string | null;
  name: string;
  /** The diagram's revision: a save or a restore changes it, and the list is read again. */
  revision: number;
  /** Called before a restore, so what is not saved yet is kept as a version rather than lost. */
  beforeRestore: () => Promise<boolean>;
  /** A version was put back: the editor reads the diagram again. */
  onRestored: () => Promise<void>;
  onClose: () => void;
}

/**
 * A diagram's history, as a dialog over the editor: the live version on top,
 * then every version kept, newest first, each with when, who and which door
 * saved it and what that save changed. A row opens as the server's picture of
 * that version, beside the list; an older one can be restored, which is a save
 * of its own - what the diagram shows now is kept, so a restore is undone by
 * restoring again.
 */
export function DiagramHistory({ diagramId, name, revision, beforeRestore, onRestored, onClose }: DiagramHistoryProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [picture, setPicture] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<Entry | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (diagramId !== null && !dialog.open) dialog.showModal();
    else if (diagramId === null && dialog.open) dialog.close();
  }, [diagramId]);

  useEffect(() => {
    if (diagramId === null) return;
    let left = false;
    Promise.all([fetchComponentCurrentVersion('DIAGRAM', diagramId), fetchComponentRevisions('DIAGRAM', diagramId, LISTED)])
      .then(([current, kept]) => {
        if (left) return;
        const rows: Entry[] = kept.map((one) => ({ id: one.id, savedAt: one.savedAt, savedBy: one.savedBy, door: one.door ?? null, changes: one.changes }));
        if (current !== null) rows.unshift({ id: null, savedAt: current.savedAt, savedBy: current.savedBy, door: current.door ?? null, changes: current.changes });
        setEntries(rows);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (left) return;
        setEntries([]);
        setError(cause instanceof Error ? cause.message : t('Could not read the history.'));
      });
    return () => {
      left = true;
    };
  }, [diagramId, revision]);

  async function open(entry: Entry) {
    const key = entry.id ?? 'current';
    setOpenKey(key);
    setPicture(null);
    // The live one is what the canvas behind the dialog shows.
    if (entry.id === null) return;
    try {
      const held = await fetchComponentRevision(entry.id);
      setPicture(held.content === null ? '' : pictureOf(held.content));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not read that version.'));
    }
  }

  async function restore(entry: Entry) {
    if (entry.id === null) return;
    if (!(await beforeRestore())) throw new Error(t('Could not save the diagram.'));
    await restoreComponentRevision(entry.id);
    await onRestored();
    setRestoring(null);
    setOpenKey(null);
    setPicture(null);
  }

  const opened = entries?.find((entry) => (entry.id ?? 'current') === openKey) ?? null;

  return (
    <>
      <dialog ref={dialogRef} className={`${form.dialog} ${styles.dialog}`} onCancel={onClose} onClose={onClose} data-testid="diagram-history-dialog">
        <div className={styles.body}>
          <header className={form.header}>
            <h2 className={form.title}>
              {t('History')}
              {entries !== null && entries.length > 0 && <span className={styles.count}>{entries.length}</span>}
            </h2>
          </header>
          {error !== null && (
            <p className={form.error} role="alert">
              {error}
            </p>
          )}
          <div className={styles.columns}>
            {entries === null ? (
              <Loader />
            ) : entries.length === 0 ? (
              <p className={styles.empty}>{t('Nothing yet.')}</p>
            ) : (
              <ul className={styles.list} data-testid="diagram-history-list">
                {entries.map((entry) => {
                  const key = entry.id ?? 'current';
                  const door = doorLabel(entry.door);
                  const said = summary(entry.changes);
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        className={`${styles.row} ${openKey === key ? styles.rowOpen : ''}`}
                        onClick={() => void open(entry)}
                        aria-pressed={openKey === key}
                        title={new Date(entry.savedAt).toLocaleString()}
                        data-testid="diagram-version"
                        data-version={key}
                        data-door={entry.door ?? ''}
                      >
                        <span className={styles.rowHead}>
                          <span className={styles.when}>{timeAgo(entry.savedAt)}</span>
                          {entry.id === null && <span className={styles.now}>{t('Current')}</span>}
                          {door !== null && <span className={styles.door}>{door}</span>}
                        </span>
                        <span className={styles.who}>{entry.savedBy === '' ? '—' : entry.savedBy}</span>
                        {said !== null && <span className={styles.said}>{said}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className={styles.preview} data-testid="diagram-version-preview">
              {opened === null ? (
                <p className={styles.empty}>{t('Pick a version to see it.')}</p>
              ) : opened.id === null ? (
                <p className={styles.empty}>{t('This is the diagram as the canvas shows it now.')}</p>
              ) : picture === null ? (
                <Loader />
              ) : picture === '' ? (
                <p className={styles.empty}>{t('This version cannot be drawn.')}</p>
              ) : (
                <img className={styles.picture} src={picture} data-keeps-colour data-testid="diagram-version-picture" alt={tf('The diagram as it was {when}', { when: new Date(opened.savedAt).toLocaleString() })} />
              )}
            </div>
          </div>
          <div className={form.actions}>
            <button type="button" className={form.ghost} onClick={onClose} data-testid="diagram-history-close">
              {t('Close')}
            </button>
            {opened !== null && opened.id !== null && (
              <button type="button" className={form.filled} onClick={() => setRestoring(opened)} data-testid="diagram-version-restore">
                {t('Restore this version')}
              </button>
            )}
          </div>
        </div>
      </dialog>
      <ConfirmDialog
        subject={restoring === null ? null : name}
        kind="restoreDiagramVersion"
        onClose={() => setRestoring(null)}
        onConfirm={() => (restoring === null ? Promise.resolve() : restore(restoring))}
      />
    </>
  );
}
