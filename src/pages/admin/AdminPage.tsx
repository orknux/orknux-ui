import { useEffect, useState } from 'react';
import type { WorkspaceOrder } from '../../api/workspaces';
import { Link } from 'react-router-dom';

import type { PageOf } from '../../api/client';
import type { SessionUser } from '../../api/session';
import { duplicateWorkspace, fetchWorkspaces, type WorkspaceCopy } from '../../api/workspaces';
import checkCircleIcon from '../../assets/check-circle.svg';
import copyIcon from '../../assets/copy.svg';
import layersIcon from '../../assets/layers.svg';
import monitorIcon from '../../assets/monitor.svg';
import plusIcon from '../../assets/plus.svg';
import serverIcon from '../../assets/server.svg';
import settingsIcon from '../../assets/settings.svg';
import { AppShell } from '../../components/AppShell';
import { CreateWorkspaceDialog } from '../../components/CreateWorkspaceDialog';
import { AdminSidebar } from '../../components/AdminSidebar';
import { ColumnHeader } from '../../components/ColumnHeader';
import { Loader } from '../../components/Loader';
import { Pagination } from '../../components/Pagination';
import { PAGE_SIZES, usePageSize } from '../../components/pageSize';
import { useTableSort } from '../../components/tableSort';
import { shellUser } from '../../session/user';
import styles from './AdminPage.module.css';
import { t } from '../../i18n';

export interface AdminPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

export function AdminPage({ session, onSignOut }: AdminPageProps) {
  const [workspacesPage, setWorkspacesPage] = useState(1);
  const [pageSize, setPageSize] = usePageSize('admin-workspaces');
  const [order, ascending, sortBy] = useTableSort<WorkspaceOrder>('admin-workspaces', 'NAME');
  const [creating, setCreating] = useState(false);
  /* Copying a workspace, and what came of it. Issue #408. */
  const [copying, setCopying] = useState<string | null>(null);
  const [copied, setCopied] = useState<WorkspaceCopy | null>(null);
  const [copyFailed, setCopyFailed] = useState<string | null>(null);
  // Bumped after a write so both tables refetch, audit log included.
  const [reloadToken, setReloadToken] = useState(0);

  const workspaces = useLoadedPage(
    () => fetchWorkspaces(workspacesPage - 1, pageSize, order, ascending),
    [workspacesPage, pageSize, reloadToken, order, ascending],
  );

  // The section links need somewhere to go; the first workspace listed is the sensible default.
  const firstWorkspace = workspaces.data?.content[0];
  const workspacePath = firstWorkspace === undefined ? undefined : `/workspace/${firstWorkspace.id}`;

  function handleCreated() {
    setCreating(false);
    setWorkspacesPage(1);
    setReloadToken((token) => token + 1);
  }

  return (
    <AppShell
      user={shellUser(session)}
      workspacePath={workspacePath}
      onSignOut={onSignOut}
      sidebar={<AdminSidebar active="workspaces" />}
    >
      <section className={styles.card}>
        <header className={styles.workspacesHeader}>
          <div className={styles.titleBlock}>
            <h1 className={styles.title}>{t('Workspaces')}</h1>
            <p className={styles.subtitle}>
              {t('Manage workspace membership, access, and ownership.')}
            </p>
          </div>
          <button type="button" className={styles.createWorkspace} onClick={() => setCreating(true)}>
            <span
              className={styles.createWorkspaceIcon}
              style={{ maskImage: `url("${plusIcon}")`, WebkitMaskImage: `url("${plusIcon}")` }}
              aria-hidden="true"
            />
            {t('Create Workspace')}
          </button>
        </header>

        <div className={styles.table}>
          <div className={`${styles.row} ${styles.tableHeader}`}>
            {/* Pressable. Issue #358; this list is paged by the server, so is the order. */}
            <ColumnHeader
              label={t('Workspace')}
              order="NAME"
              current={order}
              ascending={ascending}
              onSort={sortBy}
              className={styles.colGrow}
            />
            <ColumnHeader
              label={t('Description')}
              order="DESCRIPTION"
              current={order}
              ascending={ascending}
              onSort={sortBy}
              className={styles.colDescription}
            />
            <span className={styles.colActions} aria-hidden="true" />
          </div>

          {/*
            What the copy came to, said in full. Issue #408: a copy that
            quietly lost three agents would be worse than one that refused, so
            what could not be carried is named where somebody will read it.
          */}
          {copied !== null && (
            <div className={styles.copyResult} role="status">
              <p className={styles.copyLine}>
                {t('Copied to {name}: ').replace('{name}', copied.workspace.name)}
                {copied.carried.map((one) => `${one.count} ${one.kind}`).join(', ') || t('nothing to carry')}
              </p>
              {copied.variablesToSet.length > 0 && (
                <p className={styles.copyNote}>
                  {t('These variables came without their values and need setting: ')}
                  {copied.variablesToSet.join(', ')}
                </p>
              )}
              {/*
                Collapsed until asked for: a copy of a large workspace can leave
                behind a hundred parts, one line each, and the list pushed the
                workspaces themselves off the screen. The count says there is
                something to read; the lines are one press away.
              */}
              {copied.problems.length > 0 && (
                <details className={styles.copyProblems}>
                  <summary className={styles.copyNote}>
                    {t('{n} parts were not copied').replace('{n}', String(copied.problems.length))}
                  </summary>
                  {copied.problems.map((problem, at) => (
                    <p key={at} className={styles.copyNote}>{problem}</p>
                  ))}
                </details>
              )}
            </div>
          )}
          {copyFailed !== null && (
            <p className={styles.copyFailed} role="alert">{copyFailed}</p>
          )}

          <TableState state={workspaces} emptyMessage={t("No workspaces yet.")} />

          {workspaces.data?.content.map((workspace) => (
            <div key={workspace.id} className={styles.row}>
              <div className={styles.workspaceName}>
                <span className={styles.workspaceIcon}>
                  <img src={workspaceIcon(workspace.name)} alt="" width={16} height={16} />
                </span>
                <Link className={styles.workspaceLabel} to={`/workspace/${workspace.id}`}>
                  {workspace.name}
                </Link>
              </div>
              <span className={`${styles.colDescription} ${styles.description}`}>{workspace.description ?? '—'}</span>
              <span className={styles.colActions}>
                {/*
                  Copying one. Issue #408: a working setup is a lot of small
                  decisions, and the only way to a second one was to make every
                  decision again by hand - which nobody does accurately.
                */}
                <button
                  type="button"
                  className={styles.rowAction}
                  disabled={copying !== null}
                  aria-label={`Duplicate ${workspace.name}`}
                  title={`Duplicate ${workspace.name}`}
                  onClick={() => {
                    setCopying(workspace.id);
                    setCopied(null);
                    setCopyFailed(null);
                    duplicateWorkspace(workspace.id, `${workspace.name} copy`)
                      .then((made) => {
                        setCopied(made);
                        setReloadToken((was) => was + 1);
                      })
                      .catch((cause: unknown) => {
                        setCopyFailed(cause instanceof Error ? cause.message : t('That workspace was not copied.'));
                      })
                      .finally(() => setCopying(null));
                  }}
                >
                  <img src={copyIcon} alt="" width={16} height={16} />
                </button>
                <Link
                  className={styles.rowAction}
                  to={`/admin/workspaces/${workspace.id}/settings`}
                  aria-label={`Settings for ${workspace.name}`}
                  title={`Settings for ${workspace.name}`}
                >
                  <img src={settingsIcon} alt="" width={16} height={16} />
                </Link>
              </span>
            </div>
          ))}
        </div>

        <Pagination
          page={workspacesPage}
          pageSize={pageSize}
          totalItems={workspaces.data?.totalElements ?? 0}
          onPageChange={setWorkspacesPage}
          label={t('workspaces')}
          pageSizes={PAGE_SIZES}
          onPageSizeChange={(chosen) => {
            setPageSize(chosen);
            // Which page somebody is on means something else at another size.
            setWorkspacesPage(1);
          }}
        />
      </section>

      <CreateWorkspaceDialog open={creating} onClose={() => setCreating(false)} onCreated={handleCreated} />
    </AppShell>
  );
}

