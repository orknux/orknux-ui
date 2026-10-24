import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import type { PageOf } from '../../api/client';
import type { SessionUser } from '../../api/session';
import {
  createSkill,
  createSkillCatalog,
  deleteSkill,
  deleteSkillCatalog,
  fetchEveryWorkspaceSkill,
  fetchPluginSkillCatalogs,
  fetchSkillCatalogs,
  fetchWorkspaceSkills,
  renameSkillCatalog,
  setSkillEnabled,
  updateSkill,
} from '../../api/skills';
import type { PluginSkill, PluginSkillCatalog, Skill, SkillCatalog } from '../../api/skills';
import { timeAgo } from '../../api/tools';
import folderOpenIcon from '../../assets/folder-open.svg';
import folderIcon from '../../assets/folder.svg';
import penIcon from '../../assets/pen.svg';
import chevronDown12Icon from '../../assets/chevron-down-12.svg';
import plusIcon from '../../assets/plus.svg';
import puzzleIcon from '../../assets/puzzle.svg';
import searchIcon from '../../assets/search.svg';
import toggleOffIcon from '../../assets/toggle-off.svg';
import toggleOnIcon from '../../assets/toggle-on.svg';
import trashIcon from '../../assets/trash-grey.svg';
import { AppShell } from '../../components/AppShell';
import {
  DuplicateComponentButton,
  ExportComponentButton,
  ImportComponentsButton,
  SaveAsTemplateButton,
  UseTemplateButton,
} from '../../components/ComponentTransfer';
import { Highlighted } from '../../components/Highlighted';
import { Loader } from '../../components/Loader';
import { CatalogNameDialog } from '../../components/CatalogNameDialog';
import { Markdown } from '../../components/Markdown';
import { MoveToCatalog } from '../../components/MoveToCatalog';
import { NameDialog } from '../../components/NameDialog';
import { UsedBy } from '../../components/UsedBy';
import { WorkspaceSidebar } from '../../components/WorkspaceSidebar';
import { excerptAround, firstMatch, termsOf } from '../../components/searchMatches';
import { shellUser } from '../../session/user';
import styles from './WorkspaceMemoryPage.module.css';
import { t } from '../../i18n';

export interface WorkspaceSkillsPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

/**
 * How a plugin's catalog is spelled in `selected`.
 *
 * A workspace catalog is selected by its numeric id and a plugin's has none,
 * so the prefix is what keeps one field able to hold either.
 */
const PLUGIN_PREFIX = 'plugin:';

/** A catalog is a page's worth. */
const PAGE_SIZE = 50;

/**
 * Whether a skill answers what was typed in the search box.
 *
 * Its content too, and not only the name and description on the card: what
 * somebody remembers of a skill is often a phrase from inside it. One rule for
 * both kinds of catalog, so the box finds the same things wherever they are.
 * Issue #642.
 */
function matchesSearch(
  skill: { name: string; description: string | null; content: string },
  search: string,
): boolean {
  const wanted = search.trim().toLowerCase();
  if (wanted === '') return true;
  return haystackOf(skill).includes(wanted);
}

/** A skill's words lowercased once per skill read, not once per skill per letter typed. */
const haystacks = new WeakMap<object, string>();
function haystackOf(skill: { name: string; description: string | null; content: string }): string {
  let held = haystacks.get(skill);
  if (held === undefined) {
    held = [skill.name, skill.description ?? '', skill.content].join(' ').toLowerCase();
    haystacks.set(skill, held);
  }
  return held;
}

/**
 * A skill's markdown as the words it reads as, for an excerpt on a card.
 *
 * Only the markers that would otherwise sit around a matched word - a heading's
 * hashes, a quote's angle, bold and code ticks. Underscores stay: in a skill they
 * are as often inside an identifier as around emphasis.
 */
