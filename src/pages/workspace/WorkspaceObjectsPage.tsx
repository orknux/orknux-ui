import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import type { PageOf } from '../../api/client';
import { createObject, fetchPluginObjects, fetchWorkspaceObjects } from '../../api/objects';
import type { WorkflowObject } from '../../api/objects';
import type { SessionUser } from '../../api/session';
import { timeAgo } from '../../api/tools';
import puzzleIcon from '../../assets/puzzle.svg';
import settingsIcon from '../../assets/settings-14.svg';
import { AppShell } from '../../components/AppShell';
import { CompactPagination } from '../../components/CompactPagination';
import {
  ExportComponentButton,
  ImportComponentsButton,
  SaveAsTemplateButton,
  UseTemplateButton,
  transferStyles,
} from '../../components/ComponentTransfer';
import { Loader } from '../../components/Loader';
import { NameDialog } from '../../components/NameDialog';
import { FieldHint } from '../../components/FieldHint';
import { SearchBox, SearchRow } from '../../components/SearchBox';
import { useSearch } from '../../components/useSearch';
import { WorkspaceSidebar } from '../../components/WorkspaceSidebar';
import { PAGE_SIZES, usePageSize } from '../../components/pageSize';
import { useSieve } from '../../components/sieve';
import { usePageWithin } from '../../components/pageWithin';
import { shellUser } from '../../session/user';
import styles from './CatalogueTable.module.css';
import { t } from '../../i18n';

export interface WorkspaceObjectsPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

/**
 * The workspace's objects.
 *
 * The same table as Skills, without the status column: an object describes data
 * rather than doing anything, so there is nothing to switch off — a shape
 * nothing points at is simply unused, not disabled.
 */
