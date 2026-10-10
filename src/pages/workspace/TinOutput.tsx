/**
 * What one command in a tin printed, under its line in the session's Tin tab.
 *
 * The output can be far bigger than anybody wants drawn at once, so it arrives
 * a stretch at a time: the first one when the line is opened, the next when the
 * reader scrolls near the bottom of what is there, and - while the command is
 * still running and everything printed so far has been read - whatever it has
 * printed since, every couple of seconds, the way the log itself is followed.
 *
 * What is held is capped, because "jump to the bottom" of a command that printed
 * a gigabyte would otherwise try to hold a gigabyte in a tab. The cap is the
 * administrator's Tin output shown setting, handed back on every read as
 * `shownLimit`; past it the panel stops reading and says how much it shows.
 *
 * The panel is a fixed height to begin with and can be dragged taller by the
 * handle under it. Not remembered: a command's output is looked at once, and a
 * height kept from one would open the next one at a size chosen for something
 * else.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';

import { fetchSessionTinOutput } from '../../api/tins';
import { ResizeHandle, useWindowHeight } from '../../components/DragSize';
import type { DragHandlers } from '../../components/DragSize';
import { Loader } from '../../components/Loader';
import { t, tf } from '../../i18n';
import styles from './TinOutput.module.css';

/** "64 KB", "4 MB", "1.5 MB" - the cap as somebody would say it. */
function sizeOf(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    const mb = bytes / (1024 * 1024);
    return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
  }
  return `${Math.round(bytes / 1024)} KB`;
}

/** One ordinary read, in bytes: what scrolling near the bottom brings. */
const CHUNK_BYTES = 16 * 1024;
/** One read on the way to the bottom, where the point is to get there. */
const JUMP_BYTES = 256 * 1024;
/** How near the bottom a scroll has to come before the next stretch is asked for. */
const NEAR_BOTTOM_PX = 48;
/** How often a running command is asked for what it has printed since. */
const FOLLOW_MS = 2000;
/** The height the panel opens at. */
const OPEN_HEIGHT = 240;
const MIN_HEIGHT = 120;
/** Matches drawn as highlights; the count goes on past it, the drawing does not. */
const MAX_MARKS = 2000;

interface Props {
  sessionId: string;
  sessionTinId: string;
  executionId: string;
}

interface Held {
  text: string;
  nextOffset: number;
  done: boolean;
  /** Whether the last read reached what has been printed so far, rather than stopping at its limit. */
  caughtUp: boolean;
  available: boolean;
  message: string | null;
  /** The most of this output the tab will hold, as the server's Tin output shown setting says. */
  shownLimit: number;
}

