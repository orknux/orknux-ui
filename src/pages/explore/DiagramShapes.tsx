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

const TRIANGLE: [number, number][] = [[50, 0], [100, 100], [0, 100]];

/*
 * The features that run across a shape, in the hundred-unit box of a square
 * node, and how many of the node's heights each may be at most - the server's
 * `DiagramOutline`. Stretched with the width alone, a hexagon a thousand
 * pixels wide had slants of a hundred and fifty; so each is the smaller of the
 * two, and a wide shape stays a box with small features at its sides.
 */
const SLANT = 15;
const SLANT_HEIGHTS = 0.4;
const TABS = 20;
const TABS_HEIGHTS = 0.35;
const TAB = 40;
const TAB_HEIGHTS = 1.2;
const DEPTH = 12;

function hexagon(s: number): Outline {
  const rim: [number, number][] = [[s, 0], [100 - s, 0], [100, 50], [100 - s, 100], [s, 100], [0, 50]];
  return { pieces: [poly(rim)], inside: { left: s + 1, top: 4, right: 99 - s, bottom: 96 }, rim };
}

function slanted(rim: [number, number][], s: number): Outline {
  return { pieces: [poly(rim)], inside: { left: s + 2, top: 4, right: 98 - s, bottom: 96 }, rim };
}

const parallelogram = (s: number) => slanted([[s, 0], [100, 0], [100 - s, 100], [0, 100]], s);
const trapezoid = (s: number) => slanted([[0, 0], [100, 0], [100 - s, 100], [s, 100]], s);

function component(tab: number): Outline {
  const body = tab / 2;
  return {
    pieces: [poly([[body, 0], [100, 0], [100, 100], [body, 100]]), poly([[0, 20], [tab, 20], [tab, 35], [0, 35]]), poly([[0, 55], [tab, 55], [tab, 70], [0, 70]])],
    inside: { left: tab + 2, top: 4, right: 96, bottom: 96 },
    rim: [[body, 0], [100, 0], [100, 100], [body, 100]],
  };
}

function packaged(tab: number): Outline {
  return {
    pieces: [poly([[0, 0], [tab, 0], [tab, 15], [0, 15]]), poly([[0, 15], [100, 15], [100, 100], [0, 100]])],
    inside: { left: 4, top: 19, right: 96, bottom: 96 },
    rim: [[0, 0], [tab, 0], [tab, 15], [100, 15], [100, 100], [0, 100]],
  };
}

