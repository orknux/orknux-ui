import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import type { SessionUser } from '../../api/session';
import { timeAgo } from '../../api/tools';
import { fetchWatchers, stopWatcher } from '../../api/watchers';
import type { Watcher, WatcherPage, WatcherStatus } from '../../api/watchers';
import refreshIcon from '../../assets/refresh-cw.svg';
import { AppShell } from '../../components/AppShell';
import { AutoRefresh } from '../../components/AutoRefresh';
import { CompactPagination } from '../../components/CompactPagination';
import { FieldHint } from '../../components/FieldHint';
import { Loader } from '../../components/Loader';
import { WorkspaceSidebar } from '../../components/WorkspaceSidebar';
import { PAGE_SIZES, usePageSize } from '../../components/pageSize';
import { t, tf } from '../../i18n';
import { shellUser } from '../../session/user';
import styles from './WorkspaceWatchersPage.module.css';

export interface WorkspaceWatchersPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

/**
 * A length of time as somebody reads it: seconds up to two minutes, then
 * minutes, hours and days. Units, not prose, so the same in both languages.
 */
export function duration(seconds: number): string {
  if (seconds < 120) return `${seconds} s`;
  if (seconds < 7200) return `${Math.round(seconds / 60)} min`;
  if (seconds < 172800) return `${Math.round(seconds / 3600)} h`;
  return `${Math.round(seconds / 86400)} d`;
}

function statusLabel(status: WatcherStatus): string {
  switch (status) {
    case 'ACTIVE':
      return t('Running');
    case 'FIRED':
      return t('Fired');
    case 'TIMED_OUT':
      return t('Timed out');
    case 'FINISHED':
      return t('Finished by its agent');
    case 'STOPPED':
      return t('Stopped');
    case 'FAILED':
      return t('Could not go on');
  }
}

/**
 * AI -> Watchers. Issue #606.
 *
 * What the workspace's agents are waiting for: each row a tool the server
 * calls on an interval until its result matches, and wakes the agent that set
 * it. Running ones by default, since those are what somebody comes here to
 * see or stop; the Finished filter at the top left shows every one that has
 * ended and how. Nothing is created here - an agent sets a watcher with
 * `watcher_set` - so the only verb on the page is Stop.
 */
