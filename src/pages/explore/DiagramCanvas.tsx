import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import linkIcon from '../../assets/link.svg';
import type { CSSProperties } from 'react';
import { BaseEdge, EdgeLabelRenderer, Handle, NodeResizer, Position, ViewportPortal, useInternalNode, useReactFlow, useStore, useUpdateNodeInternals } from '@xyflow/react';
import type { Edge, EdgeProps, InternalNode, Node, NodeProps } from '@xyflow/react';

import type { DiagramLineStyle, DiagramNodeKind, DiagramRouting, DiagramSide } from '../../api/diagrams';
import { t, tf } from '../../i18n';
import { pictureUrl } from '../../api/diagrams';
import { dashesOf } from './DiagramLineStyles';
import { jumped, routeOf, routeThrough, turned } from './DiagramRoutes';
import type { Point, Route, RouteBox } from './DiagramRoutes';
import { ICON_LABEL, OutlinePieces, compartments, outlineOf, rimBorder, rimBorderFrom } from './DiagramShapes';
import type { Outline } from './DiagramShapes';
import styles from './DiagramEditorPage.module.css';

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
};

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
  /** Its own corners, where it was routed around the boxes in its way; drawn only in right angles. */
  points?: [number, number][];
  /** Where along it its label sits, where the router moved it. */
  labelAt?: number;
  /** Its own colour and thickness, where it has them. */
  color?: string;
  width?: number;
  /** Whether it runs to or from a selected box, and is lit with it. */
  touched?: boolean;
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

/** Which label is being typed over in place, and what becomes of what is typed. */
export interface LabelEditing {
  target: { kind: 'node' | 'edge'; id: string } | null;
  commit: (text: string) => void;
  cancel: () => void;
}

export const LabelEditingContext = createContext<LabelEditing>({ target: null, commit: () => {}, cancel: () => {} });

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
}

export const LinkEndsContext = createContext<LinkEnds>({ hovered: null, aim: () => null, drop: () => {} });

