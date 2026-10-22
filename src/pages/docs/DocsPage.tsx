import { memo, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';

import type { SessionUser } from '../../api/session';
import bookIcon from '../../assets/book.svg';
import searchIcon from '../../assets/search.svg';
import { AppShell, SidebarNavItem } from '../../components/AppShell';
import { Markdown } from '../../components/Markdown';
import { segments } from '../../components/searchMatches';
import { t } from '../../i18n';
import { currentLanguage } from '../../session/language';
import { shellUser } from '../../session/user';
import styles from './DocsPage.module.css';

export interface DocsPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

/**
 * The pages themselves, compiled in.
 *
 * Bundled rather than fetched from a documentation site: the documentation that
 * ships with a version describes that version, and an installation behind a
 * firewall still has it. A file added under `src/docs` appears here with no
 * further wiring — the leading number orders it, and its first heading names
 * it.
 */
const SOURCES = import.meta.glob('../../docs/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

interface DocPage {
  /** From the filename, with the ordering prefix dropped: `workflows`. */
  slug: string;
  /** The first heading in the file. */
  title: string;
  body: string;
  /** True where this page is the English one shown to somebody reading Polish. */
  untranslated: boolean;
}

/**
 * The manual in the language somebody is reading, page by page.
 *
 * A page is translated by putting `02-workflows.pl.md` beside `02-workflows.md`,
 * and nothing else: the file is picked up here, keeps the English page's slug so
 * every link and every deep link still lands, and the English one is used where
 * there is no Polish one.
 *
 * Per page rather than all or nothing, because the manual is twenty-seven
 * thousand words and translating it is a different job from translating a
 * label - one that arrives a chapter at a time. What must not happen is a
 * reader who cannot tell which they are looking at, which is why an untranslated
 * page says so above itself rather than simply appearing in English.
 */
function pages(language: string): DocPage[] {
  const named = new Map<string, { path: string; body: string }>();
  const translated = new Map<string, string>();

  for (const [path, body] of Object.entries(SOURCES)) {
    const file = path.split('/').pop()?.replace(/\.md$/, '') ?? '';
    const tag = /\.([a-z]{2})$/.exec(file);
    if (tag === null) {
      named.set(file, { path, body });
    } else if (tag[1] === language) {
      translated.set(file.slice(0, -tag[0].length), body);
    }
  }

  return [...named.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, english]) => {
      const polish = translated.get(name);
      const body = polish ?? english.body;
      const heading = /^#\s+(.+)$/m.exec(body);
      return {
        slug: name.replace(/^\d+-/, ''),
        title: heading?.[1] ?? name,
        body,
        untranslated: polish === undefined && language !== 'en',
      };
    });
}

/** A page that matched, with the line it matched on. */
interface Hit {
  page: DocPage;
  /**
   * The first matching line, for showing what was found where. Null when only
   * the title matched: the title is already the label, and repeating it under
   * itself says nothing.
   */
  line: string | null;
  /** How many lines matched, so a page full of it is obvious. */
  count: number;
}

/**
 * A line of markdown as the prose it renders to.
 *
 * A snippet is a sentence shown to somebody, not source. Left alone, the line
 * arrives as `2. Give it a **trigger**` — the markers read as typos next to the
 * very term they are meant to be showing. Headings lose their hashes for the
 * same reason the search looks at them at all: `## Chat` is about chat.
 *
 * Underscores are left alone deliberately. They mean emphasis in markdown and
 * they mean nothing at all in `user_search_base`, and this manual has more of
 * the second than the first.
 */
