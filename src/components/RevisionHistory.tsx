import { useCallback, useEffect, useState } from 'react';

import {
  fetchComponentCurrentVersion,
  fetchComponentRevision,
  fetchComponentRevisions,
  restoreComponentRevision,
} from '../api/revisions';
import type {
  ComponentCurrentVersion,
  ComponentRevision,
  ComponentRevisionDetail,
  ComponentRevisionKind,
  RevisionChange,
} from '../api/revisions';
import { JsonDiff } from './JsonDiff';
import { timeAgo } from '../api/tools';
import { FieldHint } from './FieldHint';
import { Loader } from './Loader';
import styles from './RevisionHistory.module.css';
import { t } from '../i18n';

/** The open-row key of the live state, which has no revision id. */
const CURRENT = 'current';

/** What each snapshot key is called on screen. */
const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  description: 'Description',
  type: 'Type',
  systemPrompt: 'System prompt',
  enabled: 'Enabled',
  modelId: 'Model',
  memoryShare: 'Memory share',
  orknuxAccess: 'Orknux access',
  mayAskForTools: 'May ask for tools',
  boxLabels: 'Boxes',
  icon: 'Icon',
  mcpServers: 'MCP servers',
  memoryCatalogs: 'Memory catalogs',
  secretCatalogs: 'Secret catalogs',
  variableCatalogs: 'Variable catalogs',
  skillCatalogs: 'Skill catalogs',
  tools: 'Tools',
  connectionIds: 'Connections',
  agentIds: 'Agents',
  hiddenSkills: 'Hidden skills',
  requiredSkills: 'Skills always shown',
  requiredTools: 'Tools always carried',
  hiddenTools: 'Hidden tools',
  maxTools: 'Tool ceiling',
  maxRounds: 'Round limit',
  chattiness: 'Progress messages',
  content: 'Content',
  source: 'Code',
  typescript: 'Code',
  timeoutSeconds: 'Timeout',
  returnType: 'Return type',
  returnObjectId: 'Return object',
  params: 'Parameters',
  externals: 'Variables',
  imports: 'Imports',
  libraries: 'Libraries',
  catalogId: 'Folder',
};

/** One change in a few words: "Agents −Summarizer", "Model: a → b", "System prompt edited". */
function said(change: RevisionChange): string {
  const label = t(FIELD_LABELS[change.field] ?? change.field);
  if (change.added.length > 0 || change.removed.length > 0) {
    return [label, ...change.added.map((one) => `+${one}`), ...change.removed.map((one) => `−${one}`)].join(' ');
  }
  if (change.before !== null || change.after !== null) {
    return `${label}: ${change.before ?? t('none')} → ${change.after ?? t('none')}`;
  }
  return t('{field} edited').replace('{field}', label);
}

/** A save's changes on one line, or nothing where none are known. */
function summary(changes: RevisionChange[] | null | undefined): string | null {
  if (changes === null || changes === undefined) return null;
  return changes.length === 0 ? t('No change') : changes.map(said).join('; ');
}

export interface RevisionHistoryProps {
  kind: ComponentRevisionKind;
  componentId: string;
  /**
   * What it is called now, so a row can say when it was called something else.
   *
   * A rename is the change least visible in a list of dates and most confusing
   * to restore blind: somebody putting back yesterday's version has a right to
   * know it will also put back yesterday's name.
   */
  currentName?: string;
  /** Told after a restore, so the page can refetch what it is showing. */
  onRestored?: () => void;
}

/**
 * What this component has been, and putting one of those back.
 *
 * Every save keeps the state it replaced, so this list is the states that are
 * no longer current — the newest of them is what the last save wrote over, and
 * what is on screen above it is the version after that. The list is fetched
 * when the panel is opened rather than with the component: a tool edited fifty
 * times in an afternoon is fifty copies of its source, and none of that is
 * wanted by somebody who came to change a description.
 *
 * A row is opened to read it, and the code or the prose comes down with it.
 * Restoring is one press and no confirmation, deliberately: the restore records
 * what it displaces, so the button that made the mistake is the button that
 * takes it back, and a dialog guarding an undoable action is a dialog people
 * learn to dismiss.
 */
