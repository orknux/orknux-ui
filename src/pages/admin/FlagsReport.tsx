import { FieldHint } from '../../components/FieldHint';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { clearSessionFlag, fetchSessionFlagReport, sessionFlagsCsv } from '../../api/flags';
import type {
  SessionFlag,
  SessionFlagFilter,
  SessionFlagOrder,
  SessionFlagReport,
  SessionFlagState,
  SessionFlagType,
} from '../../api/flags';
import { fetchWorkspaces } from '../../api/workspaces';
import type { Workspace } from '../../api/workspaces';
import { ColumnHeader } from '../../components/ColumnHeader';
import { CompactPagination } from '../../components/CompactPagination';
import { Loader } from '../../components/Loader';
import { SearchBox } from '../../components/SearchBox';
import { useTableSort } from '../../components/tableSort';
import { useSearch } from '../../components/useSearch';
import { t } from '../../i18n';
import styles from './AdminReportsPage.module.css';
import { FlagsChart } from './FlagsChart';
import own from './FlagsReport.module.css';
import { dayOf, formatDate, Picker, Tile } from './reportParts';

const PER_PAGE = 25;
const PAGE_SIZES = [10, 25, 50];
const SEVERITIES = [0, 1, 2, 3, 4, 5];

/** A type as the report names it. */
export function flagTypeLabel(type: SessionFlagType): string {
  return type === 'SECURITY' ? t('Security') : t('Technical issue');
}

/** A state as the report names it. */
export function flagStateLabel(state: SessionFlagState): string {
  return state === 'OPEN' ? t('Not cleared') : t('Cleared');
}

/**
 * What agents flagged about the conversations they were in: a person probing
 * the product, or a fault in the harness or its setup. Installation
 * administrators only, like everything on this page - and nowhere else does a
 * flag show, so this is where one is read and cleared.
 */
