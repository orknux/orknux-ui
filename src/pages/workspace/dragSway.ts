import { useCallback, useEffect, useRef } from 'react';

import { currentDragEffect } from '../../session/dragEffect';
import type { DragEffect } from '../../session/dragEffect';

/*
 * A dragged node moves like a chunk of jelly.
 *
 * Its body lags behind the hand on a damped spring in both directions, pulled
 * toward a lag that follows how fast and which way it moves. The lag shears it
 * and stretches it along the motion while narrowing it across, keeping its
 * area, as a soft body does. Let go while moving and it has inertia: it slides
 * on the way it was going, slowed by friction, and wobbles as it comes to a
 * stop - as far as the speed it was let go at carries it, a quick long
 * move further than a slow one. Held still, it rests. Nothing runs while nothing is moving.
 *
 * Which of that happens is the person's: Preferences offers it off, as jelly,
 * or as jelly that slides on - see `session/dragEffect`.
 */
/** Pixels of lag per pixel per millisecond of speed. */
const LAG_PER_SPEED = 6;
/** The most it lags, however fast it moves. */
const MOST_LAG = 12;
/** How hard the body is pulled toward its lag, per second squared. */
const STIFFNESS = 320;
/** How quickly a wobble dies away, per second; low enough to overshoot. */
const DAMPING = 14;
/** Degrees of shear per pixel of lag. */
const SHEAR = 0.25;
/** Stretch along the motion per pixel of lag; across it narrows to keep the area. */
const STRETCH = 0.006;
/** How much of the lag the lines and labels follow. */
const LINE_SHARE = 0.15;
/** A pointer that has not moved for this long is held still, and lets go with no throw. */
const STILL_AFTER_MS = 60;
/** How fast a thrown node slows, per second: its speed falls by e every 1/FRICTION seconds. */
const FRICTION = 10;
/** Slower than this, in pixels per millisecond, a glide has stopped. */
const STOPPED = 0.02;
/** The fastest a node can be let go, in pixels per millisecond: only a wild flick is held to it. */
const FASTEST_THROW = 4;
/** How much of the hand's speed a let-go node keeps; how far it slides follows from that and the friction. */
const THROW_SHARE = 0.5;

type Dragged = MouseEvent | TouchEvent | React.MouseEvent | React.TouchEvent;

/** Where the pointer is, for a mouse or the first finger. */
function pointOf(event: Dragged): { x: number; y: number } {
  const at = 'touches' in event ? event.touches[0] : event;
  return at === undefined ? { x: 0, y: 0 } : { x: at.clientX, y: at.clientY };
}

/**
 * Drives the `--jelly-*` custom properties on the editor's canvas while a
 * node is dragged or gliding, which the card, its lines and their labels read.
 * The cards it moves carry `data-jelly` until they settle; the attribute is
 * set on the element rather than through the node's class, which React Flow
 * would carry into the graph's state.
 *
 * @param glide moves the nodes let go by this many screen pixels, as their
 *   inertia carries them on
 * @param rest is told when the nodes let go have stopped and settled
 */
