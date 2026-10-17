import { useEffect, useState } from 'react';
import type { RefObject } from 'react';

import styles from './SectionMenu.module.css';
import { t } from '../i18n';

export interface SectionMenuProps {
  /** The element whose `h2[id]` headings are the sections. */
  within: RefObject<HTMLElement | null>;
}

interface Entry {
  id: string;
  label: string;
}

/** How far under the top of the frame a heading lands when its entry is pressed, so it is not under the top bar. */
const HEADING_CLEARANCE_PX = 88;

/**
 * The sections of a long settings page, down the side of it.
 *
 * Read off the page rather than declared beside it: every `h2` with an id
 * inside [within] is an entry, in page order, so a section added or taken
 * away - or shown only to some people - is in the menu or not without anybody
 * remembering a second list. Pressing one scrolls to it; the one in view is
 * marked as the page scrolls.
 */
export function SectionMenu({ within }: SectionMenuProps) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    const root = within.current;
    if (root === null) return undefined;

    const scan = () => {
      const headings = [...root.querySelectorAll<HTMLHeadingElement>('h2[id]')];
      headings.forEach((heading) => {
        heading.style.scrollMarginTop = `${HEADING_CLEARANCE_PX}px`;
      });
      const found = headings.map((heading) => ({ id: heading.id, label: heading.textContent?.trim() ?? heading.id }));
      setEntries((held) => (sameEntries(held, found) ? held : found));
    };
    scan();
    // Sections arrive with the data, after the first paint.
    const watcher = new MutationObserver(scan);
    watcher.observe(root, { childList: true, subtree: true });
    return () => watcher.disconnect();
  }, [within]);

  useEffect(() => {
    const root = within.current;
    if (root === null || entries.length === 0) return undefined;
    const headings = entries
      .map((entry) => root.querySelector<HTMLElement>(`h2[id="${CSS.escape(entry.id)}"]`))
      .filter((one): one is HTMLElement => one !== null);
    /*
     * The current section is the last heading above the clearance line - the
     * one whose settings are under the reader's eye - rather than whichever
     * heading happens to cross the viewport, which marks two at once and none
     * while a long section fills the screen.
     */
    const mark = () => {
      let chosen: string | null = headings[0]?.id ?? null;
      for (const heading of headings) {
        if (heading.getBoundingClientRect().top <= HEADING_CLEARANCE_PX + 8) chosen = heading.id;
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

  if (entries.length < 2) return null;

  return (
    <nav className={styles.menu} aria-label={t('Sections')} data-testid="section-menu">
      {entries.map((entry) => (
        <a
          key={entry.id}
          href={`#${entry.id}`}
          className={entry.id === current ? `${styles.entry} ${styles.entryCurrent}` : styles.entry}
          aria-current={entry.id === current ? 'location' : undefined}
          onClick={(event) => {
            event.preventDefault();
            within.current?.querySelector<HTMLElement>(`h2[id="${CSS.escape(entry.id)}"]`)?.scrollIntoView({ block: 'start' });
            history.replaceState(null, '', `#${entry.id}`);
          }}
        >
          {entry.label}
        </a>
      ))}
    </nav>
  );
}

function sameEntries(a: Entry[], b: Entry[]): boolean {
  return a.length === b.length && a.every((one, at) => one.id === b[at].id && one.label === b[at].label);
}
