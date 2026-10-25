import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import {
  createDiagram,
  createDiagramCatalog,
  deleteDiagram,
  deleteDiagramCatalog,
  fetchDiagramCatalogs,
  fetchDiagrams,
  moveDiagram,
  renameDiagramCatalog,
  searchDiagrams,
} from '../../api/diagrams';
import type { Diagram, DiagramAgentAccess, DiagramCatalog, DiagramHit } from '../../api/diagrams';
import type { SessionUser } from '../../api/session';
import { timeAgo } from '../../api/tools';
import folderOpenIcon from '../../assets/folder-open.svg';
import folderIcon from '../../assets/folder.svg';
import penIcon from '../../assets/pen.svg';
import pencilIcon from '../../assets/pencil.svg';
import plusIcon from '../../assets/plus.svg';
import searchIcon from '../../assets/search.svg';
import trashIcon from '../../assets/trash-grey.svg';
import { AppShell } from '../../components/AppShell';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Loader } from '../../components/Loader';
import { MoveToCatalog } from '../../components/MoveToCatalog';
import { TrashIcon } from '../../components/TrashIcon';
import { WorkspaceSidebar } from '../../components/WorkspaceSidebar';
import { t, tf } from '../../i18n';
import { shellUser } from '../../session/user';
import table from '../workspace/CatalogueTable.module.css';
import rail from '../workspace/WorkspaceMemoryPage.module.css';
import styles from './DiagramsPage.module.css';

export interface DiagramsPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

/** How long the search waits after the last key before it asks, so typing a word is one request. */
const SEARCH_PAUSE_MS = 250;

/** The agents setting's two choices, and the one line each means, drawn beside the option. */
export function agentAccessOptions(): { value: DiagramAgentAccess; label: string; hint: string }[] {
  return [
    { value: 'READ', label: t('Read only'), hint: t('Agents may search and read it, and not change it.') },
    { value: 'CHANGE', label: t('Read and change'), hint: t('Agents may also change it when they learn something it lacks.') },
  ];
}

/**
 * Explore -> Diagrams: the workspace's diagrams, by catalog.
 *
 * The memory page's arrangement, because it is the same thing - a folder of
 * written-down knowledge an agent is sent to - so the catalogs run down the
 * left with a search over all of them above, and the one chosen is listed on
 * the right. The search reaches into the diagrams: a word on a node, in its
 * notes or on a connection finds the node, and the hit opens the editor on it.
 */
