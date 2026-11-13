import type { DiagramRouting } from '../../api/diagrams';

/**
 * A node's centre and half sizes, in the canvas's coordinates - those of the
 * box it was turned from - and how far it is turned about that centre, in
 * degrees clockwise, where it is.
 */
export type RouteBox = { cx: number; cy: number; hw: number; hh: number; turn?: number };

/** (dx, dy) turned [degrees] clockwise, as the screen has it with y running down. The server's `DiagramOutline.turned`. */
export function turned(dx: number, dy: number, degrees: number): [number, number] {
  const angle = (degrees * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [dx * cos - dy * sin, dx * sin + dy * cos];
}

/** Where a line from a box's centre towards (tx, ty) leaves the box's outline. */
export type Leave = (box: RouteBox, tx: number, ty: number) => { x: number; y: number };

export type Point = { x: number; y: number };

/**
 * A drawn line: its path, where its label sits, and - for a line made of
 * straight runs, straight or right angles - its corners, start to end. A curve
 * has none: it neither jumps nor is jumped.
 */
export type Route = { d: string; label: Point; points?: Point[] };

/**
 * The way a line runs between two boxes, as a path and the point its label
 * sits on - the server's `DiagramRoute`, so the editor and the pictures
 * exported from it agree.
 *
 * Straight runs outline to outline along the line between the centres, as
 * every line did before there was a choice. Right angles and curved leave from
 * a side and arrive at a side - the pair facing each other across the wider of
 * the two gaps between the boxes - so boxes side by side are joined across and
 * boxes stacked are joined down; right angles turns once in the middle of that
 * gap, and curved bends through it.
 */
export function routeOf(a: RouteBox, b: RouteBox, routing: DiagramRouting, leave: Leave): Route {
  if (routing === 'straight') {
    const start = leave(a, b.cx, b.cy);
    const end = leave(b, a.cx, a.cy);
    return { d: `M ${start.x},${start.y} L ${end.x},${end.y}`, label: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }, points: [start, end] };
  }
  const across = Math.max(b.cx - b.hw - (a.cx + a.hw), a.cx - a.hw - (b.cx + b.hw));
  const down = Math.max(b.cy - b.hh - (a.cy + a.hh), a.cy - a.hh - (b.cy + b.hh));
  // Far out along the axis, so the outline's own edge on that side is where the line leaves it.
  const far = 1_000_000;
  if (across >= down) {
    const toward = b.cx >= a.cx ? 1 : -1;
    const s = leave(a, a.cx + toward * far, a.cy);
    const e = leave(b, b.cx - toward * far, b.cy);
    const mx = (s.x + e.x) / 2;
    const points =
      routing !== 'right-angles' ? undefined : Math.abs(s.y - e.y) < 0.5 ? [s, e] : [s, { x: mx, y: s.y }, { x: mx, y: e.y }, e];
    const d = points !== undefined ? pathOf(points, []) : `M ${s.x},${s.y} C ${mx},${s.y} ${mx},${e.y} ${e.x},${e.y}`;
    return { d, label: { x: mx, y: (s.y + e.y) / 2 }, points };
  }
  const toward = b.cy >= a.cy ? 1 : -1;
  const s = leave(a, a.cx, a.cy + toward * far);
  const e = leave(b, b.cx, b.cy - toward * far);
  const my = (s.y + e.y) / 2;
  const points =
    routing !== 'right-angles' ? undefined : Math.abs(s.x - e.x) < 0.5 ? [s, e] : [s, { x: s.x, y: my }, { x: e.x, y: my }, e];
  const d = points !== undefined ? pathOf(points, []) : `M ${s.x},${s.y} C ${s.x},${my} ${e.x},${my} ${e.x},${e.y}`;
  return { d, label: { x: (s.x + e.x) / 2, y: my }, points };
}

/** How far a jump reaches either side of the line it crosses: half its width. The server's `DiagramRoute.HOP`. */
export const HOP = 5;

/** How far along a-b the segment c-d crosses it, where it does inside both; null where it does not. */
function crossing(a: Point, b: Point, c: Point, d: Point): number | null {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = d.x - c.x;
  const sy = d.y - c.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den;
  const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den;
  if (t <= 0 || t >= 1 || u <= 0 || u >= 1) return null;
  return t * Math.hypot(rx, ry);
}

/** How round a right-angle line's corners are: the radius, less where a run is too short for it. The server's `DiagramRoute.CORNER`. */
export const CORNER = 10;

