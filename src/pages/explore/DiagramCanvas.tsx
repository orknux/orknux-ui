import { createContext, useContext, useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { BaseEdge, EdgeLabelRenderer, Handle, NodeResizer, Position, useInternalNode } from '@xyflow/react';
import type { Edge, EdgeProps, InternalNode, Node, NodeProps } from '@xyflow/react';

import type { DiagramLineStyle, DiagramNodeKind } from '../../api/diagrams';
import { t } from '../../i18n';
import { dashesOf } from './DiagramLineStyles';
import { ICON_LABEL, OUTLINES, OutlinePieces, compartments, rimBorder } from './DiagramShapes';
import type { Outline } from './DiagramShapes';
import styles from './DiagramEditorPage.module.css';

/** What a node on the canvas carries: what it is, and how it is drawn. */
export type ShapeData = {
  kind: DiagramNodeKind;
  label: string;
  color?: string;
  /** Whether it has notes, for the mark in its corner. */
  noted: boolean;
};

export type ShapeNode = Node<ShapeData, 'shape'>;

/** A connection's line style and words; its two ends arrive as the edge's own markers, none where it carries none. */
export type LinkData = { line: DiagramLineStyle; label?: string };

export type LinkEdge = Edge<LinkData, 'link'>;

/**
 * Colours a node can be given, as stored: `#rrggbb`, which the server holds a
 * colour to. Data rather than style - a person picks one and it is saved - so
 * they live here rather than in the tokens.
 */
export const SWATCHES = ['#e4e4e7', '#bfdbfe', '#bbf7d0', '#fef08a', '#fed7aa', '#fecaca', '#e9d5ff', '#3f3f46'];

/** Which label is being typed over in place, and what becomes of what is typed. */
export interface LabelEditing {
  target: { kind: 'node' | 'edge'; id: string } | null;
  commit: (text: string) => void;
  cancel: () => void;
}

export const LabelEditingContext = createContext<LabelEditing>({ target: null, commit: () => {}, cancel: () => {} });

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
export function ShapeNodeView({ id, data, selected }: NodeProps<ShapeNode>) {
  const editing = useContext(LabelEditingContext);
  const typing = editing.target?.kind === 'node' && editing.target.id === id;
  const filled = data.color !== undefined;
  const style = filled ? { background: data.color, color: dark(data.color as string) ? 'var(--diagram-ink-on-dark)' : 'var(--diagram-ink-on-light)' } : undefined;
  return (
    <>
      <NodeResizer isVisible={selected} minWidth={24} minHeight={24} lineClassName={styles.resizeLine} handleClassName={styles.resizeHandle} />
      {OUTLINES[data.kind] !== undefined ? (
        <OutlinedShape kind={data.kind} outline={OUTLINES[data.kind] as Outline} label={data.label} typing={typing} fill={data.color} ink={filled ? style?.color : undefined} />
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
      {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
        <Handle
          key={side}
          id={side}
          type="source"
          position={side === 'top' ? Position.Top : side === 'right' ? Position.Right : side === 'bottom' ? Position.Bottom : Position.Left}
          className={styles.handle}
        />
      ))}
    </>
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
function boxOf(node: InternalNode): { cx: number; cy: number; hw: number; hh: number } {
  const w = node.measured.width ?? node.width ?? 0;
  const h = node.measured.height ?? node.height ?? 0;
  return { cx: node.internals.positionAbsolute.x + w / 2, cy: node.internals.positionAbsolute.y + h / 2, hw: w / 2, hh: h / 2 };
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
 * A connection, drawn straight between the edges of the two boxes it joins
 * and read off React Flow's own record of where they are, so it follows a box
 * being dragged and survives the node objects being rebuilt.
 */
export function FloatingLink({ id, source, target, data, selected, markerEnd, markerStart }: EdgeProps<LinkEdge>) {
  const editing = useContext(LabelEditingContext);
  const typing = editing.target?.kind === 'edge' && editing.target.id === id;
  const from = useInternalNode(source);
  const to = useInternalNode(target);
  if (from === undefined || to === undefined) return null;
  const a = boxOf(from);
  const b = boxOf(to);
  const fromKind = (from.data as ShapeData | undefined)?.kind;
  const toKind = (to.data as ShapeData | undefined)?.kind;
  const start = rimBorder(fromKind, a, b.cx, b.cy) ?? border(a, b.cx, b.cy);
  const end = rimBorder(toKind, b, a.cx, a.cy) ?? border(b, a.cx, a.cy);
  const path = `M ${start.x},${start.y} L ${end.x},${end.y}`;
  const dashes = dashesOf(data?.line ?? 'solid');
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        markerStart={markerStart}
        className={`${styles.link} ${selected ? styles.linkSelected : ''}`}
        style={dashes === null ? undefined : { strokeDasharray: dashes, strokeLinecap: data?.line === 'dotted' ? 'round' : undefined }}
        interactionWidth={16}
      />
      {typing && (
        <EdgeLabelRenderer>
          <div
            className={`${styles.linkLabel} ${styles.linkLabelEditing}`}
            style={{ transform: `translate(-50%, -50%) translate(${(start.x + end.x) / 2}px, ${(start.y + end.y) / 2}px)` }}
          >
            {/* One line: a connection's label is drawn on one. */}
            <InPlaceLabel initial={data?.label ?? ''} className={styles.linkLabelEditor} multiline={false} />
          </div>
        </EdgeLabelRenderer>
      )}
      {!typing && data?.label !== undefined && data.label !== '' && (
        <EdgeLabelRenderer>
          <div
            className={`${styles.linkLabel} ${selected ? styles.linkLabelSelected : ''}`}
            style={{ transform: `translate(-50%, -50%) translate(${(start.x + end.x) / 2}px, ${(start.y + end.y) / 2}px)` }}
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