export function FlagsReport() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [days, setDays] = useState(30);
  const [workspaceId, setWorkspaceId] = useState('');
  const [type, setType] = useState<SessionFlagType | ''>('');
  const [lowest, setLowest] = useState('0');
  const [highest, setHighest] = useState('5');
  const [state, setState] = useState<SessionFlagState | ''>('');
  const [typed, setTyped, searching] = useSearch();
  const [order, ascending, sortBy] = useTableSort<SessionFlagOrder>('session-flags', 'FLAGGED_AT', false, [
    'FLAGGED_AT', 'SEVERITY', 'SESSION',
  ]);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(PER_PAGE);
  const [report, setReport] = useState<SessionFlagReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [clearing, setClearing] = useState<string | null>(null);

  useEffect(() => {
    fetchWorkspaces(0, 200)
      .then((held) => setWorkspaces(held.content))
      .catch(() => setWorkspaces([]));
  }, []);

  const filter: SessionFlagFilter = {
    from: dayOf(new Date(Date.now() - (days - 1) * 86_400_000)),
    to: dayOf(new Date()),
    workspaceId: workspaceId || undefined,
    type: type || undefined,
    severityFrom: Number(lowest) > 0 ? Number(lowest) : undefined,
    severityTo: Number(highest) < 5 ? Number(highest) : undefined,
    state: state || undefined,
    search: searching.trim() || undefined,
  };
  const filterKey = JSON.stringify(filter);

  useEffect(() => setPage(1), [filterKey, order, ascending]);

  const load = useCallback(() => {
    fetchSessionFlagReport(JSON.parse(filterKey) as SessionFlagFilter, page - 1, size, order, ascending)
      .then((held) => {
        setReport(held);
        setError(null);
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : t('Could not load the report.')));
  }, [filterKey, page, size, order, ascending]);

  useEffect(load, [load]);

  async function clear(flag: SessionFlag) {
    setClearing(flag.id);
    try {
      await clearSessionFlag(flag.id);
      load();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : t('Could not clear the flag.'));
    } finally {
      setClearing(null);
    }
  }

  /** The report as the table shows it - every page, in this order - saved as a file. */
  async function exportCsv() {
    setExporting(true);
    try {
      const csv = await sessionFlagsCsv(filter, order, ascending);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      link.download = `flags-${filter.from ?? ''}-${filter.to ?? ''}.csv`;
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
    <section className={styles.card}>
      <div className={styles.reportHead}>
        <div className={styles.lead}>
          <h2 className={`${styles.sectionHeading} ${styles.headingWithHint}`}>
            {t('Flags')}
            <FieldHint label={t('Flags')}>{t("Sessions agents flagged on their own: someone probing for weaknesses, or a fault in the product's setup.")}</FieldHint>
          </h2>
          <SearchBox value={typed} onChange={setTyped} placeholder={t('Search notes...')} label={t('Search notes')} />
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
          <Picker label={t('Type')} value={type} onChange={(value) => setType(value as SessionFlagType | '')}>
            <option value="">{t('All types')}</option>
            <option value="SECURITY">{t('Security')}</option>
            <option value="TECHNICAL_ISSUE">{t('Technical issue')}</option>
          </Picker>
          <Picker label={t('Lowest severity')} value={lowest} onChange={setLowest}>
            {SEVERITIES.filter((one) => one <= Number(highest)).map((one) => (
              <option key={one} value={String(one)}>{String(one)}</option>
            ))}
          </Picker>
          <Picker label={t('Highest severity')} value={highest} onChange={setHighest}>
            {SEVERITIES.filter((one) => one >= Number(lowest)).map((one) => (
              <option key={one} value={String(one)}>{String(one)}</option>
            ))}
          </Picker>
          <Picker label={t('State')} value={state} onChange={(value) => setState(value as SessionFlagState | '')}>
            <option value="">{t('Open and cleared')}</option>
            <option value="OPEN">{t('Not cleared')}</option>
            <option value="CLEARED">{t('Cleared')}</option>
          </Picker>
          <button
            type="button"
            className={styles.export}
            onClick={() => void exportCsv()}
            disabled={exporting || report === null || report.total === 0}
            data-testid="flags-export"
          >
            {exporting ? t('Exporting…') : t('Export CSV')}
          </button>
        </div>
      </div>

      {report !== null && (
        <div className={styles.tiles} data-testid="flags-tiles">
          <Tile label={t('Flags')} value={String(report.total)}>
            {t('in this period')}
          </Tile>
          <Tile label={t('Not cleared')} value={String(report.open)}>
            {t('still to look at')}
          </Tile>
          <Tile label={t('Security')} value={String(report.security)}>
            {t('people probing the product')}
          </Tile>
          <Tile label={t('Technical issue')} value={String(report.technical)}>
            {t('faults in the harness or its setup')}
          </Tile>
        </div>
      )}

      {report !== null && report.days.length > 0 && <FlagsChart series={report.days} />}

      {error !== null && <p className={`${styles.notice} ${styles.noticeError}`}>{error}</p>}
      {report === null && error === null && <p className={styles.notice}><Loader /></p>}
      {report !== null && report.total === 0 && <p className={styles.notice}>{t('No flags in this period.')}</p>}

      {report !== null && report.total > 0 && (
        <div className={styles.tableBox}>
          <table className={styles.table} data-testid="flags-table">
            <thead>
              <tr>
                {([
                  ['FLAGGED_AT', t('Flagged at'), false],
                  ['WORKSPACE', t('Workspace'), false],
                  ['SESSION', t('Session'), false],
                  ['AGENT', t('Agent'), false],
                  ['TYPE', t('Type'), false],
                  ['SEVERITY', t('Severity'), true],
                  ['NOTE', t('Note'), false],
                  ['STATE', t('State'), false],
                  ['CLEARED_BY', t('Cleared by'), false],
                  [null, '', false],
                ] as const).map(([column, label, numeric]) => (
                  <th key={column ?? 'actions'} className={numeric ? styles.number : undefined}>
                    <ColumnHeader
                      label={label}
                      order={column ?? undefined}
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
              {report.rows.map((one) => (
                <FlagRow key={one.id} flag={one} clearing={clearing === one.id} onClear={() => void clear(one)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {report !== null && report.total > PAGE_SIZES[0] && (
        <CompactPagination
          page={page}
          pageSize={size}
          totalItems={report.total}
          onPageChange={setPage}
          unit={t('flags')}
          pageSizes={PAGE_SIZES}
          onPageSizeChange={(next) => {
            setSize(next);
            setPage(1);
          }}
        />
      )}
    </section>
  );
}

function FlagRow({ flag, clearing, onClear }: { flag: SessionFlag; clearing: boolean; onClear: () => void }) {
  return (
    <tr data-testid="flag-row" data-flag-type={flag.type} data-flag-state={flag.state}>
      <td className={styles.muted}>{formatDate(flag.at)}</td>
      <td className={flag.workspaceName === null ? styles.muted : undefined}>{flag.workspaceName ?? t('Removed workspace')}</td>
      <td>
        <Link to={`/workspace/${flag.workspaceId}/sessions/${flag.sessionId}`} data-flag-session="">
          {`#${flag.sessionId} ${flag.sessionTitle ?? t('Removed session')}`}
        </Link>
      </td>
      <td>{flag.agentName}</td>
      <td>
        <span className={flag.type === 'SECURITY' ? own.typeSecurity : own.typeTechnical}>{flagTypeLabel(flag.type)}</span>
      </td>
      <td className={styles.number} data-flag-severity={flag.severity}>
        <span className={flag.severity >= 4 ? own.severityHigh : flag.severity >= 2 ? own.severityMiddling : own.severityLow}>
          {flag.severity}
        </span>
      </td>
      <td className={styles.review} data-flag-note="">{flag.note}</td>
      <td className={flag.state === 'CLEARED' ? styles.muted : undefined}>{flagStateLabel(flag.state)}</td>
      <td className={styles.muted}>{flag.clearedBy ?? '—'}</td>
      <td>
        {flag.state === 'OPEN' && (
          <button type="button" className={own.clear} onClick={onClear} disabled={clearing} data-testid="flag-clear">
            {clearing ? t('Clearing…') : t('Clear flag')}
          </button>
        )}
      </td>
    </tr>
  );
}
