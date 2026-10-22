import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { fetchErrorReport } from '../../api/errors';
import type { ErrorRecord, ErrorReport, ErrorSource } from '../../api/errors';
import type { UsageFilter } from '../../api/usage';
import { fetchWorkspaces } from '../../api/workspaces';
import type { Workspace } from '../../api/workspaces';
import { CompactPagination } from '../../components/CompactPagination';
import { Loader } from '../../components/Loader';
import { SearchBox } from '../../components/SearchBox';
import { useSearch } from '../../components/useSearch';
import { t } from '../../i18n';
import styles from './AdminReportsPage.module.css';
import { ErrorsChart } from './ErrorsChart';
import { dayOf, formatDate, Picker, Tile } from './reportParts';

const PER_PAGE = 25;
const PAGE_SIZES = [10, 25, 50];

/** What each source is called on the page. */
function sourceName(source: ErrorSource): string {
  if (source === 'RUN') return t('Workflow run');
  if (source === 'AGENT') return t('Agent');
  return t('Quick chat');
}

/**
 * What failed over a period, as it was recorded when it failed: a workflow run
 * that ended failed, an agent that could not answer, the quick chat's model.
 * Newest first, with how many of each and what failed most often.
 */
export function ErrorsReport() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [days, setDays] = useState(30);
  const [workspaceId, setWorkspaceId] = useState('');
  const [source, setSource] = useState<ErrorSource | ''>('');
  const [typed, setTyped, searching] = useSearch();
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(PER_PAGE);
  const [report, setReport] = useState<ErrorReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchWorkspaces(0, 200)
      .then((held) => setWorkspaces(held.content))
      .catch(() => setWorkspaces([]));
  }, []);

  const filter: UsageFilter = {
    from: dayOf(new Date(Date.now() - (days - 1) * 86_400_000)),
    to: dayOf(new Date()),
    workspaceId: workspaceId || undefined,
    search: searching.trim() || undefined,
  };
  const filterKey = JSON.stringify(filter);

  useEffect(() => setPage(1), [days, workspaceId, source, searching]);

  const load = useCallback(() => {
    fetchErrorReport(JSON.parse(filterKey) as UsageFilter, source || null, page - 1, size)
      .then((held) => {
        setReport(held);
        setError(null);
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : t('Could not load the report.')));
  }, [filterKey, source, page, size]);

  useEffect(load, [load]);

  const countOf = (which: ErrorSource) => report?.counts.find((one) => one.source === which)?.count ?? 0;
  const all = report === null ? 0 : report.counts.reduce((sum, one) => sum + one.count, 0);

  return (
    <section className={styles.card} data-testid="errors-report">
      <div className={styles.reportHead}>
        <div className={styles.lead}>
          <h2 className={styles.sectionHeading}>{t('Errors')}</h2>
          <SearchBox value={typed} onChange={setTyped} placeholder={t('Search errors...')} label={t('Search errors')} />
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
          <Picker label={t('Source')} value={source} onChange={(value) => setSource(value as ErrorSource | '')}>
            <option value="">{t('All sources')}</option>
            <option value="RUN">{sourceName('RUN')}</option>
            <option value="AGENT">{sourceName('AGENT')}</option>
            <option value="MODEL">{sourceName('MODEL')}</option>
          </Picker>
        </div>
      </div>

      {report !== null && (
        <div className={styles.tiles} data-testid="errors-tiles">
          <Tile label={t('Errors')} value={String(all)}>{t('in this period')}</Tile>
          <Tile label={t('Workflow runs')} value={String(countOf('RUN'))}>{t('ended failed')}</Tile>
          <Tile label={t('Agents')} value={String(countOf('AGENT'))}>{t('could not answer')}</Tile>
          <Tile label={t('Quick chat')} value={String(countOf('MODEL'))}>{t('its model could not answer')}</Tile>
        </div>
      )}

      {report !== null && report.days.length > 0 && <ErrorsChart series={report.days} />}

      {error !== null && <p className={`${styles.notice} ${styles.noticeError}`}>{error}</p>}
      {report === null && error === null && <p className={styles.notice}><Loader /></p>}
      {report !== null && report.total === 0 && <p className={styles.notice}>{t('Nothing failed in this period.')}</p>}

      {report !== null && report.often.length > 0 && (
        <div className={styles.tableBox}>
          <table className={styles.table} data-testid="errors-often">
            <caption className={styles.caption}>{t('Failed most often')}</caption>
            <thead>
              <tr>
                <th>{t('What')}</th>
                <th>{t('Source')}</th>
                <th className={styles.number}>{t('Times')}</th>
                <th>{t('Last')}</th>
              </tr>
            </thead>
            <tbody>
              {report.often.map((one) => (
                <tr key={`${one.source}:${one.subject}`}>
                  <td>{one.subject}</td>
                  <td className={styles.muted}>{sourceName(one.source)}</td>
                  <td className={styles.number}>{one.count}</td>
                  <td className={styles.muted}>{formatDate(one.last)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {report !== null && report.total > 0 && (
        <div className={styles.tableBox}>
          <table className={styles.table} data-testid="errors-table">
            <thead>
              <tr>
                <th>{t('When')}</th>
                <th>{t('Source')}</th>
                <th>{t('What')}</th>
                <th>{t('Error')}</th>
                <th>{t('Workspace')}</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((one) => <ErrorRow key={one.id} record={one} />)}
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
          unit={t('errors')}
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

function ErrorRow({ record }: { record: ErrorRecord }) {
  // The run for a run, the conversation for an agent or the quick chat; the name alone where neither is known.
  const to =
    record.executionId !== null
      ? `/workspace/${record.workspaceId}/executions/${record.executionId}`
      : record.sessionId !== null
        ? `/workspace/${record.workspaceId}/sessions/${record.sessionId}`
        : null;
  return (
    <tr data-testid="error-row" data-error-source={record.source}>
      <td className={styles.muted}>{formatDate(record.at)}</td>
      <td className={styles.muted}>{sourceName(record.source)}</td>
      <td>{to === null ? record.subject : <Link to={to}>{record.subject}</Link>}</td>
      <td className={styles.review} data-error-message="">{record.message}</td>
      <td className={record.workspaceName === null ? styles.muted : undefined}>
        {record.workspaceName ?? t('Removed workspace')}
      </td>
    </tr>
  );
}
