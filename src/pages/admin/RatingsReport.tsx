import { FieldHint } from '../../components/FieldHint';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { fetchChatReviewsEnabled, fetchSessionRatings, fetchSessionRatingsEnabled } from '../../api/ratings';
import type { RatingOrder, SessionRating, SessionRatingReport } from '../../api/ratings';
import type { PromptSource, UsageFilter } from '../../api/usage';
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
import { RecordingOff } from './RecordingOff';
import { RatingsChart } from './RatingsChart';
import { dayOf, formatDate, Picker, Tile } from './reportParts';

const PER_PAGE = 25;
const PAGE_SIZES = [10, 25, 50];

/**
 * The reviews people wrote about a conversation, which the agent sent on
 * through rate_session.
 *
 * Two switches in Admin Settings feed it - the agents' tool, and the chat's own
 * menu - and a line here says which is off. Off, nothing new arrives through
 * that door; what was sent while it was on stays readable.
 */
export function RatingsReport() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [days, setDays] = useState(30);
  const [workspaceId, setWorkspaceId] = useState('');
  const [source, setSource] = useState<PromptSource | ''>('');
  const [typed, setTyped, searching] = useSearch();
  const [order, ascending, sortBy] = useTableSort<RatingOrder>('session-ratings', 'AT', false, ['AT', 'SCORE', 'SESSION']);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(PER_PAGE);
  const [report, setReport] = useState<SessionRatingReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [agentsOn, setAgentsOn] = useState<boolean | null>(null);
  const [chatOn, setChatOn] = useState<boolean | null>(null);

  useEffect(() => {
    fetchSessionRatingsEnabled()
      .then((held) => setAgentsOn(held.enabled))
      .catch(() => setAgentsOn(null));
    fetchChatReviewsEnabled()
      .then((held) => setChatOn(held.enabled))
      .catch(() => setChatOn(null));
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

  useEffect(() => setPage(1), [days, workspaceId, source, searching, order, ascending]);

  const load = useCallback(() => {
    fetchSessionRatings(JSON.parse(filterKey) as UsageFilter, page - 1, size, order, ascending)
      .then((held) => {
        setReport(held);
        setError(null);
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : t('Could not load the report.')));
  }, [filterKey, page, size, order, ascending]);

  useEffect(load, [load]);

  const unhappy = report === null ? 0 : report.counts[0] + report.counts[1];

  return (
    <>
      {agentsOn === false && chatOn === false ? (
        <RecordingOff report="ratings" setting="session-ratings" action={t('Turn them on in Settings')}>
          {t('Session ratings and chat reviews are off.')}
        </RecordingOff>
      ) : agentsOn === false ? (
        <RecordingOff report="ratings" setting="session-ratings" action={t('Turn them on in Settings')}>
          {t('Session ratings are off.')}
        </RecordingOff>
      ) : chatOn === false ? (
        <RecordingOff report="ratings" setting="chat-reviews" action={t('Turn them on in Settings')}>
          {t('Chat reviews are off.')}
        </RecordingOff>
      ) : null}

      <section className={styles.card}>
        <div className={styles.reportHead}>
          <div className={styles.lead}>
            <h2 className={`${styles.sectionHeading} ${styles.headingWithHint}`}>
            {t('Reviews')}
            <FieldHint label={t('Reviews')}>{t("What people said of a conversation, through the chat's menu or an agent's rate_session.")}</FieldHint>
          </h2>
            <SearchBox value={typed} onChange={setTyped} placeholder={t('Search reviews...')} label={t('Search reviews')} />
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
          </div>
        </div>

        {report !== null && (
          <div className={styles.tiles} data-testid="ratings-tiles">
            <Tile label={t('Reviews')} value={String(report.total)}>
              {t('in this period')}
            </Tile>
            <Tile label={t('Average')} value={report.average === null ? '—' : `${report.average.toFixed(1)} / 5`}>
              {t('score, from 1 to 5')}
            </Tile>
            <Tile label={t('Unhappy')} value={String(unhappy)}>
              {t('scored 1 or 2')}
            </Tile>
            <Tile label={t('Scores')} value={report.counts.join(' · ')}>
              {t('1 to 5, how many gave each')}
            </Tile>
          </div>
        )}

        {report !== null && report.days.length > 0 && <RatingsChart series={report.days} />}

        {error !== null && <p className={`${styles.notice} ${styles.noticeError}`}>{error}</p>}
        {report === null && error === null && <p className={styles.notice}><Loader /></p>}
        {report !== null && report.total === 0 && <p className={styles.notice}>{t('No reviews in this period.')}</p>}

        {report !== null && report.total > 0 && (
          <div className={styles.tableBox}>
            <table className={styles.table} data-testid="ratings-table">
              <thead>
                <tr>
                  {([
                    ['AT', t('When'), false],
                    ['SCORE', t('Score'), true],
                    [null, t('Review'), false],
                    ['PERSON', t('Person'), false],
                    ['AGENT', t('Agent'), false],
                    ['SESSION', t('Session'), false],
                    [null, t('Workspace'), false],
                  ] as const).map(([column, label, numeric]) => (
                    <th key={label} className={numeric ? styles.number : undefined}>
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
                {report.rows.map((one) => <RatingRow key={one.id} rating={one} />)}
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
            unit={t('reviews')}
            pageSizes={PAGE_SIZES}
            onPageSizeChange={(next) => {
              setSize(next);
              setPage(1);
            }}
          />
        )}
      </section>
    </>
  );
}

function RatingRow({ rating }: { rating: SessionRating }) {
  return (
    <tr data-testid="rating-row">
      <td className={styles.muted}>{formatDate(rating.at)}</td>
      <td className={styles.number} data-rating-score="">{`${rating.score} / 5`}</td>
      <td className={`${styles.review} ${rating.review === null ? styles.muted : ''}`}>{rating.review ?? '—'}</td>
      <td>
        <span className={styles.person}>
          <span className={styles.personName}>{rating.source === 'NONE' ? t('Unattributed') : rating.personName ?? rating.personKey}</span>
          <span className={styles.personDetail}>{rating.source === 'SLACK' ? 'Slack' : rating.source === 'ORKNUX' ? 'Orknux' : '—'}</span>
        </span>
      </td>
      <td>{rating.agentName}</td>
      <td>
        <Link to={`/workspace/${rating.workspaceId}/sessions/${rating.sessionId}`}>
          {`#${rating.sessionId} ${rating.sessionTitle ?? t('Removed session')}`}
        </Link>
      </td>
      <td className={rating.workspaceName === null ? styles.muted : undefined} data-rating-workspace="">
        {rating.workspaceName ?? t('Removed workspace')}
      </td>
    </tr>
  );
}
