import { useCallback, useEffect, useMemo, useState } from 'react';

import { fetchComponentCurrentVersion, fetchComponentRevision, fetchComponentRevisions } from '../../api/revisions';
import type { RevisionChange } from '../../api/revisions';
import { timeAgo } from '../../api/tools';
import form from '../../components/Dialog.module.css';
import { Loader } from '../../components/Loader';
import { t, tf } from '../../i18n';
import { diffCounts, documentDiff } from './documentDiff';
import styles from './DocumentHistory.module.css';

/** One line of a document's history: a version kept, or the live one on top. */
export interface HistoryEntry {
  /** The revision's id; the live state has none. */
  id: string | null;
  savedAt: string;
  savedBy: string;
  door: string | null;
  changes: RevisionChange[] | null | undefined;
}

/** A version opened to read: what it holds, and the version before it, both as Markdown. */
export interface OpenVersion {
  entry: HistoryEntry;
  /** Null while it is read. */
  after: string | null;
  /** The version before it; null where none older is kept. */
  before: string | null;
}

/** As many versions as the server reads in one list. */
const LISTED = 200;

/** Which door saved a version, in a word. */
export function doorLabel(door: string | null | undefined): string | null {
  switch (door) {
    case 'EDITOR':
      return t('Editor');
    case 'IMPORT':
      return t('Import');
    case 'CHAT':
      return t('Chat');
    case 'TOOL':
      return t('Tools');
    case 'RESTORE':
      return t('Restored');
    default:
      return null;
  }
}

/** What a save changed, on one line: the text edited, a page setting from one value to another. */
function summary(changes: RevisionChange[] | null | undefined): string | null {
  if (changes === null || changes === undefined) return null;
  if (changes.length === 0) return t('No change');
  return changes
    .map((change) => {
      if (change.field === 'content') return t('Text edited');
      const label = { name: t('Name'), pageSize: t('Size'), orientation: t('Orientation'), margins: t('Margins'), language: t('Language') }[change.field] ?? change.field;
      return `${label}: ${change.before ?? '—'} → ${change.after ?? '—'}`;
    })
    .join('; ');
}

export interface DocumentHistoryProps {
  documentId: string;
  /** The document's revision: a save or a restore changes it, and the list is read again. */
  revision: number;
  /** The row open on the desk, by revision id, or `current`. */
  openKey: string | null;
  onOpen: (version: OpenVersion | null) => void;
}

/**
 * A document's history, down the right of the editor in place of the chat:
 * the live version on top, then every version kept, newest first, each with
 * when, who and which door saved it and what that save changed. A row opens on
 * the desk as the version's text with what it changed from the version before
 * it marked; the comparison and Restore are `DocumentVersionView`'s.
 */
export function DocumentHistory({ documentId, revision, openKey, onOpen }: DocumentHistoryProps) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [live, setLive] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    let left = false;
    Promise.all([fetchComponentCurrentVersion('DOCUMENT', documentId), fetchComponentRevisions('DOCUMENT', documentId, LISTED)])
      .then(([current, kept]) => {
        if (left) return;
        const rows: HistoryEntry[] = kept.map((one) => ({ id: one.id, savedAt: one.savedAt, savedBy: one.savedBy, door: one.door ?? null, changes: one.changes }));
        if (current !== null) rows.unshift({ id: null, savedAt: current.savedAt, savedBy: current.savedBy, door: current.door ?? null, changes: current.changes });
        setLive(current?.readable ?? null);
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
  }, [documentId]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [load, revision]);

  async function open(at: number) {
    if (entries === null) return;
    const entry = entries[at];
    const key = entry.id ?? 'current';
    if (openKey === key) {
      onOpen(null);
      return;
    }
    onOpen({ entry, after: null, before: null });
    try {
      const older = entries[at + 1];
      const [after, before] = await Promise.all([
        entry.id === null ? Promise.resolve(live ?? '') : fetchComponentRevision(entry.id).then((held) => held.readable),
        older?.id == null ? Promise.resolve(null) : fetchComponentRevision(older.id).then((held) => held.readable),
      ]);
      onOpen({ entry, after, before });
    } catch (cause) {
      onOpen(null);
      setError(cause instanceof Error ? cause.message : t('Could not read that version.'));
    }
  }

  return (
    <section className={styles.history} aria-label={t('History')} data-testid="document-history-panel">
      <h2 className={styles.heading}>
        {t('History')}
        {entries !== null && entries.length > 0 && <span className={styles.count}>{entries.length}</span>}
      </h2>
      {error !== null && (
        <p className={form.error} role="alert">
          {error}
        </p>
      )}
      {entries === null ? (
        <Loader />
      ) : entries.length === 0 ? (
        <p className={styles.empty}>{t('Nothing yet.')}</p>
      ) : (
        <ul className={styles.list}>
          {entries.map((entry, at) => {
            const key = entry.id ?? 'current';
            const door = doorLabel(entry.door);
            const said = summary(entry.changes);
            return (
              <li key={key}>
                <button
                  type="button"
                  className={`${styles.row} ${openKey === key ? styles.rowOpen : ''}`}
                  onClick={() => void open(at)}
                  aria-pressed={openKey === key}
                  title={new Date(entry.savedAt).toLocaleString()}
                  data-testid="document-version"
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
    </section>
  );
}

export interface DocumentVersionViewProps {
  version: OpenVersion;
  /** Puts this version back; absent for the live one, which is already what the document says. */
  onRestore?: () => void;
  onClose: () => void;
}

/**
 * A version on the desk: its text, block by block, with what the save that made it
 * added marked in green and what it took out struck through in red, against the version before it.
 */
export function DocumentVersionView({ version, onRestore, onClose }: DocumentVersionViewProps) {
  const blocks = useMemo(() => (version.after === null ? null : documentDiff(version.before, version.after)), [version.after, version.before]);
  const counts = blocks === null ? null : diffCounts(blocks);
  const door = doorLabel(version.entry.door);

  return (
    <div className={styles.version} role="region" aria-label={t('Version')} data-testid="document-version-view">
      <div className={styles.versionBar}>
        <span className={styles.versionTitle} title={new Date(version.entry.savedAt).toLocaleString()}>
          {new Date(version.entry.savedAt).toLocaleString()} · {version.entry.savedBy}
          {door !== null && ` · ${door}`}
        </span>
        {counts !== null && (
          <span className={styles.versionCounts} data-testid="document-version-counts">
            {version.before === null
              ? t('The oldest version kept')
              : tf('{added} added, {removed} removed, {changed} changed', counts)}
          </span>
        )}
        <span className={styles.versionGap} />
        {onRestore !== undefined && (
          <button type="button" className={form.filled} onClick={onRestore} disabled={blocks === null} data-testid="document-version-restore">
            {t('Restore this version')}
          </button>
        )}
        <button type="button" className={form.ghost} onClick={onClose} data-testid="document-version-close">
          {t('Close')}
        </button>
      </div>
      <div className={styles.versionText}>
        {blocks === null ? (
          <Loader />
        ) : (
          blocks.map((block, at) => (
            <div key={at} className={`${styles.block} ${styles[block.kind]}`} data-diff={block.kind} data-testid="document-diff-block">
              {block.pieces.map((piece, index) =>
                piece.kind === 'added' ? (
                  <ins key={index} className={styles.ins} data-testid="document-diff-added">
                    {piece.text}
                  </ins>
                ) : piece.kind === 'removed' ? (
                  <del key={index} className={styles.del} data-testid="document-diff-removed">
                    {piece.text}
                  </del>
                ) : (
                  <span key={index}>{piece.text}</span>
                ),
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
