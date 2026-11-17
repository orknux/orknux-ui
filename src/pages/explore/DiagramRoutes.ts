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
 * has none: it neither jumps nor is jumped. [mids] are where a straight or
 * curved line can be taken hold of to bend it: the middle of each part of it.
 */
export type Route = { d: string; label: Point; points?: Point[]; mids?: Point[] };

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
 *
 * An end pinned to a side says so in [pinned], as the way out of that side. A
 * curve then leaves square to it before it turns for the other end, and a
 * right-angle line leaves by it and goes round to arrive by the other's -
 * where both used to be drawn as though the ends were pinned nowhere, only
 * starting from those points, so a curve met a top nearly flat and a line from
 * one right side to another ran back along the outline of its own box.
 */
export function routeOf(a: RouteBox, b: RouteBox, routing: DiagramRouting, leave: Leave, pinned: Pinned = {}): Route {
  if (routing === 'straight') {
    const start = leave(a, b.cx, b.cy);
    const end = leave(b, a.cx, a.cy);
    const middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    return { d: `M ${start.x},${start.y} L ${end.x},${end.y}`, label: middle, points: [start, end], mids: [middle] };
  }
  const across = Math.max(b.cx - b.hw - (a.cx + a.hw), a.cx - a.hw - (b.cx + b.hw));
  const down = Math.max(b.cy - b.hh - (a.cy + a.hh), a.cy - a.hh - (b.cy + b.hh));
  // Far out along the axis, so the outline's own edge on that side is where the line leaves it.
  const far = 1_000_000;
  const flat = across >= down;
  const toward = flat ? (b.cx >= a.cx ? 1 : -1) : b.cy >= a.cy ? 1 : -1;
  const s = flat ? leave(a, a.cx + toward * far, a.cy) : leave(a, a.cx, a.cy + toward * far);
  const e = flat ? leave(b, b.cx - toward * far, b.cy) : leave(b, b.cx, b.cy - toward * far);
  const held = pinned.from !== undefined || pinned.to !== undefined;
  if (routing === 'right-angles' && held) {
    // An end pinned nowhere leaves by the side facing the other box, as it does on a line pinned at neither end.
    const out = flat ? { x: toward, y: 0 } : { x: 0, y: toward };
    const points = straightened(
      squared(a, b, s, pinned.from !== undefined ? axisOf(pinned.from) : out, e, pinned.to !== undefined ? axisOf(pinned.to) : { x: -out.x, y: -out.y }),
    );
    return { d: pathOf(points, []), label: longestMiddle(points), points };
  }
  if (flat) {
    const mx = (s.x + e.x) / 2;
    if (routing !== 'right-angles') {
      return curve(s, pinned.from !== undefined ? bend(s, pinned.from, e) : { x: mx, y: s.y }, pinned.to !== undefined ? bend(e, pinned.to, s) : { x: mx, y: e.y }, e);
    }
    const points = Math.abs(s.y - e.y) < 0.5 ? [s, e] : [s, { x: mx, y: s.y }, { x: mx, y: e.y }, e];
    return { d: pathOf(points, []), label: { x: mx, y: (s.y + e.y) / 2 }, points };
  }
  const my = (s.y + e.y) / 2;
  if (routing !== 'right-angles') {
    return curve(s, pinned.from !== undefined ? bend(s, pinned.from, e) : { x: s.x, y: my }, pinned.to !== undefined ? bend(e, pinned.to, s) : { x: e.x, y: my }, e);
  }
  const points = Math.abs(s.x - e.x) < 0.5 ? [s, e] : [s, { x: s.x, y: my }, { x: e.x, y: my }, e];
  return { d: pathOf(points, []), label: { x: (s.x + e.x) / 2, y: my }, points };
}

/** The way out of the side each end is pinned to: a step long, turned with its box. Left out for an end pinned nowhere. */
export type Pinned = { from?: Point; to?: Point };

/** How far out of a pinned side a curve runs before it turns, at the least. The server's `DiagramRoute.BEND`. */
export const BEND = 40;

/** How far out of a pinned side a right-angle line runs before it may turn. The server's `DiagramRoute.STUB`. */
export const STUB = 24;

/** The least room a right-angle line needs ahead of an end to turn there. The server's `DiagramRoute.ROOM`. */
const ROOM = 16;