/**
 * [points] as a path: straight runs, each corner rounded, and a hop over every
 * line in [under] the runs cross - the server's `DiagramRoute.path`, so the
 * editor and the exported pictures agree.
 *
 * A corner is a quarter turn drawn as a curve of [corner], or less where a run
 * is shorter than two of them, so a line turning in a narrow gap still turns.
 * Where two lines cross, the one drawn later - on top - lifts over the other
 * in a half circle, so a crossing reads as two lines passing and not as a
 * junction. A hop is never put at a line's end, on a corner, nor over another:
 * a crossing that close is drawn straight through.
 */
export function pathOf(points: Point[], under: Point[][], hop: number = HOP, corner: number = CORNER): string {
  const lengths = points.slice(1).map((b, at) => Math.hypot(b.x - points[at].x, b.y - points[at].y));
  // Each corner's radius: what fits in half of each run beside it.
  const radius = points.map((_, at) =>
    at === 0 || at === points.length - 1 ? 0 : Math.min(corner, lengths[at - 1] / 2, lengths[at] / 2),
  );
  let d = `M ${points[0].x},${points[0].y}`;
  for (let at = 1; at < points.length; at++) {
    const a = points[at - 1];
    const b = points[at];
    const length = lengths[at - 1];
    if (length === 0) continue;
    const ux = (b.x - a.x) / length;
    const uy = (b.y - a.y) / length;
    const from = radius[at - 1];
    const to = length - radius[at];
    const across: number[] = [];
    for (const line of under) {
      for (let j = 1; j < line.length; j++) {
        const distance = crossing(a, b, line[j - 1], line[j]);
        if (distance !== null) across.push(distance);
      }
    }
    across.sort((x, y) => x - y);
    let reached = from;
    for (const distance of across) {
      if (distance - hop < reached + 0.5 || distance + hop > to - 0.5) continue;
      const sx = a.x + ux * (distance - hop);
      const sy = a.y + uy * (distance - hop);
      const ex = a.x + ux * (distance + hop);
      const ey = a.y + uy * (distance + hop);
      // Up over a line running across, to the left over one running down.
      const sweep = Math.abs(ux) >= Math.abs(uy) ? (ux > 0 ? 1 : 0) : uy > 0 ? 0 : 1;
      d += ` L ${sx},${sy} A ${hop},${hop} 0 0 ${sweep} ${ex},${ey}`;
      reached = distance + hop;
    }
    if (at === points.length - 1 || radius[at] === 0) {
      d += ` L ${b.x},${b.y}`;
    } else {
      // Up to the corner, round it through its point, and on along the next run.
      const c = points[at + 1];
      const next = lengths[at];
      const r = radius[at];
      d += ` L ${b.x - ux * r},${b.y - uy * r} Q ${b.x},${b.y} ${b.x + ((c.x - b.x) / next) * r},${b.y + ((c.y - b.y) / next) * r}`;
    }
  }
  return d;
}

/**
 * [points] as a path that hops over every line in [under] it crosses - the
 * server's `DiagramRoute.jumped`, so the editor and the exported pictures agree.
 *
 * Where two lines cross, the one drawn later - on top - lifts over the other
 * in a half circle, so a crossing reads as two lines passing and not as a
 * junction. A hop is never put at a line's end, nor over another: a crossing
 * that close is drawn straight through. Null where there is nothing to hop.
 */
export function jumped(points: Point[], under: Point[][], hop: number = HOP): string | null {
  const d = pathOf(points, under, hop);
  return d.includes(' A ') ? d : null;
}

/** Where a ray from (ox, oy) inside a box towards (tx, ty) leaves its outline. */
export type LeaveFrom = (box: RouteBox, ox: number, oy: number, tx: number, ty: number) => Point;

/** How near a side's corner a line may leave a shape. The server's `DiagramRoute.SIDE_INSET`. */
export const SIDE_INSET = 12;

/**
 * Where a line leaves [box] heading for the corner [p], and the turn it adds
 * to get there, if it needs one - the server's `DiagramRoute.leave`. A corner
 * above or below is left from the top or bottom at its own x where the shape is
 * flat; one beside it, from that side at its own y; one at a slant - a box
 * moved since the line was routed - from the side facing it, with a turn.
 */
