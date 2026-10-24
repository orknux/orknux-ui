import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import {
  createMemoryCatalog,
  deleteMemory,
  deleteMemoryCatalog,
  fetchMemories,
  fetchMemoryAuthors,
  fetchMemoryCatalogs,
  memoryDate,
  moveMemory,
  renameMemoryCatalog,
} from '../../api/memory';
import type { Memory, MemoryCatalog, MemorySort } from '../../api/memory';
import type { PageOf } from '../../api/client';
import type { SessionUser } from '../../api/session';
import arrowDownIcon from '../../assets/arrow-down-narrow-wide.svg';
import chevronDown12Icon from '../../assets/chevron-down-12.svg';
import folderOpenIcon from '../../assets/folder-open.svg';
import folderIcon from '../../assets/folder.svg';
import penIcon from '../../assets/pen.svg';
import plusIcon from '../../assets/plus.svg';
import searchIcon from '../../assets/search.svg';
import slidersIcon from '../../assets/sliders-horizontal.svg';
// The grey trash from the design, not the red one the delete dialogs use: on a
// row it sits beside an edit pencil as one action among several, and a red icon
// on every card reads as a warning about the card rather than about deleting it.
import trashIcon from '../../assets/trash-grey.svg';
import { AppShell } from '../../components/AppShell';
import { Loader } from '../../components/Loader';
import { MoveToCatalog } from '../../components/MoveToCatalog';
import { UsedBy } from '../../components/UsedBy';
import { WorkspaceSidebar } from '../../components/WorkspaceSidebar';
import { shellUser } from '../../session/user';
import styles from './WorkspaceMemoryPage.module.css';
import { DuplicateButton } from '../../components/ComponentTransfer';
import { duplicateMemory } from '../../api/transfer';
import { t } from '../../i18n';
import { Select } from '../../components/Select';

export interface WorkspaceMemoryPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

/** What the grid can be ordered by, and what the control calls each one. */
const SORTS: { value: MemorySort; label: string }[] = [
  { value: 'LAST_MODIFIED', label: t('Last Modified') },
  { value: 'CREATED', label: t('Date Added') },
  { value: 'TITLE', label: t('Title') },
];

/** Five to a page, as the design shows. */
const PAGE_SIZE = 5;

/**
 * How many of one catalog's matches a search across every catalog shows.
 *
 * A page's worth, and the rest is that catalog narrowed to: the search is the
 * server's, catalog by catalog, so what is drawn is never every memory held.
 */
const GROUP_SIZE = PAGE_SIZE;

/** How long the box waits for the typing to stop before every catalog is asked. */
const SEARCH_PAUSE_MS = 250;

/**
 * The workspace's memory: catalogs on the left, what is in the selected one on
 * the right.
 *
 * Filtering, sorting and paging are the server's — the catalog is the unit that
 * is paged through, and doing it here would mean holding every memory in the
 * browser to show five of them.
 */
