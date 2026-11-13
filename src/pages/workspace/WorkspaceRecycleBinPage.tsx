import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import type { PageOf } from '../../api/client';
import {
  emptyRecycleBin,
  fetchRecycleBin,
  purgeRecycleBinEntry,
  restoreRecycleBinEntry,
} from '../../api/recycleBin';
import type { RecycleBinEntry, RecycleBinKind } from '../../api/recycleBin';
import type { SessionUser } from '../../api/session';
import { AppShell } from '../../components/AppShell';
import { CompactPagination } from '../../components/CompactPagination';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Loader } from '../../components/Loader';
import { WorkspaceSidebar } from '../../components/WorkspaceSidebar';
import { PAGE_SIZES, usePageSize } from '../../components/pageSize';
import { usePageWithin } from '../../components/pageWithin';
import { shellUser } from '../../session/user';
import styles from './WorkspaceRecycleBinPage.module.css';
import { t } from '../../i18n';

export interface WorkspaceRecycleBinPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

/** What a deleted object is called on its own screen, so the row reads as that screen does. */
function kindLabel(kind: RecycleBinKind): string {
  switch (kind) {
    case 'AGENT': return t('Agent');
    case 'TOOL': return t('Tool');
    case 'FUNCTION': return t('Function');
    case 'SKILL': return t('Skill');
    case 'DOCUMENT': return t('Document');
    case 'DIAGRAM': return t('Diagram');
    case 'SHEET': return t('Sheet');
    case 'ACTION': return t('Action');
    case 'WIREFRAME': return t('Wireframe');
    case 'MEMORY': return t('Memory');
    case 'IMAGE': return t('Picture');
    case 'ISSUE': return t('Issue');
    case 'WORKFLOW': return t('Workflow');
    // A folder, deleted with what it held: one row, and one Restore for all of it.
    case 'MEMORY_CATALOG': return t('Memory catalog');
    case 'SKILL_CATALOG': return t('Skill catalog');
    case 'CONDITION': return t('Condition');
    case 'TRIGGER': return t('Trigger');
    case 'OBJECT': return t('Object');
    // A value and a secret are one kind here: the bin does not say which, and never shows what it held.
    case 'VARIABLE': return t('Variable');
    // A kind a newer server bins and this bundle has not heard of: its own name, rather than nothing.
    default: return kind;
  }
}

/** When it was deleted, and by whom: the local date, and a name. */
function deletedWhen(entry: RecycleBinEntry): string {
  const when = new Date(entry.deletedAt);
  const date = Number.isNaN(when.getTime()) ? entry.deletedAt : when.toLocaleString();
  return `${date} · ${entry.deletedBy}`;
}

/**
 * A workspace's recycle bin: objects it has deleted, and putting them back.
 *
 * A read-only list with two row actions. Restore re-creates the object - refused
 * if its name is taken now, which is shown on the row - and Delete forever takes
 * it out of the bin before its retention is up. Everything here is purged
 * automatically once it has sat for the installation's retention.
 */
