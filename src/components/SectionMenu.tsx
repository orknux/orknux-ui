import { useEffect, useState } from 'react';
import searchIcon from '../assets/search.svg';
import type { RefObject } from 'react';

import styles from './SectionMenu.module.css';
import { t } from '../i18n';

export interface SectionMenuProps {
  /** The element whose `h2[id]` headings are the sections. */
  within: RefObject<HTMLElement | null>;
  /**
   * Where the sections are not headings: a selector for elements carrying an
   * `id` and their menu label in `data-menu-entry`. A form drawn as one card -
   * an agent's - has fields, not sections, and each named field is then an
   * entry and its own block for the search.
   */
  entries?: string;
}

interface Entry {
  id: string;
  label: string;
}

/** How far under the top of its scrolling frame a heading lands when its entry is pressed. */
const HEADING_GAP_PX = 24;

/**
 * The box the page's content scrolls in: the main area where the shell scrolls
 * the content under its top bar, else the window. Where a heading lands, and
 * which one counts as current, are measured from its top, not the window's.
 */
function scrollerOf(element: HTMLElement): HTMLElement | null {
  let held: HTMLElement | null = element.parentElement;
  while (held !== null) {
    const overflow = getComputedStyle(held).overflowY;
    if (overflow === 'auto' || overflow === 'scroll') return held;
    held = held.parentElement;
  }
  return null;
}

/**
 * The sections of a long settings page, down the side of it.
 *
 * Read off the page rather than declared beside it: every `h2` with an id
 * inside [within] is an entry, in page order, so a section added or taken
 * away - or shown only to some people - is in the menu or not without anybody
 * remembering a second list. Pressing one scrolls to it; the one in view is
 * marked as the page scrolls.
 */
/**
 * The blocks a section is made of, for the search: on a page whose headings
 * are siblings inside one card, what follows a heading up to the next; on a
 * page of one card per section, the card's children besides the title.
 */
function blocksOf(heading: HTMLElement, headings: HTMLElement[]): HTMLElement[] {
  const parent = heading.parentElement;
  if (parent === null) return [];
  const siblings = headings.filter((one) => one.parentElement === parent).length > 1;
  if (siblings) {
    const held: HTMLElement[] = [];
    let next = heading.nextElementSibling;
    while (next !== null && !(next instanceof HTMLHeadingElement && next.id !== '')) {
      if (next instanceof HTMLElement) held.push(next);
      next = next.nextElementSibling;
    }
    return held;
  }
  const card = heading.closest<HTMLElement>('section, form') ?? parent;
  return [...card.children].filter((one): one is HTMLElement => one instanceof HTMLElement && !one.contains(heading));
}

