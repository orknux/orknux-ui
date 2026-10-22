/**
 * A dialog that can be dragged to a size from any of its edges and corners, and
 * keeps the size it was dragged to.
 *
 * The import plan was the first to need it: a list of a dozen rows, each a
 * kind, a name, a badge and two buttons, in a box 420px wide wrapped every one
 * of them. The native `resize: both` it had offered one corner, and because a
 * modal dialog is centred, dragging that corner grew it to both sides at once -
 * the edge under the pointer moved half as far as the pointer did.
 *
 * Here the edge taken hold of is the edge that moves and the opposite one stays
 * where it was: the first drag pins the dialog where it is drawn, and from then
 * on it is placed rather than centred, until it is opened again. What is
 * remembered is the size and not the place - a dialog that reopened in the
 * corner somebody left it in on a different window would be a dialog somebody
 * has to find.
 *
 * `DialogEdges` is the thing on the screen: eight strips along the edges, not
 * focusable, because a modal focuses its first focusable child and that should
 * be the form, not a border. Double-clicking one goes back to the size the
 * dialog opens at.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';

import styles from './DialogSize.module.css';

/** Which edge or corner is held, by compass point. */
export type DialogEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const EDGES: DialogEdge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

export interface DialogSizeOptions {
  /** Where the chosen size is written down. One key per dialog. */
  storageKey: string;
  /** Whether the dialog is open: each opening is centred again, at the remembered size. */
  open: boolean;
  /** The floor, so neither side can be dragged to nothing. */
  minWidth: number;
  minHeight: number;
  /** How close to the window's edge a dragged edge may come. */
  margin?: number;
}

interface Size {
  /** Null leaves it to the stylesheet: the width the dialog opens at, the height of its content. */
  width: number | null;
  height: number | null;
}

export interface DialogSize {
  /** Spread onto the `<dialog>`. */
  style: CSSProperties;
  /** Whether a height has been chosen, so what is inside can fill it rather than keep its own cap. */
  sized: boolean;
  /** Spread onto `DialogEdges`. */
  edgeProps: DialogEdgesProps;
}

function read(storageKey: string): Size {
  try {
    const stored = JSON.parse(window.localStorage.getItem(storageKey) ?? 'null') as Partial<Size> | null;
    const number = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null);
    return { width: number(stored?.width), height: number(stored?.height) };
  } catch {
    // Unreadable or turned off: the dialog opens at the size it always did.
    return { width: null, height: null };
  }
}

function remember(storageKey: string, size: Size) {
  try {
    if (size.width === null && size.height === null) window.localStorage.removeItem(storageKey);
    else
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({
          width: size.width === null ? null : Math.round(size.width),
          height: size.height === null ? null : Math.round(size.height),
        }),
      );
  } catch {
    // Private mode, or storage full. The drag still works; it is just not kept.
  }
}

export function useDialogSize({ storageKey, open, minWidth, minHeight, margin = 16 }: DialogSizeOptions): DialogSize {
  const [size, setSize] = useState<Size>(() => read(storageKey));
  /** Where the dialog is pinned once dragged, or null while the browser centres it. */
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);
  /** The size as of the last move, for the release to write down without waiting for a render. */
  const latest = useRef(size);
  const held = useRef<{ edge: DialogEdge; x: number; y: number; rect: DOMRect } | null>(null);

  useEffect(() => {
    if (!open) return;
    const stored = read(storageKey);
    latest.current = stored;
    setSize(stored);
    setPlace(null);
  }, [open, storageKey]);

  // A window that changed size may no longer hold a dialog pinned near its edge; centre it again.
  useEffect(() => {
    const recentre = () => setPlace(null);
    window.addEventListener('resize', recentre);
    return () => window.removeEventListener('resize', recentre);
  }, []);

  const onPointerDown = useCallback((edge: DialogEdge, event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    const dialog = event.currentTarget.closest('dialog');
    if (dialog === null) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    held.current = { edge, x: event.clientX, y: event.clientY, rect: dialog.getBoundingClientRect() };
  }, []);

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const hold = held.current;
      if (hold === null) return;
      const { edge, rect } = hold;
      const dx = event.clientX - hold.x;
      const dy = event.clientY - hold.y;
      const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
      let { left, top, right, bottom } = rect;
      if (edge.includes('e')) right = clamp(rect.right + dx, rect.left + minWidth, window.innerWidth - margin);
      if (edge.includes('w')) left = clamp(rect.left + dx, Math.min(margin, rect.left), rect.right - minWidth);
      if (edge.includes('s')) bottom = clamp(rect.bottom + dy, rect.top + minHeight, window.innerHeight - margin);
      if (edge.includes('n')) top = clamp(rect.top + dy, Math.min(margin, rect.top), rect.bottom - minHeight);
      const horizontal = edge.includes('e') || edge.includes('w');
      const vertical = edge.includes('n') || edge.includes('s');
      const next: Size = {
        width: horizontal ? right - left : latest.current.width,
        height: vertical ? bottom - top : latest.current.height,
      };
      latest.current = next;
      setSize(next);
      setPlace({ left, top });
    },
    [minWidth, minHeight, margin],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (held.current === null) return;
      held.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      remember(storageKey, latest.current);
    },
    [storageKey],
  );

  const onDoubleClick = useCallback(() => {
    const none = { width: null, height: null };
    latest.current = none;
    setSize(none);
    setPlace(null);
    remember(storageKey, none);
  }, [storageKey]);

  const style: CSSProperties = {
    ...(size.width === null ? {} : { width: size.width }),
    ...(size.height === null ? {} : { height: size.height }),
    // Pinned: the edge not held stays where it is, rather than the browser centring the new size.
    ...(place === null ? {} : { left: place.left, top: place.top, right: 'auto', bottom: 'auto', margin: 0 }),
  };

  return {
    style,
    sized: size.height !== null,
    edgeProps: { onPointerDown, onPointerMove, onPointerUp, onDoubleClick },
  };
}

export interface DialogEdgesProps {
  onPointerDown(edge: DialogEdge, event: ReactPointerEvent<HTMLElement>): void;
  onPointerMove(event: ReactPointerEvent<HTMLElement>): void;
  onPointerUp(event: ReactPointerEvent<HTMLElement>): void;
  onDoubleClick(): void;
}

/** The eight strips a dialog is taken hold of by. Placed inside the `<dialog>`, which carries `dialogSizable`. */
export function DialogEdges({ onPointerDown, onPointerMove, onPointerUp, onDoubleClick }: DialogEdgesProps) {
  return (
    <>
      {EDGES.map((edge) => (
        <div
          key={edge}
          className={`${styles.edge} ${styles[edge]}`}
          aria-hidden="true"
          data-edge={edge}
          onPointerDown={(event) => onPointerDown(edge, event)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={onDoubleClick}
        />
      ))}
    </>
  );
}
