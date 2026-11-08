import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';

import styles from './HoverHint.module.css';

/** How long the pointer rests on something before its hint is shown. */
const DELAY_MS = 400;

interface Shown {
  text: string;
  x: number;
  y: number;
}

/**
 * A hint drawn by the application beside the pointer, for things on a canvas
 * that have no room for words of their own.
 *
 * It replaces a `title`, which the browser draws in its own grey box after a
 * delay it chooses, over everything, in a font the rest of the page does not
 * use. This one follows the pointer, rests a moment before it appears, and
 * goes the moment the pointer presses or leaves, so it never sits over a drag.
 */
export function useHoverHint(): { hintFor: (text: string) => HintHandlers; hint: ReactNode } {
  const [shown, setShown] = useState<Shown | null>(null);
  const timer = useRef<number | null>(null);
  const waiting = useRef<Shown | null>(null);

  const cancel = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    waiting.current = null;
  };
  useEffect(() => cancel, []);

  const hintFor = (text: string): HintHandlers => ({
    onPointerEnter: (event) => {
      if (event.buttons !== 0) return;
      cancel();
      waiting.current = { text, x: event.clientX, y: event.clientY };
      timer.current = window.setTimeout(() => {
        if (waiting.current !== null) setShown(waiting.current);
        timer.current = null;
      }, DELAY_MS);
    },
    onPointerMove: (event) => {
      if (event.buttons !== 0) {
        cancel();
        setShown(null);
        return;
      }
      const at = { text, x: event.clientX, y: event.clientY };
      if (waiting.current !== null) waiting.current = at;
      setShown((now) => (now === null ? null : at));
    },
    onPointerLeave: () => {
      cancel();
      setShown(null);
    },
    onPointerDownCapture: () => {
      cancel();
      setShown(null);
    },
  });

  const hint =
    shown === null
      ? null
      : createPortal(
          <HintBox at={shown} />,
          document.body,
        );

  return { hintFor, hint };
}

/** Room kept between the hint and the window's edge. */
const EDGE_PX = 8;

/**
 * The hint itself, below and to the right of the pointer where there is room,
 * and turned above it or to its left where there is not - a hint on something
 * in the bottom corner of the window would otherwise be drawn off it.
 */
function HintBox({ at }: { at: Shown }) {
  const box = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState({ left: at.x + 14, top: at.y + 18 });
  useLayoutEffect(() => {
    const element = box.current;
    if (element === null) return;
    const { width, height } = element.getBoundingClientRect();
    const right = at.x + 14 + width > window.innerWidth - EDGE_PX;
    const below = at.y + 18 + height <= window.innerHeight - EDGE_PX;
    setPlace({
      left: Math.max(EDGE_PX, right ? at.x - 10 - width : at.x + 14),
      top: Math.max(EDGE_PX, below ? at.y + 18 : at.y - 10 - height),
    });
  }, [at.x, at.y, at.text]);
  return (
    <div ref={box} className={styles.hint} role="tooltip" data-hover-hint="" style={place}>
      {at.text}
    </div>
  );
}

export interface HintHandlers {
  onPointerEnter: (event: ReactPointerEvent<Element>) => void;
  onPointerMove: (event: ReactPointerEvent<Element>) => void;
  onPointerLeave: () => void;
  onPointerDownCapture: () => void;
}