/** How far, in the screen's pixels, a grip is moved before it counts as a drag and not a click. */
const GRIP_SLACK = 4;

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
  const box = useRef<HTMLTextAreaElement | null>(null);
  /** Set once Enter or Escape has decided, so the blur that follows does not decide again. */
  const done = useRef(false);
  useEffect(() => {
    const held = box.current;
    if (held === null) return;
    held.focus();
    held.select();
  }, []);
  return (
    <textarea
      ref={box}
      className={`nodrag nopan nowheel ${className}`}
      style={style}
      defaultValue={initial}
      rows={1}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          done.current = true;
          editing.cancel();
        } else if (event.key === 'Enter' && !(multiline && event.shiftKey)) {
          event.preventDefault();
          done.current = true;
          editing.commit(event.currentTarget.value);
        }
      }}
      onDoubleClick={(event) => event.stopPropagation()}
      onBlur={(event) => {
        if (!done.current) editing.commit(event.currentTarget.value);
      }}
      aria-label={t('Label')}
      data-testid="diagram-label-editor"
    />
  );
}

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
function LinkCardNode({ link, label }: { link?: string; label: string }) {
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
        <span className={styles.linkNodeName} data-testid="diagram-node-label-text">
          {name}
        </span>
        <span className={styles.linkNodeWhere}>{where}</span>
      </span>
      {set && card !== null && !card.missing && (
        <button
          type="button"
          className={`nodrag nopan ${styles.linkNodeOpen}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            links.open(link);
          }}
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
function LinkedWords({ link, label }: { link?: string; label: string }) {
  const links = useContext(LinkOpenContext);
  const down = useRef<{ x: number; y: number } | null>(null);
  const linked = link !== undefined && link !== '';
  return (
    <span
      className={`${styles.textNodeWords} ${linked ? styles.textNodeLinked : ''}`}
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
      {label}
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
      {data.kind === 'link' ? (
        <LinkCardNode link={data.link} label={data.label} />
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
            <InPlaceLabel initial={data.label} className={`${styles.pictureCaption} ${styles.labelEditor}`} multiline={false} />
          ) : (
            data.label !== '' && (
              <span className={styles.pictureCaption} data-testid="diagram-node-label-text">
                {data.label}
              </span>
            )
          )}
        </div>
      ) : outline !== undefined ? (
        <OutlinedShape kind={data.kind} outline={outline} label={data.label} typing={typing} fill={data.color} ink={filled ? style?.color : undefined} />
      ) : data.kind === 'text' ? (
        // Words alone: no box, no outline; a fill, if one was picked, sits behind them.
        <div className={styles.textNode} style={filled ? style : undefined} data-testid="diagram-node-shape" data-kind="text">
          {typing ? (
            <InPlaceLabel initial={data.label} className={`${styles.textNodeWords} ${styles.labelEditor}`} multiline />
          ) : (
            <LinkedWords link={data.link} label={data.label} />
          )}
        </div>
      ) : data.kind === 'diamond' ? (
        <div className={styles.shapeDiamondBox} data-testid="diagram-node-shape" data-kind={data.kind}>
          <svg className={styles.diamond} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <polygon points="50,1 99,50 50,99 1,50" style={filled ? { fill: data.color } : undefined} />
          </svg>
          {typing ? (
            <InPlaceLabel initial={data.label} className={`${styles.shapeLabel} ${styles.labelEditor}`} multiline style={filled ? { color: style?.color } : undefined} />
          ) : (
            <span className={styles.shapeLabel} style={filled ? { color: style?.color } : undefined} data-testid="diagram-node-label-text">
              {data.label}
            </span>
          )}
        </div>
      ) : (
        <div className={`${styles.shape} ${styles[`shape_${data.kind}`] ?? ''}`} style={style} data-testid="diagram-node-shape" data-kind={data.kind}>
          {typing ? (
            <InPlaceLabel initial={data.label} className={`${data.kind === 'group' ? styles.groupLabel : styles.shapeLabel} ${styles.labelEditor}`} multiline />
          ) : (
            <span className={data.kind === 'group' ? styles.groupLabel : styles.shapeLabel} data-testid="diagram-node-label-text">
              {data.label}
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
function OutlinedShape({ kind, outline, label, typing, fill, ink }: { kind: DiagramNodeKind; outline: Outline; label: string; typing: boolean; fill?: string; ink?: string }) {
  const words = (className: string) =>
    typing ? (
      <InPlaceLabel initial={label} className={`${className} ${styles.labelEditor}`} multiline style={ink ? { color: ink } : undefined} />
    ) : (
      <span className={className} style={ink ? { color: ink } : undefined} data-testid="diagram-node-label-text">
        {label}
      </span>
    );
  if (outline.icon) {
    return (
      <div className={styles.shapeIconBox} data-testid="diagram-node-shape" data-kind={kind}>
        <svg className={styles.shapeIconArt} style={{ height: `calc(100% - ${ICON_LABEL}px)` }} viewBox="-2 -2 104 104" preserveAspectRatio="xMidYMid meet" aria-hidden="true" data-testid="diagram-node-outline">
          <OutlinePieces outline={outline} fill={fill} className={styles.outlinePiece} />
        </svg>
        {/* Beneath the icon, on the paper, so it is ink whatever the fill. */}
        {typing ? <InPlaceLabel initial={label} className={`${styles.shapeIconLabel} ${styles.labelEditor}`} multiline={false} /> : (
          <span className={styles.shapeIconLabel} data-testid="diagram-node-label-text">
            {label}
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
        <div className={styles.classBox} style={ink ? { color: ink } : undefined} data-testid="diagram-node-label-text">
          {compartments(label).map((lines, at) => (
            <div key={at} className={at === 0 ? styles.className : styles.classPart}>
              {lines.map((line, row) => (
                <div key={row}>{line === '' ? ' ' : line}</div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.outlineInside} style={{ left: `${left}%`, top: `${top}%`, right: `${100 - right}%`, bottom: `${100 - bottom}%` }}>
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
function sideAim(box: { cx: number; cy: number; hw: number; hh: number }, side: DiagramSide | undefined, tx: number, ty: number): [number, number] {
  const far = 1_000_000;
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
    let [ax, ay] = sideAim(box, side, tx, ty);
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
  return routeOf(a, b, routing, leave);
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

export function FloatingLink({ id, source, target, data, selected, markerEnd, markerStart }: EdgeProps<LinkEdge>) {
  const editing = useContext(LabelEditingContext);
  const typing = editing.target?.kind === 'edge' && editing.target.id === id;
  const from = useInternalNode(source);
  const to = useInternalNode(target);
  /*
   * The straight runs of every line drawn before this one, which it hops over
   * where it crosses them: the later line is the one on top. Read off the
   * store, so a box being dragged moves the hops on the lines it carries.
   */
  const edges = useStore((state) => state.edges);
  const lookup = useStore((state) => state.nodeLookup);
  useStore((state) => state.nodes);
  const viewing = useContext(ViewingContext);
  const ends = useContext(LinkEndsContext);
  const flow = useReactFlow();
  const zoom = useStore((state) => state.transform[2]);
  // The end being dragged and where the pointer has it, and whether the pointer is on a grip.
  const [held, setHeld] = useState<{ end: LinkEnd; x: number; y: number; moved: boolean } | null>(null);
  const [onGrip, setOnGrip] = useState(false);
  const pressed = useRef<{ x: number; y: number } | null>(null);
  if (from === undefined || to === undefined) return null;
  const route = routeBetween(from, to, data?.routing ?? 'straight', data?.points, data?.labelAt, data?.fromSide, data?.toSide);
  const tips = tipsOf(route);
  const gripped = !viewing && tips !== null && (selected === true || ends.hovered === id || onGrip || held !== null);
  const landing = held !== null && held.moved ? ends.aim(id, held.end, held.x, held.y) : null;
  // A lit line that has no grips - its box is what is selected, or the diagram is only being viewed - still says where it is attached.
  const marked = !gripped && tips !== null && (selected === true || data?.touched === true);
  const under: Point[][] = [];
  if (route.points !== undefined) {
    for (const other of edges) {
      if (other.id === id) break;
      const one = lookup.get(other.source);
      const two = lookup.get(other.target);
      if (one === undefined || two === undefined) continue;
      const theirs = routeBetween(
        one,
        two,
        (other.data as LinkData | undefined)?.routing ?? 'straight',
        (other.data as LinkData | undefined)?.points,
        undefined,
        (other.data as LinkData | undefined)?.fromSide,
        (other.data as LinkData | undefined)?.toSide,
      ).points;
      if (theirs !== undefined) under.push(theirs);
    }
  }
  const path = (route.points !== undefined ? jumped(route.points, under) : null) ?? route.d;
  const middle = route.label;
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
          ...(data?.color !== undefined && !selected && data?.touched !== true ? { stroke: data.color } : {}),
          ...(data?.width !== undefined ? { strokeWidth: selected || data?.touched === true ? data.width + 1 : data.width } : {}),
        }}
        interactionWidth={16}
      />
      {/*
       * Which way it goes, on a line that is lit - its own box selected, or
       * itself: dots running from its start to its end over it, as a workflow
       * shows a line a run travels. Drawn from source to target, so the dots
       * go the way the arrow points; see `.linkFlow`.
       */}
      {(selected || data?.touched === true) && (
        <>
          <path className={styles.linkFlow} d={path} data-flow="" />
          {/*
           * And arrowheads travelling along it, the way it points: dots said
           * that something moved, not which way, and a still frame of these
           * says it on its own. Not drawn where the person asked for less motion.
           */}
          {!stillWanted() &&
            FLOW_HEADS.map((at) => (
              <path key={at} className={styles.linkFlowHead} d="M -6 -5 L 5 0 L -6 5 Z" data-flow-head="">
                <animateMotion dur={`${FLOW_SECONDS}s`} begin={`${-at * FLOW_SECONDS}s`} repeatCount="indefinite" rotate="auto" path={path} />
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
      {/*
       * A grip on each end. In the viewport's portal, which is drawn over the
       * boxes: a line ends on its box's outline, and anything drawn with the
       * line is under the box and under the handle a new line starts from.
       */}
      {gripped && tips !== null && (
        <ViewportPortal>
          {landing !== null && (
            <div
              className={styles.endLanding}
              style={{ transform: `translate(${landing.x}px, ${landing.y}px) translate(-50%, -50%) scale(${1 / Math.min(1, zoom)})` }}
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
                style={{ transform: `translate(${at.x}px, ${at.y}px) translate(-50%, -50%) scale(${1 / Math.min(1, zoom)})` }}
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
        </ViewportPortal>
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
        <ViewportPortal>
          {(['from', 'to'] as const).map((end) => {
            const at = tips[end === 'from' ? 0 : 1];
            return (
              <div
                key={end}
                className={styles.endMark}
                style={{ transform: `translate(${at.x}px, ${at.y}px) translate(-50%, -50%) scale(${1 / Math.min(1, zoom)})` }}
                data-testid={`diagram-end-mark-${end}`}
                data-edge={id}
              />
            );
          })}
        </ViewportPortal>
      )}
      {typing && (
        <EdgeLabelRenderer>
          <div
            className={`${styles.linkLabel} ${styles.linkLabelEditing}`}
            style={{ transform: `translate(-50%, -50%) translate(${middle.x}px, ${middle.y}px)` }}
          >
            {/* One line: a connection's label is drawn on one. */}
            <InPlaceLabel initial={data?.label ?? ''} className={styles.linkLabelEditor} multiline={false} />
          </div>
        </EdgeLabelRenderer>
      )}
      {!typing && data?.label !== undefined && data.label !== '' && (
        <EdgeLabelRenderer>
          <div
            className={`${styles.linkLabel} ${selected || data?.touched ? styles.linkLabelSelected : ''}`}
            style={{ transform: `translate(-50%, -50%) translate(${middle.x}px, ${middle.y}px)` }}
            data-testid="diagram-edge-label"
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const NODE_TYPES = { shape: ShapeNodeView };
export const EDGE_TYPES = { link: FloatingLink };
