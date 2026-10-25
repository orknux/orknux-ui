import { BaseEdge, EdgeLabelRenderer, Handle, NodeResizer, Position, useInternalNode } from '@xyflow/react';
import type { Edge, EdgeProps, InternalNode, Node, NodeProps } from '@xyflow/react';

import type { DiagramEdgeKind, DiagramNodeKind } from '../../api/diagrams';
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

export type LinkData = { kind: DiagramEdgeKind; label?: string };

export type LinkEdge = Edge<LinkData, 'link'>;

/**
 * Colours a node can be given, as stored: `#rrggbb`, which the server holds a
 * colour to. Data rather than style - a person picks one and it is saved - so
 * they live here rather than in the tokens.
 */
export const SWATCHES = ['#e4e4e7', '#bfdbfe', '#bbf7d0', '#fef08a', '#fed7aa', '#fecaca', '#e9d5ff', '#3f3f46'];

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
export function ShapeNodeView({ data, selected }: NodeProps<ShapeNode>) {
  const filled = data.color !== undefined;
  const style = filled ? { background: data.color, color: dark(data.color as string) ? 'var(--diagram-ink-on-dark)' : 'var(--diagram-ink-on-light)' } : undefined;
  return (
    <>
      <NodeResizer isVisible={selected} minWidth={24} minHeight={24} lineClassName={styles.resizeLine} handleClassName={styles.resizeHandle} />
      {data.kind === 'diamond' ? (
        <div className={styles.shapeDiamondBox} data-testid="diagram-node-shape" data-kind={data.kind}>
          <svg className={styles.diamond} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <polygon points="50,1 99,50 50,99 1,50" style={filled ? { fill: data.color } : undefined} />
          </svg>
          <span className={styles.shapeLabel} style={filled ? { color: style?.color } : undefined}>
            {data.label}
          </span>
        </div>
      ) : (
        <div className={`${styles.shape} ${styles[`shape_${data.kind}`] ?? ''}`} style={style} data-testid="diagram-node-shape" data-kind={data.kind}>
          <span className={data.kind === 'group' ? styles.groupLabel : styles.shapeLabel}>{data.label}</span>
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
  const from = useInternalNode(source);
  const to = useInternalNode(target);
  if (from === undefined || to === undefined) return null;
  const a = boxOf(from);
  const b = boxOf(to);
  const start = border(a, b.cx, b.cy);
  const end = border(b, a.cx, a.cy);
  const path = `M ${start.x},${start.y} L ${end.x},${end.y}`;
  const kind = data?.kind ?? 'arrow';
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={kind === 'line' ? undefined : markerEnd}
        markerStart={kind === 'both' ? markerStart : undefined}
        className={`${styles.link} ${selected ? styles.linkSelected : ''}`}
        style={kind === 'dashed' ? { strokeDasharray: '6 4' } : undefined}
        interactionWidth={16}
      />
      {data?.label !== undefined && data.label !== '' && (
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