export function WorkspaceObjectsPage({ session, onSignOut }: WorkspaceObjectsPageProps) {
  const { workspaceId = '' } = useParams();
  const navigate = useNavigate();

  const [objects, setObjects] = useState<PageOf<WorkflowObject> | null>(null);
  const [page, setPage] = usePageWithin(workspaceId);
  const [pageSize, setPageSize] = usePageSize('objects');
  const [typed, setTyped, asked] = useSearch();

  // A new search is a new list, so it starts at its first page rather
  // than at page four of the previous one.
  useEffect(() => setPage(1), [asked]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  /**
   * The shapes the loaded plugins export, read once.
   *
   * Under the workspace's own rather than on a screen of their own: what
   * somebody wants to know is what a property could point at, and that is one
   * list. They are not this workspace's to edit — a plugin's shape is replaced
   * the next time it is loaded — so the rows carry no actions.
   */
  const [fromPlugins, setFromPlugins] = useState<WorkflowObject[] | null>(null);

  /**
   * One origin, or both - the same sieve the tools and functions lists wear.
   *
   * The plugins' shapes used to sit in a second table under a rule, which
   * answered "what could a property point at" and nothing else: to see one
   * plugin's shapes somebody read every row of it. This narrows instead, and
   * the row says where it came from either way.
   */
  const [source, setSource] = useSieve('objects');

  /** The plugins with a shape in this list, for the sieve's own rows. */
  const pluginChoices = [
    ...new Set((fromPlugins ?? []).map((one) => one.lastModifiedBy.replace(/^plugin /, ''))),
  ].sort((left, right) => left.localeCompare(right));

  /**
   * The plugins' shapes this sieve is showing, which is all of them or one
   * plugin's or none.
   *
   * Cut here rather than fetched that way: they arrive once, in one list, and
   * there are tens of them rather than thousands.
   */
  const shownPlugins = (() => {
    if (source === 'WORKSPACE') return [];
    const all = fromPlugins ?? [];
    if (!source.startsWith('plugin:')) return all;
    const wanted = source.slice('plugin:'.length);
    return all.filter((one) => one.lastModifiedBy.replace(/^plugin /, '') === wanted);
  })();

  const load = useCallback(() => {
    if (workspaceId === '') return;
    setError(null);
    fetchWorkspaceObjects(workspaceId, page - 1, pageSize, asked)
      .then(setObjects)
      .catch((cause: unknown) => {
        setObjects(null);
        setError(cause instanceof Error ? cause.message : t('Could not load the objects.'));
      });
  }, [workspaceId, page, pageSize, asked]);

  useEffect(load, [load]);

  // A different sieve is a different list, so it starts at its first page.
  useEffect(() => setPage(1), [source]);

  useEffect(() => {
    /*
     * Its own effect, and its own failure: a plugin's shapes being unreadable
     * is not a reason for the workspace's own list to go missing, so this one
     * sets a list or leaves it empty rather than raising the page's error.
     */
    fetchPluginObjects()
      .then(setFromPlugins)
      .catch(() => setFromPlugins([]));
  }, []);

  return (
    <AppShell
      user={shellUser(session)}
      workspacePath={`/workspace/${workspaceId}`}
      showAdmin={session.admin}
      onSignOut={onSignOut}
      sidebar={<WorkspaceSidebar workspaceId={workspaceId} />}
    >
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <h1 className={styles.title}>{t('Objects')}</h1>
          <p className={styles.subtitle}>
            {t('Named data structures the workspace\'s workflows pass around.')}
          </p>
        </div>
        <div className={transferStyles.headerActions}>
          <ImportComponentsButton workspaceId={workspaceId} onImported={load} />
          <UseTemplateButton workspaceId={workspaceId} kind="OBJECT" onImported={load} />
          <button type="button" className={styles.createButton} onClick={() => setCreating(true)}>{t('+ Create Object')}</button>
        </div>
      </header>

      <SearchRow>
        <SearchBox
          value={typed}
          onChange={setTyped}
          placeholder={t('Search objects...')}
        />
        {/* One origin, or both - the same sieve the tools list wears. */}
        <select
          className={styles.sourceFilter}
          aria-label={t('Which objects to list')}
          value={source}
          onChange={(event) => setSource(event.target.value)}
        >
          <option value="">{t('All sources')}</option>
          <option value="WORKSPACE">{t('The workspace\'s own')}</option>
          <option value="PLUGIN">{t('From plugins')}</option>
          {/* And each plugin by name, which is the question people ask. */}
          {pluginChoices.map((plugin) => (
            <option key={plugin} value={`plugin:${plugin}`}>
              {plugin}
            </option>
          ))}
        </select>
      </SearchRow>

      {error !== null && (
        <p className={styles.pageError} role="alert">
          {error}
        </p>
      )}

      <section className={styles.card}>
        <div className={styles.tableHeader}>
          <span className={styles.colName}>{t('Name')}</span>
          <span className={styles.colDescription}>{t('Description')}</span>
          {/*
            Where a shape came from, on the row rather than in a second table.

            The plugins' shapes used to sit under a rule of their own, which
            said where they came from once and then left every row of the list
            looking the same as every other. A column says it per row, which is
            also what makes the sieve beside the search worth having.
          */}
          <span className={styles.colSource}>{t('Source')}</span>
          <span className={styles.colStatus}>{t('Properties')}</span>
          <span className={styles.colModified}>{t('Last Modified')}</span>
          <span className={styles.colActions}>{t('Actions')}</span>
        </div>

        {objects === null && error === null && <p className={styles.notice}><Loader /></p>}
        {objects?.content.length === 0 && (
          <p className={styles.notice}>
            {/*
              The status stays; what an object is goes behind the (?) beside it.
              Somebody who has read it once is looking at this page for the count,
              not for the definition.
            */}
            <span className={styles.labelWithHint}>
              {t('No objects yet.')}
              <FieldHint label={t('No objects yet')}>
                {t('An object names a shape — what a trigger emits, or what a function takes — so a mapping can be offered instead of typed blind.')}
              </FieldHint>
            </span>
          </p>
        )}

        {(source === 'PLUGIN' || source.startsWith('plugin:') ? [] : objects?.content ?? []).map((held) => (
          <div key={held.id} className={styles.row}>
            <Link className={`${styles.colName} ${styles.name}`} to={`/workspace/${workspaceId}/objects/${held.id}`}>
              {held.name}
            </Link>
            <span
              className={`${styles.colDescription} ${held.description === null ? styles.noDescription : styles.description}`}
            >
              {held.description ?? t('No description')}
            </span>
            <span className={`${styles.colSource} ${styles.modified}`}>{t('This workspace')}</span>
            {/* Where Skills shows a switch: a count, because there is nothing to switch. */}
            <span className={`${styles.colStatus} ${styles.modified}`}>{held.propertyCount}</span>
            <span className={`${styles.colModified} ${styles.modified}`}>{timeAgo(held.lastModifiedAt)}</span>
            <span className={styles.colActions}>
              <ExportComponentButton workspaceId={workspaceId} kind="OBJECT" id={held.id} name={held.name} />
              <SaveAsTemplateButton
                workspaceId={workspaceId}
                kind="OBJECT"
                id={held.id}
                name={held.name}
                canPublish={session.admin}
              />
              <Link
                className={styles.rowAction}
                to={`/workspace/${workspaceId}/objects/${held.id}`}
                aria-label={`Open ${held.name}`}
                title={`Open ${held.name}`}
              >
                <img src={settingsIcon} alt="" width={14} height={14} />
              </Link>
            </span>
          </div>
        ))}

        {/*
          And what the plugins export, under a rule and without actions.

          Here rather than elsewhere because a property points at one of these
          exactly the way it points at one of the workspace's own — they are
          rows in the same table — so a list that showed only half of what can
          be pointed at would be the wrong list. What they do not get is the
          row's actions: a plugin's shape is replaced wholesale the next time
          it is loaded, so an edit would be an edit somebody loses.
        */}
        {shownPlugins.length > 0 && (
          <>
            {shownPlugins.map((held) => (
              <div key={held.id} className={styles.row}>
                <Link
                  className={`${styles.colName} ${styles.name}`}
                  to={`/workspace/${workspaceId}/objects/${held.id}`}
                >
                  <img src={puzzleIcon} alt="" width={12} height={12} />{' '}
                  {held.name}
                </Link>
                <span
                  className={`${styles.colDescription} ${held.description === null ? styles.noDescription : styles.description}`}
                >
                  {held.description ?? t('No description')}
                </span>
                <span className={`${styles.colSource} ${styles.modified}`}>
                  {held.lastModifiedBy.replace(/^plugin /, '')}
                </span>
                <span className={`${styles.colStatus} ${styles.modified}`}>{held.propertyCount}</span>
                {/*
                  Nothing, rather than the plugin's name repeated: a plugin's
                  shape is replaced wholesale the next time it is loaded, so
                  there is no edit and nobody made one.
                */}
                <span className={`${styles.colModified} ${styles.modified}`}>—</span>
                <span className={styles.colActions}>
                  <Link
                    className={styles.rowAction}
                    to={`/workspace/${workspaceId}/objects/${held.id}`}
                    aria-label={`Open ${held.name}`}
                    title={`Open ${held.name}`}
                  >
                    <img src={settingsIcon} alt="" width={14} height={14} />
                  </Link>
                </span>
              </div>
            ))}
          </>
        )}

        {objects !== null && (
          <CompactPagination
            page={page}
            pageSize={pageSize}
            totalItems={objects.totalElements}
            unit="objects"
            onPageChange={setPage}
            pageSizes={PAGE_SIZES}
            onPageSizeChange={(chosen) => {
              setPageSize(chosen);
              // Which page somebody is on means something else at another size.
              setPage(1);
            }}
          />
        )}
      </section>

      <NameDialog
        open={creating}
        title={t('Create Object')}
        message={t("An object names a shape, so a mapping can be offered rather than typed blind.")}
        nameLabel="Name"
        namePlaceholder="SlackMessage"
        descriptionPlaceholder={t("Represents an incoming Slack message with metadata")}
        submitLabel={t("Create Object")}
        onClose={() => setCreating(false)}
        onSubmit={async (name, description) => {
          const created = await createObject(workspaceId, { name, description: description || undefined });
          navigate(`/workspace/${workspaceId}/objects/${created.id}`);
        }}
      />
    </AppShell>
  );
}