export function useDragSway(
  glide: (ids: readonly string[], dx: number, dy: number) => void,
  rest: (ids: readonly string[]) => void,
) {
  const glideRef = useRef(glide);
  glideRef.current = glide;
  const restRef = useRef(rest);
  restRef.current = rest;
  const held = useRef({
    host: null as HTMLElement | null,
    /** Whether the host is the thing moved itself - a line's label - rather than the canvas around nodes. */
    own: false,
    effect: 'off' as DragEffect,
    dragging: false,
    ids: [] as readonly string[],
    last: { x: 0, y: 0, at: 0 },
    speed: { x: 0, y: 0 },
    thrown: { x: 0, y: 0 },
    lag: { x: 0, y: 0 },
    moving: { x: 0, y: 0 },
    frame: 0,
    then: 0,
  });

  /** Puts the mark on the cards being moved, or takes it off. */
  const mark = useCallback((on: boolean) => {
    const { host, ids, own } = held.current;
    if (own) {
      if (on) host?.setAttribute('data-jelly', '');
      else host?.removeAttribute('data-jelly');
      return;
    }
    for (const id of ids) {
      const card = host?.querySelector(`.react-flow__node[data-id="${CSS.escape(id)}"]`);
      if (on) card?.setAttribute('data-jelly', '');
      else card?.removeAttribute('data-jelly');
    }
  }, []);

  const write = useCallback(() => {
    const { host, lag } = held.current;
    if (host === null) return;
    const size = Math.hypot(lag.x, lag.y);
    const set = (name: string, value: string) => host.style.setProperty(name, value);
    set('--jelly-a', `${(size === 0 ? 0 : (Math.atan2(lag.y, lag.x) * 180) / Math.PI).toFixed(2)}deg`);
    set('--jelly-s', (1 + size * STRETCH).toFixed(4));
    set('--jelly-kx', `${(lag.x * SHEAR).toFixed(3)}deg`);
    set('--jelly-ky', `${(lag.y * SHEAR).toFixed(3)}deg`);
    set('--jelly-px', `${(lag.x * LINE_SHARE).toFixed(3)}px`);
    set('--jelly-py', `${(lag.y * LINE_SHARE).toFixed(3)}px`);
  }, []);

  const step = useCallback(
    (now: number) => {
      const it = held.current;
      const elapsed = Math.min(now - it.then, 50);
      const seconds = elapsed / 1000;
      it.then = now;
      if (it.dragging && now - it.last.at > STILL_AFTER_MS) it.speed = { x: 0, y: 0 };

      // Let go while moving: on it goes, slowing, and what drives the body is the glide.
      if (!it.dragging && Math.hypot(it.thrown.x, it.thrown.y) > 0) {
        glideRef.current(it.ids, it.thrown.x * elapsed, it.thrown.y * elapsed);
        const kept = Math.exp(-FRICTION * seconds);
        it.thrown = { x: it.thrown.x * kept, y: it.thrown.y * kept };
        if (Math.hypot(it.thrown.x, it.thrown.y) < STOPPED) it.thrown = { x: 0, y: 0 };
        it.speed = it.thrown;
      }

      const toward = (speed: number) => Math.max(-MOST_LAG, Math.min(MOST_LAG, -speed * LAG_PER_SPEED));
      for (const axis of ['x', 'y'] as const) {
        it.moving[axis] += (STIFFNESS * (toward(it.speed[axis]) - it.lag[axis]) - DAMPING * it.moving[axis]) * seconds;
        it.lag[axis] += it.moving[axis] * seconds;
      }
      const still = it.speed.x === 0 && it.speed.y === 0;
      const resting = still && Math.hypot(it.lag.x, it.lag.y) < 0.02 && Math.hypot(it.moving.x, it.moving.y) < 0.02;
      if (resting) {
        it.lag = { x: 0, y: 0 };
        it.moving = { x: 0, y: 0 };
      }
      write();
      if (!it.dragging && resting) {
        it.frame = 0;
        mark(false);
        restRef.current(it.ids);
        return;
      }
      it.frame = requestAnimationFrame(step);
    },
    [write, mark],
  );

  useEffect(() => () => cancelAnimationFrame(held.current.frame), []);

  return {
    start: useCallback(
      (event: Dragged, ids: readonly string[], own?: HTMLElement) => {
        const it = held.current;
        it.effect = currentDragEffect();
        if (it.effect === 'off') return;
        // A drag that starts while the last one still glides or wobbles takes over from it.
        if (it.frame !== 0) mark(false);
        it.own = own !== undefined;
        it.host = own ?? ((event.target as Element | null)?.closest('.react-flow') as HTMLElement | null);
        it.dragging = true;
        it.ids = ids;
        mark(true);
        it.thrown = { x: 0, y: 0 };
        it.last = { ...pointOf(event), at: performance.now() };
        it.speed = { x: 0, y: 0 };
        if (it.frame === 0) {
          it.then = performance.now();
          it.frame = requestAnimationFrame(step);
        }
      },
      [step, mark],
    ),
    move: useCallback((event: Dragged) => {
      const it = held.current;
      if (!it.dragging) return;
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
      const it = held.current;
      if (!it.dragging) {
        // Nothing was moved this way: the lines are let go at once.
        restRef.current(it.ids);
        return;
      }
      it.dragging = false;
      // Jelly without the slide stops where it is put, and only its body carries on - as a label always does.
      if (it.effect !== 'slide' || it.own) {
        it.speed = { x: 0, y: 0 };
        it.thrown = { x: 0, y: 0 };
        return;
      }
      // Thrown only if it was still moving when let go.
      const fresh = performance.now() - it.last.at <= STILL_AFTER_MS;
      const speed = Math.hypot(it.speed.x, it.speed.y);
      const scale = (speed > FASTEST_THROW ? FASTEST_THROW / speed : 1) * THROW_SHARE;
      it.thrown = fresh && speed > STOPPED ? { x: it.speed.x * scale, y: it.speed.y * scale } : { x: 0, y: 0 };
    }, []),
  };
}
