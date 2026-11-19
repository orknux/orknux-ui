import { createContext, memo, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import linkIcon from '../../assets/link.svg';
import type { CSSProperties } from 'react';
import { BaseEdge, Handle, NodeResizer, Position, useReactFlow, useStore, useUpdateNodeInternals } from '@xyflow/react';
import type { Edge, EdgeProps, InternalNode, Node, NodeProps, ReactFlowState } from '@xyflow/react';

import type { DiagramLineStyle, DiagramNodeKind, DiagramRouting, DiagramSide, DiagramTextAlign, DiagramTextValign } from '../../api/diagrams';
import { t, tf } from '../../i18n';
import { pictureUrl } from '../../api/diagrams';
import { dashesOf } from './DiagramLineStyles';
import { along, jumped, pathOf, routeBent, routeOf, routeThrough, shareNearest, straightened, traceOf, turned } from './DiagramRoutes';
import type { Point, Route, RouteBox } from './DiagramRoutes';
import { CodeNode, JiraNode } from './DiagramSourceNodes';
import { Styled, insertedTyped, labelOfTyped, plainOf, selectionIn, showTyped, styledTyped, typedOf, typedOfBox } from './DiagramRichText';
import type { Typed } from './DiagramRichText';
import type { DiagramSource } from '../../api/diagrams';
import { ICON_LABEL, OutlinePieces, compartments, outlineOf, rimBorder, rimBorderFrom } from './DiagramShapes';
import type { Outline } from './DiagramShapes';
import styles from './DiagramEditorPage.module.css';
import type { Guide } from './DiagramGuides';

/** What a node on the canvas carries: what it is, and how it is drawn. */
/** How long one arrowhead takes from a lit line's start to its end, and where along it the three start. */
const FLOW_SECONDS = 4.5;
const FLOW_HEADS = [0, 1 / 3, 2 / 3];

/** Whether the person asked their system for less motion; then a lit line keeps only its moving dash, which CSS also stills. */
function stillWanted(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

export type ShapeData = {
  kind: DiagramNodeKind;
  label: string;
  color?: string;
  /** Whether it has notes, for the mark in its corner. */
  noted: boolean;
  /** What it links to, for the button in its other corner. */
  link?: string;
  /** The picture an image shows: an uploaded one's id, or an address on the web. */
  image?: string;
  /** Its picture still going up: a spinner where it will be. */
  loading?: boolean;
  /** How far it is turned about its middle, in degrees clockwise; left out, upright. */
  rotation?: number;
  /** Where its label sits inside it, across and down; left out, where the shape usually has it. */
  align?: DiagramTextAlign;
  valign?: DiagramTextValign;
  /** How big its words are, in pixels; left out, the size its kind of shape usually writes in. */
  textSize?: number;
  /** Its words sized to fill it rather than drawn at textSize. */
  textFit?: boolean;
  /** What a code or a Jira shape shows, and what it last read; the editor reads, the shape only draws. */
  source?: string;
  read?: DiagramSource;
};

/** The largest and smallest a fitted label is drawn, the text size field's own bounds. */
const FIT_MOST = 96;
const FIT_LEAST = 6;

/**
 * The largest size [label] fills a [width] by [height] room at, wrapped as the export wraps it -
 * the server's `DiagramSvg.fit`, so a fitted label is the same size on the canvas and in a picture.
 */
/** Where the words of a diamond or an ellipse may go, tried in turn - as the export's `fitted` tries them: rectangles inside its sides. */
const FIT_SHARES = [0.3, 0.4, 0.5, 0.6, 0.7];
const FIT_ANGLES = [25, 35, 45, 55, 65].map((degrees) => (degrees * Math.PI) / 180);
const FIT_ROOM = 0.9;

/** The largest size [label] fits at in any of [rooms], and the width of the room it fits largest in. */
export function fittedIn(label: string, rooms: [number, number][]): { size: number; width: number } {
  return rooms.map(([width, height]) => ({ size: fittedSize(label, width, height), width })).reduce((best, one) => (one.size > best.size ? one : best));
}

/** The rooms a shape's fitted words are tried in: its outline's inside, a diamond's or an ellipse's inscribed rectangles, or its box less an inset. */
export function roomsOf(kind: string, w: number, h: number, inside?: { left: number; right: number; top: number; bottom: number }): [number, number][] {
  if (inside !== undefined) return [[((inside.right - inside.left) * w) / 100, ((inside.bottom - inside.top) * h) / 100]];
  if (kind === 'diamond') return FIT_SHARES.map((t) => [Math.floor(w * (1 - t) * FIT_ROOM), Math.floor(h * t * FIT_ROOM)]);
  if (kind === 'ellipse') return FIT_ANGLES.map((a) => [Math.floor(w * Math.cos(a) * FIT_ROOM), Math.floor(h * Math.sin(a) * FIT_ROOM)]);
  return [[w - 16, h - 8]];
}

export function fittedSize(label: string, width: number, height: number): number {
  const words = plainOf(label).trim();
  if (words === '') return 14;
  const parts = words.split(/\s+/);
  for (let size = FIT_MOST; size >= FIT_LEAST; size -= 1) {
    const line = Math.max(size + 2, Math.round((size * 18) / 14));
    const fits = Math.max(1, Math.floor(width / (size * 0.56)));
    if (parts.some((word) => word.length > fits)) continue;
    let lines = 0;
    for (const paragraph of words.split('\n')) {
      let length = 0;
      lines += 1;
      for (const word of paragraph.split(' ').filter((one) => one !== '')) {
        if (length === 0) length = word.length;
        else if (length + 1 + word.length <= fits) length += 1 + word.length;
        else {
          lines += 1;
          length = word.length;
        }
      }
    }
    if (lines * line <= height) return size;
  }
  return FIT_LEAST;
}

const ACROSS = { left: 'flex-start', center: 'center', right: 'flex-end' } as const;
const DOWN = { top: 'flex-start', middle: 'center', bottom: 'flex-end' } as const;

/**
 * Where a label was asked to sit, as the two styles that put it there: the box
 * around the words, which is a row, and the words themselves. Only what was
 * chosen is said, so a shape nobody aligned keeps the place its stylesheet
 * gives it - the middle of a box, the top left of a group.
 */
function seatOf(align: DiagramTextAlign | undefined, valign: DiagramTextValign | undefined, textSize: number | undefined): Seat {
  // The size its words were given, and the line that goes with it - the export's own sum, so a label wraps to the same height there.
  const size: CSSProperties = textSize === undefined ? {} : { fontSize: textSize, lineHeight: `${Math.max(textSize + 2, Math.round((textSize * 18) / 14))}px` };
  return {
    box: {
      ...(align === undefined ? {} : { justifyContent: ACROSS[align] }),
      ...(valign === undefined ? {} : { alignItems: DOWN[valign] }),
    },
    words: { ...(align === undefined ? {} : { textAlign: align }), ...size },
    size,
  };
}

/** Where a label sits and how big it is written: for the box round the words, for words that can be aligned, and for words that cannot. */
type Seat = { box: CSSProperties; words: CSSProperties; size: CSSProperties };

/** What a box's link is, said on its card: the diagram's own name and what it is for, or the address. */
export interface LinkCard {
  name: string;
  where: string;
  excerpt?: string;
  /** A diagram that was deleted since: drawn struck through, and not opened. */
  missing: boolean;
}

/**
 * Follows and describes a box's link, as the editor decides: another diagram
 * opens in this tab under its current name, an address in a new one. As the
 * document editor's links to documents do.
 */
export const LinkOpenContext = createContext<{ open: (link: string) => void; describe: (link: string) => LinkCard }>({
  open: () => {},
  describe: (link) => ({ name: link, where: '', missing: false }),
});

export type ShapeNode = Node<ShapeData, 'shape'>;

/** A connection's line style and words; its two ends arrive as the edge's own markers, none where it carries none. */
export type LinkData = {
  line: DiagramLineStyle;
  label?: string;
  routing?: DiagramRouting;
  /** The side of its source box it is pinned to; left out, the end floats to the side facing the target. */
  fromSide?: DiagramSide;
  /** The side of its target box it is pinned to; left out, the end floats to the side facing the source. */
  toSide?: DiagramSide;
  /** Where along its pinned side each end sits, a share of the side; left out, the middle. */
  fromAt?: number;
  toAt?: number;
  /** Its own corners, where it was routed around the boxes in its way; drawn only in right angles. */
  points?: [number, number][];
  /** Where along it its label sits, where the router moved it. */
  labelAt?: number;
  /** Its own colour and thickness, where it has them. */
  color?: string;
  width?: number;
  /** Whether it runs to or from a selected box, and is lit with it. */
  touched?: boolean;
  /** Which way its arrowheads point - to its target, or back to its source; left out where it points neither way, or both. */
  heading?: 'forward' | 'backward';
};

export type LinkEdge = Edge<LinkData, 'link'>;

/**
 * Colours a node can be given, as stored: `#rrggbb`, which the server holds a
 * colour to. Data rather than style - a person picks one and it is saved - so
 * they live here rather than in the tokens.
 */
/**
 * The colours offered for a shape, a row of pale ones, a row of stronger ones
 * and a row of deep ones - text on any of them is drawn light or dark to suit,
 * here and in the exports. Any other colour comes from the picker after them.
 */
/** How many colours make a row of [SWATCHES]: the first row is all that is shown until more are asked for. */
export const SWATCH_ROW = 9;

export const SWATCHES = [
  '#e4e4e7', '#bfdbfe', '#bbf7d0', '#fef08a', '#fed7aa', '#fecaca', '#e9d5ff', '#fbcfe8', '#a5f3fc',
  '#a1a1aa', '#60a5fa', '#4ade80', '#facc15', '#fb923c', '#f87171', '#a78bfa', '#f472b6', '#22d3ee',
  '#3f3f46', '#1e3a8a', '#14532d', '#713f12', '#7c2d12', '#7f1d1d', '#4c1d95', '#831843', '#164e63',
];

/** How long a label is kept when an older server does not say: its default. */
export const LABEL_MOST = 5000;

/** Which label is being typed over in place, and what becomes of what is typed. */
export interface LabelEditing {
  target: { kind: 'node' | 'edge'; id: string } | null;
  commit: (text: string) => void;
  cancel: () => void;
  /** How long a label is kept on this server; what is typed past it would be trimmed on save. */
  most: number;
}

export const LabelEditingContext = createContext<LabelEditing>({ target: null, commit: () => {}, cancel: () => {}, most: LABEL_MOST });

/** Whether the diagram is being viewed rather than edited: no resizing, no handles to draw a line from. */
export const ViewingContext = createContext(false);

/**
 * A turned shape being resized by one of its corners. React Flow's own resizer
 * moves the sides of an upright box, which is not what a corner of a turned one
 * is, so a turned shape draws its own and tells the editor the box it comes to:
 * its upright box's left, top, width and height, in the canvas's coordinates.
 */
export interface TurnedResize {
  start: () => void;
  to: (id: string, box: { x: number; y: number; w: number; h: number }) => void;
  end: () => void;
}

export const TurnedResizeContext = createContext<TurnedResize>({ start: () => {}, to: () => {}, end: () => {} });

/** Which end of a line: the one it leaves from, or the one it arrives at. */
export type LinkEnd = 'from' | 'to';

/**
 * A line's ends, taken hold of. Each end of a line that is selected, or that
 * the pointer is on, draws a grip, and a grip dragged is that end moved: onto a
 * side of a box it is pinned there, onto a box's middle it floats, onto another
 * box the line is re-pointed. The canvas draws the grips and follows the
 * pointer; the editor, which holds the drawing, says where a drop would land
 * and makes it.
 *
 * React Flow's own reconnect anchors did this before and could not be seen:
 * they have no drawing of their own, they sit under the boxes - so the handle a
 * new line is drawn from was what the pointer met at a line's end - and the one
 * for a floating end is placed at the box's first handle rather than where the
 * line is drawn, which is why a line's start could not be found at all.
 */
export interface LinkEnds {
  /** The line the pointer is on, which shows its grips before it is selected. */
  hovered: string | null;
  /** Where this end, let go of at (x, y), would attach - or null where it would be left as it was. */
  aim: (id: string, end: LinkEnd, x: number, y: number) => Point | null;
  /** This end let go of at (x, y). */
  drop: (id: string, end: LinkEnd, x: number, y: number) => void;
  /** A right-angle line given corners of its own, one of its runs having been dragged aside; none, and it finds its own way again. */
  bend: (id: string, corners: [number, number][]) => void;
  /** Its label slid along it to [share] of the way from its start. */
  slide: (id: string, share: number) => void;
  /** Its label clicked, which selects the line as a click on the line does - or, twice, opens the label to type in. */
  pick: (id: string, typing: boolean) => void;
}

export const LinkEndsContext = createContext<LinkEnds>({ hovered: null, aim: () => null, drop: () => {}, bend: () => {}, slide: () => {}, pick: () => {} });

/** The grid a shape settles on, and a run of a line dragged aside. */
export const GRID = 8;

/** The shortest run of a right-angle line that is given a grip to drag it by. */
const RUN_LEAST = 16;

/** How far, in the screen's pixels, a grip is moved before it counts as a drag and not a click. */
const GRIP_SLACK = 4;

/** How wide the strip along a part between two bends is, to take it hold of; on screen, whatever the zoom. */
const SPAN_REACH = 12;

/** The smallest a shape is resized to, on either side: the editor's own least. */
const LEAST = 24;

const CORNERS = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
] as const;

/** The pointer a corner of a turned shape shows: the arrow nearest the way that corner now points. */
function cornerCursor(sx: number, sy: number, turn: number): string {
  const [dx, dy] = turned(sx, sy, turn);
  const angle = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 180;
  if (angle < 22.5 || angle >= 157.5) return 'ew-resize';
  if (angle < 67.5) return 'nwse-resize';
  if (angle < 112.5) return 'ns-resize';
  return 'nesw-resize';
}

/**
 * The four corners of a turned shape, each dragged with the one opposite it
 * held where it is - on the canvas, not in the box's own numbers, which is the
 * difference from an upright box: the middle moves as the shape grows, so its
 * left and top change with every corner, not only the two on that side.
 */
function TurnedResizer({ id, x, y, width, height, turn, keepRatio }: { id: string; x: number; y: number; width: number; height: number; turn: number; keepRatio: boolean }) {
  const resize = useContext(TurnedResizeContext);
  const flow = useReactFlow();
  const held = useRef<{ fx: number; fy: number; sx: number; sy: number; ratio: number } | null>(null);
  const down = (event: ReactPointerEvent<HTMLSpanElement>, sx: number, sy: number) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    // The corner opposite, where it is drawn: the middle, and half the box turned.
    const [ox, oy] = turned((-sx * width) / 2, (-sy * height) / 2, turn);
    held.current = { fx: x + width / 2 + ox, fy: y + height / 2 + oy, sx, sy, ratio: height > 0 ? width / height : 1 };
    resize.start();
  };
  const move = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const now = held.current;
    if (now === null) return;
    const at = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    // The pointer from the held corner, in the shape's own frame.
    const [vx, vy] = turned(at.x - now.fx, at.y - now.fy, -turn);
    let w = Math.max(LEAST, Math.round(now.sx * vx));
    let h = Math.max(LEAST, Math.round(now.sy * vy));
    if (keepRatio) {
      w = Math.max(w, Math.round(h * now.ratio));
      h = Math.max(LEAST, Math.round(w / now.ratio));
    }
    const [mx, my] = turned((now.sx * w) / 2, (now.sy * h) / 2, turn);
    resize.to(id, { x: Math.round(now.fx + mx - w / 2), y: Math.round(now.fy + my - h / 2), w, h });
  };
  const up = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (held.current === null) return;
    held.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    resize.end();
  };
  return (
    <>
      {CORNERS.map(([sx, sy]) => (
        <span
          key={`${sx}${sy}`}
          // nodrag and nopan: the drag is the corner's, not the box's nor the canvas's.
          className={`${styles.turnedHandle} nodrag nopan`}
          style={{ left: sx < 0 ? 0 : '100%', top: sy < 0 ? 0 : '100%', cursor: cornerCursor(sx, sy, turn) }}
          onPointerDown={(event) => down(event, sx, sy)}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          data-testid="diagram-node-turned-resize"
          data-corner={`${sy < 0 ? 'top' : 'bottom'}-${sx < 0 ? 'left' : 'right'}`}
        />
      ))}
    </>
  );
}