function plain(line: string): string {
  return line
    .replace(/^#+\s*/, '')
    .replace(/^>\s*/, '')
    .replace(/^[-*+]\s+/, '')
    .replace(/^\d+\.\s+/, '')
    // The words, not the address behind them.
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .trim();
}

/**
 * Searches the pages as text.
 *
 * The whole manual is already in memory, so this is a scan rather than a
 * request: there is nothing to wait for and nothing to debounce.
 */
/** A page's searchable lines, cleaned once rather than on every keystroke. */
interface Searchable {
  page: DocPage;
  lines: { text: string; lower: string }[];
  title: string;
}

function search(all: Searchable[], text: string): Hit[] {
  const needle = text.trim().toLowerCase();
  if (needle === '') return [];

  return all.flatMap(({ page, lines: every, title }) => {
    const lines = every.filter((line) => line.lower.includes(needle)).map((line) => line.text);
    if (lines.length === 0 && !title.includes(needle)) return [];
    return [{ page, line: lines[0] ?? null, count: lines.length }];
  });
}

/** Cleans every page's lines for [search] - the expensive half, done once when the manual is loaded. */
function searchable(all: DocPage[]): Searchable[] {
  return all.map((page) => {
    /*
     * The pictures come out first, and before the split rather than after it.
     *
     * An image is not a sentence: matched, it offers the reader a line that is
     * nowhere on the page they are then sent to. Left in, its alt text arrives
     * as `!The quick chat, open over…` — the link rule takes the brackets and
     * leaves the bang — and one wrapped across two lines leaves its second
     * half, `back](/screens/actions.png)`, looking like a broken manual.
     */
    const prose = page.body.replace(/!\[[^\]]*\]\([^)]*\)/g, '');
    const lines = prose
      .split('\n')
      .map(plain)
      // The page's own heading is already the label on the result.
      .filter((line) => line !== '' && line !== page.title)
      .map((text) => ({ text, lower: text.toLowerCase() }));
    return { page, lines, title: page.title.toLowerCase() };
  });
}

/**
 * `text` with every occurrence of `needle` marked.
 *
 * The term is picked out in the title, in the line beside it and in the page
 * itself, so wherever the reader looks after typing, the word they typed is the
 * one their eye lands on.
 */