export function TinOutput({ sessionId, sessionTinId, executionId }: Props) {
  const [held, setHeld] = useState<Held | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  /** The scrolling box; a scroll near its bottom asks for more. */
  const scroller = useRef<HTMLDivElement | null>(null);
  /** One read at a time, so two scroll events do not ask for the same stretch twice. */
  const busy = useRef(false);
  /** The latest of what is held, for reads that chain without waiting on a render. */
  const now = useRef<Held | null>(null);
  now.current = held;
  /** False once the panel is gone, so a late answer is dropped. */
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const capped = held !== null && held.nextOffset >= held.shownLimit && !held.done;

  /** One read from where the last ended, added under what is there. */
  const readOn = useCallback(
    async (limit: number): Promise<Held | null> => {
      const was = now.current;
      if (busy.current || was === null || was.done || !was.available || was.nextOffset >= was.shownLimit) return was;
      /* Never past the limit: a jump asks for a lot at once, and what is over it would only be thrown away. */
      const ask = Math.min(limit, was.shownLimit - was.nextOffset);
      busy.current = true;
      setReading(true);
      try {
        const got = await fetchSessionTinOutput(sessionId, sessionTinId, executionId, was.nextOffset, ask);
        if (!alive.current) return null;
        const next: Held = {
          text: got.offset === was.nextOffset ? was.text + got.text : was.text,
          nextOffset: got.offset === was.nextOffset ? got.nextOffset : was.nextOffset,
          done: got.done,
          caughtUp: got.nextOffset - got.offset < ask,
          available: was.available,
          message: got.message ?? was.message,
          shownLimit: got.shownLimit,
        };
        now.current = next;
        setHeld(next);
        setError(null);
        return next;
      } catch (cause: unknown) {
        if (alive.current) setError(cause instanceof Error ? cause.message : t('Could not read the output.'));
        return null;
      } finally {
        busy.current = false;
        if (alive.current) setReading(false);
      }
    },
    [sessionId, sessionTinId, executionId],
  );

  /* The first stretch, when the line is opened. */
  useEffect(() => {
    let wanted = true;
    setHeld(null);
    setError(null);
    fetchSessionTinOutput(sessionId, sessionTinId, executionId, 0, CHUNK_BYTES)
      .then((got) => {
        if (!wanted) return;
        setHeld({
          text: got.text,
          nextOffset: got.nextOffset,
          done: got.done,
          caughtUp: got.nextOffset - got.offset < CHUNK_BYTES,
          available: got.available,
          message: got.message,
          shownLimit: got.shownLimit,
        });
      })
      .catch((cause: unknown) => {
        if (wanted) setError(cause instanceof Error ? cause.message : t('Could not read the output.'));
      });
    return () => {
      wanted = false;
    };
  }, [sessionId, sessionTinId, executionId]);

  /*
   * Followed while it runs: once everything printed so far has been read, the
   * command is asked again every couple of seconds. Before that the reader's
   * scroll is what asks, so a long output is not read to the end unasked.
   */
  const following = held !== null && held.available && !held.done && held.caughtUp && !capped;
  useEffect(() => {
    if (!following) return;
    const timer = window.setInterval(() => {
      void readOn(CHUNK_BYTES);
    }, FOLLOW_MS);
    return () => window.clearInterval(timer);
  }, [following, readOn]);

  const onScroll = useCallback(() => {
    const box = scroller.current;
    if (box === null) return;
    if (box.scrollTop + box.clientHeight >= box.scrollHeight - NEAR_BOTTOM_PX) void readOn(CHUNK_BYTES);
  }, [readOn]);

  const toTop = useCallback(() => {
    if (scroller.current !== null) scroller.current.scrollTop = 0;
  }, []);

  /** Reads the rest first - up to the cap, or to what has been printed so far - then goes there. */
  const toBottom = useCallback(async () => {
    let got = now.current;
    while (got !== null && got.available && !got.done && !got.caughtUp && got.nextOffset < got.shownLimit) {
      const before = got.nextOffset;
      got = await readOn(JUMP_BYTES);
      if (got === null || got.nextOffset === before) break;
    }
    window.requestAnimationFrame(() => {
      if (scroller.current !== null) scroller.current.scrollTop = scroller.current.scrollHeight;
    });
  }, [readOn]);

  /* ---------------------------------------------------------------- search */

  const [query, setQuery] = useState('');
  const [current, setCurrent] = useState(0);
  const text = held?.text ?? '';
  /** Where each match starts, case aside. */
  const matches = useMemo(() => {
    const needle = query.toLowerCase();
    if (needle === '') return [];
    const hay = text.toLowerCase();
    const found: number[] = [];
    for (let at = hay.indexOf(needle); at !== -1; at = hay.indexOf(needle, at + needle.length)) found.push(at);
    return found;
  }, [text, query]);
  const reachable = Math.min(matches.length, MAX_MARKS);
  const shownCurrent = reachable === 0 ? -1 : Math.min(current, reachable - 1);

  /** The text cut at each drawn match, so a match is a <mark> and the rest is text. */
  const drawnText = useMemo(() => {
    if (reachable === 0) return text;
    const parts: (string | { at: number; index: number })[] = [];
    let from = 0;
    for (let index = 0; index < reachable; index += 1) {
      const at = matches[index];
      if (at > from) parts.push(text.slice(from, at));
      parts.push({ at, index });
      from = at + query.length;
    }
    if (from < text.length) parts.push(text.slice(from));
    return parts.map((part, key) =>
      typeof part === 'string' ? (
        part
      ) : (
        <mark
          key={key}
          className={part.index === shownCurrent ? `${styles.match} ${styles.matchCurrent}` : styles.match}
          data-tin-output-match={part.index}
          data-tin-output-match-current={part.index === shownCurrent ? '' : undefined}
        >
          {text.slice(part.at, part.at + query.length)}
        </mark>
      ),
    );
  }, [text, matches, reachable, query, shownCurrent]);

  /* The current match brought into the middle of the panel, without moving the page. */
  useEffect(() => {
    const box = scroller.current;
    if (box === null || shownCurrent < 0) return;
    const mark = box.querySelector<HTMLElement>('[data-tin-output-match-current]');
    if (mark === null) return;
    box.scrollTop = Math.max(0, mark.offsetTop - box.clientHeight / 2);
  }, [shownCurrent, query]);

  const step = useCallback(
    (by: number) => {
      if (reachable === 0) return;
      setCurrent((was) => (Math.min(was, reachable - 1) + by + reachable) % reachable);
    },
    [reachable],
  );

  const onSearchKey = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        step(event.shiftKey ? -1 : 1);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        setQuery('');
        setCurrent(0);
      }
    },
    [step],
  );

  /* ---------------------------------------------------------------- height */

  const [height, setHeight] = useState(OPEN_HEIGHT);
  const windowHeight = useWindowHeight();
  const maxHeight = Math.max(MIN_HEIGHT, Math.round(windowHeight * 0.85));
  const grip = useRef<{ from: number; origin: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const clamp = useCallback((to: number) => Math.round(Math.min(Math.max(to, MIN_HEIGHT), maxHeight)), [maxHeight]);
  const shownHeight = clamp(height);

  /* Pointer and arrows, as every other handle here; held in this panel only, so nothing is written down. */
  const handlers: DragHandlers = {
    onPointerDown(event: ReactPointerEvent<HTMLElement>) {
      if (event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      grip.current = { from: event.clientY, origin: shownHeight };
      setDragging(true);
    },
    onPointerMove(event: ReactPointerEvent<HTMLElement>) {
      const held = grip.current;
      if (held === null) return;
      setHeight(clamp(held.origin + event.clientY - held.from));
    },
    onPointerUp(event: ReactPointerEvent<HTMLElement>) {
      if (grip.current === null) return;
      event.currentTarget.releasePointerCapture(event.pointerId);
      grip.current = null;
      setDragging(false);
    },
    onPointerCancel(event: ReactPointerEvent<HTMLElement>) {
      if (grip.current === null) return;
      event.currentTarget.releasePointerCapture(event.pointerId);
      grip.current = null;
      setDragging(false);
    },
    onKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
      const by = event.key === 'ArrowDown' ? 24 : event.key === 'ArrowUp' ? -24 : 0;
      if (by !== 0) {
        event.preventDefault();
        setHeight(clamp(shownHeight + by));
      } else if (event.key === 'Escape') {
        event.preventDefault();
        setHeight(OPEN_HEIGHT);
      }
    },
    onDoubleClick() {
      setHeight(OPEN_HEIGHT);
    },
  };

  /* ---------------------------------------------------------------- drawing */

  if (error !== null && held === null) {
    return (
      <p className={styles.note} role="alert" data-tin-output-error="">
        {error}
      </p>
    );
  }
  if (held === null) {
    return (
      <p className={styles.note}>
        <Loader />
      </p>
    );
  }
  if (!held.available) {
    return (
      <p className={styles.note} data-tin-output-unavailable="">
        {held.message ?? t('The output of this command cannot be had.')}
      </p>
    );
  }

  const status = capped
    ? tf('Only the first {size} of this output is shown here.', { size: sizeOf(held.shownLimit) })
    : held.done
      ? null
      : reading
        ? t('Reading…')
        : held.caughtUp
          ? t('Still running; following its output.')
          : t('Scroll down for more.');

  return (
    <div className={styles.output} data-tin-output={executionId}>
      {held.message !== null && (
        <p className={styles.quiet} data-tin-output-note="">
          {held.message}
        </p>
      )}
      <div className={styles.frame} style={{ height: shownHeight }} data-tin-output-frame="">
        <div className={styles.toolbar} data-tin-output-toolbar="">
          <input
            type="search"
            className={styles.search}
            value={query}
            placeholder={t('Search output')}
            aria-label={t('Search output')}
            onChange={(event) => {
              setQuery(event.target.value);
              setCurrent(0);
            }}
            onKeyDown={onSearchKey}
            data-tin-output-search=""
          />
          {query !== '' && (
            <span className={styles.count} data-tin-output-count={matches.length}>
              {matches.length === 0 ? '0' : `${shownCurrent + 1}/${matches.length}`}
            </span>
          )}
          {query !== '' && (
            <>
              <button
                type="button"
                className={styles.tool}
                onClick={() => step(-1)}
                disabled={reachable === 0}
                title={t('Previous match (Shift+Enter)')}
                aria-label={t('Previous match (Shift+Enter)')}
                data-tin-output-previous=""
              >
                ‹
              </button>
              <button
                type="button"
                className={styles.tool}
                onClick={() => step(1)}
                disabled={reachable === 0}
                title={t('Next match (Enter)')}
                aria-label={t('Next match (Enter)')}
                data-tin-output-next=""
              >
                ›
              </button>
            </>
          )}
          <button
            type="button"
            className={styles.tool}
            onClick={toTop}
            title={t('Jump to top')}
            aria-label={t('Jump to top')}
            data-tin-output-top=""
          >
            ⤒
          </button>
          <button
            type="button"
            className={styles.tool}
            onClick={() => void toBottom()}
            title={t('Jump to bottom')}
            aria-label={t('Jump to bottom')}
            data-tin-output-bottom=""
          >
            ⤓
          </button>
        </div>
        <div ref={scroller} className={styles.scroller} onScroll={onScroll} data-tin-output-scroller="">
          {text === '' && held.done ? (
            <p className={styles.empty}>{t('This command printed nothing.')}</p>
          ) : (
            <pre className={styles.text} data-tin-output-text="">
              {drawnText}
            </pre>
          )}
          {status !== null && (
            <p className={styles.status} data-tin-output-status="">
              {status}
            </p>
          )}
          {error !== null && (
            <p className={styles.status} role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
      <ResizeHandle
        orientation="horizontal"
        label={t('Output height')}
        valueNow={shownHeight}
        valueMin={MIN_HEIGHT}
        valueMax={maxHeight}
        title={t('Drag to make the output taller or shorter')}
        dragging={dragging}
        handlers={handlers}
        className={styles.handle}
      />
    </div>
  );
}