export function WorkspaceRecycleBinPage({ session, onSignOut }: WorkspaceRecycleBinPageProps) {
  const { workspaceId = '' } = useParams();

  const [entries, setEntries] = useState<PageOf<RecycleBinEntry> | null>(null);
  const [page, setPage] = usePageWithin(workspaceId);
  const [pageSize, setPageSize] = usePageSize('recycleBin');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** The error from a restore or a purge, shown over the list; the load has its own. */
  const [actionError, setActionError] = useState<string | null>(null);

  const [purging, setPurging] = useState<RecycleBinEntry | null>(null);
  const [emptying, setEmptying] = useState(false);
  /** Which rows have a request in flight, so their buttons are held. */
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    if (workspaceId === '') return;
    setLoading(true);
    setError(null);
    fetchRecycleBin(workspaceId, page - 1, pageSize)
      .then((result) => {
        setEntries(result);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        setEntries(null);
        setError(cause instanceof Error ? cause.message : t('Could not load the recycle bin.'));
        setLoading(false);
      });
  }, [workspaceId, page, pageSize]);

  useEffect(load, [load]);

  const withBusy = (id: string, on: boolean) =>
    setBusy((held) => {
      const next = new Set(held);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  async function restore(entry: RecycleBinEntry) {
    if (busy.has(entry.id)) return;
    setActionError(null);
    withBusy(entry.id, true);
    try {
      await restoreRecycleBinEntry(entry.id);
      load();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : t('Could not restore it.'));
    } finally {
      withBusy(entry.id, false);
    }
  }

  const total = entries?.totalElements ?? 0;

  return (
    <AppShell
      user={shellUser(session)}
      workspacePath={`/workspace/${workspaceId}`}
      showAdmin={session.admin}
      onSignOut={onSignOut}
      sidebar={<WorkspaceSidebar workspaceId={workspaceId} />}
    >
      <section className={styles.card}>
        <header className={styles.header}>
          <div className={styles.titleGroup}>
            <h1 className={styles.title}>{t('Recycle Bin')}</h1>
            <p className={styles.subtitle}>
              {t('What this workspace deleted - agents, workflows, issues, documents, pictures, catalogs and the rest - kept until it is purged. Restore one, or delete it for good.')}
            </p>
          </div>
          {total > 0 && (
            <button
              type="button"
              className={styles.emptyButton}
              onClick={() => setEmptying(true)}
              data-recycle-empty
            >
              {t('Empty bin')}
            </button>
          )}
        </header>

        {actionError !== null && (
          <p className={styles.actionError} role="alert">{actionError}</p>
        )}

        <div className={styles.table}>
          <div className={styles.tableHeader}>
            <span className={styles.colName}>{t('Name')}</span>
            <span className={styles.colType}>{t('Type')}</span>
            <span className={styles.colDeleted}>{t('Deleted')}</span>
            <span className={styles.colActions}>{t('Actions')}</span>
          </div>

          {loading && <p className={styles.notice}><Loader /></p>}
          {error !== null && <p className={`${styles.notice} ${styles.noticeError}`}>{error}</p>}
          {!loading && error === null && entries?.content.length === 0 && (
            <p className={styles.notice}>{t('The recycle bin is empty.')}</p>
          )}

          {entries?.content.map((entry) => (
            <div key={entry.id} className={styles.row} data-recycle-row data-recycle-name={entry.name}>
              <span className={`${styles.colName} ${styles.name}`} title={entry.name}>{entry.name}</span>
              <span className={styles.colType}>
                <span className={styles.badge}>{kindLabel(entry.kind)}</span>
              </span>
              <span className={`${styles.colDeleted} ${styles.muted}`}>{deletedWhen(entry)}</span>
              <span className={styles.colActions}>
                <button
                  type="button"
                  className={styles.restore}
                  onClick={() => restore(entry)}
                  disabled={busy.has(entry.id)}
                  data-recycle-restore={entry.id}
                >
                  {t('Restore')}
                </button>
                <button
                  type="button"
                  className={styles.purge}
                  onClick={() => setPurging(entry)}
                  disabled={busy.has(entry.id)}
                  data-recycle-purge={entry.id}
                >
                  {t('Delete')}
                </button>
              </span>
            </div>
          ))}

          <CompactPagination
            page={page}
            pageSize={pageSize}
            totalItems={total}
            onPageChange={setPage}
            unit="items"
            pageSizes={PAGE_SIZES}
            onPageSizeChange={(chosen) => {
              setPageSize(chosen);
              setPage(1);
            }}
          />
        </div>
      </section>

      <ConfirmDialog
        subject={purging?.name ?? null}
        kind="purgeRecycleEntry"
        onClose={() => setPurging(null)}
        onConfirm={async () => {
          const entry = purging;
          if (entry === null) return;
          await purgeRecycleBinEntry(entry.id);
          setPurging(null);
          load();
        }}
      />

      <ConfirmDialog
        subject={emptying ? String(total) : null}
        kind="emptyRecycleBin"
        onClose={() => setEmptying(false)}
        onConfirm={async () => {
          await emptyRecycleBin(workspaceId);
          setEmptying(false);
          setPage(1);
          load();
        }}
      />
    </AppShell>
  );
}
