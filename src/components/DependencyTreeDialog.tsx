import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Background, Controls, Handle, Position, ReactFlow } from '@xyflow/react';
import type { Edge, Node, NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { dependantLabel, dependantPath } from '../api/dependants';
import type { Dependant, DependencyKind } from '../api/dependants';
import { fetchDependencyGraph } from '../api/dependencyGraph';
import type { DependencyGraph, DependencyGraphNode } from '../api/dependencyGraph';
import { DialogEdges, useDialogSize } from './DialogSize';
import { Loader } from './Loader';
import { OpenDefinitionIcon } from './OpenDefinitionIcon';
import { PanelClose } from './PanelClose';
import styles from './Dialog.module.css';
import own from './DependencyTreeDialog.module.css';
import { t } from '../i18n';

export interface DependencyTreeDialogProps {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  kind: DependencyKind;
  componentId: string;
}

/** One box of a branch, and the boxes under it. */
export interface TreeBranch {
  node: DependencyGraphNode;
  children: TreeBranch[];
  /** Already drawn elsewhere in this branch's tree: named, and not followed again. */
  repeat: boolean;
}

const BOX_WIDTH = 220;
const BOX_HEIGHT = 44;
const LEVEL_GAP = 56;
const SIBLING_GAP = 14;

/** The key a part goes by on the graph: the server's `KIND:id`. */
function graphKey(kind: DependencyKind, id: string): string {
  return `${kind}:${id}`;
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

/**
 * The parts under `root` one way along the arrows - what it uses, or what uses
 * it - followed to the end.
 *
 * A graph is not a tree: two things can use one part, and a part can come back
 * round to itself. So each part is followed the first time it is reached, and
 * any later time it is a box marked as shown elsewhere - which keeps the tree as
 * large as the graph and no larger, and ends every loop.
 */
export function branchesOf(root: string, graph: DependencyGraph, uses: boolean): TreeBranch[] {
  const byKey = new Map(graph.nodes.map((node) => [node.key, node]));
  const next = (key: string) =>
    graph.edges
      .filter((edge) => (uses ? edge.from : edge.to) === key)
      .map((edge) => byKey.get(uses ? edge.to : edge.from))
      .filter((node): node is DependencyGraphNode => node !== undefined)
      .sort((a, b) => a.name.localeCompare(b.name));
  const seen = new Set([root]);
  const grow = (key: string): TreeBranch[] =>
    next(key).map((node) => {
      if (seen.has(node.key)) return { node, children: [], repeat: true };
      seen.add(node.key);
      return { node, children: grow(node.key), repeat: false };
    });
  return grow(root);
}

interface BoxData extends Record<string, unknown> {
  name: string;
  kind: string;
  root: boolean;
  repeat: boolean;
  side: 'root' | 'uses' | 'used-by';
}

function TreeBox({ data, selected }: NodeProps<Node<BoxData>>) {
  const classes = [own.box, data.root ? own.boxRoot : '', data.repeat ? own.boxRepeat : '', selected ? own.boxSelected : ''];
  return (
    <div
      className={classes.join(' ')}
      data-tree-name={data.name}
      data-tree-side={data.side}
      data-tree-repeat={data.repeat ? '' : undefined}
    >
      <Handle type="target" position={Position.Left} className={own.handle} isConnectable={false} />
      <span className={own.boxName}>{data.name}</span>
      <span className={own.boxKind}>
        {data.kind}
        {data.repeat && <span className={own.repeat}> · {t('shown elsewhere')}</span>}
      </span>
      <Handle type="source" position={Position.Right} className={own.handle} isConnectable={false} />
    </div>
  );
}

const nodeTypes = { box: TreeBox };

interface Drawn {
  nodes: Node<BoxData>[];
  edges: Edge[];
  /** Box id to the part it shows. */
  parts: Map<string, DependencyGraphNode>;
}

/**
 * The tree laid out: the part in the middle, what uses it branching out to the
 * left and what it uses to the right, a column per step. Each branch is as tall
 * as the leaves under it and its box sits at the middle of them, so a parent is
 * always level with its children and no two branches cross. Arrows run from a
 * user to what it uses - rightwards on both sides.
 */
function layOut(part: DependencyGraphNode, uses: TreeBranch[], usedBy: TreeBranch[], workspaceId: string): Drawn {
  const nodes: Node<BoxData>[] = [];
  const edges: Edge[] = [];
  const parts = new Map<string, DependencyGraphNode>();
  const pitch = BOX_HEIGHT + SIBLING_GAP;
  const leaves = (branch: TreeBranch): number =>
    branch.children.length === 0 ? 1 : branch.children.reduce((sum, child) => sum + leaves(child), 0);

  const box = (id: string, node: DependencyGraphNode, x: number, y: number, data: { root: boolean; repeat: boolean; side: BoxData['side'] }) => {
    parts.set(id, node);
    nodes.push({
      id,
      type: 'box',
      position: { x, y },
      initialWidth: BOX_WIDTH,
      initialHeight: BOX_HEIGHT,
      measured: { width: BOX_WIDTH, height: BOX_HEIGHT },
      draggable: false,
      connectable: false,
      data: { name: node.name, kind: dependantLabel(asDependant(node, workspaceId)), ...data },
    });
  };

  box('root', part, 0, 0, { root: true, repeat: false, side: 'root' });

  const side = (branches: TreeBranch[], direction: 1 | -1, name: 'uses' | 'used-by') => {
    const place = (list: TreeBranch[], parent: string, depth: number, top: number) => {
      let at = top;
      list.forEach((branch, index) => {
        // By side and path, so the two sides' first boxes are not both root/0.
        const id = `${parent === 'root' ? name : parent}/${index}`;
        const span = leaves(branch);
        box(id, branch.node, direction * depth * (BOX_WIDTH + LEVEL_GAP), (at + (span - 1) / 2) * pitch, {
          root: false,
          repeat: branch.repeat,
          side: name,
        });
        // A user points at what it uses: on the right that is parent to child, on the left child to parent.
        const [source, target] = direction === 1 ? [parent, id] : [id, parent];
        edges.push({ id: `${source}->${target}`, source, target, type: 'smoothstep', className: own.edge });
        place(branch.children, id, depth + 1, at);
        at += span;
      });
    };
    const total = branches.reduce((sum, branch) => sum + leaves(branch), 0);
    place(branches, 'root', 1, -(total - 1) / 2);
  };
  side(uses, 1, 'uses');
  side(usedBy, -1, 'used-by');
  return { nodes, edges, parts };
}

/**
 * One part's dependencies drawn as a tree: what it uses, followed out to the
 * right, and what uses it, followed out to the left - the Used by list
 * followed to the end, with the other direction beside it.
 *
 * The workspace's whole graph is fetched and walked here, so this and every
 * Used by list answer from the same rows and cannot disagree.
 */
export function DependencyTreeDialog({ open, onClose, workspaceId, kind, componentId }: DependencyTreeDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [graph, setGraph] = useState<DependencyGraph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState('root');
  /** The part the graph is drawn around: the page's own, or one chosen in it to follow from. */
  const [root, setRoot] = useState(graphKey(kind, componentId));
  // Dragged bigger from any edge or corner, and remembered: a large workspace's graph wants the room.
  const sizing = useDialogSize({ storageKey: 'orknux.dialog.dependency-graph.size', open, minWidth: 480, minHeight: 320 });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setGraph(null);
    setError(null);
    setSelected('root');
    setRoot(graphKey(kind, componentId));
    fetchDependencyGraph(workspaceId)
      .then(setGraph)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : t('Could not load the dependencies.')));
  }, [open, workspaceId, kind, componentId]);

  const drawn = useMemo(() => {
    const part = graph?.nodes.find((node) => node.key === root);
    if (graph === null || part === undefined) return null;
    return layOut(part, branchesOf(root, graph, true), branchesOf(root, graph, false), workspaceId);
  }, [graph, root, workspaceId]);

  const nodes = useMemo(
    () => drawn?.nodes.map((node) => ({ ...node, selected: node.id === selected })) ?? [],
    [drawn, selected],
  );
  const chosen = drawn?.parts.get(selected) ?? null;

  return (
    <dialog
      ref={dialogRef}
      className={`${styles.dialog} ${styles.dialogResizable} ${own.treeDialog}`}
      style={sizing.style}
      data-sized={sizing.sized || undefined}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      aria-label={t('Dependency graph')}
      data-testid="dependency-tree-dialog"
    >
      <DialogEdges {...sizing.edgeProps} />
      {open && (
        <div className={`${styles.body} ${own.body}`}>
          <header className={styles.header}>
            <h2 className={styles.title}>{t('Dependency graph')}</h2>
            <PanelClose onClose={onClose} />
          </header>
          {error !== null && <p className={styles.error}>{error}</p>}
          {/*
            At once rather than after the house quiet period: somebody has just
            pressed for this, and an empty dialog for three seconds reads as one
            that has nothing to show. In a frame the tree's size, so it does not
            jump when the tree lands.
          */}
          {error === null && graph === null && (
            <div className={`${own.canvas} ${own.waiting}`} data-testid="dependency-tree-loading">
              <Loader delay={0} />
            </div>
          )}
          {graph !== null && drawn === null && <p className={own.empty}>{t('Nothing uses this yet.')}</p>}
          {drawn !== null && (
            <>
              <div className={own.legend}>
                <span>
                  ← {t('Used by')} · {t('Uses')} →
                </span>
                {chosen !== null && (
                  <span className={own.selection} data-testid="dependency-tree-selection">
                    <span className={own.selectionName}>{chosen.name}</span>
                    {selected !== 'root' && (
                      <button
                        type="button"
                        className={own.follow}
                        onClick={() => {
                          setRoot(chosen.key);
                          setSelected('root');
                        }}
                        data-testid="dependency-tree-follow"
                      >
                        {t('Show graph')}
                      </button>
                    )}
                    <Link className={own.open} to={dependantPath(asDependant(chosen, workspaceId))} onClick={onClose}>
                      {t('Open')}
                      <OpenDefinitionIcon />
                    </Link>
                  </span>
                )}
              </div>
              <div className={own.canvas} data-testid="dependency-tree">
                <ReactFlow
                  // A new middle is a new picture: drawn afresh, so it is fitted and centred again.
                  key={root}
                  nodes={nodes}
                  edges={drawn.edges}
                  nodeTypes={nodeTypes}
                  onNodeClick={(_, node) => setSelected(node.id)}
                  nodesDraggable={false}
                  nodesConnectable={false}
                  fitView
                  // Readable rather than whole: a deep tree is panned, not shrunk until its names cannot be read.
                  fitViewOptions={{ maxZoom: 1, minZoom: 0.75 }}
                  minZoom={0.1}
                  proOptions={{ hideAttribution: true }}
                >
                  <Background />
                  <Controls className={own.controls} showInteractive={false} />
                </ReactFlow>
              </div>
            </>
          )}
        </div>
      )}
    </dialog>
  );
}