interface LoadState<T> {
  data: PageOf<T> | null;
  loading: boolean;
  error: string | null;
}

function useLoadedPage<T>(load: () => Promise<PageOf<T>>, deps: unknown[]): LoadState<T> {
  const [state, setState] = useState<LoadState<T>>({ data: null, loading: true, error: null });

  useEffect(() => {
    let current = true;
    setState((previous) => ({ ...previous, loading: true, error: null }));

    load()
      .then((data) => {
        if (current) setState({ data, loading: false, error: null });
      })
      .catch((cause: unknown) => {
        if (!current) return;
        const message = cause instanceof Error ? cause.message : t('Could not load data.');
        setState({ data: null, loading: false, error: message });
      });

    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}

function TableState<T>({ state, emptyMessage }: { state: LoadState<T>; emptyMessage: string }) {
  if (state.loading) {
    return <p className={styles.tableNotice}><Loader /></p>;
  }
  if (state.error !== null) {
    return <p className={`${styles.tableNotice} ${styles.tableError}`}>{state.error}</p>;
  }
  if (state.data !== null && state.data.content.length === 0) {
    return <p className={styles.tableNotice}>{emptyMessage}</p>;
  }
  return null;
}

/**
 * The server has no per-workspace icon, so one is picked from the design's set in a
 * way that stays stable for a given workspace name. Presentational only.
 */
const WORKSPACE_ICONS = [layersIcon, monitorIcon, serverIcon, checkCircleIcon];

function workspaceIcon(name: string): string {
  const hash = [...name].reduce((total, character) => total + character.charCodeAt(0), 0);
  return WORKSPACE_ICONS[hash % WORKSPACE_ICONS.length];
}
