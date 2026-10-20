import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { fetchSchedules, stopSchedule } from '../../api/schedules';
import type { Schedule, SchedulePage, ScheduleStatus } from '../../api/schedules';
import type { SessionUser } from '../../api/session';
import { timeAgo } from '../../api/tools';
import refreshIcon from '../../assets/refresh-cw.svg';
import { AppShell } from '../../components/AppShell';
import { AutoRefresh } from '../../components/AutoRefresh';
import { ColumnHeader } from '../../components/ColumnHeader';
import { CompactPagination } from '../../components/CompactPagination';
import { FieldHint } from '../../components/FieldHint';
import { Loader } from '../../components/Loader';
import { WorkspaceSidebar } from '../../components/WorkspaceSidebar';
import { PAGE_SIZES, usePageSize } from '../../components/pageSize';
import { t, tf } from '../../i18n';
import { zoned } from '../../session/timeZone';
import { shellUser } from '../../session/user';
// The Watchers page's own layout: the two are one kind of list, and should read as one.
import styles from './WorkspaceWatchersPage.module.css';
import { duration } from './WorkspaceWatchersPage';

export interface WorkspaceSchedulesPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

/** A moment as the reader's own clock and calendar say it. */
function local(iso: string): string {
  return new Date(iso).toLocaleString(undefined, zoned());
}

export function scheduleStatusLabel(status: ScheduleStatus): string {
  switch (status) {
    case 'ACTIVE':
      return t('Active');
    case 'STOPPED':
      return t('Stopped');
    case 'ENDED':
      return t('Ended');
  }
}

/** How often it runs, as somebody reads it: every 15 min, or the cron and its zone. */
export function cadence(one: Schedule): string {
  if (one.everySeconds !== null) return tf('every {time}', { time: duration(one.everySeconds) });
  return one.timezone === null ? (one.cron ?? '') : `${one.cron ?? ''} (${one.timezone})`;
}

/**
 * AI -> Schedules.
 *
 * What the workspace's agents come back to on a schedule: each row a reminder
 * an agent set with a schedule rather than once, which wakes it in the
 * conversation it set it in every time it is due. Active ones by default; the
 * Ended filter shows every one stopped or run out, and how. Nothing is created
 * here - an agent sets one itself - so the only verb on the page is Stop.
 */
