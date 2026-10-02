import { useEffect, useRef, useState } from 'react';
import type { WorkspaceOrder } from '../../api/workspaces';
import { Link } from 'react-router-dom';

import type { PageOf } from '../../api/client';
import type { SessionUser } from '../../api/session';
import {
  downloadWorkspaceExport,
  duplicateWorkspace,
  fetchWorkspaceCopyProgress,
  fetchWorkspaces,
  importWorkspace,
  type WorkspaceCopy,
  type WorkspaceCopyProgress,
} from '../../api/workspaces';
import checkCircleIcon from '../../assets/check-circle.svg';
import copyIcon from '../../assets/copy.svg';
import downloadIcon from '../../assets/download.svg';
import uploadIcon from '../../assets/cloud-upload.svg';
import closeIcon from '../../assets/x.svg';
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
  /** How far the copy under way has got, read while it runs. Issue #572. */
  const [progress, setProgress] = useState<WorkspaceCopyProgress | null>(null);
  const [copyFailed, setCopyFailed] = useState<string | null>(null);
  /** Whether the result above came from a duplicate or an import. Issue #590. */
  const [copiedHow, setCopiedHow] = useState<'copy' | 'import'>('copy');
  /** The workspace being downloaded, so its Export waits for the file. Issue #590. */
  const [exporting, setExporting] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  /**
   * Whether the last attempt to read the progress failed. Issue #581: failures
   * were swallowed, so a page that could not read a step looked exactly like a
   * copy that had not moved. Cleared by the next answer.
   */
  const [progressUnread, setProgressUnread] = useState(false);
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

  /**
   * A copy or an import, with its progress read while it runs. One routine for
   * both, issue #590: they report the same steps and answer the same shape.
   */
  function runCopy(what: string, how: 'copy' | 'import', start: (key: string) => Promise<WorkspaceCopy>, failed: string) {
    setCopying(what);
    setCopied(null);
    setCopyFailed(null);
    setProgress(null);
    setProgressUnread(false);
    // A key of our own, to ask how far the copy has got while it runs. #572.
    const key = crypto.randomUUID();
    /*
     * One question at a time, the next asked half a second after
     * the last was answered. Issue #581: on an interval, polls
     * that were slow to answer piled up behind each other, and
     * one landing after the copy ended drew a step over nothing.
     * A failure is said rather than swallowed, and asking goes on.
     */
    let over = false;
    let polling = 0;
    const ask = () => {
      fetchWorkspaceCopyProgress(key)
        .then((step) => {
          if (over) return;
          setProgressUnread(false);
          if (step !== null) setProgress(step);
        })
        .catch(() => { if (!over) setProgressUnread(true); })
        .finally(() => { if (!over) polling = window.setTimeout(ask, 500); });
    };
    polling = window.setTimeout(ask, 250);
    start(key)
      .then((made) => {
        setCopiedHow(how);
        setCopied(made);
        setReloadToken((was) => was + 1);
      })
      .catch((cause: unknown) => {
        setCopyFailed(cause instanceof Error ? cause.message : failed);
      })
      .finally(() => {
        over = true;
        window.clearTimeout(polling);
        setProgress(null);
        setProgressUnread(false);
        setCopying(null);
      });
  }

  /** The file chosen under Import workspace, read as text and handed over whole. Issue #590. */
  async function importChosen(file: File | undefined) {
    if (importRef.current !== null) importRef.current.value = '';
    if (file === undefined) return;
    let content: string;
    try {
      content = await file.text();
    } catch {
      setCopyFailed(t('That file could not be read.'));
      return;
    }
    // Named by the server: the file's workspace name, or the first free one after it.
    runCopy('import', 'import', (key) => importWorkspace(content, null, key), t('That workspace was not imported.'));
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
          <div className={styles.headerActions}>
            {/* A file an Export wrote, here or on another installation, as a new workspace. Issue #590. */}
            <input
              ref={importRef}
              className={styles.fileInput}
              type="file"
              accept="application/json,.json"
              data-workspace-import-file=""
              onChange={(event) => void importChosen(event.target.files?.[0])}
            />
            <button
              type="button"
              className={styles.importWorkspace}
              disabled={copying !== null}
              onClick={() => importRef.current?.click()}
              data-workspace-import=""
            >
              <span
                className={styles.createWorkspaceIcon}
                style={{ maskImage: `url("${uploadIcon}")`, WebkitMaskImage: `url("${uploadIcon}")` }}
                aria-hidden="true"
              />
              {t('Import')}
            </button>
            <button type="button" className={styles.createWorkspace} onClick={() => setCreating(true)}>
              <span
                className={styles.createWorkspaceIcon}
                style={{ maskImage: `url("${plusIcon}")`, WebkitMaskImage: `url("${plusIcon}")` }}
                aria-hidden="true"
              />
              {t('Create Workspace')}
            </button>
          </div>
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
              {/* Read once and put away: it stays until dismissed or the next copy. */}
              <button
                type="button"
                className={styles.copyDismiss}
                onClick={() => setCopied(null)}
                aria-label={t('Dismiss')}
                title={t('Dismiss')}
                data-copy-dismiss=""
              >
                <img src={closeIcon} alt="" width={14} height={14} />
              </button>
              <p className={styles.copyLine} data-copy-result={copiedHow}>
                {(copiedHow === 'import' ? t('Imported as {name}: ') : t('Copied to {name}: '))
                  .replace('{name}', copied.workspace.name)}
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
              {copied.credentialsToSet.length > 0 && (
                <p className={styles.copyNote}>
                  {t('These came without their credentials and need setting: ')}
                  {copied.credentialsToSet.join(', ')}
                </p>
              )}
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

          {/*
            How far the copy has got, while it runs. Issue #572: a large copy
            showed nothing until it ended, which reads as stuck. The kind under
            way and how many of how many, over a bar for the whole copy.
          */}
          {copying !== null && (
            <div className={styles.copyResult} role="status" data-copy-progress="">
              <p className={styles.copyLine}>
                {progress === null
                  ? t('Starting the copy…')
                  : t('Copying {kind}: {done} of {total}')
                      .replace('{kind}', progress.kind)
                      .replace('{done}', String(progress.done))
                      .replace('{total}', String(progress.total))}
              </p>
              <progress
                className={styles.copyBar}
                max={Math.max(progress?.overallTotal ?? 1, 1)}
                value={progress?.overallDone ?? 0}
                aria-label={t('How much of the workspace has been copied')}
              />
              {progressUnread && (
                <p className={styles.copyUnread} data-copy-progress-unread="">
                  {t('Progress cannot be read just now; the copy goes on.')}
                </p>
              )}
            </div>
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
                    // Named by the server: the first free of "<name> copy", "<name> copy 2"... A name chosen here was refused once taken.
                    runCopy(
                      workspace.id,
                      'copy',
                      (key) => duplicateWorkspace(workspace.id, null, key),
                      t('That workspace was not copied.'),
                    );
                  }}
                >
                  <img src={copyIcon} alt="" width={16} height={16} />
                </button>
                {/*
                  The same workspace as one file, to import here or on another
                  installation. Issue #590.
                */}
                <button
                  type="button"
                  className={styles.rowAction}
                  disabled={exporting !== null}
                  aria-label={`Export ${workspace.name}`}
                  title={`Export ${workspace.name}`}
                  data-workspace-export={workspace.name}
                  onClick={() => {
                    setExporting(workspace.id);
                    setCopyFailed(null);
                    downloadWorkspaceExport(workspace.id)
                      .catch((cause: unknown) => {
                        setCopyFailed(cause instanceof Error ? cause.message : t('That workspace could not be exported.'));
                      })
                      .finally(() => setExporting(null));
                  }}
                >
                  <img src={downloadIcon} alt="" width={16} height={16} />
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