/** A box seen from a corner: `d` across, as deep as the 12 units it is down, in pixels. */
function device(d: number): Outline {
  const far = 100 - d;
  return {
    pieces: [poly([[0, 12], [far, 12], [far, 100], [0, 100]]), poly([[0, 12], [d, 0], [100, 0], [far, 12]]), poly([[far, 12], [100, 0], [100, 88], [far, 100]])],
    inside: { left: 4, top: 16, right: far - 4, bottom: 96 },
    rim: [[0, 12], [d, 0], [100, 0], [100, 88], [far, 100], [0, 100]],
  };
}

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
  hexagon: hexagon(SLANT),
  parallelogram: parallelogram(SLANT),
  trapezoid: trapezoid(SLANT),
  triangle: { pieces: [poly(TRIANGLE)], inside: { left: 18, top: 45, right: 82, bottom: 96 }, rim: TRIANGLE },
  cloud: {
    pieces: [{ d: 'M 25 85 C 5 85 0 60 15 52 C 5 35 25 15 42 25 C 50 5 80 5 85 28 C 100 30 105 55 90 65 C 100 80 85 95 70 88 C 60 100 35 100 25 85 Z' }],
    inside: { left: 18, top: 30, right: 82, bottom: 84 },
    rim: [[25, 85], [6, 70], [15, 52], [18, 30], [42, 25], [62, 9], [85, 28], [98, 45], [90, 65], [90, 84], [70, 88], [47, 96]],
  },
  component: component(TABS),
  package: packaged(TAB),
  device: device(DEPTH),
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
  subroutine: {
    pieces: [{ d: 'M 0 0 L 100 0 L 100 100 L 0 100 Z' }, { d: 'M 10 0 L 10 100 M 90 0 L 90 100', open: true }],
    inside: { left: 12, top: 4, right: 88, bottom: 96 },
  },
  'manual-input': {
    pieces: [{ d: 'M 0 25 L 100 0 L 100 100 L 0 100 Z' }],
    inside: { left: 4, top: 30, right: 96, bottom: 96 },
    rim: [[0, 25], [100, 0], [100, 100], [0, 100]],
  },
  delay: {
    pieces: [{ d: 'M 0 0 L 60 0 C 105 0 105 100 60 100 L 0 100 Z' }],
    inside: { left: 4, top: 4, right: 84, bottom: 96 },
    rim: [[0, 0], [60, 0], [88, 15], [94, 50], [88, 85], [60, 100], [0, 100]],
  },
  display: {
    pieces: [{ d: 'M 15 0 L 80 0 C 105 0 105 100 80 100 L 15 100 L 0 50 Z' }],
    inside: { left: 16, top: 4, right: 86, bottom: 96 },
    rim: [[15, 0], [80, 0], [96, 25], [100, 50], [96, 75], [80, 100], [15, 100], [0, 50]],
  },
  'off-page': {
    pieces: [{ d: 'M 0 0 L 100 0 L 100 65 L 50 100 L 0 65 Z' }],
    inside: { left: 4, top: 4, right: 96, bottom: 64 },
    rim: [[0, 0], [100, 0], [100, 65], [50, 100], [0, 65]],
  },
  documents: {
    pieces: [{ d: 'M 10 0 L 100 0 L 100 70 L 95 70 L 95 5 L 10 5 Z' }, { d: 'M 5 5 L 95 5 L 95 78 L 90 78 L 90 10 L 5 10 Z' }, { d: 'M 0 10 L 90 10 L 90 88 C 63 75 31 105 0 90 Z' }],
    inside: { left: 4, top: 14, right: 86, bottom: 82 },
    rim: [[0, 10], [10, 0], [100, 0], [100, 70], [90, 80], [90, 88], [45, 92], [0, 90]],
  },
  step: {
    pieces: [{ d: 'M 0 0 L 85 0 L 100 50 L 85 100 L 0 100 L 15 50 Z' }],
    inside: { left: 18, top: 4, right: 84, bottom: 96 },
    rim: [[0, 0], [85, 0], [100, 50], [85, 100], [0, 100], [15, 50]],
  },
  callout: {
    pieces: [{ d: 'M 0 0 L 100 0 L 100 75 L 40 75 L 20 100 L 25 75 L 0 75 Z' }],
    inside: { left: 4, top: 4, right: 96, bottom: 71 },
    rim: [[0, 0], [100, 0], [100, 75], [40, 75], [20, 100], [25, 75], [0, 75]],
  },
  octagon: {
    pieces: [{ d: 'M 30 0 L 70 0 L 100 30 L 100 70 L 70 100 L 30 100 L 0 70 L 0 30 Z' }],
    inside: { left: 10, top: 10, right: 90, bottom: 90 },
    rim: [[30, 0], [70, 0], [100, 30], [100, 70], [70, 100], [30, 100], [0, 70], [0, 30]],
  },
  star: {
    pieces: [{ d: 'M 50 2 L 62.3 35 L 97.6 36.5 L 70 58.5 L 79.4 92.5 L 50 73 L 20.6 92.5 L 30 58.5 L 2.4 36.5 L 37.7 35 Z' }],
    inside: { left: 30, top: 38, right: 70, bottom: 76 },
    rim: [[50, 2], [62.3, 35], [97.6, 36.5], [70, 58.5], [79.4, 92.5], [50, 73], [20.6, 92.5], [30, 58.5], [2.4, 36.5], [37.7, 35]],
  },
  queue: {
    pieces: [{ d: 'M 7.5 0 L 92.5 0 C 102.5 0 102.5 100 92.5 100 L 7.5 100 C -2.5 100 -2.5 0 7.5 0 Z' }, { d: 'M 92.5 0 C 82.5 0 82.5 100 92.5 100', open: true }],
    inside: { left: 6, top: 4, right: 86, bottom: 96 },
    rim: [[7.5, 0], [92.5, 0], [100, 50], [92.5, 100], [7.5, 100], [0, 50]],
  },
  storage: {
    pieces: [{ d: 'M 0 10 C 0 0 100 0 100 10 L 88 95 C 85 102 15 102 12 95 Z' }, { d: 'M 0 10 C 0 20 100 20 100 10', open: true }],
    inside: { left: 12, top: 22, right: 88, bottom: 90 },
    rim: [[0, 10], [50, 3], [100, 10], [88, 95], [50, 100], [12, 95]],
  },
  server: {
    pieces: [{ d: 'M 0 0 L 100 0 L 100 100 L 0 100 Z' }, { d: 'M 0 33 L 100 33 M 0 66 L 100 66', open: true }, { cx: 88, cy: 16, r: 3, open: true }, { cx: 88, cy: 50, r: 3, open: true }, { cx: 88, cy: 83, r: 3, open: true }],
    inside: { left: 4, top: 4, right: 80, bottom: 96 },
  },
  browser: {
    pieces: [{ d: 'M 0 0 L 100 0 L 100 100 L 0 100 Z' }, { d: 'M 0 16 L 100 16', open: true }, { cx: 6, cy: 8, r: 2.5, open: true }, { cx: 12, cy: 8, r: 2.5, open: true }, { cx: 18, cy: 8, r: 2.5, open: true }],
    inside: { left: 4, top: 20, right: 96, bottom: 96 },
  },
  mobile: {
    pieces: [{ d: 'M 12 0 L 88 0 C 95 0 100 5 100 12 L 100 88 C 100 95 95 100 88 100 L 12 100 C 5 100 0 95 0 88 L 0 12 C 0 5 5 0 12 0 Z' }, { d: 'M 40 5 L 60 5 M 42 95 L 58 95', open: true }],
    inside: { left: 6, top: 10, right: 94, bottom: 90 },
  },
};