export function WorkspaceSchedulesPage({ session, onSignOut }: WorkspaceSchedulesPageProps) {
  const { workspaceId = '' } = useParams();

  const [ended, setEnded] = useState(false);
  const [schedules, setSchedules] = useState<SchedulePage | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = usePageSize('schedules');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stopping, setStopping] = useState<string | null>(null);

  useEffect(() => setPage(1), [workspaceId, ended]);

  const load = useCallback(() => {
    if (workspaceId === '') return;
    setLoading(true);
    setError(null);
    let abandoned = false;
    fetchSchedules(workspaceId, ended, page - 1, pageSize)
      .then((found) => {
        if (abandoned) return;
        setSchedules(found);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (abandoned) return;
        setSchedules(null);
        setError(cause instanceof Error ? cause.message : t('Could not load the schedules.'));
        setLoading(false);
      });
    return () => {
      abandoned = true;
    };
  }, [workspaceId, ended, page, pageSize]);

  useEffect(load, [load]);

  async function stop(schedule: Schedule) {
    if (stopping !== null) return;
    setStopping(schedule.id);
    setError(null);
    try {
      await stopSchedule(schedule.id);
      load();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : t('Could not stop that schedule.'));
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
        {/* What this page lists, behind the (?) beside its name - not beside an empty list, where it was only seen while there was nothing. */}
        <span className={styles.labelWithHint}>
          <h1 className={styles.title}>{t('Schedules')}</h1>
          <FieldHint label={t('Schedules')}>
            {t('An agent sets a schedule when it should come back to something again and again - every so many minutes, or by a cron - rather than once, which a timer does. Each run wakes it in the conversation it set it in, with its note. Admin Settings says how often one may run and how many one agent may have.')}
          </FieldHint>
        </span>
        <p className={styles.subtitle}>{t('What the agents come back to on a schedule, and when next')}</p>
      </header>

      <div className={styles.filterBar}>
        <div className={styles.tabs} role="group" aria-label={t('Show schedules')}>
          <button
            type="button"
            className={ended ? styles.tab : styles.tabActive}
            aria-pressed={!ended}
            data-schedule-filter="active"
            onClick={() => setEnded(false)}
          >
            {t('Active')}
          </button>
          <button
            type="button"
            className={ended ? styles.tabActive : styles.tab}
            aria-pressed={ended}
            data-schedule-filter="ended"
            onClick={() => setEnded(true)}
          >
            {t('Ended')}
          </button>
        </div>

        <div className={styles.filtersRight}>
          <AutoRefresh onRefresh={load} busy={loading} />
          <button type="button" className={styles.refresh} onClick={load} disabled={loading && schedules === null}>
            <img src={refreshIcon} alt="" width={14} height={14} />
            {t('Refresh')}
          </button>
        </div>
      </div>

      <section className={styles.card}>
        <div className={styles.tableHeader}>
          <ColumnHeader label={t('Session')} className={styles.colSession} />
          <ColumnHeader label={t('Note')} className={styles.colNote} />
          <ColumnHeader label={t('Runs')} className={styles.colCadence} />
          <ColumnHeader label={t('Count')} className={styles.colNumber} />
          <ColumnHeader label={t('Set')} className={styles.colWhen} />
          <ColumnHeader label={t('Last run')} className={styles.colWhen} />
          {!ended && <ColumnHeader label={t('Next run')} className={styles.colNextRun} />}
          {ended ? (
            <>
              <ColumnHeader label={t('Ended')} className={styles.colWhen} />
              <ColumnHeader label={t('Outcome')} className={styles.colOutcome} />
            </>
          ) : (
            <span className={styles.colAction} />
          )}
        </div>

        {/* Only while there is nothing to show, so a refresh never moves the table. */}
        {loading && schedules === null && (
          <p className={styles.notice}>
            <Loader />
          </p>
        )}
        {error !== null && (
          <p className={`${styles.notice} ${styles.noticeError}`} role="alert">
            {error}
          </p>
        )}

        {error === null && schedules?.content.length === 0 && (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>
              {ended ? t('No schedule has ended yet.') : t('No schedules are active yet.')}
            </p>
          </div>
        )}

        {schedules?.content.map((one) => (
          <div key={one.id} className={styles.row} data-schedule-row={one.id}>
            <span className={styles.colSession}>
              <Link className={styles.session} to={`/workspace/${workspaceId}/sessions/${one.sessionId}`}>
                {one.sessionTitle ?? tf('Session {id}', { id: one.sessionId })}
              </Link>
              <span className={styles.muted}>{one.agentName}</span>
            </span>
            <span className={styles.colNote} title={one.note} data-testid="schedule-note">
              {one.note}
            </span>
            <span className={`${styles.colCadence} ${styles.code}`} data-testid="schedule-cadence">
              {cadence(one)}
            </span>
            <span
              className={`${styles.colNumber} ${styles.muted}`}
              title={one.until === null ? undefined : tf('Ends {when}', { when: local(one.until) })}
              data-testid="schedule-runs"
            >
              {one.times === null ? String(one.runs) : `${one.runs} / ${one.times}`}
            </span>
            <span className={`${styles.colWhen} ${styles.muted}`} title={local(one.createdAt)}>
              {timeAgo(one.createdAt)}
            </span>
            <span className={`${styles.colWhen} ${styles.muted}`} title={one.lastRunAt === null ? undefined : local(one.lastRunAt)}>
              {one.lastRunAt === null ? <span className={styles.nothing}>—</span> : timeAgo(one.lastRunAt)}
            </span>
            {!ended && (
              <span
                className={`${styles.colNextRun} ${styles.muted}`}
                title={one.nextRunAt === null ? undefined : local(one.nextRunAt)}
                data-testid="schedule-next"
              >
                {one.nextRunAt === null ? (
                  <span className={styles.nothing}>—</span>
                ) : new Date(one.nextRunAt).getTime() <= Date.now() ? (
                  t('due now')
                ) : (
                  local(one.nextRunAt)
                )}
              </span>
            )}
            {ended ? (
              <>
                <span className={`${styles.colWhen} ${styles.muted}`} title={one.finishedAt === null ? undefined : local(one.finishedAt)}>
                  {one.finishedAt === null ? <span className={styles.nothing}>—</span> : timeAgo(one.finishedAt)}
                </span>
                <span className={styles.colOutcome} title={one.outcome ?? undefined} data-schedule-status={one.status}>
                  {scheduleStatusLabel(one.status)}
                </span>
              </>
            ) : (
              <span className={styles.colAction}>
                <button
                  type="button"
                  className={styles.stop}
                  onClick={() => void stop(one)}
                  disabled={stopping !== null}
                  data-schedule-stop={one.id}
                >
                  {t('Stop')}
                </button>
              </span>
            )}
          </div>
        ))}

        {schedules !== null && schedules.totalElements > 0 && (
          <CompactPagination
            page={page}
            pageSize={pageSize}
            totalItems={schedules.totalElements}
            unit="schedules"
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
