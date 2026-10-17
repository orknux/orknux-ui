import { Fragment, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { costAmount, tokenCount } from '../../api/chat';
import type { SessionUser } from '../../api/session';
import {
  fetchUsagePersonSessions,
  fetchUsageReport,
  fetchUsageTracking,
  setUsageTracking,
  shortTokens,
  usageReportCsv,
} from '../../api/usage';
import type { PromptSource, UsageFilter, UsageOrder, UsagePerson, UsageReport, UsageSessionShare, UsageTracking } from '../../api/usage';
import { fetchWorkspaces } from '../../api/workspaces';
import type { Workspace } from '../../api/workspaces';
import chevronDown12Icon from '../../assets/chevron-down-12.svg';
import chevronDownIcon from '../../assets/chevron-down.svg';
import toggleOffIcon from '../../assets/toggle-off.svg';
import toggleOnIcon from '../../assets/toggle-on.svg';
import { AdminSidebar } from '../../components/AdminSidebar';
import { AppShell } from '../../components/AppShell';
import { ColumnHeader } from '../../components/ColumnHeader';
import { CompactPagination } from '../../components/CompactPagination';
import { FieldHint } from '../../components/FieldHint';
import { Loader } from '../../components/Loader';
import { Pagination } from '../../components/Pagination';
import { SearchBox } from '../../components/SearchBox';
import { useTableSort } from '../../components/tableSort';
import { useSearch } from '../../components/useSearch';
import { t, tf } from '../../i18n';
import { shellUser } from '../../session/user';
import { zoned } from '../../session/timeZone';
import styles from './AdminReportsPage.module.css';

export interface AdminReportsPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

const PEOPLE_PER_PAGE = 25;
const SESSIONS_PER_PAGE = 5;

/**
 * Admin > Reports: tokens by the person who prompted them.
 *
 * The switch at the top is the whole of what is recorded - off writes nothing
 * at all, and is where a fresh installation starts. The report under it reads
 * whatever was recorded while it was on, so switching off does not empty it.
 */
export function AdminReportsPage({ session, onSignOut }: AdminReportsPageProps) {
  const [tracking, setTracking] = useState<UsageTracking | null>(null);
  const [busy, setBusy] = useState(false);
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
  const [report, setReport] = useState<UsageReport | null>(null);
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
    fetchUsageReport(JSON.parse(filterKey) as UsageFilter, page - 1, PEOPLE_PER_PAGE, order, ascending)
      .then((held) => {
        setReport(held);
        setError(null);
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : t('Could not load the report.')))
      .finally(() => setLoading(false));
  }, [filterKey, page, order, ascending]);

  useEffect(load, [load]);

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

  async function flip() {
    if (tracking === null) return;
    setBusy(true);
    try {
      setTracking(await setUsageTracking(!tracking.enabled));
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : t('Could not change usage tracking.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell user={shellUser(session)} onSignOut={onSignOut} sidebar={<AdminSidebar active="reports" />}>
      <header className={styles.titleHeader}>
        <h1 className={styles.title}>{t('Reports')}</h1>
      </header>

      <section className={styles.card} data-testid="usage-tracking">
        <div className={styles.trackingRow}>
          <div className={styles.headingRow}>
            <h2 className={styles.sectionHeading}>{t('Usage tracking')}</h2>
            <FieldHint label={t('Usage tracking')}>
              {t('Records who prompted every model call. Off records nothing at all; what was recorded stays readable.')}
            </FieldHint>
          </div>
          <span className={tracking?.enabled ? styles.stateOn : styles.stateOff} data-tracking-state="">
            {tracking === null ? '' : tracking.enabled ? t('On') : t('Off')}
          </span>
          <button
            type="button"
            className={styles.toggle}
            onClick={() => void flip()}
            disabled={busy || tracking === null}
            role="switch"
            aria-checked={tracking?.enabled ?? false}
            aria-label={tracking?.enabled ? t('Turn usage tracking off') : t('Turn usage tracking on')}
          >
            <img src={tracking?.enabled ? toggleOnIcon : toggleOffIcon} alt="" width={36} height={20} data-keeps-colour />
          </button>
        </div>
        {tracking !== null && !tracking.enabled && tracking.changedAt !== null && (
          <p className={styles.offSince} data-tracking-off-since="">
            {tf('Off since {when}. Nothing after that is recorded.', { when: formatDate(tracking.changedAt) })}
          </p>
        )}
      </section>

      <section className={styles.card}>
        <div className={styles.reportHead}>
          <h2 className={styles.sectionHeading}>{t('Tokens by person')}</h2>
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

        <div className={styles.searchRow}>
          <SearchBox value={typed} onChange={setTyped} placeholder={t('Search people...')} label={t('Search people')} />
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

        {report !== null && report.total > PEOPLE_PER_PAGE && (
          <Pagination
            page={page}
            pageSize={PEOPLE_PER_PAGE}
            totalItems={report.total}
            onPageChange={setPage}
            label={t('people')}
          />
        )}
      </section>
    </AppShell>
  );
}

function PersonRow({ person, open, onToggle }: { person: UsagePerson; open: boolean; onToggle: () => void }) {
  const unattributed = person.source === 'NONE';
  return (
    <tr className={open ? styles.rowOpen : undefined} data-testid="usage-person" data-person={person.key}>
      <td>
        <button type="button" className={styles.personButton} onClick={onToggle} aria-expanded={open}>
          <img className={open ? styles.chevronOpen : styles.chevron} src={chevronDownIcon} alt="" width={14} height={14} />
          <span className={styles.person}>
            <span className={styles.personName}>{unattributed ? t('Unattributed') : person.name ?? person.personKey}</span>
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
  const [held, setHeld] = useState<{ total: number; items: UsageSessionShare[] } | null>(null);
  const filterKey = JSON.stringify(filter);

  useEffect(() => {
    fetchUsagePersonSessions(person, JSON.parse(filterKey) as UsageFilter, page - 1, SESSIONS_PER_PAGE)
      .then(setHeld)
      .catch(() => setHeld({ total: 0, items: [] }));
  }, [person, filterKey, page]);

  if (held === null) return <Loader />;
  return (
    <div className={styles.sessions} data-testid="usage-sessions">
      <table className={styles.sessionTable}>
        <thead>
          <tr>
            <th>{t('Session')}</th>
            <th>{t('Workspace')}</th>
            <th>{t('Also prompted by')}</th>
            <th className={styles.number}>{t('Their share')}</th>
            <th className={styles.number}>{t('Tokens')}</th>
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
              </tr>
            );
          })}
        </tbody>
      </table>
      {held.total > SESSIONS_PER_PAGE && (
        <CompactPagination
          page={page}
          pageSize={SESSIONS_PER_PAGE}
          totalItems={held.total}
          unit={t('sessions')}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}

function Picker({ label, value, onChange, children }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className={styles.picker}>
      <span className={styles.pickerLabel}>{label}</span>
      <span className={styles.pickerBox}>
        <select className={styles.pickerSelect} value={value} onChange={(event) => onChange(event.target.value)}>
          {children}
        </select>
        <img className={styles.pickerChevron} src={chevronDown12Icon} alt="" width={12} height={12} />
      </span>
    </label>
  );
}

function Tile({ label, value, exact, children }: { label: string; value: string; exact?: number; children: React.ReactNode }) {
  return (
    <div className={styles.tile}>
      <span className={styles.tileLabel}>{label}</span>
      <span className={styles.tileValue} title={exact === undefined ? undefined : tokenCount(exact)}>{value}</span>
      <span className={styles.tileNote}>{children}</span>
    </div>
  );
}

function costOf(cost: string | null, partly: boolean): string {
  if (cost === null) return '—';
  return `${costAmount(Number(cost))}${partly ? '+' : ''}`;
}

function share(part: number, whole: number): string {
  if (whole === 0) return '0%';
  return `${Math.round((part / whole) * 100)}%`;
}

function dayOf(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('en-US', zoned({ month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })).format(date);
}
