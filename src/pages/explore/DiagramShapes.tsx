import type { DiagramNodeKind } from '../../api/diagrams';

/**
 * How the shapes past the first six are drawn: each an outline in a box a
 * hundred units on a side, stretched to the node. The server draws the same
 * outlines for the picture a chat shows and the exports
 * (`DiagramOutline.kt`), so the two are changed together.
 */
export type Piece = { d: string; open?: boolean } | { cx: number; cy: number; r: number; open?: boolean };

export interface Outline {
  pieces: Piece[];
  /** Where the words go, as percentages of the node's box. */
  inside: { left: number; top: number; right: number; bottom: number };
  /** The polygon a line ends at; none is the node's rectangle. */
  rim?: [number, number][];
  /** Keeps its proportions above its label rather than stretching. */
  icon?: boolean;
}

/** How tall the band under an icon is, for its label, in pixels - the server's `ICON_LABEL`. */
export const ICON_LABEL = 22;

const FULL = { left: 4, top: 4, right: 96, bottom: 96 };

function poly(points: [number, number][]): Piece {
  return { d: `M ${points.map(([x, y]) => `${x} ${y}`).join(' L ')} Z` };
}

const HEXAGON: [number, number][] = [[15, 0], [85, 0], [100, 50], [85, 100], [15, 100], [0, 50]];
const PARALLELOGRAM: [number, number][] = [[15, 0], [100, 0], [85, 100], [0, 100]];
const TRAPEZOID: [number, number][] = [[0, 0], [100, 0], [85, 100], [15, 100]];
const TRIANGLE: [number, number][] = [[50, 0], [100, 100], [0, 100]];

export const OUTLINES: Partial<Record<DiagramNodeKind, Outline>> = {
  database: {
    pieces: [{ d: 'M 0 7.5 C 0 -2.5 100 -2.5 100 7.5 L 100 92.5 C 100 102.5 0 102.5 0 92.5 Z' }, { d: 'M 0 7.5 C 0 17.5 100 17.5 100 7.5', open: true }],
    inside: { left: 4, top: 18, right: 96, bottom: 94 },
    rim: [[0, 7.5], [50, 0], [100, 7.5], [100, 92.5], [50, 100], [0, 92.5]],
  },
  document: {
    pieces: [{ d: 'M 0 0 L 100 0 L 100 85 C 70 70 35 105 0 88 Z' }],
    inside: { left: 4, top: 4, right: 96, bottom: 80 },
    rim: [[0, 0], [100, 0], [100, 85], [50, 90], [0, 88]],
  },
  hexagon: { pieces: [poly(HEXAGON)], inside: { left: 16, top: 4, right: 84, bottom: 96 }, rim: HEXAGON },
  parallelogram: { pieces: [poly(PARALLELOGRAM)], inside: { left: 17, top: 4, right: 83, bottom: 96 }, rim: PARALLELOGRAM },
  trapezoid: { pieces: [poly(TRAPEZOID)], inside: { left: 17, top: 4, right: 83, bottom: 96 }, rim: TRAPEZOID },
  triangle: { pieces: [poly(TRIANGLE)], inside: { left: 18, top: 45, right: 82, bottom: 96 }, rim: TRIANGLE },
  cloud: {
    pieces: [{ d: 'M 25 85 C 5 85 0 60 15 52 C 5 35 25 15 42 25 C 50 5 80 5 85 28 C 100 30 105 55 90 65 C 100 80 85 95 70 88 C 60 100 35 100 25 85 Z' }],
    inside: { left: 18, top: 30, right: 82, bottom: 84 },
    rim: [[25, 85], [6, 70], [15, 52], [18, 30], [42, 25], [62, 9], [85, 28], [98, 45], [90, 65], [90, 84], [70, 88], [47, 96]],
  },
  component: {
    pieces: [poly([[10, 0], [100, 0], [100, 100], [10, 100]]), poly([[0, 20], [20, 20], [20, 35], [0, 35]]), poly([[0, 55], [20, 55], [20, 70], [0, 70]])],
    inside: { left: 22, top: 4, right: 96, bottom: 96 },
    rim: [[10, 0], [100, 0], [100, 100], [10, 100]],
  },
  package: {
    pieces: [poly([[0, 0], [40, 0], [40, 15], [0, 15]]), poly([[0, 15], [100, 15], [100, 100], [0, 100]])],
    inside: { left: 4, top: 19, right: 96, bottom: 96 },
    rim: [[0, 0], [40, 0], [40, 15], [100, 15], [100, 100], [0, 100]],
  },
  device: {
    pieces: [poly([[0, 12], [88, 12], [88, 100], [0, 100]]), poly([[0, 12], [12, 0], [100, 0], [88, 12]]), poly([[88, 12], [100, 0], [100, 88], [88, 100]])],
    inside: { left: 4, top: 16, right: 84, bottom: 96 },
    rim: [[0, 12], [12, 0], [100, 0], [100, 88], [88, 100], [0, 100]],
  },
  class: { pieces: [poly([[0, 0], [100, 0], [100, 100], [0, 100]])], inside: FULL },
  actor: {
    pieces: [{ cx: 50, cy: 14, r: 11 }, { d: 'M 50 25 L 50 62 M 22 38 L 78 38 M 50 62 L 26 96 M 50 62 L 74 96', open: true }],
    inside: FULL,
    icon: true,
  },
  interface: { pieces: [{ cx: 50, cy: 50, r: 30 }], inside: FULL, icon: true },
  boundary: { pieces: [{ cx: 60, cy: 50, r: 32 }, { d: 'M 8 18 L 8 82 M 8 50 L 28 50', open: true }], inside: FULL, icon: true },
  control: { pieces: [{ cx: 50, cy: 55, r: 35 }, { d: 'M 58 11 L 47 20 L 58 29', open: true }], inside: FULL, icon: true },
  entity: { pieces: [{ cx: 50, cy: 45, r: 35 }, { d: 'M 15 88 L 85 88', open: true }], inside: FULL, icon: true },
};

