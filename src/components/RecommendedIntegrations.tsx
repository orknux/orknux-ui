import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

import {
  claudeCodeLink,
  claudeDesktopLink,
  fetchIntegrationRecommendations,
  fetchIntegrationTags,
} from '../api/integrationRecommendations';
import type { IntegrationRecommendation, IntegrationSort, IntegrationTag } from '../api/integrationRecommendations';
import { copyText } from './clipboard';
import { currentTheme } from '../session/theme';
import { Markdown } from './Markdown';
import { SearchBox } from './SearchBox';
import { Select } from './Select';
import { useSearch } from './useSearch';
import styles from './RecommendedIntegrations.module.css';
import { t, tf } from '../i18n';

/**
 * Every folded card as tall as the tallest folded one, so the grid reads as
 * even rows, while a card that is opened - its steps, or its whole
 * description - grows alone. Measured rather than stretched: a grid that
 * stretched its rows grew every neighbour of an opened card with it.
 * Measured again whenever the grid changes size, the cards change, or one
 * opens or folds.
 */
function useFoldedHeight(grid: RefObject<HTMLUListElement | null>, cards: unknown) {
  useLayoutEffect(() => {
    const list = grid.current;
    if (list === null) return undefined;
    const measure = () => {
      const folded = [...list.querySelectorAll<HTMLElement>('article[data-open="false"]')];
      list.style.removeProperty('--folded-height');
      const tallest = Math.max(0, ...folded.map((card) => card.getBoundingClientRect().height));
      if (tallest > 0) list.style.setProperty('--folded-height', `${Math.ceil(tallest)}px`);
    };
    measure();
    const resized = new ResizeObserver(() => measure());
    resized.observe(list);
    const toggled = new MutationObserver(() => measure());
    toggled.observe(list, { subtree: true, attributes: true, attributeFilter: ['data-open'] });
    return () => {
      resized.disconnect();
      toggled.disconnect();
    };
  }, [grid, cards]);
}

/** A site as a person names it: grafana.com, not https://grafana.com/docs/. */
function hostOf(address: string): string {
  try {
    return new URL(address).hostname.replace(/^www\./, '');
  } catch {
    return address;
  }
}

/** A repository as owner/name where its address has one, else its host and path. */
function repositoryName(address: string): string {
  try {
    const url = new URL(address);
    const path = url.pathname.replace(/^\/|\/$/g, '').replace(/\.git$/, '');
    return url.hostname === 'github.com' || url.hostname === 'gitlab.com' ? path : `${url.hostname}/${path}`;
  } catch {
    return address;
  }
}

