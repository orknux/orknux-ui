import { useCallback, useEffect, useState } from 'react';

import type { PageOf } from '../api/client';
import { fetchMcpCalls, fetchMcpSessions } from '../api/mcpClients';
import type { McpCallOrder, McpClientCall, McpClientSession, McpSessionOrder, McpSessionPage } from '../api/mcpClients';
import refreshIcon from '../assets/refresh-cw.svg';
import { t, tf } from '../i18n';
import { zoned } from '../session/timeZone';
import { AutoRefresh } from './AutoRefresh';
import { ColumnHeader } from './ColumnHeader';
import { CompactPagination } from './CompactPagination';
import { Loader } from './Loader';
import { PAGE_SIZES, usePageSize } from './pageSize';
import { useTableSort } from './tableSort';
import styles from './McpClients.module.css';

export interface McpClientsProps {
  /** The one workspace to show, or null for every workspace - Admin -> MCP. */
  workspaceId: string | null;
}

/**
 * Who reaches Orknux over MCP: each client's session - who, as which client and
 * token, from which address and host, connected or not - and every call those
 * clients made, newest first. Picking a session narrows the history to it.
 *
 * The same view on Admin -> MCP, for every workspace, and on a workspace's own
 * MCP page, for that one; the workspace column is drawn only on the first.
 */
