import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import {
  authLabel,
  connectionTypeLabel,
  fetchMcpServers,
  fetchWorkspaceConnections,
  statusLabel,
} from '../../api/integrations';
import type { ConnectionStatus, McpServer, WorkspaceConnection } from '../../api/integrations';
import type { SessionUser } from '../../api/session';
import settingsIcon from '../../assets/settings-14.svg';
import { AppShell } from '../../components/AppShell';
import { ColumnHeader } from '../../components/ColumnHeader';
import { ConnectionIcon } from '../../components/ConnectionIcon';
import { Loader } from '../../components/Loader';
import { ordered, useTableSort } from '../../components/tableSort';
import { McpServerDialog } from '../../components/McpServerDialog';
import { WorkspaceConnectionDialog } from '../../components/WorkspaceConnectionDialog';
import { CompactPagination } from '../../components/CompactPagination';
import { SearchBox, SearchRow } from '../../components/SearchBox';
import { useSearch } from '../../components/useSearch';
import { PAGE_SIZES, usePageSize } from '../../components/pageSize';
import { WorkspaceSidebar } from '../../components/WorkspaceSidebar';
import { shellUser } from '../../session/user';
import styles from './WorkspaceIntegrationsPage.module.css';
import { t } from '../../i18n';

export interface WorkspaceIntegrationsPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

/**
 * Green once the last check reached the server, red when it failed, grey until
 * the first one. Kept up to date on a timer, so this says which servers answer
 * now rather than which answered whenever somebody last pressed Check. #329.
 */
function reachableDot(reachable: boolean | null): string {
  if (reachable === true) return styles.dotConnected;
  if (reachable === false) return styles.dotFailed;
  return styles.dotIdle;
}

function reachableLabel(reachable: boolean | null): string {
  if (reachable === true) return t('Reachable');
  if (reachable === false) return t('Unreachable');
  return t('Not checked');
}

/** Green once the service answered, red when a check failed, grey until then. */
function statusDot(status: ConnectionStatus): string {
  switch (status) {
    case 'CONNECTED':
      return styles.dotConnected;
    case 'FAILED':
      return styles.dotFailed;
    default:
      return styles.dotIdle;
  }
}

/**
 * What each of the two tables here can be put in the order of.
 *
 * Two unions, because they are two lists: an MCP server has an address and a
 * connection has a type, and one list of names would offer each the other's.
 */
type ServerColumn = 'NAME' | 'ADDRESS' | 'AUTH';
type ConnectionColumn = 'NAME' | 'TYPE' | 'STATUS';

