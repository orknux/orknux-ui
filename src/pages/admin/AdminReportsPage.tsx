import { Fragment, useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { tokenCount } from '../../api/chat';
import type { SessionUser } from '../../api/session';
import {
  fetchUsagePersonSessions,
  fetchUsageReport,
  fetchUsageSeries,
  fetchUsageTracking,
  shortTokens,
  usageReportCsv,
} from '../../api/usage';
import type {
  PromptSource,
  UsageDay,
  UsageFilter,
  UsageOrder,
  UsagePerson,
  UsageReport,
  UsageSessionOrder,
  UsageSessionShare,
  UsageTracking,
} from '../../api/usage';
import { fetchWorkspaces } from '../../api/workspaces';
import type { Workspace } from '../../api/workspaces';
import chevronDownIcon from '../../assets/chevron-down.svg';
import { AdminSidebar } from '../../components/AdminSidebar';
import { AppShell } from '../../components/AppShell';
import { ColumnHeader } from '../../components/ColumnHeader';
import { CompactPagination } from '../../components/CompactPagination';
import { Loader } from '../../components/Loader';
import { SearchBox } from '../../components/SearchBox';
import { useTableSort } from '../../components/tableSort';
import { useSearch } from '../../components/useSearch';
import { t, tf } from '../../i18n';
import { currentLanguage } from '../../session/language';
import { shellUser } from '../../session/user';
import styles from './AdminReportsPage.module.css';
import { ErrorsReport } from './ErrorsReport';
import { FlagsReport } from './FlagsReport';
import { RatingsReport } from './RatingsReport';
import { RecordingOff } from './RecordingOff';
import { costOf, dayOf, formatDate, Picker, share, Tile } from './reportParts';
import { UsageReportChart } from './UsageReportChart';

export interface AdminReportsPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

const PEOPLE_PER_PAGE = 25;
/** The sizes the people table offers, as every other list's pager does. */
const PEOPLE_PAGE_SIZES = [10, 25, 50];
const SESSIONS_PER_PAGE = 5;
const SESSION_PAGE_SIZES = [5, 10, 25];

type ReportKind = 'usage' | 'ratings' | 'errors' | 'flags';

/** A report the address names, or null for one it does not. */
function reportOf(named: string | null): ReportKind | null {
  return named === 'usage' || named === 'ratings' || named === 'errors' || named === 'flags' ? named : null;
}

/**
 * Admin > Reports: one report at a time, picked at the top.
 *
 * The one showing is in the address, `?report=errors`, so a link or a reload
 * opens it - the way the plugins page keeps its tab. An address naming none
 * opens the one last picked here, remembered as a list's order is, and the
 * usage report before anything has been. Replaced rather than pushed, for the
 * plugins page's reason: switching reports is looking around one screen, and
 * Back should leave it.
 */
export function AdminReportsPage({ session, onSignOut }: AdminReportsPageProps) {
  const [addressed, setAddressed] = useSearchParams();
  const kind: ReportKind =
    reportOf(addressed.get('report')) ??
    (() => {
      try {
        return reportOf(window.localStorage.getItem(REPORT_KEY)) ?? 'usage';
      } catch {
        return 'usage';
      }
    })();

  // Arriving without one, the report shown is written in, so the address always says.
  useEffect(() => {
    if (addressed.get('report') === kind) return;
    const held = new URLSearchParams(addressed);
    held.set('report', kind);
    setAddressed(held, { replace: true });
  }, [addressed, kind, setAddressed]);

  function pick(next: ReportKind) {
    const held = new URLSearchParams(addressed);
    held.set('report', next);
    setAddressed(held, { replace: true });
    try {
      window.localStorage.setItem(REPORT_KEY, next);
    } catch {
      // Remembering is a convenience; the address still says which.
    }
  }

  return (
    <AppShell scrollContent user={shellUser(session)} onSignOut={onSignOut} sidebar={<AdminSidebar active="reports" />}>
      <header className={styles.titleHeader}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{t('Reports')}</h1>
          <Picker label={t('Report')} value={kind} onChange={(value) => pick(value as ReportKind)}>
            <option value="usage">{t('Usage')}</option>
            <option value="ratings">{t('Ratings')}</option>
            <option value="errors">{t('Errors')}</option>
            <option value="flags">{t('Flags')}</option>
          </Picker>
        </div>
      </header>
      {kind === 'usage' ? <UsageReportView /> : kind === 'ratings' ? <RatingsReport /> : kind === 'flags' ? <FlagsReport /> : <ErrorsReport />}
    </AppShell>
  );
}

const REPORT_KEY = 'orknux.reports.kind';

/**
 * Tokens by the person who prompted them.
 *
 * Usage tracking is the whole of what is recorded - off writes nothing at all,
 * and is where a fresh installation starts. Its switch is in Admin Settings;
 * here a line says when it is off. The report reads whatever was recorded while
 * it was on, so switching off does not empty it.
 */
function UsageReportView() {
  const [tracking, setTracking] = useState<UsageTracking | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [days, setDays] = useState(30);
  const [workspaceId, setWorkspaceId] = useState('');
  const [source, setSource] = useState<PromptSource | ''>('');
  /** Over the person alone: who they are, not what they used. */
  const [typed, setTyped, searching] = useSearch();
  /* Tokens, biggest first, until a heading is pressed; the counts start biggest-first too. */
  const [order, ascending, sortBy] = useTableSort<UsageOrder>('usage-report', 'TOKENS', false, [
    'TOKENS', 'SESSIONS', 'INPUT', 'CACHED', 'OUTPUT', 'COST', 'LAST_ACTIVE',
  ]);
  const [exporting, setExporting] = useState(false);
  const [page, setPage] = useState(1);
  const [peopleSize, setPeopleSize] = useState(PEOPLE_PER_PAGE);
  const [report, setReport] = useState<UsageReport | null>(null);
  const [series, setSeries] = useState<UsageDay[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchUsageTracking()
      .then(setTracking)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : t('Could not load the report.')));
    fetchWorkspaces(0, 200)
      .then((held) => setWorkspaces(held.content))
      .catch(() => setWorkspaces([]));
  }, []);

  const filter: UsageFilter = {
    from: dayOf(new Date(Date.now() - (days - 1) * 86_400_000)),
    to: dayOf(new Date()),
    workspaceId: workspaceId || undefined,
    source: source || undefined,
    search: searching.trim() || undefined,
  };
  const filterKey = JSON.stringify(filter);

  useEffect(() => {
    setPage(1);
    setOpen(null);
  }, [days, workspaceId, source, searching, order, ascending]);

  const load = useCallback(() => {
    setLoading(true);
    fetchUsageReport(JSON.parse(filterKey) as UsageFilter, page - 1, peopleSize, order, ascending)
      .then((held) => {
        setReport(held);
        setError(null);
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : t('Could not load the report.')))
      .finally(() => setLoading(false));
  }, [filterKey, page, peopleSize, order, ascending]);

  useEffect(load, [load]);

  // The days follow the filter and nothing else: paging and order are the table's.
  useEffect(() => {
    let current = true;
    fetchUsageSeries(JSON.parse(filterKey) as UsageFilter)
      .then((held) => current && setSeries(held))
      .catch(() => current && setSeries(null));
    return () => {
      current = false;
    };
  }, [filterKey]);

  /** The report as the table shows it - every page, in this order - saved as a file. */
  async function exportCsv() {
    setExporting(true);
    try {
      const csv = await usageReportCsv(filter, order, ascending);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      link.download = `usage-${filter.from ?? ''}-${filter.to ?? ''}.csv`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : t('Could not export the report.'));
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      {tracking !== null && !tracking.enabled && (
        <RecordingOff report="usage" setting="usage-tracking">{t('Usage tracking is off.')}</RecordingOff>
      )}

      <section className={styles.card}>
        <div className={styles.reportHead}>
          {/* The heading over the search box, as each picker's label sits over its box: two columns of the same shape. */}
          <div className={styles.lead}>
            <h2 className={styles.sectionHeading}>{t('Tokens by person')}</h2>
            <SearchBox value={typed} onChange={setTyped} placeholder={t('Search people...')} label={t('Search people')} />
          </div>
          <div className={styles.filters}>
            <Picker label={t('Period')} value={String(days)} onChange={(value) => setDays(Number(value))}>
              <option value={7}>{t('Last 7 days')}</option>
              <option value={30}>{t('Last 30 days')}</option>
              <option value={90}>{t('Last 90 days')}</option>
              <option value={365}>{t('Last 12 months')}</option>
            </Picker>
            <Picker label={t('Workspace')} value={workspaceId} onChange={setWorkspaceId}>
              <option value="">{t('All workspaces')}</option>
              {workspaces.map((one) => (
                <option key={one.id} value={one.id}>{one.name}</option>
              ))}
            </Picker>
            <Picker label={t('Source')} value={source} onChange={(value) => setSource(value as PromptSource | '')}>
              <option value="">{t('All sources')}</option>
              <option value="SLACK">Slack</option>
              <option value="ORKNUX">Orknux</option>
              <option value="NONE">{t('Unattributed')}</option>
            </Picker>
            <button type="button" className={styles.export} onClick={() => void exportCsv()} disabled={exporting || report === null || report.total === 0} data-testid="usage-export">
              {exporting ? t('Exporting…') : t('Export CSV')}
            </button>
          </div>
        </div>

        {report !== null && (
          <div className={styles.tiles}>
            <Tile label={t('Tokens')} value={shortTokens(report.inputTokens + report.outputTokens)} exact={report.inputTokens + report.outputTokens}>
              {tf('{cached} of input cached', { cached: shortTokens(report.cachedInputTokens) })}
            </Tile>
            <Tile label={t('Cost')} value={costOf(report.cost, report.partlyUnpriced)}>
              {report.partlyUnpriced ? t('some models have no price') : t("at each call's price")}
            </Tile>
            <Tile label={t('People')} value={String(report.people)}>
              {tf('in {count} sessions', { count: report.sessions })}
            </Tile>
            <Tile label={t('Unattributed')} value={share(report.unattributedTokens, report.inputTokens + report.outputTokens)}>
              {t('schedules, webhooks and API runs')}
            </Tile>
          </div>
        )}

        {error !== null && <p className={`${styles.notice} ${styles.noticeError}`}>{error}</p>}
        {loading && report === null && <p className={styles.notice}><Loader /></p>}
        {report !== null && report.total === 0 && (
          <p className={styles.notice}>{t('Nothing recorded in this period.')}</p>
        )}

        {report !== null && report.total > 0 && series !== null && series.length > 0 && <UsageReportChart series={series} />}

        {report !== null && report.total > 0 && (
          <div className={styles.tableBox}>
            <table className={styles.table} data-testid="usage-table">
              <thead>
                <tr>
                  {([
                    ['NAME', t('Person'), false],
                    ['SOURCE', t('Source'), false],
                    ['SESSIONS', t('Sessions'), true],
                    ['INPUT', t('Input'), true],
                    ['CACHED', t('Cached'), true],
                    ['OUTPUT', t('Output'), true],
                    ['COST', t('Cost'), true],
                    ['LAST_ACTIVE', t('Last active'), true],
                  ] as const).map(([column, label, numeric]) => (
                    <th key={column} className={numeric ? styles.number : undefined}>
                      <ColumnHeader
                        label={label}
                        order={column}
                        current={order}
                        ascending={ascending}
                        onSort={sortBy}
                        className={numeric ? styles.headRight : styles.headLeft}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.rows.map((person) => (
                  <Fragment key={person.key}>
                    <PersonRow person={person} open={open === person.key} onToggle={() => setOpen(open === person.key ? null : person.key)} />
                    {open === person.key && (
                      <tr className={styles.detailRow}>
                        <td colSpan={8}>
                          <PersonSessions person={person.key} filter={filter} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {report !== null && report.total > PEOPLE_PAGE_SIZES[0] && (
          <CompactPagination
            page={page}
            pageSize={peopleSize}
            totalItems={report.total}
            onPageChange={setPage}
            unit={t('people')}
            pageSizes={PEOPLE_PAGE_SIZES}
            onPageSizeChange={(next) => {
              setPeopleSize(next);
              setPage(1);
            }}
          />
        )}
      </section>
    </>
  );
}

/** "4 sessions", in the plural form the language in force wants for the number. */
function sessionCount(count: number): string {
  const form = new Intl.PluralRules(currentLanguage()).select(count);
  return count === 1 ? tf('{count} session', { count }, form) : tf('{count} sessions', { count }, form);
}

function PersonRow({ person, open, onToggle }: { person: UsagePerson; open: boolean; onToggle: () => void }) {
  const unattributed = person.source === 'NONE';
  return (
    <tr className={open ? styles.rowOpen : undefined} data-testid="usage-person" data-person={person.key}>
      <td>
        <button type="button" className={styles.personButton} onClick={onToggle} aria-expanded={open}>
          <img className={open ? styles.chevronOpen : styles.chevron} src={chevronDownIcon} alt="" width={14} height={14} />
          <span className={styles.person}>
            <span className={styles.personLine}>
              <span className={styles.personName}>{unattributed ? t('Unattributed') : person.name ?? person.personKey}</span>
              <span className={styles.personSessions} data-person-sessions="">{sessionCount(person.sessions)}</span>
            </span>
            <span className={styles.personDetail}>
              {unattributed
                ? t('nobody prompted it')
                : person.source === 'SLACK'
                  ? [person.personKey, person.connectionName].filter(Boolean).join(' · ')
                  : person.personKey}
            </span>
          </span>
        </button>
      </td>
      <td>
        <span className={`${styles.source} ${styles[`source${person.source}`]}`}>
          {person.source === 'SLACK' ? 'Slack' : person.source === 'ORKNUX' ? 'Orknux' : '—'}
        </span>
      </td>
      <td className={styles.number}>{person.sessions}</td>
      <td className={styles.number} title={tokenCount(person.inputTokens)}>{shortTokens(person.inputTokens)}</td>
      <td className={`${styles.number} ${styles.muted}`} title={tokenCount(person.cachedInputTokens)}>{shortTokens(person.cachedInputTokens)}</td>
      <td className={styles.number} title={tokenCount(person.outputTokens)}>{shortTokens(person.outputTokens)}</td>
      <td className={styles.number}>{costOf(person.cost, person.partlyUnpriced)}</td>
      <td className={`${styles.number} ${styles.muted}`}>{formatDate(person.lastActiveAt)}</td>
    </tr>
  );
}

/** One person's sessions, a page at a time, with their share of each. */
function PersonSessions({ person, filter }: { person: string; filter: UsageFilter }) {
  const [page, setPage] = useState(1);
  // Five to start, as asked; the size control every pager offers lets a person see more at once.
  const [size, setSize] = useState(SESSIONS_PER_PAGE);
  const [held, setHeld] = useState<{ total: number; items: UsageSessionShare[] } | null>(null);
  // Ordered by the server: the page on screen is five of what may be hundreds.
  const [order, ascending, sortBy] = useTableSort<UsageSessionOrder>('usage-sessions', 'TOKENS', false, [
    'SHARE', 'TOKENS', 'COST', 'LAST_ACTIVE',
  ]);
  const filterKey = JSON.stringify(filter);

  useEffect(() => setPage(1), [order, ascending]);

  useEffect(() => {
    fetchUsagePersonSessions(person, JSON.parse(filterKey) as UsageFilter, page - 1, size, order, ascending)
      .then(setHeld)
      .catch(() => setHeld({ total: 0, items: [] }));
  }, [person, filterKey, page, size, order, ascending]);

  if (held === null) return <Loader />;
  return (
    <div className={styles.sessions} data-testid="usage-sessions">
      <table className={styles.sessionTable}>
        <thead>
          <tr>
            {([
              ['SESSION', t('Session'), false],
              ['WORKSPACE', t('Workspace'), false],
              [null, t('Also prompted by'), false],
              ['SHARE', t('Their share'), true],
              ['TOKENS', t('Tokens'), true],
              ['COST', t('Cost'), true],
              ['LAST_ACTIVE', t('Last active'), true],
            ] as const).map(([column, label, numeric]) => (
              <th key={label} className={numeric ? styles.number : undefined}>
                {column === null ? label : (
                  <ColumnHeader
                    label={label}
                    order={column}
                    current={order}
                    ascending={ascending}
                    onSort={sortBy}
                    className={numeric ? styles.headRight : styles.headLeft}
                  />
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {held.items.map((one) => {
            const part = one.sessionTokens > 0 ? Math.round((one.tokens / one.sessionTokens) * 100) : 100;
            return (
              <tr key={one.sessionId} data-testid="usage-session">
                <td>
                  <Link to={`/workspace/${one.workspaceId}/sessions/${one.sessionId}`}>
                    {`#${one.sessionId} ${one.title ?? t('Removed session')}`}
                  </Link>
                </td>
                <td className={styles.muted}>{one.workspaceName ?? t('Removed workspace')}</td>
                <td className={styles.muted}>{one.others.length === 0 ? '—' : one.others.join(', ')}</td>
                <td className={styles.number}>
                  <span className={styles.shareCell}>
                    <span className={styles.bar} aria-hidden="true">
                      <span className={styles.barFill} style={{ width: `${part}%` }} />
                    </span>
                    <span className={styles.sharePct}>{`${part}%`}</span>
                  </span>
                </td>
                <td className={styles.number}>
                  {one.tokens === one.sessionTokens
                    ? shortTokens(one.tokens)
                    : tf('{mine} of {all}', { mine: shortTokens(one.tokens), all: shortTokens(one.sessionTokens) })}
                </td>
                <td className={styles.number} data-session-cost="">{costOf(one.cost, one.partlyUnpriced)}</td>
                <td className={`${styles.number} ${styles.muted}`} data-session-date="">
                  {one.lastActiveAt === null ? '—' : formatDate(one.lastActiveAt)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {held.total > SESSIONS_PER_PAGE && (
        <CompactPagination
          page={page}
          pageSize={size}
          totalItems={held.total}
          unit={t('sessions')}
          onPageChange={setPage}
          pageSizes={SESSION_PAGE_SIZES}
          onPageSizeChange={(next) => {
            setSize(next);
            setPage(1);
          }}
        />
      )}
    </div>
  );
}
