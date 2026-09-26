/**
 * A panel that can be dragged to a size, and keeps the size it was dragged to.
 *
 * The function editor had the first one of these: a divider between the code and
 * the properties, because a fixed split is the wrong answer for both of the
 * people who open that page. The run detail wants three more - the graph and the
 * log are windows onto things much bigger than the window, and the node panel
 * holds a step's JSON and a picture it drew - and three more hand-written drags
 * would be four slightly different handles that each remember in their own way.
 *
 * So the mechanism is here once: the pointer, the keyboard, the clamp, and the
 * one line of storage. What stays with the page is what only the page knows -
 * which edge is taken hold of, how little and how much is sensible, and what the
 * number means to somebody reading it out.
 *
 * `ResizeHandle` is the thing on the screen. It is a `separator` rather than a
 * button: it is not something that happens when pressed, it is something that
 * has a position, and saying so is what lets it report where it has been put.
 * Focusable and answering arrows, because a size that can only be set by holding
 * a pointer down cannot be set by everybody.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';

import styles from './DragSize.module.css';

/**
 * Which edge is taken hold of.
 *
 * `bottom` sizes a height and grows downwards, the way a textarea does.
 * `left` sizes the width of something anchored to the right, so pulling left
 * widens it and whatever is beside it gives way.
 */
export type DragEdge = 'bottom' | 'left';

export interface DragSizeOptions {
  /** Where the chosen size is written down. One key per panel, not per page. */
  storageKey: string;
  /**
   * What the panel is worth until somebody says otherwise: the size it always had.
   *
   * Null leaves that to the content. The panel is then as big as what is in it,
   * up to whatever cap its stylesheet puts on that, and `size` is null for as
   * long as nothing has been dragged - a list of three rows is three rows tall,
   * not a fixed box with empty space above the handle. A drag begins from
   * `measured`, because a delta has to begin from a number and the content chose
   * this one; a reset goes back to the content rather than to a number.
   */
  initial: number | null;
  /**
   * How big the panel is drawn now, for a drag that begins from a size the
   * content chose. Read only while `initial` is null and nothing has been
   * dragged; `useRoom` on the panel itself is the usual source.
   */
  measured?: number;
  /** The floor, so it cannot be dragged to nothing. */
  min: number;
  /**
   * The ceiling, so it cannot be dragged over the page.
   *
   * Null while it is still unknown - a ceiling worked out from a width that has
   * not been measured yet is zero, and clamping a stored size against that would
   * throw the stored size away on the first pass. Nothing is clamped until a
   * number arrives.
   */
  max: number | null;
  edge: DragEdge;
  /** One press of an arrow key. Coarse enough that a few presses get somewhere. */
  nudge?: number;
}

/** Spread onto `ResizeHandle`; nothing else should need to look inside it. */
export interface DragHandlers {
  onPointerDown(event: ReactPointerEvent<HTMLElement>): void;
  onPointerMove(event: ReactPointerEvent<HTMLElement>): void;
  onPointerUp(event: ReactPointerEvent<HTMLElement>): void;
  onPointerCancel(event: ReactPointerEvent<HTMLElement>): void;
  onKeyDown(event: ReactKeyboardEvent<HTMLElement>): void;
  onDoubleClick(): void;
}

export interface DragSize<Size extends number | null = number> {
  /**
   * What to draw.
   *
   * The chosen size clamped to what fits now, which is not always what was
   * chosen: a window too small for a stored size gets the nearest size that
   * still leaves the rest of the page. Clamped for the drawing only - what was
   * chosen is still what is stored, so a bigger window gives it back rather than
   * having quietly forgotten it on the way through.
   *
   * Null only for a panel whose `initial` is null and which nobody has dragged:
   * the content is deciding, and there is no number to draw.
   */
  size: Size;
  /** Whether a pointer is holding the handle, for the row to say so. */
  dragging: boolean;
  /** Back to the size the page opens at, for one dragged somewhere unhelpful. */
  reset(): void;
  handlers: DragHandlers;
}