/**
 * A kind's outline for a node `w` by `h` pixels: the square one, with the
 * features that run across it no wider than their share of the height - the
 * server's `DiagramOutline.of`. Undefined for a kind drawn without one.
 */
export function outlineOf(kind: DiagramNodeKind, w: number, h: number): Outline | undefined {
  const square = OUTLINES[kind];
  if (square === undefined) return undefined;
  const heights = (h / Math.max(w, 1)) * 100;
  const across = (units: number, most: number) => Math.min(units, most * heights);
  switch (kind) {
    case 'hexagon':
      return hexagon(across(SLANT, SLANT_HEIGHTS));
    case 'parallelogram':
      return parallelogram(across(SLANT, SLANT_HEIGHTS));
    case 'trapezoid':
      return trapezoid(across(SLANT, SLANT_HEIGHTS));
    case 'component':
      return component(across(TABS, TABS_HEIGHTS));
    case 'package':
      return packaged(across(TAB, TAB_HEIGHTS));
    case 'device':
      return device(across(DEPTH, DEPTH / 100));
    default:
      return square;
  }
}

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
  return rimBorderFrom(kind, box, box.cx, box.cy, tx, ty);
}

/**
 * Where a ray from (ox, oy), inside the node, towards (tx, ty) leaves the
 * outline a person sees - [rimBorder] is the one from the centre; the
 * server's `DiagramOutline.borderFrom`. A routed line leaves a side away from
 * its middle along such a ray, so a cylinder's side has as many places to
 * leave from as a box's. Null for a shape whose outline is its rectangle.
 */
export function rimBorderFrom(
  kind: DiagramNodeKind | undefined,
  box: { cx: number; cy: number; hw: number; hh: number },
  ox: number,
  oy: number,
  tx: number,
  ty: number,
): { x: number; y: number } | null {
  const dx = tx - ox;
  const dy = ty - oy;
  if (dx === 0 && dy === 0) return null;
  if (kind === 'ellipse') {
    const a = box.hw;
    const b = box.hh;
    const px = ox - box.cx;
    const py = oy - box.cy;
    const qa = (dx * dx) / (a * a) + (dy * dy) / (b * b);
    const qb = 2 * ((px * dx) / (a * a) + (py * dy) / (b * b));
    const qc = (px * px) / (a * a) + (py * py) / (b * b) - 1;
    const root = qb * qb - 4 * qa * qc;
    if (root < 0) return null;
    const t = (-qb + Math.sqrt(root)) / (2 * qa);
    return t > 0 ? { x: ox + dx * t, y: oy + dy * t } : null;
  }
  const outline = kind === undefined ? undefined : outlineOf(kind, box.hw * 2, box.hh * 2);
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
    const px = ax - ox;
    const py = ay - oy;
    const t = (px * -ey - py * -ex) / det;
    const s = (dx * py - dy * px) / det;
    if (t > 0 && s >= -1e-9 && s <= 1 + 1e-9 && t < nearest) nearest = t;
  });
  return nearest === Infinity ? null : { x: ox + dx * nearest, y: oy + dy * nearest };
}
