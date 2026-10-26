import type { DiagramRouting } from '../../api/diagrams';

/** A node's centre and half sizes, in the canvas's coordinates. */
export type RouteBox = { cx: number; cy: number; hw: number; hh: number };

/** Where a line from a box's centre towards (tx, ty) leaves the box's outline. */
export type Leave = (box: RouteBox, tx: number, ty: number) => { x: number; y: number };

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
export function routeOf(a: RouteBox, b: RouteBox, routing: DiagramRouting, leave: Leave): { d: string; label: { x: number; y: number } } {
  if (routing === 'straight') {
    const start = leave(a, b.cx, b.cy);
    const end = leave(b, a.cx, a.cy);
    return { d: `M ${start.x},${start.y} L ${end.x},${end.y}`, label: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 } };
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
    const d =
      routing === 'right-angles'
        ? Math.abs(s.y - e.y) < 0.5
          ? `M ${s.x},${s.y} L ${e.x},${e.y}`
          : `M ${s.x},${s.y} L ${mx},${s.y} L ${mx},${e.y} L ${e.x},${e.y}`
        : `M ${s.x},${s.y} C ${mx},${s.y} ${mx},${e.y} ${e.x},${e.y}`;
    return { d, label: { x: mx, y: (s.y + e.y) / 2 } };
  }
  const toward = b.cy >= a.cy ? 1 : -1;
  const s = leave(a, a.cx, a.cy + toward * far);
  const e = leave(b, b.cx, b.cy - toward * far);
  const my = (s.y + e.y) / 2;
  const d =
    routing === 'right-angles'
      ? Math.abs(s.x - e.x) < 0.5
        ? `M ${s.x},${s.y} L ${e.x},${e.y}`
        : `M ${s.x},${s.y} L ${s.x},${my} L ${e.x},${my} L ${e.x},${e.y}`
      : `M ${s.x},${s.y} C ${s.x},${my} ${e.x},${my} ${e.x},${e.y}`;
  return { d, label: { x: (s.x + e.x) / 2, y: my } };
}