/**
 * A label typed over where it is drawn: a text box over the words, in their
 * font and their centring, sized to the shape, its text selected to type over.
 *
 * Enter puts it down, Shift+Enter starts a new line where a label may have
 * lines, Escape puts the old one back, and leaving it puts it down. Its keys
 * stop here: Delete, the arrows and every shortcut are the box's while it is
 * open, and React Flow is told not to drag, pan or zoom from it.
 */
export function InPlaceLabel({ initial, className, multiline, style }: { initial: string; className: string; multiline: boolean; style?: CSSProperties }) {
  const editing = useContext(LabelEditingContext);
  const box = useRef<HTMLDivElement | null>(null);
  /**
   * The words as typed, a style per character - drawn styled in the box, with
   * the marks they are kept as written only when the label is put down. The
   * box was a textarea, which can only show the marks themselves.
   */
  const typed = useRef<Typed>(typedOf(initial));
  /** Its own undo, since every keystroke redraws the box and the browser's would undo the redraw. */
  const history = useRef<{ typed: Typed; start: number; end: number }[]>([]);
  const ahead = useRef<{ typed: Typed; start: number; end: number }[]>([]);
  /** Set once Enter or Escape has decided, so the blur that follows does not decide again. */
  const done = useRef(false);
  const composing = useRef(false);
  /** Where the styling bar sits: just above the box, on the screen. */
  const [bar, setBar] = useState<{ left: number; top: number } | null>(null);
  useEffect(() => {
    const held = box.current;
    if (held === null) return;
    held.focus();
    showTyped(held, typed.current, 0, typed.current.text.length);
    const rect = held.getBoundingClientRect();
    setBar({ left: rect.left, top: Math.max(4, rect.top - 38) });
  }, []);
  const label = () => labelOfTyped(typed.current).slice(0, editing.most);
  /** [next] put in the box with the selection from [start] to [end], the state before it kept to undo to. */
  const put = (next: Typed, start: number, end = start) => {
    const held = box.current;
    if (held === null) return;
    const was = selectionIn(held) ?? { start, end };
    history.current = [...history.current.slice(-199), { typed: typed.current, start: was.start, end: was.end }];
    ahead.current = [];
    typed.current = next;
    showTyped(held, next, start, end);
  };
  const restyle = (change: { mark: 'bold' | 'italic' | 'underline' | 'strike' } | { color: string }) => {
    const held = box.current;
    if (held === null) return;
    const at = selectionIn(held);
    if (at === null || at.start === at.end) return;
    put(styledTyped(typed.current, at.start, at.end, change), at.start, at.end);
  };
  const insert = (words: string) => {
    const held = box.current;
    if (held === null) return;
    const at = selectionIn(held) ?? { start: typed.current.text.length, end: typed.current.text.length };
    put(insertedTyped(typed.current, at.start, at.end, words), at.start + words.length);
  };
  const step = (from: typeof history, to: typeof history) => {
    const held = box.current;
    const back = from.current[from.current.length - 1];
    if (held === null || back === undefined) return;
    const now = selectionIn(held) ?? { start: 0, end: 0 };
    from.current = from.current.slice(0, -1);
    to.current = [...to.current, { typed: typed.current, start: now.start, end: now.end }];
    typed.current = back.typed;
    showTyped(held, back.typed, back.start, back.end);
  };
  return (
    <>
      <div
        ref={box}
        className={`nodrag nopan nowheel ${className} ${styles.labelEditorRich}`}
        style={style}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline={multiline}
        spellCheck={false}
        onKeyDown={(event) => {
          event.stopPropagation();
          const held = event.ctrlKey || event.metaKey;
          const key = event.key.toLowerCase();
          // The selected words styled, as in any editor: Ctrl+B, Ctrl+I, Ctrl+U, and Ctrl+Shift+X to strike them through.
          if (held && !event.altKey && (key === 'b' || key === 'i' || key === 'u' || (key === 'x' && event.shiftKey))) {
            event.preventDefault();
            restyle({ mark: key === 'b' ? 'bold' : key === 'i' ? 'italic' : key === 'u' ? 'underline' : 'strike' });
            return;
          }
          if (held && !event.altKey && (key === 'z' || key === 'y')) {
            event.preventDefault();
            if (key === 'y' || event.shiftKey) step(ahead, history);
            else step(history, ahead);
            return;
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            done.current = true;
            editing.cancel();
          } else if (event.key === 'Enter') {
            event.preventDefault();
            if (multiline && event.shiftKey) {
              insert('\n');
              return;
            }
            done.current = true;
            editing.commit(label());
          }
        }}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={(event) => {
          composing.current = false;
          const held = event.currentTarget;
          const at = selectionIn(held);
          const next = typedOfBox(held);
          history.current = [...history.current.slice(-199), { typed: typed.current, start: at?.start ?? 0, end: at?.end ?? 0 }];
          typed.current = next;
          showTyped(held, next, at?.start ?? next.text.length);
        }}
        // Whatever the browser did to the box - typed a letter into a span, deleted across two - is read back off it and drawn again, tidily.
        onInput={(event) => {
          if (composing.current) return;
          const held = event.currentTarget;
          const at = selectionIn(held) ?? { start: 0, end: 0 };
          const next = typedOfBox(held);
          history.current = [...history.current.slice(-199), { typed: typed.current, start: at.start, end: at.end }];
          ahead.current = [];
          typed.current = next;
          showTyped(held, next, at.start, at.end);
        }}
        // Pasted words arrive as words, in the style of the ones before them - not as somebody else's markup.
        onPaste={(event) => {
          const words = event.clipboardData.getData('text/plain');
          // An address over selected words is the editor's to make a link of, as in a document: left to it, untouched here.
          const over = box.current === null ? null : selectionIn(box.current);
          if (over !== null && over.start !== over.end && /^(https?:\/\/|mailto:)\S+$/i.test(words.trim())) return;
          event.preventDefault();
          insert(multiline ? words.replace(/\r\n?/g, '\n') : words.replace(/\s*[\r\n]+\s*/g, ' '));
        }}
        onDrop={(event) => event.preventDefault()}
        onDoubleClick={(event) => event.stopPropagation()}
        onBlur={() => {
          if (!done.current) editing.commit(label());
        }}
        aria-label={t('Label')}
        data-testid="diagram-label-editor"
      />
      {bar !== null &&
        createPortal(
          // Pressed without taking the focus from the words, so what is selected stays selected.
          <div className={styles.styleBar} style={{ left: bar.left, top: bar.top }} role="toolbar" aria-label={t('Style the selected words')} onMouseDown={(event) => event.preventDefault()} data-testid="diagram-style-bar">
            {(
              [
                ['bold', 'B', t('Bold'), 'Ctrl+B', { fontWeight: 700 }],
                ['italic', 'I', t('Italic'), 'Ctrl+I', { fontStyle: 'italic' }],
                ['underline', 'U', t('Underline'), 'Ctrl+U', { textDecoration: 'underline' }],
                ['strike', 'S', t('Strikethrough'), 'Ctrl+Shift+X', { textDecoration: 'line-through' }],
              ] as const
            ).map(([mark, letter, name, keys, look]) => (
              <button key={letter} type="button" className={styles.styleBarButton} style={look} onClick={() => restyle({ mark })} title={`${name} (${keys})`} aria-label={name} data-testid={`diagram-style-${letter.toLowerCase()}`}>
                {letter}
              </button>
            ))}
            <span className={styles.styleBarRule} />
            {STYLE_COLOURS.map((colour) => (
              <button
                key={colour}
                type="button"
                className={styles.styleBarColour}
                style={{ background: colour }}
                onClick={() => restyle({ color: colour })}
                title={tf('Colour the selected words {colour}', { colour })}
                aria-label={tf('Colour the selected words {colour}', { colour })}
                data-testid={`diagram-style-colour-${colour.slice(1)}`}
              />
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

/**
 * Where each line drawn now runs, by its id - as the canvas draws it, so a
 * double-click on a line can put its label at the point on it nearest the click.
 */
export const LINE_TRACES = new Map<string, Point[]>();

/** The colours offered for part of a label: the strong ones, which read on a light shape and on paper. */
const STYLE_COLOURS = ['#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#2563eb', '#9333ea'];

/**
 * A box's link, opened by its own button rather than by a click on the box,
 * which selects it and starts a drag - in View and in Edit alike, since
 * following a link changes nothing. Resting on it shows a card saying where it
 * goes, as a link to a document does in a document.
 */
function NodeLink({ link, beside = false }: { link: string; beside?: boolean }) {
  const links = useContext(LinkOpenContext);
  const button = useRef<HTMLButtonElement>(null);
  const waiting = useRef<number | null>(null);
  const [at, setAt] = useState<DOMRect | null>(null);
  const card = links.describe(link);
  const hide = () => {
    if (waiting.current !== null) window.clearTimeout(waiting.current);
    waiting.current = null;
    setAt(null);
  };
  useEffect(() => hide, []);
  return (
    <>
      <button
        ref={button}
        type="button"
        className={`nodrag nopan ${styles.linkMark} ${beside ? styles.linkMarkBeside : ''} ${card.missing ? styles.linkMarkGone : ''}`}
        aria-label={card.missing ? t('This diagram was deleted') : tf('Open {name}', { name: card.name })}
        onPointerDown={(event) => event.stopPropagation()}
        onMouseEnter={() => {
          waiting.current = window.setTimeout(() => {
            const rect = button.current?.getBoundingClientRect();
            if (rect !== undefined) setAt(rect);
          }, 300);
        }}
        onMouseLeave={hide}
        onClick={(event) => {
          event.stopPropagation();
          hide();
          if (!card.missing) links.open(link);
        }}
        data-testid="diagram-node-link"
        data-missing={card.missing ? '' : undefined}
      >
        <img src={linkIcon} alt="" width={12} height={12} data-keeps-colour />
      </button>
      {at !== null &&
        createPortal(
          <span className={styles.linkCard} style={{ left: at.left, top: at.bottom + 6 }} role="tooltip" data-testid="diagram-link-card">
            <span className={`${styles.linkCardName} ${card.missing ? styles.linkCardGone : ''}`}>{card.name}</span>
            <span className={styles.linkCardWhere}>{card.missing ? t('This diagram was deleted') : card.where}</span>
            {card.excerpt !== undefined && card.excerpt !== '' && <span className={styles.linkCardExcerpt}>{card.excerpt}</span>}
          </span>,
          document.body,
        )}
    </>
  );
}

/**
 * A link card: what it leads to, by the name that thing has now, and what
 * kind of thing it is, with a button that opens it - a double click on the
 * card does the same. Its label is only the name it was made with, shown
 * while what it leads to is not known yet, or for a web address.
 */
function LinkCardNode({ link, label, size, textSize, fill, ink }: { link?: string; label: string; size?: CSSProperties; textSize?: number; fill?: string; ink?: string }) {
  // Where it leads is written smaller than its name, in the proportion the card has at the usual size: eleven to fourteen.
  const whereSize = textSize === undefined ? undefined : { fontSize: Math.max(6, Math.round((textSize * 11) / 14)) };
  const links = useContext(LinkOpenContext);
  // Resting on the card shows where it goes, as a box's link button does: what it is, where it is, its first words.
  const root = useRef<HTMLDivElement>(null);
  const waiting = useRef<number | null>(null);
  const [at, setAt] = useState<DOMRect | null>(null);
  const hide = () => {
    if (waiting.current !== null) window.clearTimeout(waiting.current);
    waiting.current = null;
    setAt(null);
  };
  useEffect(() => hide, []);
  const set = link !== undefined && link !== '';
  const card = set ? links.describe(link) : null;
  const web = set && /^(https?:|mailto:)/i.test(link);
  const name = card === null ? t('Not linked yet') : web ? (label !== '' ? label : card.name) : card.missing ? label || card.name : card.name;
  const where = card === null ? t('Choose what it leads to in the side panel') : card.missing ? t('This diagram was deleted') : web ? link.replace(/^https?:\/\//i, '') : card.where;
  return (
    <div
      ref={root}
      className={`${styles.linkNode} ${card?.missing ? styles.linkNodeGone : ''}`}
      // A fill picked for it is its card's, with words that read on it.
      style={fill === undefined ? undefined : { background: fill, color: ink }}
      onMouseEnter={() => {
        if (card === null) return;
        waiting.current = window.setTimeout(() => {
          const rect = root.current?.getBoundingClientRect();
          if (rect !== undefined) setAt(rect);
        }, 300);
      }}
      onMouseLeave={hide}
      onPointerDown={hide}
      data-testid="diagram-node-shape"
      data-kind="link"
    >
      <img className={styles.linkNodeIcon} src={linkIcon} alt="" width={18} height={18} />
      <span className={styles.linkNodeWords}>
        <span className={styles.linkNodeName} style={size} data-testid="diagram-node-label-text">
          {name}
        </span>
        <span className={styles.linkNodeWhere} style={whereSize}>
          {where}
        </span>
      </span>
      {set && card !== null && !card.missing && (
        <button
          type="button"
          className={`nopan ${styles.linkNodeOpen}`}
          // The click goes on to the card, so it is selected as well as opened: its button was the one place on it a click did not select it.
          onClick={() => links.open(link)}
          aria-label={tf('Open {name}', { name })}
          title={tf('Open {name}', { name })}
          data-testid="diagram-node-link"
        >
          ↗
        </button>
      )}
      {at !== null &&
        card !== null &&
        createPortal(
          <span className={styles.linkCard} style={{ left: at.left, top: at.bottom + 6 }} role="tooltip" data-testid="diagram-link-card">
            <span className={`${styles.linkCardName} ${card.missing ? styles.linkCardGone : ''}`}>{name}</span>
            <span className={styles.linkCardWhere}>{card.missing ? t('This diagram was deleted') : web ? link : card.where}</span>
            {card.excerpt !== undefined && card.excerpt !== '' && <span className={styles.linkCardExcerpt}>{card.excerpt}</span>}
          </span>,
          document.body,
        )}
    </div>
  );
}

/**
 * A text element's words, and where it leads a link a click on them opens -
 * as a link in a document does, with no button beside it. A press that moves
 * is a drag of the text, and opens nothing.
 */
function LinkedWords({ link, label, style }: { link?: string; label: string; style?: CSSProperties }) {
  const links = useContext(LinkOpenContext);
  const down = useRef<{ x: number; y: number } | null>(null);
  const linked = link !== undefined && link !== '';
  return (
    <span
      className={`${styles.textNodeWords} ${linked ? styles.textNodeLinked : ''}`}
      style={style}
      title={linked ? links.describe(link).name : undefined}
      onPointerDown={(event) => {
        down.current = { x: event.clientX, y: event.clientY };
      }}
      onClick={(event) => {
        const from = down.current;
        down.current = null;
        if (!linked || from === null || Math.hypot(event.clientX - from.x, event.clientY - from.y) > 4) return;
        event.stopPropagation();
        links.open(link);
      }}
      data-testid="diagram-node-label-text"
      data-linked={linked ? '' : undefined}
    >
      <Styled text={label} />
    </span>
  );
}

/** Whether words on this fill want to be light. */
function dark(fill: string): boolean {
  if (!/^#[0-9a-f]{6}$/i.test(fill)) return false;
  const r = parseInt(fill.slice(1, 3), 16);
  const g = parseInt(fill.slice(3, 5), 16);
  const b = parseInt(fill.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}

/**
 * One box. Its four handles all start and end lines - the canvas joins them
 * loosely - because which side a line leaves from is drawn, not stored: a line
 * runs between the two boxes' edges wherever they are (see [FloatingLink]).
 */
export function ShapeNodeView({ id, data, selected, width, height, positionAbsoluteX, positionAbsoluteY }: NodeProps<ShapeNode>) {
  const editing = useContext(LabelEditingContext);
  const viewing = useContext(ViewingContext);
  const typing = editing.target?.kind === 'node' && editing.target.id === id;
  const filled = data.color !== undefined;
  const style = filled ? { background: data.color, color: dark(data.color as string) ? 'var(--diagram-ink-on-dark)' : 'var(--diagram-ink-on-light)' } : undefined;
  // Fitted to the node's own size, so a wide one keeps small features at its sides.
  const outline = outlineOf(data.kind, width ?? 100, height ?? 100);
  const turn = data.rotation ?? 0;
  // A fitted label's size, in the room the shape leaves for words - its outline's inside, or the box less its inset.
  const fitted = useMemo(
    () => (data.textFit === true ? fittedIn(data.label, roomsOf(data.kind, width ?? 100, height ?? 100, outline?.inside)) : undefined),
    [data.textFit, data.label, data.kind, width, height, outline],
  );
  const placed = seatOf(data.align, data.valign, fitted?.size ?? data.textSize);
  // Fitted inside a diamond or an ellipse, the words are set no wider than the room they were fitted to, or they cross its sides.
  const seat = fitted !== undefined && (data.kind === 'diamond' || data.kind === 'ellipse') ? { ...placed, words: { ...placed.words, maxWidth: fitted.width } } : placed;
  /*
   * React Flow reads where a node's handles are when the node is measured, and
   * a turn changes where they are without changing its size - so it is told,
   * or a line dragged out of a turned box would start where the handle was.
   */
  const remeasure = useUpdateNodeInternals();
  const measuredAt = useRef(turn);
  useEffect(() => {
    // Not on mount: the first measurement is made of the node as it is drawn, turned or not.
    if (measuredAt.current === turn) return;
    measuredAt.current = turn;
    remeasure(id);
  }, [remeasure, id, turn]);
  const drawn = (
    <>
      {data.kind === 'code' ? (
        <CodeNode source={data.source} label={data.label} read={data.read} size={data.textSize} />
      ) : data.kind === 'jira' ? (
        <JiraNode source={data.source} label={data.label} read={data.read} size={data.textSize} fill={data.color} ink={filled ? style?.color : undefined} />
      ) : data.kind === 'link' ? (
        <LinkCardNode link={data.link} label={data.label} size={seat.size} textSize={data.textSize} fill={data.color} ink={filled ? style?.color : undefined} />
      ) : data.kind === 'image' ? (
        <div className={styles.picture} data-testid="diagram-node-shape" data-kind="image">
          {data.loading === true ? (
            <span className={styles.pictureLoading} role="status" aria-label={t('Uploading the picture')} data-testid="diagram-node-picture-loading">
              <span className={styles.pictureSpinner} />
            </span>
          ) : data.image !== undefined && data.image !== '' ? (
            <img className={styles.pictureArt} src={pictureUrl(data.image)} alt={data.label} draggable={false} referrerPolicy="no-referrer" data-testid="diagram-node-picture" />
          ) : (
            <span className={styles.pictureNone}>{t('No picture')}</span>
          )}
          {typing ? (
            <InPlaceLabel initial={data.label} className={`${styles.pictureCaption} ${styles.labelEditor}`} multiline={false} style={seat.size} />
          ) : (
            data.label !== '' && (
              <span className={styles.pictureCaption} style={seat.size} data-testid="diagram-node-label-text">
                <Styled text={data.label} />
              </span>
            )
          )}
        </div>
      ) : outline !== undefined ? (
        <OutlinedShape kind={data.kind} outline={outline} label={data.label} typing={typing} fill={data.color} ink={filled ? style?.color : undefined} seat={seat} />
      ) : data.kind === 'text' ? (
        // Words alone: no box, no outline; a fill, if one was picked, sits behind them.
        <div className={styles.textNode} style={{ ...(filled ? style : {}), ...seat.box }} data-testid="diagram-node-shape" data-kind="text">
          {typing ? (
            <InPlaceLabel initial={data.label} className={`${styles.textNodeWords} ${styles.labelEditor}`} multiline style={seat.words} />
          ) : (
            <LinkedWords link={data.link} label={data.label} style={seat.words} />
          )}
        </div>
      ) : data.kind === 'diamond' ? (
        <div className={styles.shapeDiamondBox} style={seat.box} data-testid="diagram-node-shape" data-kind={data.kind}>
          <svg className={styles.diamond} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <polygon points="50,1 99,50 50,99 1,50" style={filled ? { fill: data.color } : undefined} />
          </svg>
          {typing ? (
            <InPlaceLabel initial={data.label} className={`${styles.shapeLabel} ${styles.labelEditor}`} multiline style={{ ...(filled ? { color: style?.color } : {}), ...seat.words }} />
          ) : (
            <span className={styles.shapeLabel} style={{ ...(filled ? { color: style?.color } : {}), ...seat.words }} data-testid="diagram-node-label-text">
              <Styled text={data.label} />
            </span>
          )}
        </div>
      ) : (
        <div className={`${styles.shape} ${styles[`shape_${data.kind}`] ?? ''}`} style={{ ...style, ...seat.box }} data-testid="diagram-node-shape" data-kind={data.kind}>
          {typing ? (
            <InPlaceLabel initial={data.label} className={`${data.kind === 'group' ? styles.groupLabel : styles.shapeLabel} ${styles.labelEditor}`} multiline style={seat.words} />
          ) : (
            <span className={data.kind === 'group' ? styles.groupLabel : styles.shapeLabel} style={seat.words} data-testid="diagram-node-label-text">
              <Styled text={data.label} />
            </span>
          )}
        </div>
      )}
      {data.noted && <span className={styles.notedMark} title="" aria-hidden="true" data-testid="diagram-node-noted" />}
      {data.kind !== 'link' && data.kind !== 'text' && data.link !== undefined && data.link !== '' && <NodeLink link={data.link} />}
      {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
        <Handle
          key={side}
          id={side}
          type="source"
          position={side === 'top' ? Position.Top : side === 'right' ? Position.Right : side === 'bottom' ? Position.Bottom : Position.Left}
          className={`${styles.handle} ${viewing ? styles.handleViewing : ''}`}
          isConnectable={!viewing}
        />
      ))}
    </>
  );
  if (turn === 0) {
    return (
      <>
        {/* A picture keeps its proportions while it is resized, as one does in any editor. */}
        <NodeResizer isVisible={selected && !viewing} minWidth={LEAST} minHeight={LEAST} keepAspectRatio={data.kind === 'image'} lineClassName={styles.resizeLine} handleClassName={styles.resizeHandle} />
        {drawn}
      </>
    );
  }
  /*
   * Turned: everything the node draws - its shape, its marks, the four handles
   * a line is dragged out of - turns together about its middle, inside the
   * upright box React Flow still places and measures. The corners it is
   * resized by turn with it.
   */
  return (
    <div className={styles.turned} style={{ transform: `rotate(${turn}deg)` }} data-testid="diagram-node-turned" data-rotation={turn}>
      {drawn}
      {selected && !viewing && (
        <TurnedResizer id={id} x={positionAbsoluteX} y={positionAbsoluteY} width={width ?? 100} height={height ?? 100} turn={turn} keepRatio={data.kind === 'image'} />
      )}
    </div>
  );
}

/**
 * A flowchart or UML shape: its outline stretched to the node - or, for an
 * icon, kept square above its label - and its words where the outline keeps
 * them. A class's words are its compartments.
 */
function OutlinedShape({ kind, outline, label, typing, fill, ink, seat }: { kind: DiagramNodeKind; outline: Outline; label: string; typing: boolean; fill?: string; ink?: string; seat: Seat }) {
  const words = (className: string) =>
    typing ? (
      <InPlaceLabel initial={label} className={`${className} ${styles.labelEditor}`} multiline style={{ ...(ink ? { color: ink } : {}), ...seat.words }} />
    ) : (
      <span className={className} style={{ ...(ink ? { color: ink } : {}), ...seat.words }} data-testid="diagram-node-label-text">
        <Styled text={label} />
      </span>
    );
  if (outline.icon) {
    // Under the icon the label keeps its band, so the art is the size it was; bigger words stand out of the band rather than being cut by it.
    const under: CSSProperties | undefined = seat.size.fontSize === undefined ? undefined : { fontSize: seat.size.fontSize, overflow: 'visible' };
    return (
      <div className={styles.shapeIconBox} data-testid="diagram-node-shape" data-kind={kind}>
        <svg className={styles.shapeIconArt} style={{ height: `calc(100% - ${ICON_LABEL}px)` }} viewBox="-2 -2 104 104" preserveAspectRatio="xMidYMid meet" aria-hidden="true" data-testid="diagram-node-outline">
          <OutlinePieces outline={outline} fill={fill} className={styles.outlinePiece} />
        </svg>
        {/* Beneath the icon, on the paper, so it is ink whatever the fill. */}
        {typing ? <InPlaceLabel initial={label} className={`${styles.shapeIconLabel} ${styles.labelEditor}`} multiline={false} style={under} /> : (
          <span className={styles.shapeIconLabel} style={under} data-testid="diagram-node-label-text">
            <Styled text={label} />
          </span>
        )}
      </div>
    );
  }
  const { left, top, right, bottom } = outline.inside;
  return (
    <div className={styles.shapeOutlineBox} data-testid="diagram-node-shape" data-kind={kind}>
      <svg className={styles.diamond} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" data-testid="diagram-node-outline">
        <OutlinePieces outline={outline} fill={fill} className={styles.outlinePiece} />
      </svg>
      {kind === 'class' && !typing ? (
        <div className={styles.classBox} style={{ ...(ink ? { color: ink } : {}), ...seat.size }} data-testid="diagram-node-label-text">
          {compartments(label).map((lines, at) => (
            <div key={at} className={at === 0 ? styles.className : styles.classPart}>
              {lines.map((line, row) => (
                <div key={row}>{line === '' ? ' ' : <Styled text={line} />}</div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.outlineInside} style={{ left: `${left}%`, top: `${top}%`, right: `${100 - right}%`, bottom: `${100 - bottom}%`, ...seat.box }}>
          {words(styles.shapeLabel)}
        </div>
      )}
    </div>
  );
}

/** The centre of a node, and its half sizes, in the canvas's own coordinates. */
function boxOf(node: InternalNode): RouteBox {
  const w = node.measured.width ?? node.width ?? 0;
  const h = node.measured.height ?? node.height ?? 0;
  const turn = (node.data as ShapeData | undefined)?.rotation;
  return { cx: node.internals.positionAbsolute.x + w / 2, cy: node.internals.positionAbsolute.y + h / 2, hw: w / 2, hh: h / 2, ...(turn ? { turn } : {}) };
}

/** Where a ray from (ox, oy) inside this box towards (tx, ty) leaves the box. */
function rectFrom(box: { cx: number; cy: number; hw: number; hh: number }, ox: number, oy: number, tx: number, ty: number): { x: number; y: number } {
  const dx = tx - ox;
  const dy = ty - oy;
  const scale = Math.min(
    dx > 0 ? (box.cx + box.hw - ox) / dx : dx < 0 ? (box.cx - box.hw - ox) / dx : Infinity,
    dy > 0 ? (box.cy + box.hh - oy) / dy : dy < 0 ? (box.cy - box.hh - oy) / dy : Infinity,
  );
  return scale === Infinity ? { x: ox, y: oy } : { x: ox + dx * scale, y: oy + dy * scale };
}

/** Where a line from this box's centre towards (tx, ty) leaves the box. */
function border(box: { cx: number; cy: number; hw: number; hh: number }, tx: number, ty: number): { x: number; y: number } {
  const dx = tx - box.cx;
  const dy = ty - box.cy;
  if (dx === 0 && dy === 0) return { x: box.cx, y: box.cy };
  const scale = Math.min(dx !== 0 ? box.hw / Math.abs(dx) : Infinity, dy !== 0 ? box.hh / Math.abs(dy) : Infinity);
  return { x: box.cx + dx * scale, y: box.cy + dy * scale };
}

/**
 * A connection between the edges of the two boxes it joins - straight, in
 * right angles or curved, as its routing says - read off React Flow's own
 * record of where they are, so it follows a box being dragged and survives
 * the node objects being rebuilt.
 */
/** Far off a pinned side, so the outline's own point on that side is where the end leaves; the floating target otherwise. */
function sideAim(box: { cx: number; cy: number; hw: number; hh: number }, side: DiagramSide | undefined, tx: number, ty: number, at?: number): [number, number] {
  const far = 1_000_000;
  // Part way along the side: toward that point of it, where the outline is met on the ray through it - the server's `DiagramRoute.aim`.
  if (at !== undefined && side !== undefined) {
    const along = at - 0.5;
    if (side === 'top') return [box.cx + along * 2 * box.hw, box.cy - box.hh];
    if (side === 'bottom') return [box.cx + along * 2 * box.hw, box.cy + box.hh];
    if (side === 'left') return [box.cx - box.hw, box.cy + along * 2 * box.hh];
    return [box.cx + box.hw, box.cy + along * 2 * box.hh];
  }
  switch (side) {
    case 'top':
      return [box.cx, box.cy - far];
    case 'bottom':
      return [box.cx, box.cy + far];
    case 'left':
      return [box.cx - far, box.cy];
    case 'right':
      return [box.cx + far, box.cy];
    default:
      return [tx, ty];
  }
}

/** The way a line runs between two drawn boxes, each left by its own outline - or by a side it was pinned to. */
function routeBetween(
  from: InternalNode,
  to: InternalNode,
  routing: DiagramRouting,
  points?: [number, number][],
  labelAt?: number,
  fromSide?: DiagramSide,
  toSide?: DiagramSide,
  fromAt?: number,
  toAt?: number,
): Route {
  const a = boxOf(from);
  const b = boxOf(to);
  const fromKind = (from.data as ShapeData | undefined)?.kind;
  const toKind = (to.data as ShapeData | undefined)?.kind;
  /*
   * A turned shape is met in its own frame - the server's `DiagramOutline.borderFrom`:
   * the way to the target turned back, the upright outline met from its
   * middle, and that point turned forward again.
   */
  const edge = (kind: DiagramNodeKind | undefined, box: typeof a, tx: number, ty: number) => {
    if (!box.turn) return rimBorder(kind, box, tx, ty) ?? border(box, tx, ty);
    const [ux, uy] = turned(tx - box.cx, ty - box.cy, -box.turn);
    if (ux === 0 && uy === 0) return { x: box.cx, y: box.cy };
    const met = rimBorder(kind, box, box.cx + ux, box.cy + uy) ?? border(box, box.cx + ux, box.cy + uy);
    const [rx, ry] = turned(met.x - box.cx, met.y - box.cy, box.turn);
    return { x: box.cx + rx, y: box.cy + ry };
  };
  const leave = (box: typeof a, tx: number, ty: number) => {
    const side = box === a ? fromSide : toSide;
    let [ax, ay] = sideAim(box, side, tx, ty, box === a ? fromAt : toAt);
    // A pinned side turns with its box: the top of one turned a quarter is on its right.
    if (box.turn && side !== undefined) {
      const [sx, sy] = turned(ax - box.cx, ay - box.cy, box.turn);
      ax = box.cx + sx;
      ay = box.cy + sy;
    }
    return edge(box === a ? fromKind : toKind, box, ax, ay);
  };
  if (routing === 'right-angles' && points !== undefined && points.length > 0) {
    // Out of a side from a point inside it: the outline of the shape, or its box where the shape is its box.
    const leaveFrom = (box: typeof a, ox: number, oy: number, tx: number, ty: number) =>
      // A turned shape is left from its middle, the same way.
      box.turn
        ? edge(box === a ? fromKind : toKind, box, box.cx + (tx - ox), box.cy + (ty - oy))
        : (rimBorderFrom(box === a ? fromKind : toKind, box, ox, oy, tx, ty) ?? rectFrom(box, ox, oy, tx, ty));
    return routeThrough(a, b, points, leaveFrom, labelAt);
  }
  // Bent by hand: through its own points, as straight runs or as a curve.
  const drawn =
    points !== undefined && points.length > 0
      ? routeBent(a, b, routing, points, leave, { from: outOf(a, fromSide), to: outOf(b, toSide) }, labelAt)
      : routeOf(a, b, routing, leave, { from: outOf(a, fromSide), to: outOf(b, toSide) });
  // A label moved along the line by hand sits that share of the way along it, whatever the line's shape - the server's `DiagramRoute.of`.
  return labelAt === undefined ? drawn : { ...drawn, label: along(traceOf(drawn), labelAt) };
}

/** The way out of a box through a side an end is pinned to, a step long and turned with the box; nothing for an end pinned nowhere. */
function outOf(box: RouteBox, side: DiagramSide | undefined): Point | undefined {
  if (side === undefined) return undefined;
  const [dx, dy] = side === 'top' ? [0, -1] : side === 'bottom' ? [0, 1] : side === 'left' ? [-1, 0] : [1, 0];
  const [x, y] = box.turn ? turned(dx, dy, box.turn) : [dx, dy];
  return { x, y };
}

/**
 * Where a drawn line starts and where it ends. A line of straight runs has its
 * corners; a curve has only its path, which begins `M x,y` and ends on its last
 * pair of numbers.
 */
function tipsOf(route: Route): [Point, Point] | null {
  if (route.points !== undefined && route.points.length >= 2) return [route.points[0], route.points[route.points.length - 1]];
  const numbers = (route.d.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/gi) ?? []).map(Number);
  if (numbers.length < 4 || numbers.some((one) => !Number.isFinite(one))) return null;
  return [
    { x: numbers[0], y: numbers[1] },
    { x: numbers[numbers.length - 2], y: numbers[numbers.length - 1] },
  ];
}

/** Whether two lists hold the same things in the same places. */
export function sameAll(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a.length !== b.length) return false;
  for (let at = 0; at < a.length; at += 1) if (a[at] !== b[at]) return false;
  return true;
}

/** One line as it is drawn: the way it runs, its path with the hops over the lines under it, and its two ends. */
interface DrawnLine {
  route: Route;
  path: string;
  tips: [Point, Point] | null;
}

/** Every line of one canvas, as last worked out, and what each was worked out from. */
interface DrawnLines {
  state: ReactFlowState;
  order: string[];
  routes: Map<string, { key: readonly unknown[]; route: Route }>;
  lines: Map<string, DrawnLine>;
}

/** Per canvas, by the one map of nodes its store keeps for as long as it lives. */
const drawnLines = new WeakMap<object, DrawnLines>();

/**
 * Every line of the canvas, worked out once for each state of it and handed to
 * each line by its id.
 *
 * A line hops over the straight runs of every line drawn before it - the later
 * line is the one on top - so each one used to route every line before it for
 * itself, on every change to the canvas: on a diagram of a few hundred lines,
 * tens of thousands of routes for each pixel a box was dragged, which is what
 * made a big diagram lag. Here the lines are walked once, in their order, each
 * routed again only where one of its boxes moved or it was itself changed, and
 * a line whose drawing came out the same keeps the same object - so the lines
 * that are drawn again are the ones a change reached.
 */
function linesOf(state: ReactFlowState): Map<string, DrawnLine> {
  const before = drawnLines.get(state.nodeLookup);
  if (before !== undefined && before.state === state) return before.lines;
  const order: string[] = [];
  const routes = new Map<string, { key: readonly unknown[]; route: Route }>();
  const lines = new Map<string, DrawnLine>();
  const under: Point[][] = [];
  // Whether anything a later line hops over has changed, after which every later line with runs is looked at again.
  let stale = false;
  for (const edge of state.edges) {
    if (before?.order[order.length] !== edge.id) stale = true;
    order.push(edge.id);
    const from = state.nodeLookup.get(edge.source);
    const to = state.nodeLookup.get(edge.target);
    if (from === undefined || to === undefined) continue;
    const data = edge.data as LinkData | undefined;
    const a = boxOf(from);
    const b = boxOf(to);
    const key = [
      a.cx, a.cy, a.hw, a.hh, a.turn, (from.data as ShapeData | undefined)?.kind,
      b.cx, b.cy, b.hw, b.hh, b.turn, (to.data as ShapeData | undefined)?.kind,
      data?.routing, data?.points, data?.labelAt, data?.fromSide, data?.toSide, data?.fromAt, data?.toAt,
    ];
    const held = before?.routes.get(edge.id);
    const kept = held !== undefined && sameAll(held.key, key);
    const route = kept ? held.route : routeBetween(from, to, data?.routing ?? 'straight', data?.points, data?.labelAt, data?.fromSide, data?.toSide, data?.fromAt, data?.toAt);
    routes.set(edge.id, { key, route });
    if (!kept && (route.points !== undefined || held?.route.points !== undefined)) stale = true;
    const was = before?.lines.get(edge.id);
    if (kept && was !== undefined && (!stale || route.points === undefined)) {
      lines.set(edge.id, was);
    } else {
      const path = (route.points !== undefined ? jumped(route.points, under) : null) ?? route.d;
      lines.set(edge.id, was !== undefined && was.route === route && was.path === path ? was : { route, path, tips: tipsOf(route) });
    }
    if (route.points !== undefined) under.push(route.points);
  }
  drawnLines.set(state.nodeLookup, { state, order, routes, lines });
  return lines;
}

/**
 * Something drawn in one of the canvas's own layers over the boxes - the one
 * for line labels, or the one that moves with the viewport. React Flow's part
 * for each looks its layer up in the whole canvas again every time anything
 * in the canvas's state changes: asked for by a label on each of a few
 * hundred lines, that was a few hundred searches of the page for every pixel
 * a box was dragged. The layer is there for as long as the canvas is, so this
 * finds it once.
 */
function OverCanvas({ layer, children }: { layer: 'react-flow__edgelabel-renderer' | 'react-flow__viewport-portal'; children: ReactNode }) {
  const canvas = useStore((state) => state.domNode);
  const [into, setInto] = useState<Element | null>(null);
  useLayoutEffect(() => {
    setInto(canvas?.querySelector(`.${layer}`) ?? null);
  }, [canvas, layer]);
  return into === null ? null : createPortal(children, into);
}

export function FloatingLink({ id, data, selected, markerEnd, markerStart }: EdgeProps<LinkEdge>) {
  const editing = useContext(LabelEditingContext);
  const typing = editing.target?.kind === 'edge' && editing.target.id === id;
  // Its drawing, which is a new object only when it is drawn differently - see [linesOf].
  const drawn = useStore((state) => linesOf(state).get(id));
  const viewing = useContext(ViewingContext);
  const ends = useContext(LinkEndsContext);
  const flow = useReactFlow();
  // The end being dragged and where the pointer has it, and whether the pointer is on a grip.
  const [held, setHeld] = useState<{ end: LinkEnd; x: number; y: number; moved: boolean } | null>(null);
  const [onGrip, setOnGrip] = useState(false);
  const pressed = useRef<{ x: number; y: number } | null>(null);
  // The run being dragged aside - the one from corner `at` to the next - and the line's corners as they would be let go of here.
  const [run, setRun] = useState<{ at: number; points: Point[]; moved: boolean } | null>(null);
  // A bend being dragged - one of the line's own, or one being made from the middle of a part - and the bends as they would be let go of here.
  // With [both], a part between two bends taken hold of: both move together, by how far the pointer has gone from [both.start].
  const [bending, setBending] = useState<{ at: number; points: Point[]; moved: boolean; both?: { base: Point[]; start: Point } } | null>(null);
  // The label being slid along the line, and how far along it would be let go of; a press that does not move is a click.
  const [sliding, setSliding] = useState<{ share: number; moved: boolean } | null>(null);
  /*
   * Followed on the window for as long as it is held, as a box is: the label is
   * drawn again under the pointer at every step, and an element drawn again lost
   * hold of the pointer after the first one.
   */
  const slide = useRef<{ x: number; y: number; share: number; moved: boolean } | null>(null);
  const traceNow = useRef<Point[]>([]);
  const slideEnds = useRef(ends);
  slideEnds.current = ends;
  const slidingNow = sliding !== null;
  useEffect(() => {
    if (!slidingNow) return;
    const move = (event: PointerEvent) => {
      const held = slide.current;
      if (held === null) return;
      if (!held.moved && Math.hypot(event.clientX - held.x, event.clientY - held.y) <= GRIP_SLACK) return;
      const where = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }, { snapToGrid: false });
      held.moved = true;
      held.share = shareNearest(traceNow.current, where);
      setSliding({ share: held.share, moved: true });
    };
    const up = () => {
      const held = slide.current;
      slide.current = null;
      setSliding(null);
      if (held === null) return;
      if (held.moved) slideEnds.current.slide(id, Math.round(held.share * 1000) / 1000);
      else slideEnds.current.pick(id, false);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [slidingNow, flow, id]);
  /*
   * How much its grips and marks are scaled to stay a size a pointer can hit
   * however far out the canvas is. Read only by a line that draws any, so a
   * zoom draws the lit lines again and not every line there is.
   */
  const lit = selected === true || data?.touched === true || ends.hovered === id || onGrip || held !== null || run !== null || bending !== null;
  const scale = useStore((state) => (lit ? 1 / Math.min(1, state.transform[2]) : 1));
  if (drawn === undefined) return null;
  const { route, path, tips } = drawn;
  const gripped = !viewing && tips !== null && (selected === true || ends.hovered === id || onGrip || held !== null || run !== null || bending !== null);
  /*
   * A straight or curved line is bent by hand: a grip on each bend it has,
   * which moves it and a double-click takes out, and a fainter one in the
   * middle of each part, which makes a new bend where it is dragged. The
   * middles stay where they were while a bend is dragged, so the grip that
   * was pressed is still there to be let go of.
   */
  // On a selected line only: shown on one the pointer merely crossed, the grip in its middle was what a click to select it landed on.
  const bendable = !viewing && tips !== null && (selected === true || bending !== null) && held === null && run === null && data?.routing !== 'right-angles';
  const bends = bending?.points ?? (data?.points ?? []).map(([x, y]) => ({ x, y }));
  const bendMids = bendable ? (route.mids ?? []) : [];
  const asCorners = (points: Point[]): [number, number][] => points.map((point) => [Math.round(point.x), Math.round(point.y)]);
  const pressBend = (event: ReactPointerEvent<HTMLDivElement>, at: number, points: Point[]) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pressed.current = { x: event.clientX, y: event.clientY };
    setBending({ at, points, moved: false });
  };
  const moveBend = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (bending === null || pressed.current === null) return;
    const far = Math.hypot(event.clientX - pressed.current.x, event.clientY - pressed.current.y) > GRIP_SLACK;
    if (!bending.moved && !far) return;
    const where = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }, { snapToGrid: false });
    const { both } = bending;
    if (both !== undefined) {
      // The part keeps its shape: both its bends go the same way, by whole steps of the grid.
      const dx = Math.round((where.x - both.start.x) / GRID) * GRID;
      const dy = Math.round((where.y - both.start.y) / GRID) * GRID;
      setBending({ ...bending, moved: true, points: both.base.map((point, index) => (index === bending.at || index === bending.at + 1 ? { x: point.x + dx, y: point.y + dy } : point)) });
      return;
    }
    // On the grid, as a box is: bends lined up by eye are lined up.
    const to = { x: Math.round(where.x / GRID) * GRID, y: Math.round(where.y / GRID) * GRID };
    setBending({ at: bending.at, moved: true, points: bending.points.map((point, index) => (index === bending.at ? to : point)) });
  };
  /** A part between bend [at] and the next, taken hold of along its length. */
  const pressSpan = (event: ReactPointerEvent<HTMLDivElement>, at: number) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pressed.current = { x: event.clientX, y: event.clientY };
    const start = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }, { snapToGrid: false });
    setBending({ at, points: bends, moved: false, both: { base: bends, start } });
  };
  const dropBend = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (bending === null) return;
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    pressed.current = null;
    setBending(null);
    if (bending.moved) ends.bend(id, asCorners(bending.points));
  };
  const cancelBend = () => {
    pressed.current = null;
    setBending(null);
  };
  /*
   * The runs of a right-angle line that can be dragged aside: every one but
   * the first and the last, which leave and meet its boxes. A run across is
   * moved up and down, a run down is moved across, and its neighbours stretch.
   */
  const corners = run?.points ?? route.points;
  const runs =
    gripped && held === null && data?.routing === 'right-angles' && corners !== undefined && corners.length >= 4
      ? corners.slice(1, -2).flatMap((from, index) => {
          const at = index + 1;
          const to = corners[at + 1];
          const flat = Math.abs(from.y - to.y) < 0.5;
          if (run?.at !== at && Math.hypot(to.x - from.x, to.y - from.y) < RUN_LEAST) return [];
          return [{ at, flat, x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }];
        })
      : [];
  const landing = held !== null && held.moved ? ends.aim(id, held.end, held.x, held.y) : null;
  // A lit line that has no grips - its box is what is selected, or the diagram is only being viewed - still says where it is attached.
  const marked = !gripped && tips !== null && (selected === true || data?.touched === true);
  traceNow.current = traceOf(route);
  LINE_TRACES.set(id, traceNow.current);
  const middle = sliding !== null && sliding.moved ? along(traceNow.current, sliding.share) : route.label;
  const dashes = dashesOf(data?.line ?? 'solid');
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        markerStart={markerStart}
        className={`${styles.link} ${selected ? styles.linkSelected : data?.touched ? styles.linkTouched : ''}`}
        style={{
          ...(dashes === null ? {} : { strokeDasharray: dashes, strokeLinecap: data?.line === 'dotted' ? 'round' : undefined }),
          // Its own colour and thickness; selected or lit, the selection's colour says so instead.
          // As variables: the stylesheet's stroke is important, and a plain stroke here lost to it.
          ...(data?.color !== undefined ? { '--link-stroke': data.color } : {}),
          ...(data?.width !== undefined ? { '--link-width': data.width, '--link-width-lit': data.width + 1 } : {}),
        } as CSSProperties}
        interactionWidth={16}
      />
      {/*
       * Which way it goes, on a line that is lit - its own box selected, or
       * itself: dots running along it the way its arrowhead points, as a
       * workflow shows a line a run travels. Only on a line that points one
       * way: one with no arrowhead, or with one at each end, goes nowhere in
       * particular and is lit by its colour and weight alone - a plain line
       * drew arrows running along it that it does not have. See `.linkFlow`.
       */}
      {(selected || data?.touched === true) && data?.heading !== undefined && (
        <>
          <path className={`${styles.linkFlow} ${data.heading === 'backward' ? styles.linkFlowBack : ''}`} d={path} data-flow={data.heading} />
          {/*
           * And arrowheads travelling along it, the way it points: dots said
           * that something moved, not which way, and a still frame of these
           * says it on its own. Not drawn where the person asked for less motion.
           */}
          {!stillWanted() &&
            FLOW_HEADS.map((at) => (
              <path key={at} className={styles.linkFlowHead} d="M -6 -5 L 5 0 L -6 5 Z" data-flow-head="">
                {data.heading === 'backward' ? (
                  // The path is drawn from source to target; a line pointing back is travelled from its far end.
                  <animateMotion dur={`${FLOW_SECONDS}s`} begin={`${-at * FLOW_SECONDS}s`} repeatCount="indefinite" rotate="auto-reverse" keyPoints="1;0" keyTimes="0;1" calcMode="linear" path={path} />
                ) : (
                  <animateMotion dur={`${FLOW_SECONDS}s`} begin={`${-at * FLOW_SECONDS}s`} repeatCount="indefinite" rotate="auto" path={path} />
                )}
              </path>
            ))}
        </>
      )}
      {/* The end being dragged, as it would be drawn let go of here: from the end that stays to where it lands, or to the pointer. */}
      {held !== null && held.moved && tips !== null && (
        <path
          className={styles.endAim}
          d={`M ${tips[held.end === 'from' ? 1 : 0].x},${tips[held.end === 'from' ? 1 : 0].y} L ${(landing ?? held).x},${(landing ?? held).y}`}
          data-testid="diagram-end-aim"
        />
      )}
      {/* A run being dragged aside, as the line would be drawn let go of here. */}
      {run !== null && run.moved && <path className={styles.endAim} d={pathOf(run.points, [])} data-testid="diagram-run-aim" />}
      {/* A bend being dragged, as the line would run through its bends let go of here. */}
      {bending !== null && bending.moved && tips !== null && <path className={styles.endAim} d={pathOf([tips[0], ...bending.points, tips[1]], [])} data-testid="diagram-bend-aim" />}
      {bendable && (
        <OverCanvas layer="react-flow__viewport-portal">
          {/*
            Each part between two bends, to be taken hold of along its length
            and moved whole - both its bends with it - as a right-angle line's
            middle run is. Under the grips: the dot in its middle still makes
            a new bend, and a bend's own grip still moves that bend alone.
          */}
          {bends.slice(0, -1).map((from, index) => {
            const to = bends[index + 1];
            const length = Math.hypot(to.x - from.x, to.y - from.y);
            if (length < 1) return null;
            const angle = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
            return (
              <div
                key={`span-${index}`}
                style={{
                  width: length,
                  height: SPAN_REACH * scale,
                  transform: `translate(${(from.x + to.x) / 2}px, ${(from.y + to.y) / 2}px) translate(-50%, -50%) rotate(${angle}deg)`,
                }}
                className={`${styles.bendSpan} ${bending?.both !== undefined && bending.at === index ? styles.bendSpanHeld : ''} nodrag nopan`}
                title={t('Drag to move this part of the line')}
                data-testid="diagram-bend-span"
                data-edge={id}
                data-part={index}
                onPointerEnter={() => setOnGrip(true)}
                onPointerLeave={() => setOnGrip(false)}
                onPointerDown={(event) => pressSpan(event, index)}
                onPointerMove={moveBend}
                onPointerUp={dropBend}
                onPointerCancel={cancelBend}
                onClick={(event) => event.stopPropagation()}
              />
            );
          })}
          {bendMids.map((at, index) => (
            <div
              key={`add-${index}`}
              style={{ transform: `translate(${at.x}px, ${at.y}px) translate(-50%, -50%) scale(${scale})` }}
              className={`${styles.bendAdd} ${bending !== null ? styles.bendAddAway : ''} nodrag nopan`}
              title={t('Drag to bend the line here')}
              data-testid="diagram-bend-add"
              data-edge={id}
              data-part={index}
              onPointerEnter={() => setOnGrip(true)}
              onPointerLeave={() => setOnGrip(false)}
              onPointerDown={(event) => pressBend(event, index, [...bends.slice(0, index), at, ...bends.slice(index)])}
              onPointerMove={moveBend}
              onPointerUp={dropBend}
              onPointerCancel={cancelBend}
              onClick={(event) => event.stopPropagation()}
            />
          ))}
          {bends.map((at, index) => (
            /*
              A bend's grip, and beside it a cross that takes the bend out -
              which a double-click on the grip does too, and which nothing on
              the screen said. Shown on every bend of a selected line: one
              shown only under the pointer was not found. One hold for both.
            */
            <div
              key={`bend-${index}`}
              style={{ transform: `translate(${at.x}px, ${at.y}px) translate(-50%, -50%) scale(${scale})` }}
              className={`${styles.bendHold} nodrag nopan`}
              onPointerEnter={() => setOnGrip(true)}
              onPointerLeave={() => setOnGrip(false)}
            >
              <div
                className={`${styles.bendGrip} ${bending?.at === index && bending.both === undefined ? styles.endGripHeld : ''}`}
                title={t('Drag to move this bend; double-click to take it out')}
                data-testid="diagram-bend"
                data-edge={id}
                data-bend={index}
                onPointerDown={(event) => pressBend(event, index, bends)}
                onPointerMove={moveBend}
                onPointerUp={dropBend}
                onPointerCancel={cancelBend}
                onClick={(event) => event.stopPropagation()}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  ends.bend(id, asCorners(bends.filter((_, other) => other !== index)));
                }}
              />
              {bending === null && (
                <button
                  type="button"
                  className={styles.bendRemove}
                  title={t('Take this bend out')}
                  aria-label={t('Take this bend out')}
                  data-testid="diagram-bend-remove"
                  data-edge={id}
                  data-bend={index}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    ends.bend(id, asCorners(bends.filter((_, other) => other !== index)));
                  }}
                >
                  {/* Drawn here rather than an icon file: it takes the selection's colour, which an image cannot. */}
                  <svg viewBox="0 0 16 16" width={12} height={12} aria-hidden="true">
                    <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </OverCanvas>
      )}
      {runs.length > 0 && route.points !== undefined && (
        <OverCanvas layer="react-flow__viewport-portal">
          {runs.map((one) => (
            <div
              key={one.at}
              style={{ transform: `translate(${one.x}px, ${one.y}px) translate(-50%, -50%) scale(${scale})`, cursor: one.flat ? 'ns-resize' : 'ew-resize' }}
              className={`${styles.runGrip} ${one.flat ? styles.runGripFlat : ''} ${run?.at === one.at ? styles.endGripHeld : ''} nodrag nopan`}
              title={t('Drag to move this part of the line')}
              data-testid="diagram-run-grip"
              data-edge={id}
              data-run={one.at}
              data-axis={one.flat ? 'y' : 'x'}
              onPointerEnter={() => setOnGrip(true)}
              onPointerLeave={() => setOnGrip(false)}
              onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => {
                if (event.button !== 0 || route.points === undefined) return;
                event.stopPropagation();
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                pressed.current = { x: event.clientX, y: event.clientY };
                setRun({ at: one.at, points: route.points, moved: false });
              }}
              onPointerMove={(event: ReactPointerEvent<HTMLDivElement>) => {
                if (run === null || run.at !== one.at || pressed.current === null) return;
                const far = Math.hypot(event.clientX - pressed.current.x, event.clientY - pressed.current.y) > GRIP_SLACK;
                if (!run.moved && !far) return;
                const where = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }, { snapToGrid: false });
                // On the grid, as a box is: a run dragged level with another by eye is level.
                const to = Math.round((one.flat ? where.y : where.x) / GRID) * GRID;
                setRun({
                  at: one.at,
                  moved: true,
                  points: run.points.map((point, index) => (index === one.at || index === one.at + 1 ? (one.flat ? { x: point.x, y: to } : { x: to, y: point.y }) : point)),
                });
              }}
              onPointerUp={(event: ReactPointerEvent<HTMLDivElement>) => {
                if (run === null || run.at !== one.at) return;
                event.stopPropagation();
                if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                pressed.current = null;
                setRun(null);
                if (!run.moved) return;
                // Its corners between its two ends; the ends themselves are found again from the boxes.
                ends.bend(id, straightened(run.points).slice(1, -1).map((point) => [Math.round(point.x), Math.round(point.y)]));
              }}
              onPointerCancel={() => {
                pressed.current = null;
                setRun(null);
              }}
              onClick={(event) => event.stopPropagation()}
            />
          ))}
        </OverCanvas>
      )}
      {/*
       * A grip on each end. In the viewport's portal, which is drawn over the
       * boxes: a line ends on its box's outline, and anything drawn with the
       * line is under the box and under the handle a new line starts from.
       */}
      {gripped && tips !== null && (
        <OverCanvas layer="react-flow__viewport-portal">
          {landing !== null && (
            <div
              className={styles.endLanding}
              style={{ transform: `translate(${landing.x}px, ${landing.y}px) translate(-50%, -50%) scale(${scale})` }}
              data-testid="diagram-end-landing"
            />
          )}
          {(['from', 'to'] as const).map((end) => {
            const home = tips[end === 'from' ? 0 : 1];
            const mine = held !== null && held.end === end ? held : null;
            const at = mine !== null && mine.moved ? mine : home;
            return (
              <div
                key={end}
                // Kept at a size a pointer can hit however far out the canvas is zoomed.
                style={{ transform: `translate(${at.x}px, ${at.y}px) translate(-50%, -50%) scale(${scale})` }}
                className={`${styles.endGrip} ${mine !== null ? styles.endGripHeld : ''} nodrag nopan`}
                title={t('Drag onto a side of a shape to pin this end there, or onto another shape')}
                data-testid={`diagram-end-${end}`}
                data-edge={id}
                onPointerEnter={() => setOnGrip(true)}
                onPointerLeave={() => setOnGrip(false)}
                onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => {
                  if (event.button !== 0) return;
                  event.stopPropagation();
                  event.preventDefault();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  pressed.current = { x: event.clientX, y: event.clientY };
                  setHeld({ end, x: home.x, y: home.y, moved: false });
                }}
                onPointerMove={(event: ReactPointerEvent<HTMLDivElement>) => {
                  if (mine === null || pressed.current === null) return;
                  const far = Math.hypot(event.clientX - pressed.current.x, event.clientY - pressed.current.y) > GRIP_SLACK;
                  if (!mine.moved && !far) return;
                  // Where the pointer is, not the grid point nearest it: a side is a matter of which part of a box it is over.
                  const where = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }, { snapToGrid: false });
                  setHeld({ end, x: where.x, y: where.y, moved: true });
                }}
                onPointerUp={(event: ReactPointerEvent<HTMLDivElement>) => {
                  if (mine === null) return;
                  event.stopPropagation();
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                  pressed.current = null;
                  setHeld(null);
                  if (!mine.moved) return;
                  const where = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }, { snapToGrid: false });
                  ends.drop(id, end, where.x, where.y);
                }}
                onPointerCancel={() => {
                  pressed.current = null;
                  setHeld(null);
                }}
                // A click on a grip is not a click on the canvas under it.
                onClick={(event) => event.stopPropagation()}
              />
            );
          })}
        </OverCanvas>
      )}
      {/*
       * Where a lit line is attached, on a line that has no grips. A selected
       * box is outlined in the colour its lines are lit in, so a line's end
       * was lost in that outline exactly where it met it. A mark and not a
       * grip: a selected box shows the handles a new line is drawn from, an
       * end very often sits on one, and a grip there would be what the pointer
       * took hold of instead. Pointing at the line is what turns these into grips.
       */}
      {marked && tips !== null && (
        <OverCanvas layer="react-flow__viewport-portal">
          {(['from', 'to'] as const).map((end) => {
            const at = tips[end === 'from' ? 0 : 1];
            return (
              <div
                key={end}
                className={styles.endMark}
                style={{ transform: `translate(${at.x}px, ${at.y}px) translate(-50%, -50%) scale(${scale})` }}
                data-testid={`diagram-end-mark-${end}`}
                data-edge={id}
              />
            );
          })}
        </OverCanvas>
      )}
      {typing && (
        <OverCanvas layer="react-flow__edgelabel-renderer">
          <div
            className={`${styles.linkLabel} ${styles.linkLabelEditing}`}
            style={{ transform: `translate(-50%, -50%) translate(${middle.x}px, ${middle.y}px)` }}
          >
            {/* One line: a connection's label is drawn on one. */}
            <InPlaceLabel initial={data?.label ?? ''} className={styles.linkLabelEditor} multiline={false} />
          </div>
        </OverCanvas>
      )}
      {!typing && data?.label !== undefined && data.label !== '' && (
        <OverCanvas layer="react-flow__edgelabel-renderer">
          <div
            className={`${styles.linkLabel} ${selected || data?.touched ? styles.linkLabelSelected : ''} ${viewing ? '' : styles.linkLabelMovable}`}
            style={{ transform: `translate(-50%, -50%) translate(${middle.x}px, ${middle.y}px)` }}
            // Taken hold of and moved, it slides along its line - to wherever on the line is nearest the pointer.
            onPointerDown={(event) => {
              if (viewing || event.button !== 0) return;
              event.stopPropagation();
              event.preventDefault();
              slide.current = { x: event.clientX, y: event.clientY, share: data?.labelAt ?? 0.5, moved: false };
              setSliding({ share: data?.labelAt ?? 0.5, moved: false });
            }}
            onDoubleClick={(event) => {
              if (viewing) return;
              event.stopPropagation();
              ends.pick(id, true);
            }}
            onPointerCancel={() => {
              pressed.current = null;
              setSliding(null);
            }}
            data-testid="diagram-edge-label"
          >
            <Styled text={data.label} />
          </div>
        </OverCanvas>
      )}
    </>
  );
}