/**
 * Where a curve bends from an end pinned to a side: straight [out] of that
 * side before it turns for the [other] end, so it meets the side square on -
 * the server's `DiagramRoute.bend`. Half the way there, as an unpinned end
 * goes; never less than [BEND] where there is room for it, and further out for
 * an end that lies behind the side, which the curve has to come round to.
 */
function bend(at: Point, out: Point, other: Point): Point {
  const dx = other.x - at.x;
  const dy = other.y - at.y;
  const gap = Math.hypot(dx, dy);
  const ahead = dx * out.x + dy * out.y;
  const reach = ahead >= 0 ? Math.max(ahead / 2, Math.min(BEND, gap / 2)) : Math.min(gap, BEND + Math.sqrt(-ahead) * 4);
  return { x: at.x + out.x * reach, y: at.y + out.y * reach };
}

/** A curve from one end to the other by way of the two points it bends from; its label half way along it. */
function curve(s: Point, c1: Point, c2: Point, e: Point): Route {
  const middle = halfway(s, c1, c2, e);
  return { d: `M ${s.x},${s.y} C ${c1.x},${c1.y} ${c2.x},${c2.y} ${e.x},${e.y}`, label: middle, mids: [middle] };
}

/** The point half way along a cubic curve. */
function halfway(s: Point, c1: Point, c2: Point, e: Point): Point {
  return { x: (s.x + 3 * c1.x + 3 * c2.x + e.x) / 8, y: (s.y + 3 * c1.y + 3 * c2.y + e.y) / 8 };
}

/**
 * A straight or curved line bent through points of its own - dragged there by
 * hand - the server's `DiagramRoute.bent`, so the editor and the exported
 * pictures agree. Each end leaves its box toward the bend nearest it, or by
 * the side it is pinned to. Straight, it runs bend to bend, its corners
 * rounded as a right-angle line's are; curved, it passes smoothly through
 * every bend, square out of a pinned side as an unbent curve is.
 *
 * The label sits on the middle bend where there is one in the middle, and
 * half way along the middle part where there is not; [labelAt] puts it a
 * share of the way along instead, on a straight line.
 */
export function routeBent(
  a: RouteBox,
  b: RouteBox,
  routing: DiagramRouting,
  bends: [number, number][],
  leave: Leave,
  pinned: Pinned = {},
  labelAt?: number,
): Route {
  const inner = bends.map(([x, y]) => ({ x, y }));
  const start = leave(a, inner[0].x, inner[0].y);
  const end = leave(b, inner[inner.length - 1].x, inner[inner.length - 1].y);
  const all = [start, ...inner, end];
  const middles = all.slice(1).map((one, at) => ({ x: (all[at].x + one.x) / 2, y: (all[at].y + one.y) / 2 }));
  if (routing === 'straight') {
    return { d: pathOf(all, []), label: labelAt !== undefined ? along(all, labelAt) : longestMiddle(all), points: all, mids: middles };
  }
  let d = `M ${start.x},${start.y}`;
  const mids: Point[] = [];
  for (let at = 0; at < all.length - 1; at++) {
    const p = all[at];
    const q = all[at + 1];
    const before = at === 0 ? null : all[at - 1];
    const after = at + 2 < all.length ? all[at + 2] : null;
    // A Catmull-Rom spline through the points, each part a cubic; at an end, square out of a pinned side or a sixth of the way along.
    const c1 =
      before !== null
        ? { x: p.x + (q.x - before.x) / 6, y: p.y + (q.y - before.y) / 6 }
        : pinned.from !== undefined
          ? bend(p, pinned.from, q)
          : { x: p.x + (q.x - p.x) / 6, y: p.y + (q.y - p.y) / 6 };
    const c2 =
      after !== null
        ? { x: q.x - (after.x - p.x) / 6, y: q.y - (after.y - p.y) / 6 }
        : pinned.to !== undefined
          ? bend(q, pinned.to, p)
          : { x: q.x - (q.x - p.x) / 6, y: q.y - (q.y - p.y) / 6 };
    d += ` C ${c1.x},${c1.y} ${c2.x},${c2.y} ${q.x},${q.y}`;
    mids.push(halfway(p, c1, c2, q));
  }
  const parts = all.length - 1;
  return { d, label: parts % 2 === 0 ? all[parts / 2] : mids[(parts - 1) / 2], mids };
}

/** The way out of a side as one of the four ways a right-angle line can run: a turned box's side leaves by the nearest. */
function axisOf(out: Point): Point {
  return Math.abs(out.x) >= Math.abs(out.y) ? { x: out.x < 0 ? -1 : 1, y: 0 } : { x: 0, y: out.y < 0 ? -1 : 1 };
}

