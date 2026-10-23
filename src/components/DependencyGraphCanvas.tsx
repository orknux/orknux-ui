import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Background, Controls, Handle, Position, ReactFlow } from '@xyflow/react';
import type { Edge, Node, NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { dependantLabel, dependantPath } from '../api/dependants';
import type { Dependant, DependencyKind } from '../api/dependants';
import type { DependencyGraph, DependencyGraphNode } from '../api/dependencyGraph';
import { OpenDefinitionIcon } from './OpenDefinitionIcon';
import styles from './DependencyGraphCanvas.module.css';
import { t } from '../i18n';

/**
 * The order kinds are stacked in within a column: users before what they use,
 * so a workflow sits above the agent it runs and a model above its provider.
 */
const COLUMNS: DependencyKind[][] = [
  ['WORKFLOW', 'WORKSPACE'],
  ['TRIGGER', 'AGENT', 'ACTION', 'CONDITION'],
  ['FUNCTION', 'TOOL', 'SKILL_CATALOG', 'MEMORY_CATALOG', 'MCP_SERVER', 'MODEL'],
  ['OBJECT', 'LIBRARY', 'MODEL_PROVIDER', 'CONNECTION'],
  ['VARIABLE'],
];

const NODE_WIDTH = 220;
const NODE_HEIGHT = 44;
const COLUMN_GAP = 120;
const ROW_GAP = 12;
/** Past this many boxes a column wraps into another beside it, so a long list does not shrink the whole picture to fit. */
const MOST_ROWS = 14;
const WRAP_GAP = 24;

function columnOf(kind: DependencyKind): number {
  return COLUMNS.findIndex((kinds) => kinds.includes(kind));
}

/** The key a part goes by on the graph: the server's `KIND:id`. */
export function graphKey(kind: DependencyKind, id: string): string {
  return `${kind}:${id}`;
}

export function asDependant(node: DependencyGraphNode, workspaceId: string): Dependant {
  return {
    kind: node.kind,
    id: node.id,
    name: node.name,
    workspaceId: node.kind === 'LIBRARY' ? null : workspaceId,
    workspaceName: null,
    published: node.published,
    section: node.section,
  };
}

/** Everything reachable from `start` along the arrows, both ways: what it needs and what needs it. */
export function chainOf(start: string, graph: DependencyGraph): Set<string> {
  const chain = new Set([start]);
  for (const forward of [true, false]) {
    const queue = [start];
    while (queue.length > 0) {
      const at = queue.pop() as string;
      for (const edge of graph.edges) {
        const [from, to] = forward ? [edge.from, edge.to] : [edge.to, edge.from];
        if (from === at && !chain.has(to)) {
          chain.add(to);
          queue.push(to);
        }
      }
    }
  }
  return chain;
}

/**
 * How far each part is from `focus`: what uses it at -1, what uses that at -2,
 * what it uses at 1 and so on. One part's chain is drawn in these columns
 * rather than by kind, so two things that use it directly stand one above the
 * other instead of one behind the other on the same row.
 */
export function distancesFrom(focus: string, graph: DependencyGraph): Map<string, number> {
  const distance = new Map([[focus, 0]]);
  for (const forward of [true, false]) {
    let ring = [focus];
    for (let step = 1; ring.length > 0; step++) {
      const next: string[] = [];
      for (const at of ring) {
        for (const edge of graph.edges) {
          const [from, to] = forward ? [edge.from, edge.to] : [edge.to, edge.from];
          if (from === at && !distance.has(to)) {
            distance.set(to, forward ? step : -step);
            next.push(to);
          }
        }
      }
      ring = next;
    }
  }
  return distance;
}

/** Only the parts in `keep`, and the arrows between them. */
export function narrowed(graph: DependencyGraph, keep: Set<string>): DependencyGraph {
  return {
    nodes: graph.nodes.filter((node) => keep.has(node.key)),
    edges: graph.edges.filter((edge) => keep.has(edge.from) && keep.has(edge.to)),
  };
}

interface PartData extends Record<string, unknown> {
  name: string;
  kind: string;
  dimmed: boolean;
}

function PartNode({ data, selected }: NodeProps<Node<PartData>>) {
  return (
    <div
      className={`${styles.part} ${selected ? styles.partSelected : ''} ${data.dimmed ? styles.partDimmed : ''}`}
      data-part-name={data.name}
      data-part-kind={data.kind}
    >
      <Handle type="target" position={Position.Left} className={styles.handle} isConnectable={false} />
      <span className={styles.partName}>{data.name}</span>
      <span className={styles.partKind}>{data.kind}</span>
      <Handle type="source" position={Position.Right} className={styles.handle} isConnectable={false} />
    </div>
  );
}

const nodeTypes = { part: PartNode };

export interface DependencyGraphCanvasProps {
  graph: DependencyGraph;
  workspaceId: string;
  /** The part chosen; its chain is lit and the rest dimmed. */
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  /** A class for the frame, which sets its height. */
  className?: string;
  /** The part whose chain this is; the columns are distances from it. */
  focusKey: string;
}

/** One part's chain - what uses it and what it uses, on down both ways - drawn as a graph. */
export function DependencyGraphCanvas({ graph, workspaceId, selectedKey, onSelect, className, focusKey }: DependencyGraphCanvasProps) {
  const chain = useMemo(() => (selectedKey !== null ? chainOf(selectedKey, graph) : null), [graph, selectedKey]);

  const nodes: Node<PartData>[] = useMemo(() => {
    const distance = distancesFrom(focusKey, graph);
    const nearest = Math.min(0, ...distance.values());
    const columnCount = Math.max(0, ...distance.values()) - nearest + 1;
    const column = (node: DependencyGraphNode) => (distance.get(node.key) ?? 0) - nearest;
    const order = (node: DependencyGraphNode) => columnOf(node.kind) * 100 + COLUMNS[columnOf(node.kind)].indexOf(node.kind);
    const sorted = [...graph.nodes].sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));
    const columns = Array.from({ length: columnCount }, (_, at) => at);
    // Each column is as many boxes wide as it needs to stay at most MOST_ROWS tall, and starts where the last ended.
    const sizes = columns.map((at) => sorted.filter((node) => column(node) === at).length);
    const wraps = sizes.map((size) => Math.max(1, Math.ceil(size / MOST_ROWS)));
    const tall = sizes.map((size, column) => Math.ceil(size / wraps[column]));
    const lefts = wraps.reduce<number[]>(
      (held, wide, column) => [...held, held[column] + (sizes[column] > 0 ? wide * NODE_WIDTH + (wide - 1) * WRAP_GAP + COLUMN_GAP : 0)],
      [0],
    );
    const placed = columns.map(() => 0);
    // A column shorter than the tallest is centred on it, so a chain reads as a line through the middle.
    const tallest = Math.max(1, ...tall);
    return sorted.map((node) => {
      const at = column(node);
      const index = placed[at]++;
      const across = Math.floor(index / tall[at]);
      const row = index % tall[at] + (tallest - tall[at]) / 2;
      return {
        id: node.key,
        type: 'part',
        position: { x: lefts[at] + across * (NODE_WIDTH + WRAP_GAP), y: row * (NODE_HEIGHT + ROW_GAP) },
        initialWidth: NODE_WIDTH,
        initialHeight: NODE_HEIGHT,
        measured: { width: NODE_WIDTH, height: NODE_HEIGHT },
        selected: node.key === selectedKey,
        draggable: false,
        connectable: false,
        data: {
          name: node.name,
          kind: dependantLabel(asDependant(node, workspaceId)),
          dimmed: chain !== null && !chain.has(node.key),
        },
      };
    });
  }, [graph, chain, selectedKey, workspaceId, focusKey]);

  const edges: Edge[] = useMemo(() => {
    const present = new Set(graph.nodes.map((node) => node.key));
    return graph.edges
      .filter((edge) => present.has(edge.from) && present.has(edge.to))
      .map((edge) => {
        const lit = chain !== null && chain.has(edge.from) && chain.has(edge.to);
        return {
          id: `${edge.from}->${edge.to}`,
          source: edge.from,
          target: edge.to,
          type: 'smoothstep',
          className: lit ? styles.edgeLit : chain !== null ? styles.edgeDimmed : styles.edge,
        };
      });
  }, [graph, chain]);

  return (
    <div className={`${styles.canvas} ${className ?? ''}`} data-testid="dependency-graph">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => onSelect(selectedKey === node.id ? null : node.id)}
        onPaneClick={() => onSelect(null)}
        nodesDraggable={false}
        nodesConnectable={false}
        fitView
        fitViewOptions={{ maxZoom: 1 }}
        minZoom={0.1}
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls className={styles.controls} showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