function leaveToward(box: RouteBox, p: Point, leave: LeaveFrom): { rim: Point; turn?: Point } {
  const left = box.cx - box.hw;
  const right = box.cx + box.hw;
  const top = box.cy - box.hh;
  const bottom = box.cy + box.hh;
  const far = 1_000_000;
  // A turned shape is left from its middle: its sides no longer run along the corner's own x or y.
  const along = (at: number, low: number, high: number, middle: number) =>
    !box.turn && at >= low + SIDE_INSET && at <= high - SIDE_INSET ? at : middle;
  if (p.x >= left && p.x <= right && (p.y < top || p.y > bottom)) {
    const down = p.y > bottom;
    const x = along(p.x, left, right, box.cx);
    // Straight out of the side from that point inside: the outline itself, whatever the shape.
    const rim = leave(box, x, box.cy, x, down ? box.cy + far : box.cy - far);
    return Math.abs(x - p.x) < 1 ? { rim } : { rim, turn: { x, y: p.y } };
  }
  if (p.y >= top && p.y <= bottom && (p.x < left || p.x > right)) {
    const east = p.x > right;
    const y = along(p.y, top, bottom, box.cy);
    const rim = leave(box, box.cx, y, east ? box.cx + far : box.cx - far, y);
    return Math.abs(y - p.y) < 1 ? { rim } : { rim, turn: { x: p.x, y } };
  }
  const dx = p.x - box.cx;
  const dy = p.y - box.cy;
  if (Math.abs(dx) / Math.max(box.hw * 2, 1) >= Math.abs(dy) / Math.max(box.hh * 2, 1)) {
    const rim = leave(box, box.cx, box.cy, dx > 0 ? box.cx + far : box.cx - far, box.cy);
    return { rim, turn: { x: p.x, y: rim.y } };
  }
  const rim = leave(box, box.cx, box.cy, box.cx, dy > 0 ? box.cy + far : box.cy - far);
  return { rim, turn: { x: rim.x, y: p.y } };
}

/** [points] without a repeat or a point in the middle of a straight run. The server's `DiagramRoute.straightened`. */
export function straightened(points: Point[]): Point[] {
  const kept: Point[] = [];
  for (const point of points) {
    const last = kept[kept.length - 1];
    if (last !== undefined && Math.abs(last.x - point.x) < 0.5 && Math.abs(last.y - point.y) < 0.5) continue;
    if (kept.length >= 2) {
      const a = kept[kept.length - 2];
      const b = kept[kept.length - 1];
      const cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
      const onward = (b.x - a.x) * (point.x - b.x) + (b.y - a.y) * (point.y - b.y);
      if (Math.abs(cross) < 0.5 && onward >= 0) kept.pop();
    }
    kept.push(point);
  }
  return kept;
}

/**
 * A right-angle line through its own corners, as `orknux_route_diagram` found
 * them: left from [a] toward the first, through each, into [b] from the last;
 * its label on the middle of its longest run. The server's `DiagramRoute.through`.
 */
export function routeThrough(a: RouteBox, b: RouteBox, corners: [number, number][], leave: LeaveFrom, labelAt?: number): Route {
  const inner = corners.map(([x, y]) => ({ x, y }));
  const out = leaveToward(a, inner[0], leave);
  const into = leaveToward(b, inner[inner.length - 1], leave);
  const points = straightened([out.rim, ...(out.turn ? [out.turn] : []), ...inner, ...(into.turn ? [into.turn] : []), into.rim]);
  let longest = 1;
  let most = -1;
  for (let at = 1; at < points.length; at++) {
    const length = Math.hypot(points[at].x - points[at - 1].x, points[at].y - points[at - 1].y);
    if (length > most) {
      most = length;
      longest = at;
    }
  }
  const p = points[longest - 1];
  const q = points[longest];
  return { d: pathOf(points, []), label: labelAt !== undefined ? along(points, labelAt) : { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }, points };
}

/** The point [share] of the way along [points], by length. The server's `DiagramRoute.along`. */
export function along(points: Point[], share: number): Point {
  const lengths = points.slice(1).map((b, at) => Math.hypot(b.x - points[at].x, b.y - points[at].y));
  let left = lengths.reduce((sum, one) => sum + one, 0) * Math.min(1, Math.max(0, share));
  for (let at = 0; at < lengths.length; at++) {
    if (left <= lengths[at] || at === lengths.length - 1) {
      const part = lengths[at] === 0 ? 0 : Math.min(1, Math.max(0, left / lengths[at]));
      return { x: points[at].x + (points[at + 1].x - points[at].x) * part, y: points[at].y + (points[at + 1].y - points[at].y) * part };
    }
    left -= lengths[at];
  }
  return points[points.length - 1];
}