// Each drawn again only when what it is handed changes: a canvas of hundreds is otherwise drawn whole for a change to one.
/**
 * The alignment guides, drawn on the canvas while a box is dragged or resized:
 * a line down or across it through the edge or the middle the box has come
 * level with. In the canvas's own coordinates, so they move and scale with it,
 * and a hair wide whatever the zoom.
 */
export function AlignmentGuides({ guides }: { guides: Guide[] }) {
  const zoom = useStore((state) => state.transform[2]);
  if (guides.length === 0) return null;
  return (
    <OverCanvas layer="react-flow__viewport-portal">
      {guides.map((one) => (
        <div
          key={`${one.axis}${one.at}`}
          className={styles.guide}
          data-testid="diagram-guide"
          data-axis={one.axis}
          data-at={one.at}
          style={
            one.axis === 'x'
              ? { left: one.at, top: one.from, height: one.to - one.from, borderLeftWidth: 1 / zoom }
              : { left: one.from, top: one.at, width: one.to - one.from, borderTopWidth: 1 / zoom }
          }
        />
      ))}
    </OverCanvas>
  );
}

/** What a click on a side's handle would draw: a line to the box that way, or a copy of this one with a line to it. */
export interface Suggestion {
  kind: 'line' | 'copy';
  /** The box and the side it would be drawn from. */
  from: string;
  side: DiagramSide;
  /** The line, as a path in the drawing's own coordinates, and where its arrowhead lies. */
  path: string;
  tip: { x: number; y: number; angle: number };
  /** The box it would end on: one already there, or the copy to be made. */
  to?: string;
  /** The side of that box the line would arrive at. */
  toSide?: DiagramSide;
  box?: { x: number; y: number; w: number; h: number; rotation?: number };
  /** The group the copy would be made in, when it would stand inside one. */
  home?: string;
}

