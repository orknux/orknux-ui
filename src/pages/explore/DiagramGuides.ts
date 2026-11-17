/**
 * Alignment guides: the lines a box being dragged or resized is drawn with when
 * one of its edges or its middle comes level with another box's, and the small
 * pull that brings it exactly level. Arithmetic only, so the editor and its
 * checks can ask it the same question.
 */

/** A box as the drawing keeps it: its upright left, top, width and height. */
export interface GuideBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One guide: a line down the canvas at `at` (axis x) or across it (axis y), drawn between `from` and `to` on the other axis. */
export interface Guide {
  axis: 'x' | 'y';
  at: number;
  from: number;
  to: number;
}

/** Which of a box's three lines on one axis may be brought level: its near edge, its middle, its far edge. */
export type GuideLine = 'start' | 'middle' | 'end';

const ALL: readonly GuideLine[] = ['start', 'middle', 'end'];

/** How far past the boxes it joins a guide is drawn, so it is seen beside them and not only between them. */
const OVERHANG = 12;

/** How near two lines are to count as level. Half a pixel: a middle falls on a half where a size is odd. */
const LEVEL = 0.5;

function linesOf(start: number, size: number): Record<GuideLine, number> {
  return { start, middle: start + size / 2, end: start + size };
}

/** The pull on one axis: how far the moving box's nearest line is from the nearest line of any other, within reach. */
function pull(moving: Record<GuideLine, number>, lines: readonly GuideLine[], others: Record<GuideLine, number>[], reach: number): number | null {
  let best: number | null = null;
  for (const line of lines) {
    for (const other of others) {
      for (const theirs of ALL) {
        const off = other[theirs] - moving[line];
        if (Math.abs(off) <= reach && (best === null || Math.abs(off) < Math.abs(best))) best = off;
      }
    }
  }
  return best;
}

export interface Aligned {
  /** How far to move the box - or the edge being resized - to bring it level; 0 where nothing is within reach. */
  dx: number;
  dy: number;
  /** The lines to draw, for the box once it has been moved by that much. */
  guides: Guide[];
}

/**
 * Brings [moving] level with the nearest of [others] on each axis, where one is
 * within [reach], and says which guides to draw.
 *
 * [across] and [down] name the lines of the moving box that may be pulled: all
 * three for a box being dragged, and only the edge under the pointer for one
 * being resized - there the answer moves that edge and leaves the opposite one
 * where it is, so `resized` says what the box becomes.
 */
export function alignTo(
  moving: GuideBox,
  others: GuideBox[],
  reach: number,
  across: readonly GuideLine[] = ALL,
  down: readonly GuideLine[] = ALL,
  resized = false,
): Aligned {
  const theirsAcross = others.map((one) => linesOf(one.x, one.w));
  const theirsDown = others.map((one) => linesOf(one.y, one.h));
  // Whole pixels: the drawing keeps whole numbers, and a middle half a pixel off is level enough to say so.
  const dx = across.length === 0 ? 0 : Math.round(pull(linesOf(moving.x, moving.w), across, theirsAcross, reach) ?? 0);
  const dy = down.length === 0 ? 0 : Math.round(pull(linesOf(moving.y, moving.h), down, theirsDown, reach) ?? 0);
  const settled = resized ? stretched(moving, dx, dy, across, down) : { ...moving, x: moving.x + dx, y: moving.y + dy };
  const guides: Guide[] = [];
  const mineAcross = linesOf(settled.x, settled.w);
  const mineDown = linesOf(settled.y, settled.h);
  for (const line of across) {
    const at = mineAcross[line];
    const level = others.filter((_, index) => ALL.some((theirs) => Math.abs(theirsAcross[index][theirs] - at) <= LEVEL));
    if (level.length === 0 || guides.some((one) => one.axis === 'x' && Math.abs(one.at - at) <= LEVEL)) continue;
    guides.push({
      axis: 'x',
      at,
      from: Math.min(settled.y, ...level.map((one) => one.y)) - OVERHANG,
      to: Math.max(settled.y + settled.h, ...level.map((one) => one.y + one.h)) + OVERHANG,
    });
  }
  for (const line of down) {
    const at = mineDown[line];
    const level = others.filter((_, index) => ALL.some((theirs) => Math.abs(theirsDown[index][theirs] - at) <= LEVEL));
    if (level.length === 0 || guides.some((one) => one.axis === 'y' && Math.abs(one.at - at) <= LEVEL)) continue;
    guides.push({
      axis: 'y',
      at,
      from: Math.min(settled.x, ...level.map((one) => one.x)) - OVERHANG,
      to: Math.max(settled.x + settled.w, ...level.map((one) => one.x + one.w)) + OVERHANG,
    });
  }
  return { dx, dy, guides };
}

/** A box with the one edge being resized moved by (dx, dy), and the opposite edge left where it was. */
export function stretched(box: GuideBox, dx: number, dy: number, across: readonly GuideLine[], down: readonly GuideLine[]): GuideBox {
  const next = { ...box };
  if (across.includes('start')) {
    next.x += dx;
    next.w -= dx;
  } else if (across.includes('end')) {
    next.w += dx;
  }
  if (down.includes('start')) {
    next.y += dy;
    next.h -= dy;
  } else if (down.includes('end')) {
    next.h += dy;
  }
  return next;
}

/** The smallest box that holds all of these; null for none. */
export function boundsOf(boxes: GuideBox[]): GuideBox | null {
  if (boxes.length === 0) return null;
  const left = Math.min(...boxes.map((one) => one.x));
  const top = Math.min(...boxes.map((one) => one.y));
  const right = Math.max(...boxes.map((one) => one.x + one.w));
  const bottom = Math.max(...boxes.map((one) => one.y + one.h));
  return { x: left, y: top, w: right - left, h: bottom - top };
}
