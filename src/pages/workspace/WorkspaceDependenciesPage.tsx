import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Background, Controls, Handle, Position, ReactFlow } from '@xyflow/react';
import type { Edge, Node, NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { dependantLabel, dependantPath } from '../../api/dependants';
import type { Dependant, DependencyKind } from '../../api/dependants';
import { fetchDependencyGraph } from '../../api/dependencyGraph';
import type { DependencyGraph, DependencyGraphNode } from '../../api/dependencyGraph';
import type { SessionUser } from '../../api/session';
import searchIcon from '../../assets/search.svg';
import { AppShell } from '../../components/AppShell';
import { Loader } from '../../components/Loader';
import { OpenDefinitionIcon } from '../../components/OpenDefinitionIcon';
import { WorkspaceSidebar } from '../../components/WorkspaceSidebar';
import { shellUser } from '../../session/user';
import styles from './WorkspaceDependenciesPage.module.css';
import { t } from '../../i18n';

export interface WorkspaceDependenciesPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

/**
 * The columns, left to right: what uses things on the left, what is used on
 * the right. An arrow mostly runs rightwards, so a chain reads like a sentence -
 * a workflow runs an agent that thinks with a model reached through a provider
 * that reads a variable. Arrows inside a column (an agent asking another, a
 * function importing one) are the exception and are drawn as such.
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

function asDependant(node: DependencyGraphNode, workspaceId: string): Dependant {
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
function chainOf(start: string, graph: DependencyGraph): Set<string> {
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

/** A workspace's parts and what uses what, drawn as one graph. */
export function WorkspaceDependenciesPage({ session, onSignOut }: WorkspaceDependenciesPageProps) {
  const { workspaceId = '' } = useParams();
  const [graph, setGraph] = useState<DependencyGraph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [hideUnused, setHideUnused] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    if (workspaceId === '') return;
    setGraph(null);
    setError(null);
    setSelectedKey(null);
    fetchDependencyGraph(workspaceId)
      .then(setGraph)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : t('Could not load the dependencies.')));
  }, [workspaceId]);

  const shown = useMemo(() => {
    if (graph === null) return null;
    const linked = new Set(graph.edges.flatMap((edge) => [edge.from, edge.to]));
    const nodes = hideUnused ? graph.nodes.filter((node) => linked.has(node.key)) : graph.nodes;
    return { nodes, edges: graph.edges };
  }, [graph, hideUnused]);

  const chain = useMemo(
    () => (graph !== null && selectedKey !== null ? chainOf(selectedKey, graph) : null),
    [graph, selectedKey],
  );
  const needle = search.trim().toLowerCase();

  const nodes: Node<PartData>[] = useMemo(() => {
    if (shown === null) return [];
    const order = (node: DependencyGraphNode) => COLUMNS[columnOf(node.kind)].indexOf(node.kind);
    const sorted = [...shown.nodes].sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));
    // Each column is as many boxes wide as it needs to stay at most MOST_ROWS tall, and starts where the last ended.
    const sizes = COLUMNS.map((_, column) => sorted.filter((node) => columnOf(node.kind) === column).length);
    const wraps = sizes.map((size) => Math.max(1, Math.ceil(size / MOST_ROWS)));
    const tall = sizes.map((size, column) => Math.ceil(size / wraps[column]));
    const lefts = wraps.reduce<number[]>(
      (held, wide, column) => [...held, held[column] + wide * NODE_WIDTH + (wide - 1) * WRAP_GAP + (wide > 0 && sizes[column] > 0 ? COLUMN_GAP : 0)],
      [0],
    );
    const placed = COLUMNS.map(() => 0);
    return sorted
      .map((node) => {
        const column = columnOf(node.kind);
        const at = placed[column]++;
        const across = Math.floor(at / tall[column]);
        const row = at % tall[column];
        const x = lefts[column] + across * (NODE_WIDTH + WRAP_GAP);
        const matches = needle === '' || node.name.toLowerCase().includes(needle);
        return {
          id: node.key,
          type: 'part',
          position: { x, y: row * (NODE_HEIGHT + ROW_GAP) },
          initialWidth: NODE_WIDTH,
          initialHeight: NODE_HEIGHT,
          measured: { width: NODE_WIDTH, height: NODE_HEIGHT },
          selected: node.key === selectedKey,
          draggable: false,
          connectable: false,
          data: {
            name: node.name,
            kind: dependantLabel(asDependant(node, workspaceId)),
            dimmed: !matches || (chain !== null && !chain.has(node.key)),
          },
        };
      });
  }, [shown, needle, chain, selectedKey, workspaceId]);

  const edges: Edge[] = useMemo(() => {
    if (shown === null) return [];
    const present = new Set(shown.nodes.map((node) => node.key));
    return shown.edges
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
  }, [shown, chain]);

  const selected = graph?.nodes.find((node) => node.key === selectedKey) ?? null;
  const uses = selected === null ? 0 : (graph?.edges.filter((edge) => edge.from === selected.key).length ?? 0);
  const usedBy = selected === null ? 0 : (graph?.edges.filter((edge) => edge.to === selected.key).length ?? 0);

  return (
    <AppShell
      user={shellUser(session)}
      workspacePath={`/workspace/${workspaceId}`}
      showAdmin={session.admin}
      onSignOut={onSignOut}
      sidebar={<WorkspaceSidebar workspaceId={workspaceId} />}
    >
      <header className={styles.titleHeader}>
        <h1 className={styles.title}>{t('Dependencies')}</h1>
        <p className={styles.subtitle}>{t('What uses what in this workspace')}</p>
      </header>

      <div className={styles.filterBar}>
        <div className={styles.searchInput}>
          <img src={searchIcon} alt="" width={14} height={14} />
          <input
            className={styles.searchField}
            type="search"
            placeholder={t('Search by name...')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label={t('Search the dependencies')}
          />
        </div>
        <label className={styles.toggle}>
          <input type="checkbox" checked={hideUnused} onChange={(event) => setHideUnused(event.target.checked)} />
          {t('Hide unconnected')}
        </label>
        {selected !== null && (
          <div className={styles.selection} data-testid="dependency-selection">
            <span className={styles.selectionName}>{selected.name}</span>
            <span className={styles.selectionKind}>{dependantLabel(asDependant(selected, workspaceId))}</span>
            <span className={styles.selectionCounts}>
              {t('Uses')} {uses} · {t('Used by')} {usedBy}
            </span>
            <Link className={styles.open} to={dependantPath(asDependant(selected, workspaceId))}>
              {t('Open')}
              <OpenDefinitionIcon />
            </Link>
          </div>
        )}
      </div>

      {error !== null && <p className={styles.notice}>{error}</p>}
      {error === null && graph === null && (
        <p className={styles.notice}>
          <Loader />
        </p>
      )}
      {graph !== null && graph.nodes.length === 0 && <p className={styles.notice}>{t('Nothing in this workspace yet.')}</p>}
      {graph !== null && graph.nodes.length > 0 && (
        <div className={styles.canvas} data-testid="dependency-graph">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodeClick={(_, node) => setSelectedKey((held) => (held === node.id ? null : node.id))}
            onPaneClick={() => setSelectedKey(null)}
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
      )}
    </AppShell>
  );
}
