import { useCallback, useEffect, useRef } from 'react';

/*
 * A dragged node moves like a chunk of jelly. Its body lags behind the hand by
 * a damped spring in both directions, pulled toward a lag that follows the
 * pointer's velocity: a fast drag leans and stretches it along the way it is
 * going, a stop lets it wobble back past straight once or twice, and held still
 * it rests. Nothing runs while nothing is moving.
 */
/** Pixels of lag per pixel per millisecond of pointer speed. */
const LAG_PER_SPEED = 10;
/** The most it lags, however fast the drag. */
const MOST_LAG = 22;
/** How hard the body is pulled toward its lag, per second squared. */
const STIFFNESS = 220;
/** How quickly a wobble dies away, per second; low enough to overshoot. */
const DAMPING = 10;
/** Degrees of lean per pixel of lag. */
const LEAN = 0.35;
/** Stretch along the motion per pixel of lag; it narrows across by half as much. */
const STRETCH = 0.005;
/** How much of the lag the lines and labels follow. */
const LINE_SHARE = 0.15;
/** A pointer that has not moved for this long is held still. */
const STILL_AFTER_MS = 60;

type Dragged = MouseEvent | TouchEvent | React.MouseEvent | React.TouchEvent;

/** Where the pointer is, for a mouse or the first finger. */
function pointOf(event: Dragged): { x: number; y: number } {
  const at = 'touches' in event ? event.touches[0] : event;
  return at === undefined ? { x: 0, y: 0 } : { x: at.clientX, y: at.clientY };
}

/**
 * Drives the `--jelly-*` custom properties on the editor's canvas while a
 * node is dragged; the dragged card, its lines and their labels read them.
 */
export function useDragSway() {
  const held = useRef({
    host: null as HTMLElement | null,
    dragging: false,
    last: { x: 0, y: 0, at: 0 },
    speed: { x: 0, y: 0 },
    lag: { x: 0, y: 0 },
    moving: { x: 0, y: 0 },
    frame: 0,
    then: 0,
  });

  const write = useCallback(() => {
    const { host, lag } = held.current;
    if (host === null) return;
    const along = (mine: number, other: number) => 1 + Math.abs(mine) * STRETCH - Math.abs(other) * STRETCH * 0.5;
    const set = (name: string, value: string) => host.style.setProperty(name, value);
    set('--jelly-kx', `${(lag.x * LEAN).toFixed(3)}deg`);
    set('--jelly-ky', `${(lag.y * LEAN).toFixed(3)}deg`);
    set('--jelly-sx', along(lag.x, lag.y).toFixed(4));
    set('--jelly-sy', along(lag.y, lag.x).toFixed(4));
    set('--jelly-px', `${(lag.x * LINE_SHARE).toFixed(3)}px`);
    set('--jelly-py', `${(lag.y * LINE_SHARE).toFixed(3)}px`);
  }, []);

  const step = useCallback(
    (now: number) => {
      const it = held.current;
      const seconds = Math.min((now - it.then) / 1000, 0.05);
      it.then = now;
      if (now - it.last.at > STILL_AFTER_MS) it.speed = { x: 0, y: 0 };
      const toward = (speed: number) => Math.max(-MOST_LAG, Math.min(MOST_LAG, -speed * LAG_PER_SPEED));
      for (const axis of ['x', 'y'] as const) {
        it.moving[axis] += (STIFFNESS * (toward(it.speed[axis]) - it.lag[axis]) - DAMPING * it.moving[axis]) * seconds;
        it.lag[axis] += it.moving[axis] * seconds;
      }
      const still = it.speed.x === 0 && it.speed.y === 0;
      const resting = still && Math.hypot(it.lag.x, it.lag.y) < 0.02 && Math.hypot(it.moving.x, it.moving.y) < 0.02;
      // At rest is exactly straight, not a hair off it for as long as the hand stays put.
      if (resting) {
        it.lag = { x: 0, y: 0 };
        it.moving = { x: 0, y: 0 };
      }
      if (!it.dragging && resting) {
        it.frame = 0;
        write();
        return;
      }
      write();
      it.frame = requestAnimationFrame(step);
    },
    [write],
  );

  useEffect(() => () => cancelAnimationFrame(held.current.frame), []);

  return {
    start: useCallback(
      (event: Dragged) => {
        const it = held.current;
        it.host = (event.target as Element | null)?.closest('.react-flow') as HTMLElement | null;
        it.dragging = true;
        it.last = { ...pointOf(event), at: performance.now() };
        it.speed = { x: 0, y: 0 };
        if (it.frame === 0) {
          it.then = performance.now();
          it.frame = requestAnimationFrame(step);
        }
      },
      [step],
    ),
    move: useCallback((event: Dragged) => {
      const it = held.current;
      const now = performance.now();
      const at = pointOf(event);
      const elapsed = Math.max(now - it.last.at, 1);
      // Smoothed, so one jumpy event is not a jolt.
      it.speed = {
        x: it.speed.x * 0.6 + ((at.x - it.last.x) / elapsed) * 0.4,
        y: it.speed.y * 0.6 + ((at.y - it.last.y) / elapsed) * 0.4,
      };
      it.last = { ...at, at: now };
    }, []),
    stop: useCallback(() => {
      held.current.dragging = false;
    }, []),
  };
}