/** Stars as a person reads them: 950, 12.3k, 1.2M. */
export function starsLabel(stars: number): string {
  if (stars < 1000) return String(stars);
  if (stars < 1_000_000) return `${(stars / 1000).toFixed(stars < 10_000 ? 1 : 0).replace(/\.0$/, '')}k`;
  return `${(stars / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

/** The card's icon for the theme in use: the dark one on a dark page where there is one. */
function iconOf(card: { icon: string | null; iconDark: string | null }): string | null {
  return currentTheme() === 'dark' ? (card.iconDark ?? card.icon) : (card.icon ?? card.iconDark);
}

function effortLabel(effort: string): string {
  switch (effort) {
    case 'MINUTES':
      return t('A few minutes');
    case 'QUARTER_HOUR':
      return t('About a quarter of an hour');
    case 'HOUR':
      return t('About an hour');
    default:
      return t('An afternoon');
  }
}

function placeLabel(card: IntegrationRecommendation): string {
  switch (card.runsOn) {
    case 'USER_MACHINE':
      return t('Runs on your computer');
    case 'SERVER':
      return t('Runs beside the Orknux server');
    default:
      return t('Runs anywhere');
  }
}

/**
 * The sort last chosen, kept in this browser: a view choice of the person in
 * front of the screen, not of the account or the workspace.
 */
const SORT_KEY = 'orknux.integrations.sort';
const SORT_ORDERS: IntegrationSort['order'][] = ['RECOMMENDED', 'POPULAR', 'NAME', 'NEWEST'];

function rememberedSort(): IntegrationSort {
  try {
    const held = JSON.parse(window.localStorage.getItem(SORT_KEY) ?? 'null') as Partial<IntegrationSort> | null;
    if (held && SORT_ORDERS.includes(held.order as IntegrationSort['order'])) {
      return { order: held.order as IntegrationSort['order'], ascending: typeof held.ascending === 'boolean' ? held.ascending : null };
    }
  } catch {
    // Unreadable or blocked: the default below.
  }
  return { order: 'RECOMMENDED', ascending: null };
}

function rememberSort(sort: IntegrationSort): void {
  try {
    window.localStorage.setItem(SORT_KEY, JSON.stringify(sort));
  } catch {
    // The choice lasts as long as the page does.
  }
}

/**
 * Integrations orknux.ai recommends for this workspace, as cards: what each is,
 * where it lives, how long setting it up takes - and Ask Claude, which opens the
 * person's own Claude with a prompt for doing it with them.
 *
 * Orknux's part ends there. Most of these tools run on the person's computer,
 * where this server cannot act, so the setup is Claude's, interactively, on
 * that computer; the prompt carries what only this server knows (its address,
 * the workspace, where an MCP server is added) and nothing secret.
 */
export function RecommendedIntegrations({ workspaceId }: { workspaceId: string }) {
  const [searchInput, setSearchInput, search] = useSearch();
  const [tag, setTag] = useState<string | null>(null);
  const [sort, setSortNow] = useState<IntegrationSort>(rememberedSort);
  const setSort = (next: IntegrationSort) => {
    setSortNow(next);
    rememberSort(next);
  };
  /** Which way the order runs now: its own way where nothing was chosen. */
  const ascending = sort.ascending ?? sort.order === 'NAME';
  const [tags, setTags] = useState<IntegrationTag[]>([]);
  const [cards, setCards] = useState<IntegrationRecommendation[] | null>(null);
  const gridRef = useRef<HTMLUListElement>(null);
  useFoldedHeight(gridRef, cards);
  const [offered, setOffered] = useState(true);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchIntegrationTags().then(setTags, () => setTags([]));
  }, []);

  useEffect(() => {
    let current = true;
    setError(null);
    fetchIntegrationRecommendations(workspaceId, search, tag, null, sort)
        .then((page) => {
          if (!current) return;
          setOffered(page.offered);
          setCards(page.items);
          setNext(page.next);
        })
        .catch((cause: unknown) => {
          if (!current) return;
          setCards([]);
          setError(cause instanceof Error ? cause.message : t('Could not load the recommendations.'));
        });
    return () => {
      current = false;
    };
  }, [workspaceId, search, tag, sort]);

  // The next page loads as the end of the list comes into view: one at a time, and never a page twice.
  const loadingMore = useRef(false);
  const more = useCallback(() => {
    if (next === null || loadingMore.current) return;
    loadingMore.current = true;
    fetchIntegrationRecommendations(workspaceId, search, tag, next, sort).then((page) => {
      setCards((had) => [...(had ?? []), ...page.items]);
      setNext(page.next);
    }, (cause: unknown) => setError(cause instanceof Error ? cause.message : t('Could not load the recommendations.')))
      .finally(() => { loadingMore.current = false; });
  }, [next, workspaceId, search, tag, sort]);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const end = endRef.current;
    if (end === null || next === null) return undefined;
    // Ahead of the bottom by a screen's worth, so the next cards are there before anybody reaches the end.
    const watch = new IntersectionObserver((seen) => { if (seen.some((one) => one.isIntersecting)) more(); }, { rootMargin: '600px 0px' });
    watch.observe(end);
    return () => watch.disconnect();
  }, [next, more]);

  return (
    <section className={styles.card} data-testid="recommended-integrations">
      <div className={styles.cardHeader}>
        <div className={styles.cardTitles}>
          <h2 id="recommended" className={styles.cardTitle}>{t('Recommended integrations')}</h2>
          <p className={styles.cardSubtitle}>
            {t('Tools your agents can work with, recommended by orknux.ai. Ask Claude opens Claude on your computer to set one up with you.')}
          </p>
        </div>
      </div>

      <div className={styles.filters}>
        <SearchBox value={searchInput} onChange={setSearchInput} placeholder={t('Search integrations…')} />
        {/* The order, and which way it runs: every order can be turned round, orknux.ai's own included. */}
        <div className={styles.sort}>
          <Select
            value={sort.order}
            onChange={(value) => setSort({ order: value as IntegrationSort['order'], ascending: null })}
            prefix={<span className={styles.sortPrefix}>{t('Sort')}</span>}
            title={t('Sort the integrations')}
            className={styles.sortBox}
          >
            <option value="RECOMMENDED">{t('Recommended')}</option>
            <option value="POPULAR">{t('Popularity')}</option>
            <option value="NAME">{t('Name')}</option>
          </Select>
          {(
            <button
              type="button"
              className={styles.direction}
              onClick={() => setSort({ order: sort.order, ascending: !ascending })}
              aria-label={ascending ? t('Ascending; press for descending') : t('Descending; press for ascending')}
              title={ascending ? t('Ascending; press for descending') : t('Descending; press for ascending')}
              data-testid="sort-direction"
              data-ascending={ascending ? 'true' : 'false'}
            >
              {sort.order === 'NAME' ? (ascending ? 'A→Z' : 'Z→A') : ascending ? '↑' : '↓'}
            </button>
          )}
        </div>
        {tags.length > 0 && (
          <div className={styles.tags} role="group" aria-label={t('Filter by tag')}>
            <button type="button" className={tag === null ? styles.tagOn : styles.tag} onClick={() => setTag(null)}>
              {t('All')}
            </button>
            {tags.map((one) => (
              <button
                key={one.tag}
                type="button"
                className={tag === one.tag ? styles.tagOn : styles.tag}
                onClick={() => setTag(tag === one.tag ? null : one.tag)}
              >
                {one.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {error !== null && <p className={styles.notice} role="alert">{error}</p>}
      {error === null && cards === null && <p className={styles.notice}>{t('Loading…')}</p>}
      {error === null && cards !== null && !offered && (
        <p className={styles.notice}>{t('orknux.ai has no recommendations for this installation yet.')}</p>
      )}
      {error === null && cards !== null && offered && cards.length === 0 && (
        <p className={styles.notice}>{t('Nothing matches.')}</p>
      )}

      {cards !== null && cards.length > 0 && (
        <ul className={styles.grid} ref={gridRef}>
          {cards.map((card) => (
            <li key={card.key}>
              <RecommendationCard
                card={card}
                tagLabel={(one) => tags.find((known) => known.tag === one)?.label ?? one}
                chosenTag={tag}
                onTag={(one) => setTag(tag === one ? null : one)}
              />
            </li>
          ))}
        </ul>
      )}
      {next !== null && (
        <div ref={endRef} className={styles.moreRow} data-testid="integrations-more" aria-hidden="true">
          <span className={styles.notice}>{t('Loading…')}</span>
        </div>
      )}
    </section>
  );
}

function RecommendationCard({ card, tagLabel, chosenTag, onTag }: {
  card: IntegrationRecommendation;
  /** A tag's name as the filter row writes it: "3D" for 3d. */
  tagLabel: (tag: string) => string;
  chosenTag: string | null;
  /** Pressing a card's tag filters by it, as the same tag in the row above does. */
  onTag: (tag: string) => void;
}) {
  const [steps, setSteps] = useState(false);
  const [asked, setAsked] = useState(false);
  const [iconFailed, setIconFailed] = useState(false);
  // Folded at five lines; only a description that is longer than that can be opened.
  const [folded, setFolded] = useState(true);
  const [long, setLong] = useState(false);
  const summaryRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const element = summaryRef.current;
    if (element !== null && folded) setLong(element.scrollHeight > element.clientHeight + 1);
  }, [card.summary, folded]);
  const stepsRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  // Opened below the bottom of the window, the steps looked cut off: brought into view as they open, with
  // the buttons under them - the whole card where it fits, otherwise down to its buttons.
  useEffect(() => {
    if (!steps) return;
    const card = stepsRef.current?.closest('li') ?? stepsRef.current;
    const fits = card !== null && card !== undefined && card.getBoundingClientRect().height <= window.innerHeight - 32;
    (fits ? card : actionsRef.current)?.scrollIntoView({ block: fits ? 'nearest' : 'end', behavior: 'smooth' });
  }, [steps]);
  const [copied, setCopied] = useState<boolean | null>(null);
  async function copyPrompt() {
    const done = await copyText(card.claudePrompt);
    setCopied(done);
    window.setTimeout(() => setCopied(null), done ? 1500 : 4000);
  }
  const bridged = card.transport === 'STDIO';

  return (
    <article className={styles.item} data-testid={`integration-${card.key}`} data-open={steps || (long && !folded) ? 'true' : 'false'}>
      <header className={styles.itemHead}>
        {/*
          The tool's own icon, fetched by this server from orknux.ai; its initial
          where there is none, or where the picture does not load.
        */}
        {iconOf(card) !== null && !iconFailed ? (
          <img className={styles.glyphImage} src={iconOf(card) ?? undefined} alt="" aria-hidden="true" loading="lazy" onError={() => setIconFailed(true)} data-testid="integration-icon" />
        ) : (
          <span className={styles.glyph} aria-hidden="true">{card.name.slice(0, 1).toUpperCase()}</span>
        )}
        <div className={styles.itemTitles}>
          <h3 className={styles.itemName}>{card.name}</h3>
          <span className={styles.itemVendor}>
            {card.vendor}
            {card.maintainer === 'OFFICIAL' && <span className={styles.badge}>{t('Official')}</span>}
            {card.maintainer === 'COMMUNITY' && <span className={styles.badgeMuted}>{t('Community')}</span>}
          </span>
        </div>
        {card.installed && <span className={styles.installed}>{t('Set up here')}</span>}
      </header>

      <p
        ref={summaryRef}
        className={[styles.summary, folded ? styles.summaryFolded : '', long ? styles.summaryToggle : ''].join(' ')}
        onClick={long ? () => setFolded(!folded) : undefined}
        onKeyDown={long ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setFolded(!folded); } } : undefined}
        role={long ? 'button' : undefined}
        tabIndex={long ? 0 : undefined}
        aria-expanded={long ? !folded : undefined}
        title={long ? (folded ? t('Show all of it') : t('Show less')) : undefined}
        data-testid="integration-summary"
      >
        {card.summary}
      </p>
      {card.reason && <p className={styles.reason}>{card.reason}</p>}

      <dl className={styles.facts}>
        <div>
          <dt>{t('Setup')}</dt>
          <dd data-testid="effort">
            {card.minutes > 0 ? tf('about {minutes} min', { minutes: card.minutes }) : effortLabel(card.effort)}
            <span className={styles.factHint}> · {effortLabel(card.effort)}</span>
          </dd>
        </div>
        <div>
          <dt>{t('Where')}</dt>
          <dd>
            {placeLabel(card)}
            {bridged && <span className={styles.factHint}> · {t('needs a bridge to HTTP')}</span>}
          </dd>
        </div>
        {card.needsAdmin && (
          <div>
            <dt>{t('Who')}</dt>
            <dd>{t('Needs an Orknux administrator')}</dd>
          </div>
        )}
        {/* Where it lives, by name rather than as two more underlined words: the site, then the code with its stars. */}
        {card.homepage && (
          <div>
            <dt>{t('Website')}</dt>
            <dd className={styles.factLink}>
              <a href={card.homepage} target="_blank" rel="noopener noreferrer" data-testid="integration-website">{hostOf(card.homepage)}</a>
            </dd>
          </div>
        )}
        {(card.github?.url ?? card.repository) && (
          <div>
            <dt>{t('Repository')}</dt>
            <dd className={styles.factLink}>
              <a href={card.github?.url ?? card.repository ?? undefined} target="_blank" rel="noopener noreferrer" data-testid="integration-repository">
                {card.github?.fullName ?? repositoryName(card.repository ?? '')}
              </a>
              {card.github !== null && (
                <span
                  className={styles.factHint}
                  title={card.github.checkedAt === null
                    ? tf('{name} on GitHub', { name: card.github.fullName })
                    : tf('{name} on GitHub, as of {when}', { name: card.github.fullName, when: new Date(card.github.checkedAt).toLocaleDateString() })}
                  data-testid="integration-stars"
                >
                  {' · ★ '}{starsLabel(card.github.stars)}
                </span>
              )}
            </dd>
          </div>
        )}
      </dl>

      {card.tags.length > 0 && (
        <div className={styles.cardTags} data-testid="integration-tags">
          {card.tags.map((one) => (
            <button key={one} type="button" className={one === chosenTag ? styles.cardTagOn : styles.cardTag} onClick={() => onTag(one)}>
              {tagLabel(one)}
            </button>
          ))}
        </div>
      )}
      {card.tooOld && <p className={styles.warning}>{card.tooOld}</p>}
      {card.github?.archived === true && (
        <p className={styles.archived} data-testid="integration-archived">{t('Archived on GitHub: its makers no longer maintain it.')}</p>
      )}

      <div className={styles.links}>
        <button type="button" className={styles.linkButton} aria-expanded={steps} onClick={() => setSteps(!steps)}>
          {steps ? t('Hide the steps') : t('Do it yourself')}
        </button>
        {/*
          The prompt Ask Claude hands over, for pasting into Claude by hand when
          neither link opens it. A word beside the other links, not a bare copy
          icon on a line of its own, which nobody could tell the purpose of.
        */}
        <button type="button" className={styles.linkButton} onClick={() => void copyPrompt()} data-testid="copy-prompt">
          {copied === null ? t('Copy prompt') : copied ? t('Copied') : t('Could not copy')}
        </button>
      </div>

      {steps && (
        <div className={styles.steps} ref={stepsRef}>
          {card.requirements.length > 0 && (
            <p className={styles.requirements}>
              <strong>{t('You need:')}</strong> {card.requirements.join(', ')}
            </p>
          )}
          <Markdown>{card.steps}</Markdown>
        </div>
      )}

      <div className={styles.actions} ref={actionsRef}>
        <a
          className={styles.askButton}
          href={claudeCodeLink(card.claudePrompt)}
          onClick={() => setAsked(true)}
          data-testid="ask-claude"
        >
          {t('Ask Claude')}
        </a>
        <a className={styles.ghostButton} href={claudeDesktopLink(card.claudePrompt)} onClick={() => setAsked(true)}>
          {t('In Claude Desktop')}
        </a>
      </div>
      {asked && (
        <p className={styles.handoff} role="status">
          <span>{t('Claude opens with the setup prompt filled in. Read it, press Enter, and Claude takes it from there with you. Nothing opened? Claude Code answers these links once you have sent it a message; or copy the prompt.')}</span>
          <button type="button" className={styles.handoffClose} onClick={() => setAsked(false)} aria-label={t('Close')} data-testid="handoff-close">
            ×
          </button>
        </p>
      )}
    </article>
  );
}