export function DiagramsPage({ session, onSignOut }: DiagramsPageProps) {
  const { workspaceId = '' } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [catalogs, setCatalogs] = useState<DiagramCatalog[] | null>(null);
  const [diagrams, setDiagrams] = useState<Diagram[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<Diagram | null>(null);
  const [removingCatalog, setRemovingCatalog] = useState<DiagramCatalog | null>(null);
  const [search, setSearch] = useState('');
  const [hits, setHits] = useState<DiagramHit[] | null>(null);

  const selected = searchParams.get('catalog');
  const current = catalogs?.find((one) => one.id === selected) ?? catalogs?.[0] ?? null;
  const sought = search.trim();

  async function load(choose?: string) {
    try {
      const [foundCatalogs, foundDiagrams] = await Promise.all([fetchDiagramCatalogs(workspaceId), fetchDiagrams(workspaceId)]);
      setCatalogs(foundCatalogs);
      setDiagrams(foundDiagrams);
      if (choose !== undefined) setSearchParams({ catalog: choose }, { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not load the diagrams.'));
    }
  }

  useEffect(() => {
    if (workspaceId === '') return;
    void load();
    // Loaded once per workspace; every change below reloads what it touched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  useEffect(() => {
    if (sought === '') {
      setHits(null);
      return;
    }
    let left = false;
    const timer = window.setTimeout(() => {
      searchDiagrams(workspaceId, sought)
        .then((found) => {
          if (!left) setHits(found);
        })
        .catch(() => {
          if (!left) setHits([]);
        });
    }, SEARCH_PAUSE_MS);
    return () => {
      left = true;
      window.clearTimeout(timer);
    };
  }, [sought, workspaceId]);

  async function guard(work: () => Promise<void>) {
    setError(null);
    try {
      await work();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('That could not be done.'));
    }
  }

  const open = (id: string, node?: string | null) =>
    navigate(`/workspace/${workspaceId}/explore/diagrams/${id}${node ? `?node=${encodeURIComponent(node)}` : ''}`);

  async function make() {
    if (busy) return;
    setBusy(true);
    await guard(async () => {
      const made = await createDiagram(workspaceId, t('Untitled diagram'), current?.id);
      open(made.id);
    });
    setBusy(false);
  }

  async function newCatalog() {
    const name = window.prompt(t('Name the catalog'));
    if (name === null || name.trim() === '') return;
    await guard(async () => {
      const made = await createDiagramCatalog(workspaceId, name.trim());
      await load(made.id);
    });
  }

  async function renameCatalog() {
    if (current === null) return;
    const name = window.prompt(t('Rename the catalog'), current.name);
    if (name === null || name.trim() === '' || name.trim() === current.name) return;
    await guard(async () => {
      await renameDiagramCatalog(current.id, name.trim());
      await load(current.id);
    });
  }

  const listed = (diagrams ?? []).filter((one) => current !== null && one.catalogId === current.id);

  return (
    <AppShell
      user={shellUser(session)}
      workspacePath={`/workspace/${workspaceId}`}
      showAdmin={session.admin}
      onSignOut={onSignOut}
      sidebar={<WorkspaceSidebar workspaceId={workspaceId} />}
    >
      <div className={rail.split}>
        <aside className={rail.catalogs}>
          <header className={rail.catalogsHeader}>
            <p className={rail.catalogsTitle}>{t('DIAGRAM CATALOGS')}</p>
            <button
              type="button"
              className={rail.newCatalog}
              onClick={() => void newCatalog()}
              aria-label={t('New catalog')}
              title={t('New catalog')}
              data-testid="diagram-new-catalog"
            >
              <img src={plusIcon} alt="" width={10} height={10} />
            </button>
          </header>

          <div className={rail.railSearch}>
            <img src={searchIcon} alt="" width={14} height={14} />
            <input
              className={rail.searchInput}
              type="search"
              placeholder={t('Search diagrams...')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label={t('Search diagrams')}
              data-testid="diagram-search"
            />
          </div>

          <div className={rail.catalogsList}>
            {catalogs === null && error === null && (
              <p className={rail.sidebarNote}>
                <Loader />
              </p>
            )}
            {catalogs?.length === 0 && <p className={rail.sidebarNote}>{t('No catalogs yet.')}</p>}
            {catalogs?.map((catalog) => {
              const chosen = catalog.id === current?.id && sought === '';
              return (
                <button
                  key={catalog.id}
                  type="button"
                  className={chosen ? rail.catalogCurrent : rail.catalog}
                  onClick={() => {
                    setSearch('');
                    setSearchParams({ catalog: catalog.id }, { replace: true });
                  }}
                  aria-current={chosen ? 'true' : undefined}
                  data-testid="diagram-catalog-row"
                  data-catalog-row={catalog.name}
                >
                  <img src={chosen ? folderOpenIcon : folderIcon} alt="" width={14} height={14} />
                  <span className={rail.catalogName}>{catalog.name}</span>
                  <span className={chosen ? rail.countCurrent : rail.count}>{catalog.diagramCount}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className={rail.panel}>
          {error !== null && (
            <p className={rail.error} role="alert" data-testid="diagram-error">
              {error}
            </p>
          )}

          {sought !== '' ? (
            <>
              <header className={rail.catalogHeader}>
                <h1 className={rail.catalogHeading}>{tf('Found for "{query}"', { query: sought })}</h1>
              </header>
              <div className={rail.rule} />
              {hits === null && <p className={rail.sidebarNote}><Loader /></p>}
              {hits?.length === 0 && <p className={rail.empty}>{t('Nothing in any diagram matches that.')}</p>}
              {hits !== null && hits.length > 0 && (
                <ul className={styles.hits} data-testid="diagram-hits">
                  {hits.map((hit, index) => (
                    <li key={`${hit.diagramId}-${hit.nodeId ?? hit.edgeId ?? 'name'}-${index}`}>
                      <button type="button" className={styles.hit} onClick={() => open(hit.diagramId, hit.nodeId)} data-testid="diagram-hit">
                        <span className={styles.hitWhere}>
                          {hit.diagramName}
                          {hit.nodeLabel !== null && hit.nodeLabel !== '' && <span className={styles.hitNode}> › {hit.nodeLabel}</span>}
                        </span>
                        <span className={styles.hitSnippet}>{hit.snippet}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : catalogs !== null && current === null ? (
            <div className={styles.emptyStart}>
              <p className={rail.empty}>{t('No diagrams yet.')}</p>
              <button type="button" className={table.createButton} onClick={() => void make()} disabled={busy} data-testid="new-diagram">
                {t('+ New diagram')}
              </button>
            </div>
          ) : current === null ? null : (
            <>
              <header className={rail.catalogHeader}>
                <div className={styles.headingGroup}>
                  <h1 className={rail.catalogHeading} data-testid="diagram-catalog-heading">{current.name}</h1>
                  <div className={rail.catalogActions}>
                    <button type="button" className={rail.iconButton} onClick={() => void renameCatalog()} aria-label={t('Rename the catalog')} title={t('Rename')} data-testid="diagram-rename-catalog">
                      <img src={penIcon} alt="" width={14} height={14} />
                    </button>
                    <button type="button" className={rail.iconButton} onClick={() => setRemovingCatalog(current)} aria-label={t('Delete the catalog')} title={t('Delete')} data-testid="diagram-delete-catalog">
                      <img src={trashIcon} alt="" width={14} height={14} />
                    </button>
                  </div>
                </div>
                <button type="button" className={table.createButton} onClick={() => void make()} disabled={busy} data-testid="new-diagram">
                  {t('+ New diagram')}
                </button>
              </header>
              <div className={rail.rule} />

              <section className={`${table.card} ${styles.card}`}>
                <div className={table.tableHeader}>
                  <span className={styles.colName}>{t('Name')}</span>
                  <span className={styles.colSize}>{t('Size')}</span>
                  <span className={table.colModified}>{t('Updated')}</span>
                  <span className={styles.colActions} />
                </div>
                {diagrams === null && <p className={table.notice}><Loader /></p>}
                {diagrams !== null && listed.length === 0 && <p className={table.notice}>{t('No diagrams in this catalog yet.')}</p>}
                {listed.map((diagram) => (
                  <div key={diagram.id} className={table.row} data-testid="diagram-row" data-diagram-id={diagram.id}>
                    <span className={styles.colName}>
                      <span className={styles.nameLine}>
                        <Link className={table.name} to={`/workspace/${workspaceId}/explore/diagrams/${diagram.id}`} data-testid="diagram-name">
                          {diagram.name}
                        </Link>
                        {/* Only where it is not what a new diagram is: Read and change is the ordinary case. */}
                        {diagram.agentAccess === 'READ' && (
                          <span className={styles.badge} title={t('Agents may search and read it, and not change it.')} data-testid="diagram-read-only">
                            {t('Read only')}
                          </span>
                        )}
                      </span>
                      {diagram.description !== null && (
                        <span className={styles.description} title={diagram.description} data-testid="diagram-description">
                          {diagram.description}
                        </span>
                      )}
                    </span>
                    <span className={`${styles.colSize} ${table.modified}`}>
                      {tf('{nodes} nodes, {edges} connections', { nodes: diagram.nodeCount, edges: diagram.edgeCount })}
                    </span>
                    <span className={`${table.colModified} ${table.modified}`}>{timeAgo(diagram.updatedAt)}</span>
                    <span className={styles.colActions}>
                      <button
                        type="button"
                        className={table.rowAction}
                        onClick={() => navigate(`/workspace/${workspaceId}/explore/diagrams/${diagram.id}/settings`)}
                        aria-label={tf('Edit {name}', { name: diagram.name })}
                        title={t('Edit')}
                        data-testid="diagram-edit"
                      >
                        <img src={pencilIcon} alt="" width={14} height={14} />
                      </button>
                      <MoveToCatalog
                        name={diagram.name}
                        catalogs={catalogs ?? []}
                        currentCatalogId={diagram.catalogId}
                        move={(catalogId) => moveDiagram(diagram.id, catalogId)}
                        onMoved={() => load()}
                        className={table.rowAction}
                      />
                      <button
                        type="button"
                        className={table.rowAction}
                        onClick={() => setRemoving(diagram)}
                        aria-label={t('Remove the diagram')}
                        title={t('Remove the diagram')}
                        data-testid="diagram-remove"
                      >
                        <TrashIcon />
                      </button>
                    </span>
                  </div>
                ))}
              </section>
            </>
          )}
        </section>
      </div>

      <ConfirmDialog
        subject={removing?.name ?? null}
        kind="removeDiagram"
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (removing === null) return;
          await deleteDiagram(removing.id);
          setRemoving(null);
          await load();
        }}
      />
      <ConfirmDialog
        subject={removingCatalog?.name ?? null}
        kind="removeDiagramCatalog"
        onClose={() => setRemovingCatalog(null)}
        onConfirm={async () => {
          if (removingCatalog === null) return;
          await deleteDiagramCatalog(removingCatalog.id);
          setRemovingCatalog(null);
          setSearchParams({}, { replace: true });
          await load();
        }}
      />
    </AppShell>
  );
}