export function SectionMenu({ within, entries: selector }: SectionMenuProps) {
  const which = selector ?? 'h2[id]';
  const [entries, setEntries] = useState<Entry[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  /** What is typed into the menu's search: a setting is kept where its words match, a section where any setting is. */
  const [looking, setLooking] = useState('');
  const [matching, setMatching] = useState<Set<string> | null>(null);

  useEffect(() => {
    const root = within.current;
    if (root === null) return undefined;

    const scan = () => {
      const headings = [...root.querySelectorAll<HTMLElement>(which)].filter((one) => one.id !== '');
      headings.forEach((heading) => {
        heading.style.scrollMarginTop = `${HEADING_GAP_PX}px`;
      });
      const found = headings.map((heading) => ({ id: heading.id, label: heading.dataset.menuEntry ?? labelOf(heading) }));
      setEntries((held) => (sameEntries(held, found) ? held : found));
    };
    scan();
    // Sections arrive with the data, after the first paint.
    const watcher = new MutationObserver(scan);
    watcher.observe(root, { childList: true, subtree: true });
    return () => watcher.disconnect();
  }, [within, which]);

  useEffect(() => {
    const root = within.current;
    if (root === null || entries.length === 0) return undefined;
    const headings = entries
      .map((entry) => root.querySelector<HTMLElement>(`[id="${CSS.escape(entry.id)}"]`))
      .filter((one): one is HTMLElement => one !== null);
    /*
     * The current section is the last heading above the clearance line - the
     * one whose settings are under the reader's eye - rather than whichever
     * heading happens to cross the viewport, which marks two at once and none
     * while a long section fills the screen.
     */
    const scroller = scrollerOf(root);
    const mark = () => {
      const line = (scroller?.getBoundingClientRect().top ?? 0) + HEADING_GAP_PX + 8;
      let chosen: string | null = headings[0]?.id ?? null;
      for (const heading of headings) {
        if (heading.getBoundingClientRect().top <= line) chosen = heading.id;
      }
      setCurrent(chosen);
    };
    mark();
    window.addEventListener('scroll', mark, { passive: true, capture: true });
    window.addEventListener('resize', mark);
    return () => {
      window.removeEventListener('scroll', mark, { capture: true });
      window.removeEventListener('resize', mark);
    };
  }, [within, entries]);

  /*
   * The search hides what does not match and shows it again when the box is
   * cleared: a block is kept where its own words hold what was typed, a
   * heading where any of its blocks is, and the menu lists what is left.
   */
  useEffect(() => {
    const root = within.current;
    if (root === null) return undefined;
    const headings = [...root.querySelectorAll<HTMLElement>(which)].filter((one) => one.id !== '');
    const query = looking.trim().toLowerCase();
    const kept = new Set<string>();
    // An entry that is a field rather than a heading is the whole of its own block.
    const asFields = selector !== undefined;
    headings.forEach((heading) => {
      if (asFields) {
        const named = [...heading.querySelectorAll('[id], [name], [aria-label]')]
          .map((one) => `${one.id} ${one.getAttribute('name') ?? ''} ${one.getAttribute('aria-label') ?? ''}`)
          .join(' ');
        const hit = query === '' || `${heading.dataset.menuEntry ?? ''} ${heading.textContent ?? ''} ${named}`.toLowerCase().includes(query);
        heading.style.display = hit ? '' : 'none';
        if (hit) kept.add(heading.id);
        return;
      }
      const blocks = blocksOf(heading, headings);
      let any = false;
      blocks.forEach((block) => {
        // What a block says, and what its controls are called underneath: a box named
        // revisionRetentionDays answers to "retention" though its label says "kept for".
        const named = [...block.querySelectorAll('[id], [name], [aria-label]')]
          .map((one) => `${one.id} ${one.getAttribute('name') ?? ''} ${one.getAttribute('aria-label') ?? ''}`)
          .join(' ');
        const words = `${block.textContent ?? ''} ${named}`.toLowerCase();
        const hit = query === '' || words.includes(query) || (heading.textContent ?? '').toLowerCase().includes(query);
        block.style.display = hit ? '' : 'none';
        if (hit) any = true;
      });
      const title = heading.closest<HTMLElement>('section, form') === heading.parentElement?.closest('section, form') && blocks.length > 0 && headings.filter((one) => one.parentElement === heading.parentElement).length > 1
        ? heading
        : (heading.closest<HTMLElement>('section, form') ?? heading);
      title.style.display = any || query === '' ? '' : 'none';
      if (any || query === '') kept.add(heading.id);
    });
    setMatching(query === '' ? null : kept);
    return () => {
      headings.forEach((heading) => {
        if (asFields) {
          heading.style.display = '';
          return;
        }
        blocksOf(heading, headings).forEach((block) => { block.style.display = ''; });
        heading.style.display = '';
        const card = heading.closest<HTMLElement>('section, form');
        if (card !== null) card.style.display = '';
      });
    };
  }, [within, looking, entries, which, selector]);

  if (entries.length < 2) return null;
  const shown = matching === null ? entries : entries.filter((entry) => matching.has(entry.id));

  return (
    <nav className={styles.menu} aria-label={t('Sections')} data-testid="section-menu">
      <label className={styles.search}>
        <img src={searchIcon} alt="" width={14} height={14} />
        <input
          type="search"
          className={styles.searchInput}
          value={looking}
          onChange={(event) => setLooking(event.target.value)}
          placeholder={t('Search settings…')}
          aria-label={t('Search settings')}
          data-testid="settings-search"
        />
      </label>
      {matching !== null && shown.length === 0 && <span className={styles.nothing}>{t('No setting matches.')}</span>}
      {shown.map((entry) => (
        <a
          key={entry.id}
          href={`#${entry.id}`}
          className={entry.id === current ? `${styles.entry} ${styles.entryCurrent}` : styles.entry}
          aria-current={entry.id === current ? 'location' : undefined}
          onClick={(event) => {
            event.preventDefault();
            within.current?.querySelector<HTMLElement>(`[id="${CSS.escape(entry.id)}"]`)?.scrollIntoView({ block: 'start' });
            history.replaceState(null, '', `#${entry.id}`);
          }}
        >
          {entry.label}
        </a>
      ))}
    </nav>
  );
}

/**
 * What a heading says, without what sits beside it: the (?) of a hint is a
 * button in the heading, and "Chat?" is not the section's name.
 */
function labelOf(heading: HTMLElement): string {
  const copy = heading.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('button, [role="tooltip"], [role="button"]').forEach((one) => one.remove());
  return copy.textContent?.trim() || heading.id;
}

function sameEntries(a: Entry[], b: Entry[]): boolean {
  return a.length === b.length && a.every((one, at) => one.id === b[at].id && one.label === b[at].label);
}