/**
 * The suggestion, drawn faintly over the canvas while the pointer rests on a
 * side's handle. It takes no pointer, so the handle under it is still what is
 * clicked or dragged.
 */
export function SuggestionGhost({ suggestion }: { suggestion: Suggestion | null }) {
  if (suggestion === null) return null;
  const { box, tip } = suggestion;
  return (
    <OverCanvas layer="react-flow__viewport-portal">
      {box !== undefined && (
        <div
          className={styles.suggestion}
          style={{ width: box.w, height: box.h, transform: `translate(${box.x}px, ${box.y}px)${box.rotation ? ` rotate(${box.rotation}deg)` : ''}` }}
          data-testid="diagram-suggestion-box"
        />
      )}
      <svg className={styles.suggestionLine} width={1} height={1} aria-hidden="true" data-testid="diagram-suggestion" data-kind={suggestion.kind} data-side={suggestion.side}>
        <path d={suggestion.path} />
        <polygon points="0,0 -10,-4.5 -10,4.5" transform={`translate(${tip.x} ${tip.y}) rotate(${tip.angle})`} />
      </svg>
    </OverCanvas>
  );
}

export const NODE_TYPES = { shape: memo(ShapeNodeView) };
export const EDGE_TYPES = { link: memo(FloatingLink) };