export function WorkspaceMemoryPage({ session, onSignOut }: WorkspaceMemoryPageProps) {
  const { workspaceId = '' } = useParams();
  /**
   * Which catalog to open on, where somebody arrived pointed at one.
   *
   * A catalog is what an agent is granted, so the grant list on an agent's
   * settings links to it - and a link that lands on whichever catalog happens
   * to be first is a link that names one thing and opens another. Issue #251.
   * It is an opening position and not a filter: choosing another in the column
   * leaves the address alone, because a catalog somebody is reading is not a
   * place they asked to be sent.
   */
  const [addressed] = useSearchParams();
  const asked = addressed.get('catalog');

  const [catalogs, setCatalogs] = useState<MemoryCatalog[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [authors, setAuthors] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  /**
   * What the box at the top of the rail holds, and it reads every catalog.
   *
   * It sat in the catalog's panel and searched only that one, so a memory
   * filed somewhere else was "not there". `?q=` opens on a search.
   */
  const [search, setSearch] = useState(() => addressed.get('q') ?? '');
  const searching = search.trim() !== '';
  /**
   * Whether a search has been narrowed to the selected catalog by choosing it
   * in the rail. Otherwise a search shows every catalog's matches, grouped.
   */
  const [narrowed, setNarrowed] = useState(false);
  /** The first matches in each catalog, and how many there are, by catalog id. */
  const [found, setFound] = useState<Map<string, PageOf<Memory>> | null>(null);
  /** Bumped after a change, so the search across every catalog is asked again. */
  const [revision, setRevision] = useState(0);
  const [author, setAuthor] = useState('');
  const [sort, setSort] = useState<MemorySort>('LAST_MODIFIED');
  const [page, setPage] = useState(0);

  const [error, setError] = useState<string | null>(null);

  const current = catalogs?.find((catalog) => catalog.id === selected) ?? null;

  const loadCatalogs = useCallback(
    async (keep?: string) => {
      const found = await fetchMemoryCatalogs(workspaceId);
      setCatalogs(found);
      // Keep the catalog that was open where it still exists; then the one the
      // address asked for, which is only ever the first time round; then the
      // first, so the panel is never showing nothing while catalogs exist.
      setSelected((present) => {
        const wanted = keep ?? present ?? asked;
        return found.find((catalog) => catalog.id === wanted)?.id ?? found[0]?.id ?? null;
      });
    },
    [workspaceId, asked],
  );

  useEffect(() => {
    loadCatalogs().catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : t('Could not load the memory catalogs.'));
    });
  }, [loadCatalogs]);

  const loadMemories = useCallback(async () => {
    if (selected === null) {
      setMemories([]);
      setTotal(0);
      setTotalPages(0);
      return;
    }
    const found = await fetchMemories(selected, { search, author, sort, page, size: PAGE_SIZE });
    setMemories(found.content);
    setTotal(found.totalElements);
    setTotalPages(found.totalPages);
  }, [selected, search, author, sort, page]);

  useEffect(() => {
    loadMemories().catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : t('Could not load the memories.'));
    });
  }, [loadMemories]);

  // The filter offers the authors of this catalog, so it changes with it.
  useEffect(() => {
    if (selected === null) {
      setAuthors([]);
      return;
    }
    fetchMemoryAuthors(selected).then(setAuthors).catch(() => setAuthors([]));
  }, [selected, total]);

  /*
   * Every catalog asked the same question, each for its first few and a count.
   *
   * The server's search rather than the browser's, as inside a catalog: a
   * catalog is paged because it can be long, so reading them all whole to
   * filter here is exactly what the paging is there to avoid. Asked again
   * while narrowed, because the rail's counts are what this answers.
   */
  useEffect(() => {
    if (!searching || catalogs === null) {
      setFound(null);
      return;
    }
    let stale = false;
    const pause = window.setTimeout(() => {
      Promise.all(
        catalogs.map(async (catalog) => {
          const matches = await fetchMemories(catalog.id, { search, sort, page: 0, size: GROUP_SIZE });
          return [catalog.id, matches] as const;
        }),
      )
        .then((answers) => {
          if (!stale) setFound(new Map(answers));
        })
        .catch((cause: unknown) => {
          if (!stale) setError(cause instanceof Error ? cause.message : t('Could not load the memories.'));
        });
    }, SEARCH_PAUSE_MS);
    return () => {
      stale = true;
      window.clearTimeout(pause);
    };
  }, [searching, catalogs, search, sort, revision]);

  /** After a change to a memory: the open catalog, and the search across all of them. */
  async function reloadMemories() {
    await loadMemories();
    setRevision((present) => present + 1);
  }

  /** A new search starts across every catalog; one being refined stays where it was narrowed to. */
  function changeSearch(text: string) {
    if (search.trim() === '' || text.trim() === '') setNarrowed(false);
    setSearch(text);
    setPage(0);
  }

  /**
   * Anything that changes what is being shown starts again at the first page.
   * The search stays: choosing a catalog while searching narrows it there.
   */
  function choose(catalogId: string) {
    setSelected(catalogId);
    setAuthor('');
    setPage(0);
    if (searching) setNarrowed(true);
  }

  async function guard(work: () => Promise<void>) {
    setError(null);
    try {
      await work();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('That did not work.'));
    }
  }

  async function handleNewCatalog() {
    const name = window.prompt(t('Name the catalog'));
    if (name === null || name.trim() === '') return;
    await guard(async () => {
      const created = await createMemoryCatalog(workspaceId, name.trim());
      await loadCatalogs(created.id);
    });
  }

  async function handleRenameCatalog() {
    if (current === null) return;
    const name = window.prompt(t('Rename the catalog'), current.name);
    if (name === null || name.trim() === '' || name.trim() === current.name) return;
    await guard(async () => {
      await renameMemoryCatalog(current.id, name.trim());
      await loadCatalogs(current.id);
    });
  }

  async function handleDeleteCatalog() {
    if (current === null) return;
    const held = current.memoryCount;
    const warning =
      held === 0
        ? `Delete ${current.name}?`
        : `Delete ${current.name} and the ${held} ${held === 1 ? 'memory' : 'memories'} in it?`;
    if (!window.confirm(warning)) return;
    await guard(async () => {
      await deleteMemoryCatalog(current.id);
      await loadCatalogs();
    });
  }

  async function handleDeleteMemory(memory: Memory) {
    if (!window.confirm(`Delete "${memory.title}"?`)) return;
    await guard(async () => {
      await deleteMemory(memory.id);
      await reloadMemories();
      await loadCatalogs(selected ?? undefined);
    });
  }

  /** Every catalog's matches at once, rather than the selected catalog's. */
  const everywhere = searching && !narrowed;
  const foundTotal = [...(found?.values() ?? [])].reduce((sum, matches) => sum + matches.totalElements, 0);

  /** A memory's card, the same in its catalog and in a search across all of them. */
  function memoryCard(memory: Memory) {
    return (
      <article key={memory.id} className={styles.card} data-memory-card={memory.title}>
        <header className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>
            <Link className={styles.cardTitleLink} to={`/workspace/${workspaceId}/memory/${memory.id}`}>
              {memory.title}
            </Link>
          </h2>
          <div className={styles.cardActions}>
            <DuplicateButton
              name={memory.title}
              className={styles.iconButton}
              run={() => duplicateMemory(memory.id).then((made) => made.title)}
              onDone={() => void reloadMemories()}
            />
            <MoveToCatalog
              name={memory.title}
              catalogs={catalogs ?? []}
              currentCatalogId={memory.catalogId}
              className={styles.iconButton}
              move={(target) => moveMemory(memory.id, memory.title, memory.content, target)}
              onMoved={() =>
                guard(async () => {
                  await reloadMemories();
                  await loadCatalogs(selected ?? undefined);
                })
              }
            />
            <Link
              className={styles.iconButton}
              to={`/workspace/${workspaceId}/memory/${memory.id}`}
              aria-label={`Edit ${memory.title}`}
              title={t('Edit')}
            >
              <img src={penIcon} alt="" width={14} height={14} />
            </Link>
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => void handleDeleteMemory(memory)}
              aria-label={`Delete ${memory.title}`}
              title={t('Delete')}
            >
              <img src={trashIcon} alt="" width={14} height={14} />
            </button>
          </div>
        </header>
        <p className={styles.cardBody}>{memory.content}</p>
        <footer className={styles.cardFooter}>
          <span className={styles.author}>
            <span className={styles.avatar} aria-hidden="true">
              {memory.createdBy.slice(0, 1).toUpperCase()}
            </span>
            Added by {memory.createdBy}
          </span>
          <span className={styles.date}>{memoryDate(memory.createdAt)}</span>
        </footer>
      </article>
    );
  }

  const from = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min((page + 1) * PAGE_SIZE, total);

  return (
    <AppShell
      user={shellUser(session)}
      workspacePath={`/workspace/${workspaceId}`}
      showAdmin={session.admin}
      onSignOut={onSignOut}
      sidebar={<WorkspaceSidebar workspaceId={workspaceId} />}
    >
      <div className={styles.split}>
        <aside className={styles.catalogs}>
          <header className={styles.catalogsHeader}>
            <p className={styles.catalogsTitle}>{t('MEMORY CATALOGS')}</p>
            <button
              type="button"
              className={styles.newCatalog}
              onClick={() => void handleNewCatalog()}
              aria-label={t('New catalog')}
              title={t('New catalog')}
            >
              <img src={plusIcon} alt="" width={10} height={10} />
            </button>
          </header>

          {/* The search, over every catalog, so it sits above them rather than in one. */}
          <div className={styles.railSearch}>
            <img src={searchIcon} alt="" width={14} height={14} />
            <input
              className={styles.searchInput}
              type="search"
              placeholder={t('Search memories...')}
              value={search}
              onChange={(event) => changeSearch(event.target.value)}
              aria-label={t('Search memories')}
              data-memory-search
            />
          </div>

          <div className={styles.catalogsList}>
            {catalogs === null && <p className={styles.sidebarNote}><Loader /></p>}
            {catalogs?.length === 0 && <p className={styles.sidebarNote}>{t('No catalogs yet.')}</p>}
            {searching && (
              <button
                type="button"
                className={everywhere ? styles.catalogCurrent : styles.catalog}
                onClick={() => setNarrowed(false)}
                aria-current={everywhere ? 'true' : undefined}
                data-search-everywhere
              >
                <img src={searchIcon} alt="" width={14} height={14} />
                <span className={styles.catalogName}>{t('All catalogs')}</span>
                <span className={everywhere ? styles.countCurrent : styles.count}>{found === null ? '' : foundTotal}</span>
              </button>
            )}
            {catalogs?.map((catalog) => {
              const open = catalog.id === selected && !everywhere;
              // While searching, the badge is the matches and a catalog with none is dimmed.
              const matches = found?.get(catalog.id)?.totalElements;
              return (
                <button
                  key={catalog.id}
                  type="button"
                  className={`${open ? styles.catalogCurrent : styles.catalog}${matches === 0 ? ` ${styles.catalogDim}` : ''}`}
                  onClick={() => choose(catalog.id)}
                  aria-current={open ? 'true' : undefined}
                  data-catalog-row={catalog.name}
                  data-matches={matches}
                >
                  <img src={open ? folderOpenIcon : folderIcon} alt="" width={14} height={14} />
                  <span className={styles.catalogName}>{catalog.name}</span>
                  <span className={open ? styles.countCurrent : styles.count}>{matches ?? catalog.memoryCount}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className={styles.panel}>
          {error !== null && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          {everywhere ? (
            /*
              A search across every catalog: the first matches in each, grouped
              under the catalog they are in, each card the one its catalog draws.
              A catalog with more than fits says how many, and the rest is that
              catalog narrowed to - paged as it always is.
            */
            <>
              <header className={styles.catalogHeader}>
                <h1 className={styles.catalogHeading}>{t('All catalogs')}</h1>
              </header>
              <div className={styles.rule} />

              {found === null ? (
                <p className={styles.sidebarNote}><Loader /></p>
              ) : foundTotal === 0 ? (
                <p className={styles.empty} data-search-empty>{t('Nothing anywhere matches that.')}</p>
              ) : (
                <div className={styles.groups}>
                  {(catalogs ?? []).map((catalog) => {
                    const matches = found.get(catalog.id);
                    if (matches === undefined || matches.totalElements === 0) return null;
                    return (
                      <section key={catalog.id} className={styles.group} data-search-group={catalog.name}>
                        <h2 className={styles.groupHeading}>
                          <img src={folderIcon} alt="" width={14} height={14} />
                          <span className={styles.catalogName}>{catalog.name}</span>
                          <span className={styles.count}>{matches.totalElements}</span>
                        </h2>
                        <div className={styles.cards}>{matches.content.map(memoryCard)}</div>
                        {matches.totalElements > matches.content.length && (
                          <button
                            type="button"
                            className={styles.groupMore}
                            onClick={() => choose(catalog.id)}
                            data-search-more
                          >
                            {t('Show all')} {matches.totalElements}
                          </button>
                        )}
                      </section>
                    );
                  })}
                </div>
              )}
            </>
          ) : current === null ? (
            <p className={styles.empty}>
              {catalogs?.length === 0
                ? t('Add a catalog to start writing things down.')
                : t('Choose a catalog to see what is in it.')}
            </p>
          ) : (
            <>
              <header className={styles.catalogHeader}>
                <h1 className={styles.catalogHeading}>{current.name}</h1>
                <div className={styles.catalogActions}>
                  <button
                    type="button"
                    className={styles.iconButton}
                    onClick={() => void handleRenameCatalog()}
                    aria-label={`Rename ${current.name}`}
                    title={t('Rename')}
                  >
                    <img src={penIcon} alt="" width={14} height={14} />
                  </button>
                  {/*
                    The one this workspace always has carries no Delete.

                    Left out rather than drawn and disabled: a control that is
                    there and refuses is a control somebody presses twice before
                    reading why. Rename is beside it and is the way out of a name
                    nobody likes, which is the whole reason this one is a flag
                    rather than a name. The server refuses it as well, because a
                    screen is not a boundary.
                  */}
                  {!current.isDefault && (
                    <button
                      type="button"
                      className={styles.iconButton}
                      onClick={() => void handleDeleteCatalog()}
                      aria-label={`Delete ${current.name}`}
                      title={t('Delete')}
                    >
                      <img src={trashIcon} alt="" width={14} height={14} />
                    </button>
                  )}
                </div>
              </header>
              <div className={styles.rule} />

              <div className={styles.toolbar}>
                <div className={styles.selectBox}>
                  <img src={slidersIcon} alt="" width={14} height={14} />
                  <Select
                    className={styles.select}
                    value={author}
                    onChange={(picked) => {
                      setAuthor(picked);
                      setPage(0);
                    }}
                    aria-label={t('Filter by author')}
                    chevron={false}
                  >
                    <option value="">{t('All Authors')}</option>
                    {authors.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </Select>
                  <img src={chevronDown12Icon} alt="" width={10} height={10} />
                </div>
                <Link
                  className={styles.addMemory}
                  to={`/workspace/${workspaceId}/memory/new?catalog=${current.id}`}
                >{t('+ Add Memory')}</Link>
              </div>

              <div className={styles.stats}>
                <p className={styles.statsText}>
                  {total === 0
                    ? `Nothing in ${current.name} yet`
                    : `Showing ${memories.length} ${memories.length === 1 ? 'memory' : 'memories'} in ${current.name}`}
                </p>
                <div className={styles.sortBy}>
                  <span className={styles.statsText}>{t('Sort by:')}</span>
                  <Select
                    className={styles.sortSelect}
                    value={sort}
                    onChange={(picked) => {
                      setSort(picked as MemorySort);
                      setPage(0);
                    }}
                    aria-label={t('Sort memories')}
                    chevron={false}
                  >
                    {SORTS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                  <img src={arrowDownIcon} alt="" width={10} height={10} />
                </div>
              </div>

              <div className={styles.cards}>
                {memories.length === 0 && (
                  <p className={styles.empty}>
                    {search !== '' || author !== ''
                      ? t('Nothing here matches that.')
                      : t('Nothing written down here yet.')}
                  </p>
                )}
                {memories.map(memoryCard)}
              </div>

              <div className={styles.pagination}>
                <p className={styles.statsText}>
                  {total === 0 ? t('No memories') : `Showing ${from}-${to} of ${total} memories`}
                </p>
                <div className={styles.pageControls}>
                  <button
                    type="button"
                    className={styles.pageButton}
                    onClick={() => setPage((present) => Math.max(0, present - 1))}
                    disabled={page === 0}
                  >{t('Previous')}</button>
                  {Array.from({ length: totalPages }, (_, index) => index).map((index) => (
                    <button
                      key={index}
                      type="button"
                      className={index === page ? styles.pageCurrent : styles.pageButton}
                      onClick={() => setPage(index)}
                      aria-current={index === page ? 'page' : undefined}
                    >
                      {index + 1}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={styles.pageButton}
                    onClick={() => setPage((present) => Math.min(totalPages - 1, present + 1))}
                    disabled={page >= totalPages - 1}
                  >{t('Next')}</button>
                </div>
              </div>

              {/*
                Which agents are granted this catalog, under what is in it. The
                same panel the skills page draws, for the same reason: the
                folder is the unit an agent is granted and the unit a delete is
                refused on, so it is the unit the question is asked about.
              */}
              <section className={styles.card}>
                <UsedBy key={current.id} kind="MEMORY_CATALOG" componentId={current.id} />
              </section>
            </>
          )}
        </section>
      </div>

    </AppShell>
  );
}