/*
 * Two signatures for one hook, so a page that names a starting size never has
 * to ask whether `size` is null: it is not, and the type says so. Only a panel
 * that leaves its opening size to the content gets the nullable answer.
 */
export function useDragSize(options: DragSizeOptions & { initial: number }): DragSize;
export function useDragSize(options: DragSizeOptions & { initial: null }): DragSize<number | null>;
export function useDragSize(options: DragSizeOptions): DragSize<number | null> {
  const { storageKey, initial, measured, min, max, edge, nudge = 24 } = options;
  /** What the panel has been dragged to, or null before anything has been read. */
  const [wanted, setWanted] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  /**
   * Where the drag began, and the size it began from.
   *
   * A delta from the press rather than the pointer read against the panel's box:
   * the handle can sit anywhere relative to the edge it moves - below it, in the
   * gap beside it, inside the card's padding - and a delta does not care which,
   * so pressing without moving changes nothing. A ref, because the pointer moves
   * far more often than anything is drawn differently for it.
   */
  const held = useRef<{ from: number; origin: number } | null>(null);

  useEffect(() => {
    try {
      const stored = Number(window.localStorage.getItem(storageKey));
      if (Number.isFinite(stored) && stored > 0) setWanted(stored);
    } catch {
      // Unreadable, or turned off: the panel simply opens where it always did.
    }
  }, [storageKey]);

  /**
   * Writes the size down. A browser that will not remember is no reason to refuse the drag.
   *
   * Null is "nothing chosen", so the key comes out rather than holding a zero
   * the next read would have to know to ignore.
   */
  const remember = useCallback(
    (size: number | null) => {
      try {
        if (size === null) window.localStorage.removeItem(storageKey);
        else window.localStorage.setItem(storageKey, String(Math.round(size)));
      } catch {
        // Private mode, or storage full. The panel still resizes; it just does
        // not survive the next visit, which is better than a drag that does
        // nothing.
      }
    },
    [storageKey],
  );

  const ceiling = max === null ? Number.POSITIVE_INFINITY : Math.max(min, max);
  const clamp = (to: number) => Math.round(Math.min(Math.max(to, min), ceiling));
  const chosen = wanted ?? initial;
  const size = chosen === null ? null : clamp(chosen);
  /**
   * The number a drag or a nudge begins from: what is drawn, whichever of the
   * two decided it. A panel the content is sizing has been measured; one that
   * has not been measured yet starts from the floor rather than from nothing.
   */
  const from = size ?? measured ?? min;

  function reset() {
    setWanted(initial);
    remember(initial);
  }

  const handlers: DragHandlers = {
    onPointerDown(event) {
      if (event.button !== 0) return;
      // Otherwise the press begins a selection that runs across whatever the
      // pointer crosses, and the drag ends with half the page highlighted.
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      held.current = { from: edge === 'bottom' ? event.clientY : event.clientX, origin: from };
      setDragging(true);
    },
    onPointerMove(event) {
      const grip = held.current;
      if (grip === null) return;
      // Left widens, because left is where the edge goes; down makes it taller.
      const by = edge === 'bottom' ? event.clientY - grip.from : grip.from - event.clientX;
      setWanted(clamp(grip.origin + by));
    },
    onPointerUp(event) {
      if (held.current === null) return;
      event.currentTarget.releasePointerCapture(event.pointerId);
      held.current = null;
      setDragging(false);
      // Written once, at the end. Storing on every frame of a drag would be a
      // hundred writes to say what the last one says.
      remember(size);
    },
    onPointerCancel(event) {
      if (held.current === null) return;
      event.currentTarget.releasePointerCapture(event.pointerId);
      held.current = null;
      setDragging(false);
      remember(size);
    },
    /**
     * The same drag from the keyboard, for somebody who cannot hold a pointer
     * down. The delete keys put the size back rather than removing anything,
     * since there is nothing here to remove.
     */
    onKeyDown(event) {
      const grow = edge === 'bottom' ? 'ArrowDown' : 'ArrowLeft';
      const shrink = edge === 'bottom' ? 'ArrowUp' : 'ArrowRight';
      const by = event.key === grow ? nudge : event.key === shrink ? -nudge : 0;
      if (by !== 0) {
        // Kept from the page behind, which would scroll instead.
        event.preventDefault();
        const next = clamp(from + by);
        setWanted(next);
        remember(next);
        return;
      }
      if (event.key === 'Escape' || event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        reset();
      }
    },
    onDoubleClick: reset,
  };

  return { size, dragging, reset, handlers };
}