function proseOf(markdown: string): string {
  return markdown.replace(/^[ \t]{0,3}(?:#{1,6}|>)[ \t]*/gm, '').replace(/\*\*|`/g, '');
}

/**
 * The excerpt a card draws when the search matched only its content, which the
 * card does not show; null where something it does show matched, or nothing.
 */
function excerptFor(drawn: string, content: string, terms: readonly string[]): string | null {
  if (terms.length === 0 || firstMatch(drawn, terms) !== -1) return null;
  return excerptAround(proseOf(content), terms) ?? excerptAround(content, terms);
}

/**
 * The workspace's skills: catalogs on the left, what is in the selected one on
 * the right.
 *
 * The same shape as Memory, and deliberately the same stylesheet — the two
 * screens answer the same question about different things, and a second layout
 * for it would be a second thing to keep in step. The catalog is the unit an
 * agent is granted, which is why it is the unit shown.
 */
export function WorkspaceSkillsPage({ session, onSignOut }: WorkspaceSkillsPageProps) {
  const { workspaceId = '' } = useParams();
  const navigate = useNavigate();
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

  const [catalogs, setCatalogs] = useState<SkillCatalog[] | null>(null);
  /**
   * The catalogs the loaded plugins bring, read once.
   *
   * Beside the workspace's own in the rail rather than on a screen of their
   * own: what somebody wants to know is what an agent could be given, and
   * that is one list. They are not rows — nothing here can be renamed,
   * deleted, added to or edited — so the panel draws them read-only.
   */
  const [pluginCatalogs, setPluginCatalogs] = useState<PluginSkillCatalog[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [skills, setSkills] = useState<PageOf<Skill> | null>(null);
  /**
   * What the box at the top of the rail holds, and it reads every catalog.
   *
   * It sat inside the catalog's panel and searched only that one, so a skill
   * somebody half remembered was "not there" unless they had already guessed
   * its folder - the opposite of what a search is for. Opened on `?q=` where a
   * link names one skill: the agent form's rows for a plugin's skill, which has
   * no page of its own.
   */
  const [search, setSearch] = useState(() => addressed.get('q') ?? '');
  const searching = search.trim() !== '';
  /**
   * The words a card marks where it draws them: its name, its description and
   * its content, so somebody can see why a card is on the list.
   */
  const terms = termsOf(search);
  /**
   * Whether a search has been narrowed to the selected catalog by choosing it
   * in the rail. Otherwise a search shows every catalog's matches, grouped.
   */
  const [narrowed, setNarrowed] = useState(false);
  /** Every workspace skill, read while a search is on and only then. */
  const [everySkill, setEverySkill] = useState<Skill[] | null>(null);
  const searchBox = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  /** Whether the catalog column is folded away; the list is not always the work. */
  const [foldedCatalogs, setFoldedCatalogs] = useState(false);
  const [creating, setCreating] = useState(false);
  /** Which catalog naming dialog is open: making a new one, or renaming one. */
  const [naming, setNaming] = useState<{ mode: 'new' } | { mode: 'rename'; id: string; name: string } | null>(null);

  const current = catalogs?.find((catalog) => catalog.id === selected) ?? null;
  /** A plugin's catalog is selected by name behind a prefix, so ids cannot clash. */
  const currentPlugin =
    selected?.startsWith(PLUGIN_PREFIX) === true
      ? pluginCatalogs?.find((catalog) => catalog.name === selected.slice(PLUGIN_PREFIX.length)) ?? null
      : null;

  const loadCatalogs = useCallback(
    async (keep?: string) => {
      const found = await fetchSkillCatalogs(workspaceId);
      setCatalogs(found);
      // Keep the catalog that was open where it still exists; then the one the
      // address asked for, which is only ever the first time round; then the
      // first, so the panel is never showing nothing while catalogs exist.
      setSelected((held) => {
        const wanted = keep ?? held ?? asked;
        // A plugin's catalog is not among `found`, and is kept as asked: the rail draws it once the plugins' list is in.
        if (wanted?.startsWith(PLUGIN_PREFIX)) return wanted;
        return found.find((catalog) => catalog.id === wanted)?.id ?? found[0]?.id ?? null;
      });
    },
    [workspaceId, asked],
  );

  useEffect(() => {
    if (workspaceId === '') return;
    loadCatalogs().catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : t('Could not load the skill catalogs.'));
    });
  }, [loadCatalogs, workspaceId]);

  const loadSkills = useCallback(async () => {
    // A plugin's catalog is not a folder in this workspace, so there is
    // nothing here to page through: its skills arrived with the catalog.
    if (selected === null || selected.startsWith(PLUGIN_PREFIX)) {
      setSkills(null);
      return;
    }
    setSkills(await fetchWorkspaceSkills(workspaceId, 0, PAGE_SIZE, selected));
  }, [workspaceId, selected]);

  useEffect(() => {
    /*
     * Its own effect, and its own failure. A plugin's catalogs being
     * unreadable is not a reason for the workspace's own to go missing, so
     * this one sets a list or leaves it empty rather than raising the error
     * the page shows.
     */
    fetchPluginSkillCatalogs()
      .then(setPluginCatalogs)
      .catch(() => setPluginCatalogs([]));
  }, []);

  useEffect(() => {
    loadSkills().catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : t('Could not load the skills.'));
    });
  }, [loadSkills]);

  // Read once when a search starts rather than on every letter: the box filters what is here.
  const loadEvery = useCallback(async () => {
    if (!searching) {
      setEverySkill(null);
      return;
    }
    setEverySkill(await fetchEveryWorkspaceSkill(workspaceId));
  }, [workspaceId, searching]);

  useEffect(() => {
    loadEvery().catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : t('Could not load the skills.'));
    });
  }, [loadEvery]);

  /** After a change to a skill: the open catalog, and the search across all of them. */
  async function reloadSkills() {
    await Promise.all([loadSkills(), loadEvery()]);
  }

  /** A new search starts across every catalog; one being refined stays where it was narrowed to. */
  function changeSearch(text: string) {
    if (search.trim() === '' || text.trim() === '') setNarrowed(false);
    setSearch(text);
  }

  /** Choosing a catalog while searching narrows the search to it. */
  function choose(at: string) {
    setSelected(at);
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

  function handleNewCatalog() {
    setNaming({ mode: 'new' });
  }

  function handleRenameCatalog() {
    if (current === null) return;
    setNaming({ mode: 'rename', id: current.id, name: current.name });
  }

  async function submitCatalogName(name: string) {
    if (naming === null) return;
    if (naming.mode === 'rename') {
      // An unchanged name is not a rename; close without troubling the server.
      if (name !== naming.name) {
        await renameSkillCatalog(naming.id, name);
        await loadCatalogs(naming.id);
      }
    } else {
      const created = await createSkillCatalog(workspaceId, name);
      await loadCatalogs(created.id);
    }
    setNaming(null);
  }

  async function handleDeleteCatalog() {
    if (current === null) return;
    const held = current.skillCount;
    const warning =
      held === 0
        ? `Delete ${current.name}?`
        : `Delete ${current.name} and the ${held} ${held === 1 ? 'skill' : 'skills'} in it?`;
    if (!window.confirm(warning)) return;
    await guard(async () => {
      await deleteSkillCatalog(current.id);
      await loadCatalogs();
    });
  }

  async function handleDeleteSkill(skill: Skill) {
    if (!window.confirm(`Delete "${skill.name}"?`)) return;
    await guard(async () => {
      await deleteSkill(skill.id);
      await reloadSkills();
      await loadCatalogs(selected ?? undefined);
    });
  }

  // Filtered here rather than by the server, by the one rule both kinds share.
  const showing = (skills?.content ?? []).filter((skill) => matchesSearch(skill, search));
  // A plugin's catalog arrived whole with the rail, so it is filtered the same way.
  const showingPlugin = (currentPlugin?.skills ?? []).filter((skill) => matchesSearch(skill, search));

  /** What a search finds, catalog by catalog; null until every skill has been read. */
  const found =
    searching && everySkill !== null
      ? new Map<string, Skill[]>(
          (catalogs ?? []).map((catalog) => [
            catalog.id,
            everySkill.filter((skill) => skill.catalogId === catalog.id && matchesSearch(skill, search)),
          ]),
        )
      : null;
  const foundPlugin = searching
    ? new Map<string, PluginSkill[]>(
        (pluginCatalogs ?? []).map((catalog) => [
          catalog.name,
          catalog.skills.filter((skill) => matchesSearch(skill, search)),
        ]),
      )
    : null;
  const foundTotal =
    [...(found?.values() ?? [])].reduce((sum, list) => sum + list.length, 0) +
    [...(foundPlugin?.values() ?? [])].reduce((sum, list) => sum + list.length, 0);
  /** Every catalog's matches at once, rather than the selected catalog's. */
  const everywhere = searching && !narrowed;

  /** A workspace skill's card, the same in its catalog and in a search across all of them. */
  function skillCard(skill: Skill) {
    // The content is not on the card, so a skill found only by it says where.
    const excerpt = excerptFor(`${skill.name} ${skill.key} ${skill.description ?? ''}`, skill.content, terms);
    return (
      <article key={skill.id} className={styles.card} data-skill-card={skill.name}>
        <header className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>
            <Link className={styles.cardTitleLink} to={`/workspace/${workspaceId}/skills/${skill.id}`}>
              <Highlighted text={skill.name} terms={terms} />
            </Link>
            <code className={styles.cardKey} data-skill-key>
              <Highlighted text={skill.key} terms={terms} />
            </code>
          </h2>
          <div className={styles.cardActions}>
            {/* A skill can be left defined but out of reach, which is
                what the toggle is for; which catalog it is in does
                not change either way. */}
            <button
              type="button"
              className={styles.iconButton}
              onClick={() =>
                void guard(async () => {
                  await setSkillEnabled(skill.id, !skill.enabled);
                  await reloadSkills();
                })
              }
              role="switch"
              aria-checked={skill.enabled}
              aria-label={`${skill.enabled ? 'Disable' : 'Enable'} ${skill.name}`}
              title={skill.enabled ? 'Disable' : 'Enable'}
            >
              <img
                src={skill.enabled ? toggleOnIcon : toggleOffIcon}
                alt=""
                width={36}
                height={20}
                data-keeps-colour
              />
            </button>
            <ExportComponentButton
              workspaceId={workspaceId}
              kind="SKILL"
              id={skill.id}
              name={skill.name}
              className={styles.iconButton}
            />
            <DuplicateComponentButton
              workspaceId={workspaceId}
              kind="SKILL"
              id={skill.id}
              name={skill.name}
              className={styles.iconButton}
              onDone={() => void reloadSkills()}
            />
            <SaveAsTemplateButton
              workspaceId={workspaceId}
              kind="SKILL"
              id={skill.id}
              name={skill.name}
              className={styles.iconButton}
              canPublish={session.admin}
            />
            <MoveToCatalog
              name={skill.name}
              catalogs={catalogs ?? []}
              currentCatalogId={skill.catalogId}
              className={styles.iconButton}
              move={(target) => updateSkill(skill.id, { catalogId: target })}
              onMoved={() =>
                guard(async () => {
                  await reloadSkills();
                  await loadCatalogs(selected ?? undefined);
                })
              }
            />
            <Link
              className={styles.iconButton}
              to={`/workspace/${workspaceId}/skills/${skill.id}`}
              aria-label={`Edit ${skill.name}`}
              title={t('Edit')}
            >
              <img src={penIcon} alt="" width={14} height={14} />
            </Link>
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => void handleDeleteSkill(skill)}
              aria-label={`Delete ${skill.name}`}
              title={t('Delete')}
            >
              <img src={trashIcon} alt="" width={14} height={14} />
            </button>
          </div>
        </header>
        <p className={styles.cardBody}>
          {skill.description === null ? t('No description') : <Highlighted text={skill.description} terms={terms} />}
        </p>
        {excerpt !== null && (
          <p className={styles.cardExcerpt} data-search-excerpt>
            <Highlighted text={excerpt} terms={terms} />
          </p>
        )}
        <footer className={styles.cardFooter}>
          <span className={styles.author}>
            <span className={styles.avatar} aria-hidden="true">
              {skill.lastModifiedBy.slice(0, 1).toUpperCase()}
            </span>
            {timeAgo(skill.lastModifiedAt)} by {skill.lastModifiedBy}
          </span>
        </footer>
      </article>
    );
  }

  /** A plugin skill's card: read-only, with the page folded away under it. */
  function pluginSkillCard(skill: PluginSkill) {
    // Found only by what is folded away, it is opened, so the match can be seen.
    const unfold = excerptFor(`${skill.name} ${skill.description ?? ''}`, skill.content, terms) !== null;
    return (
      <article key={skill.name} className={styles.card} data-skill-card={skill.name}>
        <header className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>
            <Highlighted text={skill.name} terms={terms} />
          </h2>
        </header>
        <p className={styles.cardBody}>
          {skill.description === null ? t('No description') : <Highlighted text={skill.description} terms={terms} />}
        </p>
        {/*
          The page itself, folded away. A skill is long, and a
          catalog of them opened flat is a screen nobody reads -
          but what it says is the only thing worth coming here
          for, so it is one click and not a page away.
        */}
        <details open={unfold || undefined}>
          <summary className={styles.statsText}>{t('Read it')}</summary>
          <Markdown highlight={terms}>{skill.content}</Markdown>
        </details>
      </article>
    );
  }

  return (
    <AppShell
      user={shellUser(session)}
      workspacePath={`/workspace/${workspaceId}`}
      showAdmin={session.admin}
      onSignOut={onSignOut}
      sidebar={<WorkspaceSidebar workspaceId={workspaceId} />}
    >
      <div className={styles.split}>
        <aside className={foldedCatalogs ? `${styles.catalogs} ${styles.catalogsCollapsed}` : styles.catalogs}>
          <header className={styles.catalogsHeader}>
            {!foldedCatalogs && <p className={styles.catalogsTitle}>{t('SKILL CATALOGS')}</p>}
            {!foldedCatalogs && (
            <button
              type="button"
              className={styles.newCatalog}
              onClick={() => void handleNewCatalog()}
              aria-label={t('New catalog')}
              title={t('New catalog')}
            >
              <img src={plusIcon} alt="" width={10} height={10} />
            </button>
            )}
          </header>

          {/*
            The search, over every catalog, so it sits above them rather than in
            one. Folded, the column keeps a way to it: the glass opens the
            column with the box ready to type in.
          */}
          {foldedCatalogs ? (
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => {
                setFoldedCatalogs(false);
                // After the column is drawn again, which is what puts the box back.
                requestAnimationFrame(() => searchBox.current?.focus());
              }}
              aria-label={t('Search skills')}
              title={t('Search skills')}
              data-skill-search-open
            >
              <img src={searchIcon} alt="" width={14} height={14} />
            </button>
          ) : (
            <div className={styles.railSearch}>
              <img src={searchIcon} alt="" width={14} height={14} />
              <input
                ref={searchBox}
                className={styles.searchInput}
                type="search"
                placeholder={t('Search skills...')}
                value={search}
                onChange={(event) => changeSearch(event.target.value)}
                aria-label={t('Search skills')}
                data-skill-search
              />
            </div>
          )}

          {!foldedCatalogs && (
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
                <span className={everywhere ? styles.countCurrent : styles.count}>{foundTotal}</span>
              </button>
            )}
            {catalogs?.map((catalog) => {
              const open = catalog.id === selected && !everywhere;
              // While searching, the badge is the matches and a catalog with none is dimmed.
              const matches = found?.get(catalog.id)?.length;
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
                  <span className={open ? styles.countCurrent : styles.count}>{matches ?? catalog.skillCount}</span>
                </button>
              );
            })}

            {/*
              And what the plugins bring, under a rule so the two kinds read
              as two kinds. A plugin's catalog is granted the same way and
              carries the same skills; what it cannot do is be edited, which
              the panel says rather than the rail.
            */}
            {pluginCatalogs !== null && pluginCatalogs.length > 0 && (
              <>
                <p className={styles.catalogsFrom}>{t('FROM PLUGINS')}</p>
                {pluginCatalogs.map((catalog) => {
                  const at = `${PLUGIN_PREFIX}${catalog.name}`;
                  const open = at === selected && !everywhere;
                  const matches = foundPlugin?.get(catalog.name)?.length;
                  return (
                    <button
                      key={catalog.name}
                      type="button"
                      className={`${open ? styles.catalogCurrent : styles.catalog}${matches === 0 ? ` ${styles.catalogDim}` : ''}`}
                      onClick={() => choose(at)}
                      aria-current={open ? 'true' : undefined}
                      title={`${catalog.name} — from the ${catalog.plugin} plugin`}
                      data-catalog-row={catalog.name}
                      data-matches={matches}
                    >
                      <img src={puzzleIcon} alt="" width={14} height={14} />
                      <span className={styles.catalogName}>{catalog.name}</span>
                      <span className={open ? styles.countCurrent : styles.count}>
                        {matches ?? catalog.skills.length}
                      </span>
                    </button>
                  );
                })}
              </>
            )}
          </div>
          )}
        </aside>
        {/*
          Outside the panel, because the panel scrolls - a handle straddling
          its edge from the inside would be clipped. Same reasoning, and the
          same drawing, as the shell handle one level up (issue #118).
        */}
          <button
            type="button"
            className={foldedCatalogs ? `${styles.collapseCatalogs} ${styles.collapseCatalogsShut}` : styles.collapseCatalogs}
            onClick={() => setFoldedCatalogs((folded) => !folded)}
            aria-expanded={!foldedCatalogs}
            aria-label={foldedCatalogs ? t('Show catalogs') : t('Hide catalogs')}
            title={foldedCatalogs ? t('Show catalogs') : t('Hide catalogs')}
          >
            <span
              className={
                foldedCatalogs
                  ? `${styles.collapseIcon} ${styles.collapseIconOpen}`
                  : styles.collapseIcon
              }
              style={{
                maskImage: `url("${chevronDown12Icon}")`,
                WebkitMaskImage: `url("${chevronDown12Icon}")`,
              }}
            />
          </button>

        <section className={styles.panel}>
          {error !== null && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          {everywhere ? (
            /*
              A search across every catalog: the matches grouped under the
              catalog each is in, the plugins' after the workspace's own, and
              every card the one its catalog draws - opened and edited from here
              exactly as from there.
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
                    const matches = found.get(catalog.id) ?? [];
                    if (matches.length === 0) return null;
                    return (
                      <section key={catalog.id} className={styles.group} data-search-group={catalog.name}>
                        <h2 className={styles.groupHeading}>
                          <img src={folderIcon} alt="" width={14} height={14} />
                          <span className={styles.catalogName}>{catalog.name}</span>
                          <span className={styles.count}>{matches.length}</span>
                        </h2>
                        <div className={styles.cards}>{matches.map(skillCard)}</div>
                      </section>
                    );
                  })}
                  {(pluginCatalogs ?? []).map((catalog) => {
                    const matches = foundPlugin?.get(catalog.name) ?? [];
                    if (matches.length === 0) return null;
                    return (
                      <section key={catalog.name} className={styles.group} data-search-group={catalog.name}>
                        <h2 className={styles.groupHeading} title={`${catalog.name} — from the ${catalog.plugin} plugin`}>
                          <img src={puzzleIcon} alt="" width={14} height={14} data-plugin-marker />
                          <span className={styles.catalogName}>{catalog.name}</span>
                          <span className={styles.groupFrom}>{t('From the plugin')} {catalog.plugin}</span>
                          <span className={styles.count}>{matches.length}</span>
                        </h2>
                        <div className={styles.cards}>{matches.map(pluginSkillCard)}</div>
                      </section>
                    );
                  })}
                </div>
              )}
            </>
          ) : currentPlugin !== null ? (
            /*
              A plugin's catalog, read-only and saying so.

              Every action a workspace skill has is missing here because none
              of them means anything: a plugin's skills are replaced wholesale
              the next time it is loaded, so an edit would be an edit somebody
              loses without being told. What is left is what somebody actually
              came for — what the agent would read, in full.
            */
            <>
              <header className={styles.catalogHeader}>
                <h1 className={styles.catalogHeading}>{currentPlugin.name}</h1>
              </header>
              <div className={styles.rule} />

              <div className={styles.stats}>
                {/* One line, and the whole of what is different here: where
                    it came from, and that it is granted like any other. */}
                <p className={styles.statsText}>
                  {t('From the plugin')} {currentPlugin.plugin} — {t('granted by name, and not edited here.')}
                </p>
              </div>

              <div className={styles.cards}>
                {currentPlugin.skills.length === 0 && (
                  <p className={styles.empty}>{t('This plugin brings no skills.')}</p>
                )}
                {currentPlugin.skills.length > 0 && showingPlugin.length === 0 && (
                  <p className={styles.empty}>{t('Nothing here matches that.')}</p>
                )}
                {showingPlugin.map(pluginSkillCard)}
              </div>
            </>
          ) : current === null ? (
            <p className={styles.empty}>
              {catalogs?.length === 0
                ? t('Add a catalog to start writing skills.')
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
                  <button
                    type="button"
                    className={styles.iconButton}
                    onClick={() => void handleDeleteCatalog()}
                    aria-label={`Delete ${current.name}`}
                    title={t('Delete')}
                  >
                    <img src={trashIcon} alt="" width={14} height={14} />
                  </button>
                </div>
              </header>
              <div className={styles.rule} />

              <div className={styles.toolbar}>
                <ImportComponentsButton
                  workspaceId={workspaceId}
                  onImported={() =>
                    void guard(async () => {
                      // The catalogs too: an imported skill names its folder, and
                      // a folder this workspace did not have was just made.
                      await loadCatalogs();
                      await reloadSkills();
                    })
                  }
                />
                <UseTemplateButton
                  workspaceId={workspaceId}
                  kind="SKILL"
                  onImported={() =>
                    void guard(async () => {
                      // The catalogs too, for the reason Import gives above.
                      await loadCatalogs();
                      await reloadSkills();
                    })
                  }
                />
                <button type="button" className={styles.addMemory} onClick={() => setCreating(true)}>{t('+ Add Skill')}</button>
              </div>

              <div className={styles.stats}>
                <p className={styles.statsText}>
                  {/* Empty is the catalog's own count: a search that matches nothing has not emptied it. */}
                  {(skills?.content.length ?? 0) === 0
                    ? `Nothing in ${current.name} yet`
                    : `Showing ${showing.length} ${showing.length === 1 ? 'skill' : 'skills'} in ${current.name}`}
                </p>
              </div>

              <div className={styles.cards}>
                {showing.length === 0 && (
                  <p className={styles.empty}>
                    {search !== '' ? t('Nothing here matches that.') : t('No skills in this catalog yet.')}
                  </p>
                )}
                {showing.map(skillCard)}
              </div>

              {/*
                Which agents are granted this catalog, under what is in it.

                The folder is what an agent is granted, so the folder is what
                the question is asked about - the same unit the delete guard
                refuses on. Under the skills rather than over them: somebody
                opens a catalog to read it, and this is what they want at the
                point they are thinking of taking it away.
              */}
              <section className={styles.card}>
                <UsedBy key={current.id} kind="SKILL_CATALOG" componentId={current.id} />
              </section>
            </>
          )}
        </section>
      </div>

      <NameDialog
        open={creating}
        title={t('Create Skill')}
        message={t("A skill is markdown telling an agent how to go about something.")}
        nameLabel="Name"
        namePlaceholder="codeReviewGuidelines"
        descriptionPlaceholder={t("Guidelines for thorough and consistent code reviews")}
        submitLabel={t("Create Skill")}
        onClose={() => setCreating(false)}
        onSubmit={async (name, description) => {
          const created = await createSkill(workspaceId, {
            name,
            description: description || undefined,
            // Into the catalog that is open, which is the one being looked at.
            catalogId: selected ?? undefined,
          });
          navigate(`/workspace/${workspaceId}/skills/${created.id}`);
        }}
      />

      <CatalogNameDialog
        open={naming !== null}
        title={naming?.mode === 'rename' ? t('Rename the catalog') : t('Name the catalog')}
        message={t('A catalog is the set of skills an agent is granted at once.')}
        submitLabel={naming?.mode === 'rename' ? t('Rename') : t('Create')}
        initialName={naming?.mode === 'rename' ? naming.name : ''}
        onClose={() => setNaming(null)}
        onSubmit={submitCatalogName}
      />
    </AppShell>
  );
}