export function WorkspaceWatchersPage({ session, onSignOut }: WorkspaceWatchersPageProps) {
  const { workspaceId = '' } = useParams();

  const [finished, setFinished] = useState(false);
  const [watchers, setWatchers] = useState<WatcherPage | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = usePageSize('watchers');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stopping, setStopping] = useState<string | null>(null);

  useEffect(() => setPage(1), [workspaceId, finished]);

  const load = useCallback(() => {
    if (workspaceId === '') return;
    setLoading(true);
    setError(null);
    let abandoned = false;
    fetchWatchers(workspaceId, finished, page - 1, pageSize)
      .then((found) => {
        if (abandoned) return;
        setWatchers(found);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (abandoned) return;
        setWatchers(null);
        setError(cause instanceof Error ? cause.message : t('Could not load the watchers.'));
        setLoading(false);
      });
    return () => {
      abandoned = true;
    };
  }, [workspaceId, finished, page, pageSize]);

  useEffect(load, [load]);

  async function stop(watcher: Watcher) {
    if (stopping !== null) return;
    setStopping(watcher.id);
    setError(null);
    try {
      await stopWatcher(watcher.id);
      load();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : t('Could not stop that watcher.'));
    } finally {
      setStopping(null);
    }
  }

  return (
    <AppShell
      user={shellUser(session)}
      workspacePath={`/workspace/${workspaceId}`}
      showAdmin={session.admin}
      onSignOut={onSignOut}
      sidebar={<WorkspaceSidebar workspaceId={workspaceId} />}
    >
      <header className={styles.titleHeader}>
        <h1 className={styles.title}>{t('Watchers')}</h1>
        <p className={styles.subtitle}>{t('What the agents are waiting for, checked on an interval until it happens')}</p>
      </header>

      <div className={styles.filterBar}>
        <div className={styles.tabs} role="group" aria-label={t('Show watchers')}>
          <button
            type="button"
            className={finished ? styles.tab : styles.tabActive}
            aria-pressed={!finished}
            data-watcher-filter="active"
            onClick={() => setFinished(false)}
          >
            {t('Active')}
          </button>
          <button
            type="button"
            className={finished ? styles.tabActive : styles.tab}
            aria-pressed={finished}
            data-watcher-filter="finished"
            onClick={() => setFinished(true)}
          >
            {t('Finished')}
          </button>
        </div>

        <div className={styles.filtersRight}>
          <AutoRefresh onRefresh={load} busy={loading} />
          <button type="button" className={styles.refresh} onClick={load} disabled={loading && watchers === null}>
            <img src={refreshIcon} alt="" width={14} height={14} />
            {t('Refresh')}
          </button>
        </div>
      </div>

      <section className={styles.card}>
        <div className={styles.tableHeader}>
          <span className={styles.colSession}>{t('Session')}</span>
          <span className={styles.colCall}>{t('Tool call')}</span>
          <span className={styles.colCondition}>{t('Condition')}</span>
          <span className={styles.colNumber}>{t('Interval')}</span>
          <span className={styles.colNumber}>{t('Timeout')}</span>
          <span className={styles.colWhen}>{t('Set')}</span>
          {finished ? (
            <>
              <span className={styles.colWhen}>{t('Finished')}</span>
              <span className={styles.colOutcome}>{t('Outcome')}</span>
            </>
          ) : (
            <span className={styles.colAction} />
          )}
        </div>

        {loading && watchers === null && (
          <p className={styles.notice}>
            <Loader />
          </p>
        )}
        {error !== null && (
          <p className={`${styles.notice} ${styles.noticeError}`} role="alert">
            {error}
          </p>
        )}

        {!loading && error === null && watchers?.content.length === 0 && (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>
              <span className={styles.labelWithHint}>
                {finished ? t('No watcher has finished yet.') : t('No watchers are running yet.')}
                <FieldHint label={t('Watchers')}>
                  {t('An agent sets a watcher with watcher_set: one of its own tools, called on an interval until what it returns matches a JSONPath or a regular expression, when the agent is woken in the conversation it set it in. Admin Settings says how long one may run, how often it may look and how many one agent may have.')}
                </FieldHint>
              </span>
            </p>
          </div>
        )}

        {watchers?.content.map((one) => (
          <div key={one.id} className={styles.row} data-watcher-row={one.id}>
            <span className={styles.colSession}>
              <Link className={styles.session} to={`/workspace/${workspaceId}/sessions/${one.sessionId}`}>
                {one.sessionTitle ?? tf('Session {id}', { id: one.sessionId })}
              </Link>
              <span className={styles.muted}>{one.agentName}</span>
            </span>
            <span className={`${styles.colCall} ${styles.code}`} title={one.note ?? undefined}>
              {one.tool}({one.arguments === '{}' ? '' : one.arguments})
            </span>
            <span className={styles.colCondition}>
              <span className={styles.kind}>{one.conditionKind === 'JSONPATH' ? 'JSONPath' : 'regex'}</span>
              <span className={styles.code}>{one.condition}</span>
              <span className={styles.muted} data-testid="watcher-result-path">{tf('at {path}', { path: one.toolResultPath })}</span>
            </span>
            <span className={`${styles.colNumber} ${styles.muted}`}>{duration(one.intervalSeconds)}</span>
            <span className={`${styles.colNumber} ${styles.muted}`}>{duration(one.timeoutSeconds)}</span>
            <span className={`${styles.colWhen} ${styles.muted}`} title={one.createdAt}>
              {timeAgo(one.createdAt)}
            </span>
            {finished ? (
              <>
                <span className={`${styles.colWhen} ${styles.muted}`} title={one.finishedAt ?? undefined}>
                  {one.finishedAt === null ? <span className={styles.nothing}>—</span> : timeAgo(one.finishedAt)}
                </span>
                <span className={styles.colOutcome} title={one.outcome ?? undefined} data-watcher-status={one.status}>
                  {statusLabel(one.status)}
                </span>
              </>
            ) : (
              <span className={styles.colAction}>
                <button
                  type="button"
                  className={styles.stop}
                  onClick={() => void stop(one)}
                  disabled={stopping !== null}
                  data-watcher-stop={one.id}
                >
                  {t('Stop')}
                </button>
              </span>
            )}
          </div>
        ))}

        {watchers !== null && watchers.totalElements > 0 && (
          <CompactPagination
            page={page}
            pageSize={pageSize}
            totalItems={watchers.totalElements}
            unit="watchers"
            onPageChange={setPage}
            pageSizes={PAGE_SIZES}
            onPageSizeChange={(chosen) => {
              setPageSize(chosen);
              setPage(1);
            }}
          />
        )}
      </section>
    </AppShell>
  );
}