/**
 * How much room a row or a column has, watched.
 *
 * A ceiling for one panel is usually a share of what its row has, which is not
 * the window and changes with it. A callback ref rather than `useRef`, because
 * the row is often not rendered at all on the first pass - a page still loading,
 * a panel not yet opened - and an effect reading a ref would find nothing on the
 * pass that matters and never be run again.
 *
 * `box` says which edge is measured. The content box is the room *inside*
 * something, which is what a ceiling wants; the border box is how big the thing
 * itself is drawn, which is what a drag that begins from a content-chosen size
 * wants - the height it will set is a border-box height, and a drag that began
 * from the content height would shrink the panel by its padding on the first
 * frame.
 */
export function useRoom(
  axis: 'width' | 'height',
  box: 'content' | 'border' = 'content',
): [(held: HTMLElement | null) => void, number] {
  const [held, setHeld] = useState<HTMLElement | null>(null);
  const [room, setRoom] = useState(0);

  useEffect(() => {
    if (held === null) return;
    const watch = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry === undefined) return;
      const rect = box === 'border' ? entry.target.getBoundingClientRect() : entry.contentRect;
      setRoom(axis === 'width' ? rect.width : rect.height);
    });
    watch.observe(held);
    return () => watch.disconnect();
  }, [held, axis, box]);

  return [setHeld, room];
}

/**
 * The window's height, watched, for a ceiling on something dragged taller.
 *
 * A panel's floor is about what it holds, but its ceiling is about the screen:
 * "as tall as this window and a little less" is a cap somebody can reach and
 * cannot go past, where a fixed number is either short on a tall screen or off
 * the bottom on a short one.
 */
export function useWindowHeight(): number {
  const [tall, setTall] = useState(() => window.innerHeight);

  useEffect(() => {
    const seen = () => setTall(window.innerHeight);
    window.addEventListener('resize', seen);
    return () => window.removeEventListener('resize', seen);
  }, []);

  return tall;
}

export interface ResizeHandleProps {
  /**
   * Which way the line runs, which is what the attribute means: a `vertical`
   * separator is a vertical line, and it moves left and right.
   */
  orientation: 'vertical' | 'horizontal';
  /** Said out loud in place of the handle, so the size has a name. */
  label: string;
  /** The id of what is being sized. */
  controls?: string;
  /** What it reports about where it has been put, in whatever unit the page reads out. */
  valueNow: number;
  valueMin: number;
  valueMax: number;
  title?: string;
  dragging: boolean;
  handlers: DragHandlers;
  /**
   * One class of the page's own, for the rules only the page can write.
   *
   * What it is actually for is the breakpoint: below a width where two columns
   * stop being columns there is nothing to divide, and only the page knows where
   * that width is. Hidden from a rule of the page's that names this class *and*
   * its container, so it beats the one-class rule here whichever stylesheet the
   * bundler happens to put first.
   */
  className?: string;
}

export function ResizeHandle(props: ResizeHandleProps) {
  const { orientation, label, controls, valueNow, valueMin, valueMax, title, handlers } = props;
  const shape = orientation === 'vertical' ? styles.vertical : styles.horizontal;
  const worn = [styles.handle, shape, props.dragging ? styles.dragging : null, props.className]
    .filter((one) => one !== null && one !== undefined)
    .join(' ');
  return (
    <div
      className={worn}
      role="separator"
      tabIndex={0}
      aria-orientation={orientation}
      aria-label={label}
      aria-controls={controls}
      aria-valuenow={valueNow}
      aria-valuemin={valueMin}
      aria-valuemax={valueMax}
      title={title}
      {...handlers}
    />
  );
}