export function WorkspaceIntegrationsPage({ session, onSignOut }: WorkspaceIntegrationsPageProps) {
  const { workspaceId = '' } = useParams();
  const navigate = useNavigate();

  const [servers, setServers] = useState<McpServer[] | null>(null);
  const [connections, setConnections] = useState<WorkspaceConnection[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  /*
   * Both lists are narrowed and paged here rather than by the server.
   *
   * Honest on this page and not on the paged ones: these two queries answer
   * with the whole list, so what is in the browser is the population and
   * nothing can be hiding on a page that was never fetched.
   */
  const [serverTyped, setServerTyped, serverAsked] = useSearch();
  const [connectionTyped, setConnectionTyped, connectionAsked] = useSearch();
  const [serverPage, setServerPage] = useState(1);
  const [connectionPage, setConnectionPage] = useState(1);
  const [serverSize, setServerSize] = usePageSize('mcpServers');
  const [connectionSize, setConnectionSize] = usePageSize('connections');

  // A new search is a new list, so each goes back to its own first page.
  useEffect(() => setServerPage(1), [serverAsked]);
  useEffect(() => setConnectionPage(1), [connectionAsked]);

  /** A server is found by its name or by where it points. */
  const [serverOrder, serverAscending, sortServers] = useTableSort<ServerColumn>('mcp-servers', 'NAME');
  const [connectionOrder, connectionAscending, sortConnections] = useTableSort<ConnectionColumn>(
    'connections',
    'NAME',
  );

  const matchingServers = useMemo(() => {
    const looking = serverAsked.trim().toLowerCase();
    if (servers === null) return null;
    if (looking === '') return servers;
    return servers.filter(
      (held) =>
        held.name.toLowerCase().includes(looking) ||
        held.address.toLowerCase().includes(looking),
    );
  }, [servers, serverAsked]);

  /** A connection is found by its name or by what kind it is. */
  const matchingConnections = useMemo(() => {
    const looking = connectionAsked.trim().toLowerCase();
    if (connections === null) return null;
    if (looking === '') return connections;
    return connections.filter(
      (held) =>
        held.name.toLowerCase().includes(looking) ||
        held.type.toLowerCase().includes(looking),
    );
  }, [connections, connectionAsked]);

  /** The slice of an already-filtered list that belongs on the page being shown. */
  function slice<T>(all: T[] | null, page: number, size: number): T[] | null {
    if (all === null) return null;
    const from = (page - 1) * size;
    return all.slice(from, from + size);
  }

  /*
   * An order per table. Issue #358. Both lists arrive whole - a workspace has a
   * handful of each and this page does its own paging - so ordering the rows it
   * holds is ordering all of them.
   */
  const serverKey = (held: McpServer) => {
    if (serverOrder === 'ADDRESS') return held.address;
    if (serverOrder === 'AUTH') return held.authType;
    return held.name;
  };
  const connectionKey = (held: WorkspaceConnection) => {
    if (connectionOrder === 'TYPE') return held.type;
    if (connectionOrder === 'STATUS') return held.status;
    return held.name;
  };

  const arrangedServers =
    matchingServers === null ? null : ordered(matchingServers, serverKey, serverAscending, (held) => held.name);
  const arrangedConnections =
    matchingConnections === null
      ? null
      : ordered(matchingConnections, connectionKey, connectionAscending, (held) => held.name);

  const shownServers = slice<McpServer>(arrangedServers, serverPage, serverSize);
  const shownConnections = slice<WorkspaceConnection>(arrangedConnections, connectionPage, connectionSize);
  const [addingServer, setAddingServer] = useState(false);
  const [addingConnection, setAddingConnection] = useState(false);

  const load = useCallback(() => {
    if (workspaceId === '') return;
    setError(null);
    Promise.all([fetchMcpServers(workspaceId), fetchWorkspaceConnections(workspaceId)])
      .then(([loadedServers, loadedConnections]) => {
        setServers(loadedServers);
        setConnections(loadedConnections);
      })
      .catch((cause: unknown) => {
        setServers(null);
        setConnections(null);
        setError(cause instanceof Error ? cause.message : t('Could not load the integrations.'));
      });
  }, [workspaceId]);

  useEffect(load, [load]);

  return (
    <AppShell
      user={shellUser(session)}
      workspacePath={`/workspace/${workspaceId}`}
      showAdmin={session.admin}
      onSignOut={onSignOut}
      sidebar={<WorkspaceSidebar workspaceId={workspaceId} />}
    >
      <header className={styles.contentHeader}>
        <h1 className={styles.title}>{t('Integrations')}</h1>
        <p className={styles.subtitle}>
          {t('Manage external service connections and MCP servers')}
        </p>
      </header>

      {error !== null && (
        <p className={styles.pageError} role="alert">
          {error}
        </p>
      )}

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>{t('MCP Servers')}</h2>
          <button type="button" className={styles.addButton} onClick={() => setAddingServer(true)}>{t('+ Add Server')}</button>
        </div>
        <SearchRow inset>
          <SearchBox
            value={serverTyped}
            onChange={setServerTyped}
            placeholder={t('Search servers...')}
            label={t('Search MCP servers')}
          />
        </SearchRow>

        <div className={styles.tableHeader}>
          {/* Pressable where there is something to order by. Issue #358. */}
          <ColumnHeader
            label={t('Name')}
            order="NAME"
            current={serverOrder}
            ascending={serverAscending}
            onSort={sortServers}
            className={styles.colName}
          />
          <ColumnHeader
            label={t('Address')}
            order="ADDRESS"
            current={serverOrder}
            ascending={serverAscending}
            onSort={sortServers}
            className={styles.colGrow}
          />
          <ColumnHeader
            label={t('Auth')}
            order="AUTH"
            current={serverOrder}
            ascending={serverAscending}
            onSort={sortServers}
            className={styles.colMeta}
          />
          <span className={styles.colActions}>{t('Actions')}</span>
        </div>

        {servers === null && error === null && <p className={styles.notice}><Loader /></p>}
        {servers?.length === 0 && <p className={styles.notice}>{t('No MCP servers yet.')}</p>}
        {servers !== null && servers.length > 0 && arrangedServers?.length === 0 && (
          <p className={styles.notice}>{t('No server matches what you typed.')}</p>
        )}

        {shownServers?.map((server) => (
          <div
            key={server.id}
            className={`${styles.row} ${styles.rowOpens}`}
            onClick={() => navigate(`/workspace/${workspaceId}/integrations/servers/${server.id}`)}
          >
            <Link
              className={`${styles.colName} ${styles.serverName} ${styles.openName}`}
              to={`/workspace/${workspaceId}/integrations/servers/${server.id}`}
            >
              {server.name}
            </Link>
            <span className={`${styles.colGrow} ${styles.address}`}>{server.address}</span>
            <span className={`${styles.colMeta} ${styles.meta}`}>
              {authLabel(server.authType, server.secretSet)}
            </span>
            <span className={`${styles.colMeta} ${styles.status}`} title={server.checkDetail ?? undefined}>
              <span className={reachableDot(server.reachable)} aria-hidden="true" />
              {reachableLabel(server.reachable)}
            </span>
            <span className={styles.colActions}>
              <Link
                className={styles.rowAction}
                to={`/workspace/${workspaceId}/integrations/servers/${server.id}`}
                aria-label={`Settings for ${server.name}`}
                title={`Settings for ${server.name}`}
              >
                <img src={settingsIcon} alt="" width={14} height={14} />
              </Link>
            </span>
          </div>
        ))}

        {/*
          Shown whenever there is anything, not only when there is more than
          one page: it carries the page-size control as well as the numbers.
        */}
        {matchingServers !== null && matchingServers.length > 0 && (
          <CompactPagination
            page={serverPage}
            pageSize={serverSize}
            totalItems={matchingServers.length}
            unit={t('servers')}
            onPageChange={setServerPage}
            pageSizes={PAGE_SIZES}
            onPageSizeChange={setServerSize}
          />
        )}
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={styles.cardTitles}>
            <h2 className={styles.cardTitle}>{t('Connections')}</h2>
            <p className={styles.cardSubtitle}>
              {t('Connections inherited from admin defaults. Override credentials per connection.')}
            </p>
          </div>
          <button type="button" className={styles.addButton} onClick={() => setAddingConnection(true)}>{t('+ Add Connection')}</button>
        </div>

        <SearchRow inset>
          <SearchBox
            value={connectionTyped}
            onChange={setConnectionTyped}
            placeholder={t('Search connections...')}
            label={t('Search connections')}
          />
        </SearchRow>

        <div className={styles.tableHeader}>
          <ColumnHeader
            label={t('Name')}
            order="NAME"
            current={connectionOrder}
            ascending={connectionAscending}
            onSort={sortConnections}
            className={styles.colName}
          />
          <ColumnHeader
            label={t('Type')}
            order="TYPE"
            current={connectionOrder}
            ascending={connectionAscending}
            onSort={sortConnections}
            className={styles.colGrow}
          />
          <ColumnHeader
            label={t('Status')}
            order="STATUS"
            current={connectionOrder}
            ascending={connectionAscending}
            onSort={sortConnections}
            className={styles.colMeta}
          />
          <span className={styles.colActions}>{t('Actions')}</span>
        </div>

        {connections === null && error === null && <p className={styles.notice}><Loader /></p>}
        {connections?.length === 0 && <p className={styles.notice}>{t('No connections yet.')}</p>}
        {connections !== null && connections.length > 0 && arrangedConnections?.length === 0 && (
          <p className={styles.notice}>{t('No connection matches what you typed.')}</p>
        )}

        {shownConnections?.map((connection) => (
          // The whole row opens it: a cog at the far right is a small target
          // for the only thing anybody wants from a row.
          <div
            key={connection.id}
            className={`${styles.row} ${styles.rowOpens}`}
            onClick={() => navigate(`/workspace/${workspaceId}/integrations/connections/${connection.id}`)}
          >
            <Link
              className={`${styles.colName} ${styles.openName}`}
              to={`/workspace/${workspaceId}/integrations/connections/${connection.id}`}
            >
              <ConnectionIcon type={connection.type} bare />
              <span className={styles.connectionName}>{connection.name}</span>
            </Link>
            <span
              className={`${styles.colGrow} ${connection.status === 'CONNECTED' ? styles.type : styles.typeMuted}`}
            >
              {connectionTypeLabel(connection.type)}
            </span>
            <span className={`${styles.colMeta} ${styles.status}`} title={connection.lastCheckMessage ?? undefined}>
              <span className={statusDot(connection.status)} aria-hidden="true" />
              {statusLabel(connection.status)}
            </span>
            <span className={styles.colActions}>
              <Link
                className={styles.rowAction}
                to={`/workspace/${workspaceId}/integrations/connections/${connection.id}`}
                aria-label={`Settings for ${connection.name}`}
                title={`Settings for ${connection.name}`}
                onClick={(event) => event.stopPropagation()}
              >
                <img src={settingsIcon} alt="" width={14} height={14} />
              </Link>
            </span>
          </div>
        ))}

        {matchingConnections !== null && matchingConnections.length > 0 && (
          <CompactPagination
            page={connectionPage}
            pageSize={connectionSize}
            totalItems={matchingConnections.length}
            unit={t('connections')}
            onPageChange={setConnectionPage}
            pageSizes={PAGE_SIZES}
            onPageSizeChange={setConnectionSize}
          />
        )}
      </section>

      <McpServerDialog
        open={addingServer}
        workspaceId={workspaceId}
        onClose={() => setAddingServer(false)}
        onCreated={() => {
          setAddingServer(false);
          load();
        }}
      />
      <WorkspaceConnectionDialog
        open={addingConnection}
        workspaceId={workspaceId}
        onClose={() => setAddingConnection(false)}
        onCreated={() => {
          setAddingConnection(false);
          load();
        }}
      />
    </AppShell>
  );
}