/** The middle of a line's longest run, where a label has the most room. */
function longestMiddle(points: Point[]): Point {
  let longest = 1;
  let most = -1;
  for (let at = 1; at < points.length; at++) {
    const length = Math.hypot(points[at].x - points[at - 1].x, points[at].y - points[at - 1].y);
    if (length > most) {
      most = length;
      longest = at;
    }
  }
  return { x: (points[longest - 1].x + points[longest].x) / 2, y: (points[longest - 1].y + points[longest].y) / 2 };
}

const flipped = (point: Point): Point => ({ x: point.y, y: point.x });

/**
 * A right-angle line from [s], leaving the way [dS] points, to [e], which it
 * reaches coming in against [dE] - the server's `DiagramRoute.squared`. Each
 * is one of the four ways along the axes.
 *
 * Two ends that face each other with room between turn once in the middle, as
 * a line pinned nowhere does; two that face away go out a [STUB] each and
 * round between the boxes, or under them where they overlap. Two that leave
 * the same way - right side to right side - run out past the further of the
 * two and come back, round the other box where it stands in the way. And two
 * at right angles meet in one corner where both have room ahead for it, and
 * in three where one does not.
 */
function squared(a: RouteBox, b: RouteBox, s: Point, dS: Point, e: Point, dE: Point): Point[] {
  // Written for a start that leaves across; one that leaves up or down is the same line with x and y exchanged.
  if (dS.x === 0) {
    const turnedBox = (box: RouteBox): RouteBox => ({ cx: box.cy, cy: box.cx, hw: box.hh, hh: box.hw });
    return squared(turnedBox(a), turnedBox(b), flipped(s), flipped(dS), flipped(e), flipped(dE)).map(flipped);
  }
  const s1 = { x: s.x + dS.x * STUB, y: s.y };
  const e1 = { x: e.x + dE.x * STUB, y: e.y + dE.y * STUB };
  if (dE.x === 0) {
    const corner = { x: e.x, y: s.y };
    if ((corner.x - s.x) * dS.x >= ROOM && (corner.y - e.y) * dE.y >= ROOM) return [s, corner, e];
    return [s, s1, { x: s1.x, y: e1.y }, e1, e];
  }
  if (dE.x === -dS.x) {
    if ((e.x - s.x) * dS.x >= ROOM) {
      const mx = (s.x + e.x) / 2;
      return [s, { x: mx, y: s.y }, { x: mx, y: e.y }, e];
    }
    const my = between(a, b);
    return [s, s1, { x: s1.x, y: my }, { x: e1.x, y: my }, e1, e];
  }
  const x = dS.x > 0 ? Math.max(s1.x, e1.x) : Math.min(s1.x, e1.x);
  if (crosses(b, s.y, s.x, x)) {
    const y = around(b, s.y);
    return [s, s1, { x: s1.x, y }, { x, y }, { x, y: e.y }, e];
  }
  if (crosses(a, e.y, e.x, x)) {
    const y = around(a, e.y);
    return [s, { x, y: s.y }, { x, y }, { x: e1.x, y }, e1, e];
  }
  return [s, { x, y: s.y }, { x, y: e.y }, e];
}

/** Whether a run across at [y], between [x1] and [x2], passes through [box]. */
function crosses(box: RouteBox, y: number, x1: number, x2: number): boolean {
  return y > box.cy - box.hh && y < box.cy + box.hh && Math.max(x1, x2) > box.cx - box.hw && Math.min(x1, x2) < box.cx + box.hw;
}

/** The height to pass [box] at, a [STUB] clear of it: over it from a line nearer its top, under it otherwise. */
function around(box: RouteBox, y: number): number {
  return y < box.cy ? box.cy - box.hh - STUB : box.cy + box.hh + STUB;
}

/** The height a line runs at between two boxes it cannot cross straight between: the middle of the gap, or under both where there is none. */
function between(a: RouteBox, b: RouteBox): number {
  if (b.cy - b.hh - (a.cy + a.hh) >= ROOM) return (a.cy + a.hh + b.cy - b.hh) / 2;
  if (a.cy - a.hh - (b.cy + b.hh) >= ROOM) return (b.cy + b.hh + a.cy - a.hh) / 2;
  return Math.max(a.cy + a.hh, b.cy + b.hh) + STUB;
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