function Marked({ text, needle }: { text: string; needle: string }) {
  return (
    <>
      {segments(text, needle).map((part, index) =>
        part.match ? (
          <mark key={index} className={styles.mark}>
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}

/**
 * How far down the view the reader is taken to be looking.
 *
 * Not the very top: a heading that has just appeared is not yet what somebody is
 * reading, and treating it as such makes the contents flicker a line early.
 */
const READING_LINE = 120;

/** How long typing pauses before the term is marked across the manual. */
const MARK_AFTER_MS = 250;

/** How long one slice of marking may hold the page before it lets a frame through. */
const MARK_SLICE_MS = 12;

/** How often, and how many times, a jump to a match looks whether it has arrived. */
const SEAT_EVERY_MS = 200;
const SEAT_TRIES = 15;

/** The names the marks are registered under, which the stylesheet paints by. */
const MARKS = 'docs-search';
const CURRENT_MARK = 'docs-search-current';

/** Whether this browser paints ranges by name; where it does not, the matches are still stepped through. */
function canPaintRanges(): boolean {
  return typeof Highlight === 'function' && typeof CSS !== 'undefined' && 'highlights' in CSS;
}


/**
 * The manual, as it stood when this version was built.
 *
 * One page at a time with the contents down the side, which is what
 * documentation is read as: somebody arrives with a question, finds the page
 * whose title matches it, and reads that page. The box above the contents is
 * for when no title matches the question — it looks inside the pages and says
 * which one says it.
 */
export function DocsPage({ session, onSignOut }: DocsPageProps) {
  const { page } = useParams();
  const language = currentLanguage();
  const all = useMemo(() => pages(language), [language]);
  const [typed, setTyped] = useState('');
  /*
   * What is searched for, a step behind what is typed, so the box shows each
   * letter at once and the list of hits catches up when there is time.
   */
  const query = useDeferredValue(typed);
  const prepared = useMemo(() => searchable(all), [all]);
  const hits = useMemo(() => search(prepared, query), [prepared, query]);
  /*
   * And the marks in the manual, once typing pauses. The list of hits above is
   * cheap and follows every letter; the marks follow the word.
   */
  const [marked, setMarked] = useState('');
  useEffect(() => {
    const settle = window.setTimeout(() => setMarked(query), MARK_AFTER_MS);
    return () => window.clearTimeout(settle);
  }, [query]);
  /** Whether the contents show hits rather than every page: from the first letter, not the pause. */
  const looking = query.trim() !== '';
  const current = all.find((one) => one.slug === page);

  const article = useRef<HTMLElement>(null);

  /*
   * The manual is one document, and it is read as one.
   *
   * Every page is rendered, stacked in order, and the reader scrolls. There is no
   * turn between them: the next page's heading arrives the way the next section of
   * anything does, because that is what it is — the files are split for writing,
   * not for reading.
   *
   * Scrolling moves nothing but the highlight in the contents. It deliberately does
   * not touch the address: an address that followed the reader would come back
   * through the router as a page to go to, and the reader would be dragged to the
   * top of each section as they crossed into it. Reading is not navigation, and the
   * only thing that needs to know where you are is the list on the left.
   */
  const sections = useRef(new Map<string, HTMLElement>());
  /** Which page is under the reading line: what the contents lights up. */
  const [reading, setReading] = useState(page);

  /*
   * Chosen from the contents, or arrived at by link. This is the only thing that
   * moves the view, so nothing can move it out from under somebody who is reading.
   */
  const landed = useRef(false);
  /** The page a chosen result is taking the reader to a word on, which the arrival below leaves alone. */
  const jumping = useRef<string | null>(null);
  useEffect(() => {
    if (page === undefined) return;
    if (jumping.current === page) {
      jumping.current = null;
      setReading(page);
      return;
    }
    jumping.current = null;
    const scroller = document.querySelector<HTMLElement>('main');
    const section = sections.current.get(page);
    if (scroller === null || section === undefined) return;

    setReading(page);
    scroller.scrollTo({
      top: section.offsetTop - scroller.offsetTop,
      // The first arrival is a deep link: be there, rather than travel there.
      behavior: landed.current ? 'smooth' : 'auto',
    });
    landed.current = true;
  }, [page]);

  /*
   * Which page is being read, from where the view is: the last section that has
   * started by the time the reading line is reached.
   *
   * Listened for on the document, in the capture phase, rather than on the element
   * that scrolls. A scroll event does not bubble, but it does capture — and the
   * element it comes from is replaced whenever the route changes, because the frame
   * animates each page in. Held directly, the listener was left on a node that had
   * been thrown away: the highlight followed the reader until the first time they
   * used the contents, and then never moved again.
   */
  useEffect(() => {
    let queued = false;

    const onScroll = (event: Event) => {
      const scroller = document.querySelector<HTMLElement>('main');
      if (scroller === null || event.target !== scroller) return;
      if (queued) return;
      queued = true;

      requestAnimationFrame(() => {
        queued = false;
        const line = scroller.scrollTop + READING_LINE;
        let found: string | undefined;
        for (const one of all) {
          const section = sections.current.get(one.slug);
          if (section === undefined) continue;
          if (section.offsetTop - scroller.offsetTop <= line) found = one.slug;
        }
        if (found !== undefined) setReading((was) => (was === found ? was : found));
      });
    };

    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => document.removeEventListener('scroll', onScroll, { capture: true });
  }, [all]);
  /** Every occurrence of the term in the manual, in the order they appear in it. */
  const [matches, setMatches] = useState<Range[]>([]);
  const [at, setAt] = useState(0);
  /** A result chosen before its marks were made: where to start once they are. */
  const wanted = useRef<string | null>(null);
  /** The term whose marks are all made, as against one still being walked. */
  const done = useRef('');

  /*
   * The term is marked on the drawn page, not in the markdown. It used to be
   * marked by drawing the manual again with the term in it - every page parsed,
   * highlighted and reconciled in one piece nothing could interrupt, which
   * measured 0.9 s with nothing else running and 3.5 to 6.7 s on a CPU four to
   * six times slower, after every pause in typing. The text is already on the
   * page; finding the term in it and naming the ranges is a walk over its text,
   * done a slice at a time so a frame gets through between slices, and painted
   * by the browser through `::highlight` with no element added or redrawn.
   *
   * Collected from the page rather than counted in the source, so what can be
   * stepped through is exactly what is drawn. Not on which page is being read:
   * left as a dependency it would recollect every time scrolling crossed a
   * heading, and the effect below would take the reader back to the first match.
   */
  useEffect(() => {
    const root = article.current;
    const needle = marked.trim().toLowerCase();
    const paints = canPaintRanges();
    if (paints) {
      CSS.highlights.delete(MARKS);
      CSS.highlights.delete(CURRENT_MARK);
    }
    done.current = '';
    if (root === null || needle === '') {
      setMatches([]);
      setAt(0);
      return;
    }

    const painted = paints ? new Highlight() : null;
    if (painted !== null) CSS.highlights.set(MARKS, painted);
    const found: Range[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let timer = 0;

    const slice = () => {
      const until = performance.now() + MARK_SLICE_MS;
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        const text = (node.nodeValue ?? '').toLowerCase();
        for (let index = text.indexOf(needle); index !== -1; index = text.indexOf(needle, index + needle.length)) {
          const range = document.createRange();
          range.setStart(node, index);
          range.setEnd(node, index + needle.length);
          found.push(range);
          painted?.add(range);
        }
        if (performance.now() > until) {
          timer = window.setTimeout(slice);
          return;
        }
      }

      done.current = marked;
      const slug = wanted.current;
      wanted.current = null;
      const section = slug === null ? undefined : sections.current.get(slug);
      const first = section === undefined ? -1 : found.findIndex((range) => section.contains(range.startContainer));
      // A result whose page holds the term only in its title: the page, then.
      if (section !== undefined && first === -1) section.scrollIntoView({ block: 'start', behavior: 'smooth' });
      setMatches(found);
      setAt(Math.max(first, 0));
    };
    slice();

    return () => {
      window.clearTimeout(timer);
      if (paints) {
        CSS.highlights.delete(MARKS);
        CSS.highlights.delete(CURRENT_MARK);
      }
    };
  }, [marked]);

  /*
   * The current match is painted by a second name rather than rendered, so
   * stepping through the matches draws nothing again.
   */
  useEffect(() => {
    const range = matches[at];
    if (range === undefined) return;
    if (canPaintRanges()) {
      const current = new Highlight(range);
      current.priority = 1;
      CSS.highlights.set(CURRENT_MARK, current);
    }
    toRange(range);
  }, [matches, at]);

  /** Enter and the arrows walk the matches; Shift reverses. Wraps at both ends. */
  function step(event: KeyboardEvent<HTMLInputElement>) {
    if (matches.length === 0) return;
    const forward = event.key === 'Enter' ? !event.shiftKey : event.key === 'ArrowDown';
    const back = event.key === 'ArrowUp' || (event.key === 'Enter' && event.shiftKey);
    if (!forward && !back) return;
    event.preventDefault();
    setAt((was) => (was + (forward ? 1 : -1) + matches.length) % matches.length);
  }

  /** The occurrence the view is being taken to, until it is there. */
  const seating = useRef(0);
  useEffect(() => () => window.clearTimeout(seating.current), []);

  /*
   * Takes the reader to one occurrence of the term, by the element it is in: a
   * range cannot be scrolled to, and the words around it are what the reader is
   * being brought to read anyway.
   *
   * In a task of its own, after whatever chose it has drawn, so the two do not
   * add up into one long stall. And kept there until it is: the pages between
   * here and there have not been laid out, so a smooth scroll aims at where the
   * word would be if they were all the size they are guessed to be, and stops a
   * long way short once they turn out not to be. Once the view stops short, it
   * is put there directly. Bounded, so a reader who scrolls away is let go.
   */
  function toRange(range: Range) {
    window.clearTimeout(seating.current);
    const element = range.startContainer.parentElement;
    const scroller = document.querySelector<HTMLElement>('main');
    if (element === null || scroller === null) return;

    let tries = 0;
    let was = -1;
    const seat = () => {
      const word = range.getBoundingClientRect();
      const view = scroller.getBoundingClientRect();
      if (word.height > 0 && word.top >= view.top && word.bottom <= view.bottom) return;
      if (scroller.scrollTop === was) element.scrollIntoView({ block: 'center' });
      was = scroller.scrollTop;
      if (++tries < SEAT_TRIES) seating.current = window.setTimeout(seat, SEAT_EVERY_MS);
    };
    seating.current = window.setTimeout(() => {
      element.scrollIntoView({ block: 'center', behavior: 'smooth' });
      seating.current = window.setTimeout(seat, SEAT_EVERY_MS);
    });
  }

  /*
   * Choosing a result goes to the first match on it, whether the title or the
   * line beside it was clicked. Landing at the top of a page and being left to
   * find the word yourself is what the mark was supposed to solve.
   */
  function toFirstMatch(slug: string) {
    const section = sections.current.get(slug);
    if (section === undefined) return;
    // The address changes with the click; arriving there must not undo this.
    jumping.current = slug;

    // Chosen before typing paused: mark now, and start from this page when done.
    if (marked !== query) {
      wanted.current = slug;
      setMarked(query);
      return;
    }
    if (done.current !== marked) {
      wanted.current = slug;
      return;
    }

    // Which of the marks this is, so stepping on with Enter carries on from here
    // rather than starting again at the top of the manual.
    const index = matches.findIndex((range) => section.contains(range.startContainer));
    if (index === -1) {
      section.scrollIntoView({ block: 'start', behavior: 'smooth' });
      return;
    }
    // The effect above scrolls when the match changes; choosing the same one again has to ask.
    if (index === at) toRange(matches[index]);
    else setAt(index);
  }

  // An address that names no page — an old link, a typo — goes to the first one
  // rather than to an empty frame.
  if (current === undefined) {
    return <Navigate to={`/docs/${all[0]?.slug ?? ''}`} replace />;
  }

  return (
    <AppShell
      title={current.title}
      user={shellUser(session)}
      onSignOut={onSignOut}
      scrollContent
      contentKey="docs"
      sidebar={
        <>
          <div className={styles.search}>
            <img src={searchIcon} alt="" width={16} height={16} />
            <input
              className={styles.searchField}
              type="search"
              placeholder="Search the docs"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              onKeyDown={step}
              aria-label="Search the documentation"
            />
            {/* Which match of how many, on the page being read. */}
            {matches.length > 0 && (
              <span className={styles.counter}>
                {at + 1}/{matches.length}
              </span>
            )}
          </div>

          {looking && hits.length === 0 && <p className={styles.noHits}>Nothing found.</p>}

          {looking
            ? hits.map((hit) => (
                <div
                  key={hit.page.slug}
                  className={styles.hit}
                  onClick={() => toFirstMatch(hit.page.slug)}
                >
                  <SidebarNavItem
                    label={
                      <>
                        <Marked text={hit.page.title} needle={query} />
                        {hit.count > 1 && ` (${hit.count})`}
                      </>
                    }
                    icon={bookIcon}
                    active={hit.page.slug === reading}
                    to={`/docs/${hit.page.slug}`}
                  />
                  {/*
                   * The line the page matched on. A list of titles answers
                   * "which page", but not "is this the one I meant" — the
                   * sentence it was found in does.
                   */}
                  {hit.line !== null && (
                    <Link to={`/docs/${hit.page.slug}`} className={styles.snippet}>
                      <Marked text={hit.line} needle={query} />
                    </Link>
                  )}
                </div>
              ))
            : all.map((one) => (
                <SidebarNavItem
                  key={one.slug}
                  label={one.title}
                  icon={bookIcon}
                  active={one.slug === reading}
                  to={`/docs/${one.slug}`}
                />
              ))}
        </>
      }
    >
      <article className={styles.card} ref={article}>
        {/*
          Every page, in order, in one column. What used to be here was whichever
          page the address named; the rest of the manual was a click away and the
          reader had to know to want it.

          The term is marked wherever it appears, which now means the whole manual
          rather than one page of it — so a search says where the word is, and
          scrolling is how you get there.
        */}
        {all.map((one) => (
          <DocsSection
            key={one.slug}
            page={one}
            onElement={(element) => {
              if (element === null) sections.current.delete(one.slug);
              else sections.current.set(one.slug, element);
            }}
          />
        ))}
      </article>
    </AppShell>
  );
}

/**
 * One page of the manual, drawn once - not on every render of the page around
 * it, which happens on every letter typed and as the reader scrolls and the
 * contents' highlight moves. The term is marked over it, not in it.
 */
const DocsSection = memo(function DocsSection({
  page,
  onElement,
}: {
  page: DocPage;
  onElement: (element: HTMLElement | null) => void;
}) {
  return (
    <section id={page.slug} className={styles.section} ref={onElement}>
      {page.untranslated && <p className={styles.notTranslated}>{t('This page is not translated yet.')}</p>}
      {/*
        The manual is where a picture is a picture of this application, taken
        at 1440 and drawn into a column half that: `zoomImages` is what makes
        clicking one open it at the size it was taken (issue #217).
      */}
      <Markdown zoomImages>
        {page.body}
      </Markdown>
    </section>
  );
}, (before, after) => before.page === after.page);