export interface DependencySelectionProps {
  graph: DependencyGraph;
  workspaceId: string;
  selectedKey: string | null;
  className?: string;
  /** Called as the part is opened, for a dialog that has to close behind it. */
  onOpen?: () => void;
}

/** The chosen part's name, how many it uses and is used by, and a way to it. */
export function DependencySelection({ graph, workspaceId, selectedKey, className, onOpen }: DependencySelectionProps) {
  const selected = graph.nodes.find((node) => node.key === selectedKey);
  if (selected === undefined) return null;
  const uses = graph.edges.filter((edge) => edge.from === selected.key).length;
  const usedBy = graph.edges.filter((edge) => edge.to === selected.key).length;
  return (
    <div className={`${styles.selection} ${className ?? ''}`} data-testid="dependency-selection">
      <span className={styles.selectionName}>{selected.name}</span>
      <span className={styles.selectionKind}>{dependantLabel(asDependant(selected, workspaceId))}</span>
      <span className={styles.selectionCounts}>
        {t('Uses')} {uses} · {t('Used by')} {usedBy}
      </span>
      <Link className={styles.open} to={dependantPath(asDependant(selected, workspaceId))} onClick={onOpen}>
        {t('Open')}
        <OpenDefinitionIcon />
      </Link>
    </div>
  );
}