/**
 * A class's label as its compartments: the first line is the name, and a line
 * of just `--` starts the next one - attributes, then operations.
 */
export function compartments(label: string): string[][] {
  const lines = label.replace(/\r\n/g, '\n').split('\n');
  const rest = lines.slice(1);
  if (rest.length === 0) return [[lines[0]]];
  const parts: string[][] = [[]];
  for (const line of rest) {
    if (line.trim() === '--') parts.push([]);
    else parts[parts.length - 1].push(line);
  }
  if (parts[0].length === 0 && rest[0].trim() === '--') parts.shift();
  return [[lines[0]], ...parts];
}

/** The outline's strokes, in its hundred-unit box. [fill] colours what is closed. */
export function OutlinePieces({ outline, fill, className }: { outline: Outline; fill?: string; className?: string }) {
  return (
    <>
      {outline.pieces.map((piece, at) =>
        'd' in piece ? (
          <path key={at} d={piece.d} className={className} style={piece.open ? { fill: 'none' } : fill ? { fill } : undefined} />
        ) : (
          <circle key={at} cx={piece.cx} cy={piece.cy} r={piece.r} className={className} style={piece.open ? { fill: 'none' } : fill ? { fill } : undefined} />
        ),
      )}
    </>
  );
}

/** A shape drawn small, for a button: the outline itself, so the menu shows what it adds. */
export function ShapeIcon({ kind }: { kind: DiagramNodeKind }) {
  const outline = OUTLINES[kind];
  if (outline === undefined) return null;
  return (
    <svg width={16} height={16} viewBox="-6 -6 112 112" aria-hidden="true" preserveAspectRatio={outline.icon ? 'xMidYMid meet' : 'none'}>
      <g fill="none" stroke="currentColor" strokeWidth={9} strokeLinejoin="round" strokeLinecap="round">
        <OutlinePieces outline={outline} />
      </g>
    </svg>
  );
}

/**
 * Where a line from the centre of a node towards (tx, ty) leaves the outline a
 * person sees: the rim polygon of a shape that has one, a diamond's and an
 * ellipse's own; and the box for the rest.
 */
export function rimBorder(kind: DiagramNodeKind | undefined, box: { cx: number; cy: number; hw: number; hh: number }, tx: number, ty: number): { x: number; y: number } | null {
  const dx = tx - box.cx;
  const dy = ty - box.cy;
  if (dx === 0 && dy === 0) return null;
  if (kind === 'ellipse') {
    const t = 1 / Math.sqrt((dx * dx) / (box.hw * box.hw) + (dy * dy) / (box.hh * box.hh));
    return { x: box.cx + dx * t, y: box.cy + dy * t };
  }
  const outline = kind === undefined ? undefined : OUTLINES[kind];
  const rim: [number, number][] | undefined = kind === 'diamond' ? [[50, 0], [100, 50], [50, 100], [0, 50]] : outline?.icon ? undefined : outline?.rim;
  if (rim === undefined) return null;
  const left = box.cx - box.hw;
  const top = box.cy - box.hh;
  const points = rim.map(([u, v]) => [left + (u * box.hw * 2) / 100, top + (v * box.hh * 2) / 100]);
  let nearest = Infinity;
  points.forEach(([ax, ay], at) => {
    const [bx, by] = points[(at + 1) % points.length];
    const ex = bx - ax;
    const ey = by - ay;
    const det = dx * -ey - dy * -ex;
    if (Math.abs(det) < 1e-9) return;
    const px = ax - box.cx;
    const py = ay - box.cy;
    const t = (px * -ey - py * -ex) / det;
    const s = (dx * py - dy * px) / det;
    if (t > 0 && s >= -1e-9 && s <= 1 + 1e-9 && t < nearest) nearest = t;
  });
  return nearest === Infinity ? null : { x: box.cx + dx * nearest, y: box.cy + dy * nearest };
}