export function RevisionHistory({ kind, componentId, currentName, onRestored }: RevisionHistoryProps) {
  const [revisions, setRevisions] = useState<ComponentRevision[] | null>(null);
  const [current, setCurrent] = useState<ComponentCurrentVersion | null>(null);
  /** The version before the open one, which the diff compares it with. */
  const [previous, setPrevious] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ComponentRevisionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Whether the list is drawn. Collapsed by default: it can run to dozens. Issue #414. */
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    // Nothing saved yet has nothing to have been. A page that draws this while
    // creating something would otherwise wait on a fetch it never makes.
    if (componentId === '') {
      setRevisions([]);
      return;
    }
    fetchComponentCurrentVersion(kind, componentId)
      .then(setCurrent)
      .catch(() => setCurrent(null));
    fetchComponentRevisions(kind, componentId)
      .then((held) => {
        setRevisions(held);
        setError(null);
      })
      .catch((cause: unknown) => {
        setRevisions([]);
        setError(cause instanceof Error ? cause.message : t('Could not read the history.'));
      });
  }, [kind, componentId]);

  useEffect(load, [load]);

  async function openRow(id: string) {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    setDetail(null);
    setPrevious(null);
    try {
      /*
       * The open row against the one before it - or, for the live state, the
       * newest kept version against what is saved now.
       */
      if (id === CURRENT) {
        const newest = revisions?.[0];
        if (newest === undefined) return;
        const held = await fetchComponentRevision(newest.id);
        setPrevious(held.readable);
        setDetail(held);
        return;
      }
      const at = revisions?.findIndex((one) => one.id === id) ?? -1;
      const older = at >= 0 ? revisions?.[at + 1] : undefined;
      const [held, before] = await Promise.all([
        fetchComponentRevision(id),
        older === undefined ? Promise.resolve(null) : fetchComponentRevision(older.id),
      ]);
      setPrevious(before?.readable ?? null);
      setDetail(held);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not read that version.'));
    }
  }

  async function restore(id: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await restoreComponentRevision(id);
      setOpenId(null);
      setDetail(null);
      // The restore is itself a version, so the list it came from is now one
      // row longer - reading it again is the only honest way to draw it.
      load();
      onRestored?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('That could not be restored.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.history} aria-label={t('History')}>
      {/*
        What this panel is, behind the (?) rather than under the heading.

        `UI-DESIGN-RULES.md`: an explanation goes behind a question mark beside
        the thing it explains, and this was a paragraph of it under a heading -
        printed to everybody who opened an editor, for the one reader who ever
        wondered where old versions go. On the heading rather than on a row,
        because it explains the whole panel.

        The sentence below it stayed where it is on purpose - but only the half
        of it that is a sentence about this component. "Nothing yet." is the
        state; "the next save will keep what this says now, and it will appear
        here" was the panel teaching how it fills, said a second time three
        inches under a control that exists to say exactly that. It is folded
        into the note above rather than deleted: "and it appears here" is the
        same fact, said once.
      */}
      {/*
        Collapsed by default, opened on a press. A component saved often keeps
        dozens of versions, and drawn open they push everything under the panel
        off the screen - so the panel is a line that says how many there are
        and opens to the list when somebody wants it. Issue #414.
      */}
      <div className={styles.headingRow}>
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={open}
          data-history-toggle=""
          onClick={() => setOpen((was) => !was)}
        >
          <span className={styles.caret} aria-hidden="true">{open ? '▾' : '▸'}</span>
          <h2 className={styles.heading}>{t('History')}</h2>
          {revisions !== null && revisions.length > 0 && (
            <span className={styles.count} data-history-count={revisions.length}>
              {revisions.length}
            </span>
          )}
        </button>
        <FieldHint label={t('History')}>
          {t('Every save keeps what this was before it, and it appears here. How long they are kept is an administrator’s setting.')}
        </FieldHint>
      </div>

      {open && error !== null && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {open &&
        (revisions === null ? (
          <Loader />
        ) : revisions.length === 0 ? (
          // A status says the state. It does not teach; the (?) above does that.
          <p className={styles.empty}>{t('Nothing yet.')}</p>
        ) : (
          <ul className={styles.list}>
          {current !== null && (
            <li className={styles.item} data-history-current="">
              <button
                type="button"
                className={styles.row}
                onClick={() => void openRow(CURRENT)}
                aria-expanded={openId === CURRENT}
              >
                <span className={styles.when}>{timeAgo(current.savedAt)}</span>
                <span className={styles.who}>{current.savedBy === '' ? 'unknown' : current.savedBy}</span>
                <span className={styles.now}>{t('current')}</span>
                <span className={styles.changed} data-history-changes="">{summary(current.changes)}</span>
              </button>
              {openId === CURRENT && (
                <div className={styles.detail}>
                  {detail === null ? <Loader /> : <JsonDiff before={previous} after={current.readable} />}
                </div>
              )}
            </li>
          )}
          {revisions.map((revision) => (
            <li key={revision.id} className={styles.item}>
              <button
                type="button"
                className={styles.row}
                onClick={() => void openRow(revision.id)}
                aria-expanded={openId === revision.id}
              >
                <span className={styles.when}>{timeAgo(revision.savedAt)}</span>
                <span className={styles.who}>{revision.savedBy === '' ? 'unknown' : revision.savedBy}</span>
                {currentName !== undefined && revision.name !== currentName && (
                  <span className={styles.renamed}>called {revision.name}</span>
                )}
                {summary(revision.changes) !== null && (
                  <span className={styles.changed} data-history-changes="">{summary(revision.changes)}</span>
                )}
              </button>

              {openId === revision.id && (
                <div className={styles.detail}>
                  {detail === null ? <Loader /> : <JsonDiff before={previous} after={detail.readable} />}
                  <button
                    type="button"
                    className={styles.restore}
                    onClick={() => void restore(revision.id)}
                    disabled={busy}
                  >{t('Restore this version')}</button>
                  <p className={styles.undo}>
                    {t('Restoring keeps what it replaces, so this is undoable from the row it adds.')}
                  </p>
                </div>
              )}
            </li>
          ))}
        </ul>
        ))}
    </section>
  );
}