export function McpClients({ workspaceId }: McpClientsProps) {
  const everywhere = workspaceId === null;
  const scope = everywhere ? 'admin' : 'workspace';

  const [sessions, setSessions] = useState<McpSessionPage | null>(null);
  const [sessionPage, setSessionPage] = useState(1);
  const [sessionSize, setSessionSize] = usePageSize(`mcp-sessions-${scope}`);
  const [connectedOnly, setConnectedOnly] = useState(false);
  // Ordered by the server, because a page of a list in order is not the list in order.
  const [sessionOrder, sessionAscending, sortSessions] = useTableSort<McpSessionOrder>(
    `mcp-sessions-${scope}`, 'LAST_SEEN', false, ['LAST_SEEN', 'CALLS'],
  );
  const [callOrder, callAscending, sortCalls] = useTableSort<McpCallOrder>(
    `mcp-calls-${scope}`, 'AT', false, ['AT', 'DURATION', 'RESULT'],
  );

  const [calls, setCalls] = useState<PageOf<McpClientCall> | null>(null);
  const [callPage, setCallPage] = useState(1);
  const [callSize, setCallSize] = usePageSize(`mcp-calls-${scope}`);
  const [failedOnly, setFailedOnly] = useState(false);
  const [picked, setPicked] = useState<McpClientSession | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setSessionPage(1), [connectedOnly, workspaceId, sessionOrder, sessionAscending]);
  useEffect(() => setCallPage(1), [failedOnly, picked, workspaceId, callOrder, callAscending]);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetchMcpSessions(workspaceId, sessionPage - 1, sessionSize, connectedOnly, sessionOrder, sessionAscending),
      fetchMcpCalls(workspaceId, picked?.id ?? null, callPage - 1, callSize, failedOnly, callOrder, callAscending),
    ])
      .then(([sessionsNow, callsNow]) => {
        setSessions(sessionsNow);
        setCalls(callsNow);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : t('Could not load the MCP clients.'));
        setLoading(false);
      });
  }, [workspaceId, sessionPage, sessionSize, connectedOnly, sessionOrder, sessionAscending, picked, callPage, callSize, failedOnly, callOrder, callAscending]);

  useEffect(load, [load]);

  /* A heading of either table: the shared column header, inside the cell the table lays out. */
  const SessionHead = ({ label, order, number = false }: { label: string; order: McpSessionOrder; number?: boolean }) => (
    <th className={number ? styles.number : undefined}>
      <ColumnHeader label={label} order={order} current={sessionOrder} ascending={sessionAscending} onSort={sortSessions} className={styles.head} />
    </th>
  );
  const CallHead = ({ label, order, number = false }: { label: string; order: McpCallOrder; number?: boolean }) => (
    <th className={number ? styles.number : undefined}>
      <ColumnHeader label={label} order={order} current={callOrder} ascending={callAscending} onSort={sortCalls} className={styles.head} />
    </th>
  );

  return (
    <div className={styles.view} data-testid="mcp-clients">
      <div className={styles.toolbar}>
        <span className={styles.summary} data-testid="mcp-connected-count">
          {sessions === null ? '' : tf('{count} connected now', { count: sessions.connectedCount })}
        </span>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={connectedOnly}
            onChange={(event) => setConnectedOnly(event.target.checked)}
            data-testid="mcp-connected-only"
          />
          {t('Connected only')}
        </label>
        <div className={styles.watch}>
          <button
            type="button"
            className={styles.refresh}
            onClick={load}
            aria-label={t('Refresh the MCP clients')}
            title={t('Refresh the MCP clients')}
          >
            <img src={refreshIcon} alt="" width={14} height={14} />
          </button>
          <AutoRefresh onRefresh={load} busy={loading} />
        </div>
      </div>

      {error !== null && <p className={`${styles.notice} ${styles.noticeError}`}>{error}</p>}

      <section className={styles.card} aria-labelledby="mcp-sessions-heading">
        <h2 className={styles.cardTitle} id="mcp-sessions-heading">
          {t('Sessions')}
        </h2>
        <div className={styles.scroll}>
          <table className={styles.table} data-testid="mcp-sessions">
            <thead>
              <tr>
                <SessionHead label={t('Status')} order="STATUS" />
                <SessionHead label={t('Client')} order="CLIENT" />
                <SessionHead label={t('Person')} order="PERSON" />
                <SessionHead label={t('Address')} order="ADDRESS" />
                {everywhere && <SessionHead label={t('Workspace')} order="WORKSPACE" />}
                <SessionHead label={t('Last seen')} order="LAST_SEEN" />
                <SessionHead label={t('Calls')} order="CALLS" number />
              </tr>
            </thead>
            <tbody>
              {sessions?.content.map((session) => {
                const chosen = picked?.id === session.id;
                return (
                  <tr
                    key={session.id}
                    className={chosen ? `${styles.clickable} ${styles.chosen}` : styles.clickable}
                    onClick={() => setPicked(chosen ? null : session)}
                    data-testid="mcp-session"
                    data-session-id={session.id}
                    aria-selected={chosen}
                  >
                    <td>
                      <Status session={session} />
                    </td>
                    <td>
                      <span className={styles.strong}>
                        {session.clientName ?? t('Unknown client')}
                        {session.clientVersion !== null && <span className={styles.muted}> {session.clientVersion}</span>}
                      </span>
                      {session.userAgent !== null && <span className={styles.sub} title={session.userAgent}>{session.userAgent}</span>}
                    </td>
                    <td>
                      <span className={styles.strong}>{session.username}</span>
                      {session.tokenName !== null && <span className={styles.sub}>{tf('token {name}', { name: session.tokenName })}</span>}
                    </td>
                    <td data-testid="mcp-session-address">
                      <span className={`${styles.strong} ${styles.mono}`} data-testid="mcp-session-ip">{session.ipAddress}</span>
                      <span className={styles.sub} data-testid="mcp-session-host">
                        {session.hostname ?? t('no host name')}
                      </span>
                      {session.peerAddress !== null && (
                        <span className={styles.sub}>{tf('via {address}', { address: session.peerAddress })}</span>
                      )}
                    </td>
                    {everywhere && <td data-testid="mcp-session-workspace">{session.workspaceName ?? session.workspaceId}</td>}
                    <td className={styles.when}>
                      {formatDate(session.lastSeenAt)}
                      <span className={styles.sub}>{tf('since {when}', { when: formatDate(session.startedAt) })}</span>
                    </td>
                    <td className={styles.number}>{session.calls}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {loading && sessions === null && <p className={styles.notice}><Loader /></p>}
        {sessions !== null && sessions.content.length === 0 && (
          <p className={styles.notice}>{connectedOnly ? t('No MCP client is connected now.') : t('No MCP client has connected yet.')}</p>
        )}
        <CompactPagination
          page={sessionPage}
          pageSize={sessionSize}
          totalItems={sessions?.totalElements ?? 0}
          onPageChange={setSessionPage}
          unit={t('sessions')}
          pageSizes={PAGE_SIZES}
          onPageSizeChange={(chosen) => {
            setSessionSize(chosen);
            setSessionPage(1);
          }}
        />
      </section>

      <section className={styles.card} aria-labelledby="mcp-calls-heading">
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle} id="mcp-calls-heading">
            {t('History')}
          </h2>
          {picked !== null && (
            <button type="button" className={styles.chip} onClick={() => setPicked(null)} data-testid="mcp-calls-session">
              {tf('Only {client} from {address}', {
                client: picked.clientName ?? t('Unknown client'),
                address: picked.hostname ?? picked.ipAddress,
              })}
              <span aria-hidden="true"> ×</span>
            </button>
          )}
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={failedOnly}
              onChange={(event) => setFailedOnly(event.target.checked)}
              data-testid="mcp-failed-only"
            />
            {t('Failed only')}
          </label>
        </div>
        <div className={styles.scroll}>
          <table className={styles.table} data-testid="mcp-calls">
            <thead>
              <tr>
                <CallHead label={t('When')} order="AT" />
                <CallHead label={t('Called')} order="CALLED" />
                <CallHead label={t('Person')} order="PERSON" />
                <CallHead label={t('From')} order="ADDRESS" />
                {everywhere && <CallHead label={t('Workspace')} order="WORKSPACE" />}
                <CallHead label={t('Result')} order="RESULT" />
                <CallHead label={t('Took')} order="DURATION" number />
                {/* What a call was passed, cut short: nothing to put in order. */}
                <th>{t('Arguments')}</th>
              </tr>
            </thead>
            <tbody>
              {calls?.content.map((call) => (
                <tr key={call.id} data-testid="mcp-call" data-tool={call.tool ?? call.method}>
                  <td className={styles.when}>{formatDate(call.at)}</td>
                  <td>
                    <span className={`${styles.strong} ${styles.mono}`}>{call.tool ?? call.method}</span>
                    {call.method !== 'tools/call' && <span className={styles.sub}>{call.method}</span>}
                  </td>
                  <td>{call.username}</td>
                  <td>
                    <span className={styles.mono}>{call.ipAddress}</span>
                    {call.hostname !== null && <span className={styles.sub}>{call.hostname}</span>}
                  </td>
                  {everywhere && <td>{call.workspaceName ?? call.workspaceId}</td>}
                  <td>
                    {call.failed ? (
                      <span className={`${styles.pill} ${styles.pillFailed}`} title={call.error ?? undefined}>
                        {t('Failed')}
                      </span>
                    ) : (
                      <span className={`${styles.pill} ${styles.pillOk}`}>{t('OK')}</span>
                    )}
                    {call.failed && call.error !== null && <span className={styles.sub} title={call.error}>{call.error}</span>}
                  </td>
                  <td className={styles.number}>{formatDuration(call.durationMs)}</td>
                  <td className={styles.arguments}>
                    <code title={call.arguments ?? undefined}>{call.arguments ?? ''}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading && calls === null && <p className={styles.notice}><Loader /></p>}
        {calls !== null && calls.content.length === 0 && <p className={styles.notice}>{t('No calls to show.')}</p>}
        <CompactPagination
          page={callPage}
          pageSize={callSize}
          totalItems={calls?.totalElements ?? 0}
          onPageChange={setCallPage}
          unit={t('calls')}
          pageSizes={PAGE_SIZES}
          onPageSizeChange={(chosen) => {
            setCallSize(chosen);
            setCallPage(1);
          }}
        />
      </section>
    </div>
  );
}

/** Connected, idle - quiet past the window Admin -> Settings sets - or ended by the client. */
function Status({ session }: { session: McpClientSession }) {
  if (session.connected) {
    return <span className={`${styles.pill} ${styles.pillOk}`} data-status="connected">{t('Connected')}</span>;
  }
  if (session.endedAt !== null) {
    return <span className={`${styles.pill} ${styles.pillQuiet}`} data-status="ended">{t('Ended')}</span>;
  }
  return <span className={`${styles.pill} ${styles.pillQuiet}`} data-status="idle">{t('Idle')}</span>;
}

/** "Aug 14 09:12:05", with the year only where it is not this one. */
function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const thisYear = date.getFullYear() === new Date().getFullYear();
  const day = new Intl.DateTimeFormat('en-US', zoned(thisYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' })).format(date);
  const time = new Intl.DateTimeFormat('en-US', zoned({ hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })).format(date);
  return `${day} ${time}`;
}

function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}
