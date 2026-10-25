import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useViewport,
} from '@xyflow/react';
import type { Connection, EdgeChange, NodeChange } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import {
  askDiagram,
  describeDiagram,
  DIAGRAM_EDGE_KINDS,
  DIAGRAM_NODE_KINDS,
  diagramExportUrl,
  drawingOf,
  fetchDiagram,
  renameDiagram,
  saveDiagram,
  setDiagramAgentAccess,
} from '../../api/diagrams';
import type {
  Diagram,
  DiagramAgentAccess,
  DiagramDrawing,
  DiagramEdgeData,
  DiagramEdgeKind,
  DiagramNodeData,
  DiagramNodeKind,
  DiagramTurn,
} from '../../api/diagrams';
import { fetchModels } from '../../api/models';
import type { Model } from '../../api/models';
import type { SessionUser } from '../../api/session';
import circleIcon from '../../assets/circle-dot.svg';
import dashboardIcon from '../../assets/layout-dashboard.svg';
import frameIcon from '../../assets/frame.svg';
import gitBranchIcon from '../../assets/git-branch.svg';
import networkIcon from '../../assets/network.svg';
import chevronIcon from '../../assets/chevron-down.svg';
import pencilIcon from '../../assets/pencil.svg';
import polishIcon from '../../assets/wand-sparkles.svg';
import redoIcon from '../../assets/redo.svg';
import roundedIcon from '../../assets/rectangle-button.svg';
import sendIcon from '../../assets/send.svg';
import squareIcon from '../../assets/square.svg';
import stickyIcon from '../../assets/sticky-note.svg';
import diamondIcon from '../../assets/diamond.svg';
import undoIcon from '../../assets/undo.svg';
import usersIcon from '../../assets/users.svg';
import { AppShell } from '../../components/AppShell';
import { Loader } from '../../components/Loader';
import { Markdown } from '../../components/Markdown';
import { Select } from '../../components/Select';
import { useSieve } from '../../components/sieve';
import { UnsavedWorkDialog } from '../../components/UnsavedWorkDialog';
import { askBeforeLeaving, useLeaveGuard } from '../../components/leaveGuard';
import form from '../../components/Dialog.module.css';
import { t, tf } from '../../i18n';
import {
  matches,
  useArrangeShortcut,
  useCopyShortcut,
  useCutShortcut,
  useDuplicateShortcut,
  usePasteShortcut,
  useRedoShortcut,
  useSaveShortcut,
  useUndoShortcut,
  useZoomInShortcut,
  useZoomOutShortcut,
} from '../../session/shortcut';
import { shellUser } from '../../session/user';
import shell from '../design/DesignImageEditorPage.module.css';
import chat from '../design/WireframeEditorPage.module.css';
import { EDGE_TYPES, LabelEditingContext, NODE_TYPES, SWATCHES } from './DiagramCanvas';
import type { LinkEdge, ShapeNode } from './DiagramCanvas';
import { agentAccessOptions } from './DiagramsPage';
import styles from './DiagramEditorPage.module.css';
import { laidOut } from './diagramLayout';
import type { LayoutDirection } from './diagramLayout';

export interface DiagramEditorPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

/** The grid things snap to, in the drawing's pixels. */
const GRID = 8;
/** How many steps undo keeps. */
const UNDO_DEPTH = 100;
/** How far a paste lands from what was copied. */
const PASTE_OFFSET = 32;

/** What a shape is called on its button. */
const SHAPES: { kind: DiagramNodeKind; icon: string; label: () => string }[] = [
  { kind: 'box', icon: squareIcon, label: () => t('Box') },
  { kind: 'rounded', icon: roundedIcon, label: () => t('Rounded box') },
  { kind: 'ellipse', icon: circleIcon, label: () => t('Ellipse') },
  { kind: 'diamond', icon: diamondIcon, label: () => t('Diamond') },
  { kind: 'note', icon: stickyIcon, label: () => t('Note') },
  { kind: 'group', icon: frameIcon, label: () => t('Group') },
];

/** The size a new node starts at - the server's own defaults (`DiagramNodeKind`). */
const MADE: Record<DiagramNodeKind, { w: number; h: number }> = {
  box: { w: 160, h: 60 },
  rounded: { w: 160, h: 60 },
  ellipse: { w: 160, h: 70 },
  diamond: { w: 140, h: 90 },
  note: { w: 180, h: 100 },
  group: { w: 360, h: 240 },
};

function kindLabel(kind: DiagramNodeKind): string {
  return SHAPES.find((one) => one.kind === kind)?.label() ?? kind;
}

function edgeKindLabel(kind: DiagramEdgeKind): string {
  switch (kind) {
    case 'arrow':
      return t('Arrow');
    case 'line':
      return t('Line');
    case 'dashed':
      return t('Dashed arrow');
    case 'both':
      return t('Arrow both ways');
  }
}

const freshId = (prefix: string) => `${prefix}${Math.random().toString(36).slice(2, 10)}`;
const snap = (value: number) => Math.round(value / GRID) * GRID;

/** What Copy and Cut put down and Paste picks up: for the length of the tab, across diagrams. */
let clipboard: DiagramDrawing | null = null;

/** What an empty chat offers: a pressed card is sent as it is. */
interface Idea {
  icon: string;
  title: () => string;
  line: () => string;
  prompt: () => string;
}

const IDEAS: Idea[] = [
  {
    icon: networkIcon,
    title: () => t('System landscape'),
    line: () => t('Services, stores and who calls whom'),
    prompt: () => t('Draw a system landscape: a web app, an API, a database, a queue and two background workers, with labelled connections saying what each calls.'),
  },
  {
    icon: gitBranchIcon,
    title: () => t('Process flow'),
    line: () => t('Steps, a decision and the outcomes'),
    prompt: () => t('Draw a process from an order arriving to it being shipped, with a decision for payment failing, and notes on each step saying who does it.'),
  },
  {
    icon: usersIcon,
    title: () => t('Team map'),
    line: () => t('Teams, owners and what they own'),
    prompt: () => t('Draw a map of three teams as groups, the systems each owns inside them, and how those systems depend on each other.'),
  },
  {
    icon: dashboardIcon,
    title: () => t('Decision tree'),
    line: () => t('Questions branching to answers'),
    prompt: () => t('Draw a decision tree for choosing a database: diamonds for the questions and rounded boxes for the answers.'),
  },
];

const POLISH: Idea = {
  icon: polishIcon,
  title: () => t('Tidy this diagram'),
  line: () => t('Label, connect and annotate what is here'),
  prompt: () => t('Tidy this diagram: give every node and connection a clear label, add the connections that are obviously missing, and write a line of notes on each node.'),
};

const talkKey = (id: string) => `orknux.diagram.talk.${id}`;
const modelKey = (workspaceId: string) => `orknux.diagram.model.${workspaceId}`;

/** The editor as the routes hold it: one page per diagram, so another one opens afresh. */
export function DiagramEditorRoute(props: DiagramEditorPageProps) {
  const { diagramId = '' } = useParams();
  return (
    <ReactFlowProvider key={diagramId}>
      <DiagramEditorPage {...props} />
    </ReactFlowProvider>
  );
}

/** A node's place among the others: how many groups it sits in. */
function depthOf(node: DiagramNodeData, byId: Map<string, DiagramNodeData>): number {
  let depth = 0;
  let up = node.parent;
  const seen = new Set<string>();
  while (up !== undefined && !seen.has(up)) {
    seen.add(up);
    depth += 1;
    up = byId.get(up)?.parent;
  }
  return depth;
}

/** Whether [id] is [group] or sits somewhere inside it. */
function within(id: string, group: string, byId: Map<string, DiagramNodeData>): boolean {
  let at: string | undefined = id;
  const seen = new Set<string>();
  while (at !== undefined && !seen.has(at)) {
    if (at === group) return true;
    seen.add(at);
    at = byId.get(at)?.parent;
  }
  return false;
}

/**
 * Where a diagram is drawn: the canvas, its tools along the top, and down the
 * right a panel holding what is selected and a conversation with a chat model
 * that works on the diagram.
 *
 * The wireframe editor's shell and panel, so the two editors read as one
 * product, with React Flow for the canvas, as the workflow editor has. The
 * drawing is held here as the server holds it - absolute positions, a group
 * named by each node's parent - and React Flow's nodes are made from it on
 * every change, each carrying its size as `measured`, so the lines between
 * them survive the rebuild (see AGENTS.md). Undo is whole-drawing snapshots;
 * what a model draws is saved by the model, taken up when it answers, and is
 * one step undo goes back over.
 */
export function DiagramEditorPage({ session, onSignOut }: DiagramEditorPageProps) {
  const firstName = (session.displayName?.trim() || session.username).split(/\s+/)[0];
  const { workspaceId = '', diagramId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const flow = useReactFlow();
  const viewport = useViewport();

  const [diagram, setDiagram] = useState<Diagram | null>(null);
  const [missing, setMissing] = useState(false);
  const [drawing, setDrawing] = useState<DiagramDrawing>({ nodes: [], edges: [] });
  const [saved, setSaved] = useState('');
  const [selectedNodes, setSelectedNodes] = useState<string[]>([]);
  const [selectedEdges, setSelectedEdges] = useState<string[]>([]);
  const [past, setPast] = useState<DiagramDrawing[]>([]);
  const [future, setFuture] = useState<DiagramDrawing[]>([]);
  const [naming, setNaming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<'layout' | 'align' | 'export' | null>(null);
  /** Whether the Diagram section is folded away, remembered for the person: open unless they folded it. */
  const [diagramFold, setDiagramFold] = useSieve('diagram.editor.diagram-section');
  const diagramOpen = diagramFold !== 'closed';
  /** The label being typed over in place, on the canvas. */
  const [labelling, setLabelling] = useState<{ kind: 'node' | 'edge'; id: string } | null>(null);

  const [models, setModels] = useState<Model[] | null>(null);
  const [modelId, setModelId] = useState('');
  const [talk, setTalk] = useState<DiagramTurn[]>([]);
  const [asking, setAsking] = useState('');
  const [answering, setAnswering] = useState(false);
  const [talkError, setTalkError] = useState<string | null>(null);

  const talkEnd = useRef<HTMLDivElement | null>(null);
  /** The drawing as it was when a drag, a resize or a typed field began, so the whole gesture is one step. */
  const gestureStart = useRef<DiagramDrawing | null>(null);

  const undoKey = useUndoShortcut();
  const redoKey = useRedoShortcut();
  const saveKey = useSaveShortcut();
  const duplicateKey = useDuplicateShortcut();
  const copyKey = useCopyShortcut();
  const cutKey = useCutShortcut();
  const pasteKey = usePasteShortcut();
  const zoomInKey = useZoomInShortcut();
  const zoomOutKey = useZoomOutShortcut();
  const arrangeKey = useArrangeShortcut();

  const unsaved = diagram !== null && JSON.stringify(drawing) !== saved;
  const noteMost = diagram?.noteCharactersMost ?? 5000;
  const byId = useMemo(() => new Map(drawing.nodes.map((node) => [node.id, node])), [drawing]);

  // -- Loading ------------------------------------------------------------

  useEffect(() => {
    if (diagramId === '') return;
    let left = false;
    fetchDiagram(diagramId)
      .then((found) => {
        if (left) return;
        if (found === null) {
          setMissing(true);
          return;
        }
        take(found);
        const asked = searchParams.get('node');
        const drawn = drawingOf(found);
        window.requestAnimationFrame(() => {
          const node = asked === null ? undefined : drawn.nodes.find((one) => one.id === asked);
          if (node === undefined) {
            void flow.fitView({ padding: 0.2, maxZoom: 1 });
          } else {
            setSelectedNodes([node.id]);
            void flow.setCenter(node.x + node.w / 2, node.y + node.h / 2, { zoom: 1 });
          }
        });
      })
      .catch((cause: unknown) => {
        if (!left) setError(cause instanceof Error ? cause.message : t('Could not load the diagram.'));
      });
    try {
      const kept = sessionStorage.getItem(talkKey(diagramId));
      if (kept !== null) setTalk(JSON.parse(kept) as DiagramTurn[]);
    } catch {
      // Nothing kept, or nowhere to keep it: the conversation starts empty.
    }
    return () => {
      left = true;
    };
    // Loaded once per diagram; the route remounts the page for another.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagramId]);

  useEffect(() => {
    if (workspaceId === '') return;
    fetchModels(workspaceId)
      .then((all) => {
        const usable = all.filter((one) => one.kind === 'CHAT' && one.enabled !== false);
        setModels(usable);
        let remembered: string | null = null;
        try {
          remembered = localStorage.getItem(modelKey(workspaceId));
        } catch {
          remembered = null;
        }
        setModelId(usable.some((one) => one.id === remembered) ? (remembered ?? '') : (usable[0]?.id ?? ''));
      })
      .catch(() => setModels([]));
  }, [workspaceId]);

  useEffect(() => {
    try {
      if (diagramId !== '') sessionStorage.setItem(talkKey(diagramId), JSON.stringify(talk));
    } catch {
      // A conversation that cannot be kept is still a conversation.
    }
    talkEnd.current?.scrollIntoView({ block: 'end' });
  }, [talk, answering, diagramId]);

  /** A diagram as the server holds it, taken onto the canvas. */
  function take(found: Diagram) {
    const drawn = drawingOf(found);
    setDiagram(found);
    setDrawing(drawn);
    setSaved(JSON.stringify(drawn));
    setSelectedNodes((held) => held.filter((id) => drawn.nodes.some((one) => one.id === id)));
    setSelectedEdges((held) => held.filter((id) => drawn.edges.some((one) => one.id === id)));
  }

  // -- Undo ---------------------------------------------------------------

  function remember(before: DiagramDrawing) {
    setPast((held) => [...held, before].slice(-UNDO_DEPTH));
    setFuture([]);
  }

  function change(next: DiagramDrawing) {
    remember(drawing);
    setDrawing(next);
  }

  function undo() {
    if (past.length === 0) return;
    const to = past[past.length - 1];
    setPast(past.slice(0, -1));
    setFuture((ahead) => [drawing, ...ahead]);
    setDrawing(to);
  }

  function redo() {
    if (future.length === 0) return;
    const [to, ...rest] = future;
    setFuture(rest);
    setPast((held) => [...held, drawing]);
    setDrawing(to);
  }

  /** A gesture's start, for fields typed into and handles dragged: the step is pushed once it ends. */
  function begin() {
    if (gestureStart.current === null) gestureStart.current = drawing;
  }

  function end() {
    const before = gestureStart.current;
    gestureStart.current = null;
    if (before !== null && JSON.stringify(before) !== JSON.stringify(drawing)) remember(before);
  }

  // -- What React Flow draws -------------------------------------------------

  /*
   * Groups before what sits in them, as React Flow wants a parent before its
   * children; a child's position relative to its group, which is how React
   * Flow places it; and every node's size said as measured, since the box is
   * exactly that size, so its lines are kept across this rebuild.
   */
  const nodes = useMemo<ShapeNode[]>(() => {
    const ordered = [...drawing.nodes].sort((a, b) => {
      const groups = Number(b.kind === 'group') - Number(a.kind === 'group');
      return depthOf(a, byId) - depthOf(b, byId) || groups;
    });
    return ordered.map((node) => {
      const parent = node.parent === undefined ? undefined : byId.get(node.parent);
      return {
        id: node.id,
        type: 'shape',
        position: { x: node.x - (parent?.x ?? 0), y: node.y - (parent?.y ?? 0) },
        parentId: parent?.id,
        data: { kind: node.kind, label: node.label, color: node.color, noted: (node.notes ?? '') !== '' },
        width: node.w,
        height: node.h,
        initialWidth: node.w,
        initialHeight: node.h,
        measured: { width: node.w, height: node.h },
        selected: selectedNodes.includes(node.id),
        zIndex: node.kind === 'group' ? -1 : undefined,
      };
    });
  }, [drawing, byId, selectedNodes]);

  const edges = useMemo<LinkEdge[]>(
    () =>
      drawing.edges.map((edge) => ({
        id: edge.id,
        source: edge.from,
        target: edge.to,
        type: 'link',
        data: { kind: edge.kind, label: edge.label },
        markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
        markerStart: { type: MarkerType.ArrowClosed, width: 18, height: 18, orient: 'auto-start-reverse' },
        selected: selectedEdges.includes(edge.id),
      })),
    [drawing, selectedEdges],
  );

  /** A node and everything inside it moved by the same amount. */
  function shifted(from: DiagramDrawing, id: string, dx: number, dy: number): DiagramDrawing {
    const index = new Map(from.nodes.map((node) => [node.id, node]));
    return {
      ...from,
      nodes: from.nodes.map((node) => (within(node.id, id, index) ? { ...node, x: node.x + dx, y: node.y + dy } : node)),
    };
  }

  function onNodesChange(changes: NodeChange<ShapeNode>[]) {
    let next = drawing;
    let picked = selectedNodes;
    for (const one of changes) {
      if (one.type === 'select') {
        picked = one.selected ? [...new Set([...picked, one.id])] : picked.filter((id) => id !== one.id);
      } else if (one.type === 'position' && one.position !== undefined) {
        const node = next.nodes.find((held) => held.id === one.id);
        if (node === undefined) continue;
        const parent = node.parent === undefined ? undefined : next.nodes.find((held) => held.id === node.parent);
        const x = Math.round(one.position.x + (parent?.x ?? 0));
        const y = Math.round(one.position.y + (parent?.y ?? 0));
        if (x !== node.x || y !== node.y) next = shifted(next, node.id, x - node.x, y - node.y);
      } else if (one.type === 'dimensions' && one.dimensions !== undefined && one.resizing !== undefined) {
        if (one.resizing) begin();
        const w = Math.max(GRID * 3, Math.round(one.dimensions.width));
        const h = Math.max(GRID * 3, Math.round(one.dimensions.height));
        next = { ...next, nodes: next.nodes.map((node) => (node.id === one.id ? { ...node, w, h } : node)) };
        if (!one.resizing) window.requestAnimationFrame(() => end());
      }
    }
    if (picked !== selectedNodes) setSelectedNodes(picked);
    if (next !== drawing) setDrawing(next);
  }

  function onEdgesChange(changes: EdgeChange<LinkEdge>[]) {
    let picked = selectedEdges;
    for (const one of changes) {
      if (one.type === 'select') picked = one.selected ? [...new Set([...picked, one.id])] : picked.filter((id) => id !== one.id);
    }
    if (picked !== selectedEdges) setSelectedEdges(picked);
  }

  function onConnect(connection: Connection) {
    if (connection.source === connection.target) return;
    const made: DiagramEdgeData = { id: freshId('e'), from: connection.source, to: connection.target, kind: 'arrow' };
    change({ ...drawing, edges: [...drawing.edges, made] });
    setSelectedNodes([]);
    setSelectedEdges([made.id]);
  }

  /** A node let go of lands in the smallest group under its middle, or in none. */
  function onDragStop(dragged: string[]) {
    let next = drawing;
    const index = new Map(next.nodes.map((node) => [node.id, node]));
    for (const id of dragged) {
      const node = index.get(id);
      if (node === undefined) continue;
      const cx = node.x + node.w / 2;
      const cy = node.y + node.h / 2;
      const home = next.nodes
        .filter((group) => group.kind === 'group' && !within(group.id, node.id, index))
        .filter((group) => cx >= group.x && cx <= group.x + group.w && cy >= group.y && cy <= group.y + group.h)
        .sort((a, b) => a.w * a.h - b.w * b.h)[0];
      if (home?.id !== node.parent) {
        next = { ...next, nodes: next.nodes.map((held) => (held.id === id ? { ...held, parent: home?.id } : held)) };
      }
    }
    if (next !== drawing) setDrawing(next);
    window.requestAnimationFrame(() => end());
  }

  // -- Edits ----------------------------------------------------------------

  /** A new node of [kind], in the middle of what is on screen. */
  function add(kind: DiagramNodeKind) {
    const size = MADE[kind];
    const box = document.querySelector('[data-testid="diagram-canvas"]')?.getBoundingClientRect();
    const middle = box === undefined ? { x: 0, y: 0 } : flow.screenToFlowPosition({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
    // Each new one a little further on than the last, so a row of clicks is not one pile.
    const offset = (drawing.nodes.length % 6) * GRID * 3;
    const made: DiagramNodeData = {
      id: freshId('n'),
      kind,
      label: kind === 'group' ? t('Group') : kind === 'note' ? t('Note') : t('New node'),
      x: snap(middle.x - size.w / 2 + offset),
      y: snap(middle.y - size.h / 2 + offset),
      w: size.w,
      h: size.h,
    };
    change({ ...drawing, nodes: kind === 'group' ? [made, ...drawing.nodes] : [...drawing.nodes, made] });
    setSelectedNodes([made.id]);
    setSelectedEdges([]);
  }

  function remove() {
    if (selectedNodes.length === 0 && selectedEdges.length === 0) return;
    const gone = new Set(selectedNodes);
    change({
      nodes: drawing.nodes.filter((node) => !gone.has(node.id)).map((node) => (node.parent !== undefined && gone.has(node.parent) ? { ...node, parent: undefined } : node)),
      edges: drawing.edges.filter((edge) => !selectedEdges.includes(edge.id) && !gone.has(edge.from) && !gone.has(edge.to)),
    });
    setSelectedNodes([]);
    setSelectedEdges([]);
  }

  /** What is selected, and the connections between it. */
  function picked(): DiagramDrawing | null {
    if (selectedNodes.length === 0) return null;
    const ids = new Set(selectedNodes);
    return {
      nodes: drawing.nodes.filter((node) => ids.has(node.id)),
      edges: drawing.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to)),
    };
  }

  function copy() {
    const held = picked();
    if (held !== null) clipboard = held;
  }

  function cut() {
    const held = picked();
    if (held === null) return;
    clipboard = held;
    remove();
  }

  function paste(from: DiagramDrawing | null = clipboard) {
    if (from === null || from.nodes.length === 0) return;
    const renamed = new Map(from.nodes.map((node) => [node.id, freshId('n')]));
    const nodes = from.nodes.map((node) => ({
      ...node,
      id: renamed.get(node.id) as string,
      x: node.x + PASTE_OFFSET,
      y: node.y + PASTE_OFFSET,
      parent: node.parent === undefined ? undefined : (renamed.get(node.parent) ?? (byId.has(node.parent) ? node.parent : undefined)),
    }));
    const edges = from.edges.map((edge) => ({
      ...edge,
      id: freshId('e'),
      from: renamed.get(edge.from) as string,
      to: renamed.get(edge.to) as string,
    }));
    change({ nodes: [...drawing.nodes, ...nodes], edges: [...drawing.edges, ...edges] });
    setSelectedNodes(nodes.map((node) => node.id));
    setSelectedEdges([]);
  }

  function duplicate() {
    paste(picked());
  }

  function nudge(dx: number, dy: number) {
    if (selectedNodes.length === 0) return;
    let next = drawing;
    for (const id of selectedNodes) next = shifted(next, id, dx, dy);
    change(next);
  }

  /** The selected nodes lined up on one edge or middle of the first of them. */
  function align(how: 'left' | 'centre' | 'right' | 'top' | 'middle' | 'bottom') {
    const chosen = drawing.nodes.filter((node) => selectedNodes.includes(node.id));
    if (chosen.length < 2) return;
    const left = Math.min(...chosen.map((node) => node.x));
    const right = Math.max(...chosen.map((node) => node.x + node.w));
    const top = Math.min(...chosen.map((node) => node.y));
    const bottom = Math.max(...chosen.map((node) => node.y + node.h));
    let next = drawing;
    for (const node of chosen) {
      const x = how === 'left' ? left : how === 'right' ? right - node.w : how === 'centre' ? Math.round((left + right) / 2 - node.w / 2) : node.x;
      const y = how === 'top' ? top : how === 'bottom' ? bottom - node.h : how === 'middle' ? Math.round((top + bottom) / 2 - node.h / 2) : node.y;
      next = shifted(next, node.id, x - node.x, y - node.y);
    }
    change(next);
    setMenu(null);
  }

  function arrange(direction: LayoutDirection) {
    if (drawing.nodes.length === 0) return;
    change(laidOut(drawing, direction));
    setMenu(null);
    window.requestAnimationFrame(() => void flow.fitView({ padding: 0.2, maxZoom: 1, duration: 200 }));
  }

  function setNode(id: string, patch: Partial<DiagramNodeData>) {
    setDrawing((held) => ({ ...held, nodes: held.nodes.map((node) => (node.id === id ? { ...node, ...patch } : node)) }));
  }

  function setEdge(id: string, patch: Partial<DiagramEdgeData>) {
    setDrawing((held) => ({ ...held, edges: held.edges.map((edge) => (edge.id === id ? { ...edge, ...patch } : edge)) }));
  }

  /** A label typed in place, put down as one step through the ordinary change. */
  function commitLabel(text: string) {
    const target = labelling;
    setLabelling(null);
    if (target === null) return;
    if (target.kind === 'node') {
      const label = text.trim();
      const node = drawing.nodes.find((one) => one.id === target.id);
      if (node === undefined || node.label === label) return;
      change({ ...drawing, nodes: drawing.nodes.map((one) => (one.id === target.id ? { ...one, label } : one)) });
    } else {
      const label = text.replace(/\s+/g, ' ').trim();
      const edge = drawing.edges.find((one) => one.id === target.id);
      if (edge === undefined || (edge.label ?? '') === label) return;
      change({ ...drawing, edges: drawing.edges.map((one) => (one.id === target.id ? { ...one, label: label === '' ? undefined : label } : one)) });
    }
  }

  const labelEditing = useMemo(
    () => ({ target: labelling, commit: commitLabel, cancel: () => setLabelling(null) }),
    // The commit reads the drawing as it is now, so it is made again with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [labelling, drawing],
  );

  // -- Saving -------------------------------------------------------------

  async function save(): Promise<boolean> {
    if (diagram === null) return false;
    if (!unsaved) return true;
    setBusy(true);
    setError(null);
    try {
      take(await saveDiagram(diagram.id, drawing, diagram.revision));
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not save the diagram.'));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function rename() {
    if (naming === null || diagram === null) return;
    const called = naming.trim();
    setNaming(null);
    if (called === '' || called === diagram.name) return;
    try {
      const renamed = await renameDiagram(diagram.id, called);
      setDiagram({ ...diagram, name: renamed.name });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not rename the diagram.'));
    }
  }

  /** The description as typed, written when the field is left; the server's word on it is taken back. */
  async function describe(said: string) {
    if (diagram === null || said.trim() === (diagram.description ?? '')) return;
    try {
      const changed = await describeDiagram(diagram.id, said);
      setDiagram({ ...diagram, description: changed.description });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('That could not be saved.'));
    }
  }

  async function setAccess(access: DiagramAgentAccess) {
    if (diagram === null) return;
    try {
      const changed = await setDiagramAgentAccess(diagram.id, access);
      setDiagram({ ...diagram, agentAccess: changed.agentAccess });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('That could not be saved.'));
    }
  }

  /** The file the server writes - of what is saved, so what is on screen is saved first. */
  async function exportAs(format: 'png' | 'svg' | 'pdf' | 'mermaid' | 'json') {
    setMenu(null);
    if (diagram === null || !(await save())) return;
    const link = document.createElement('a');
    link.href = diagramExportUrl(diagram.id, format);
    link.download = '';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  const guard = useLeaveGuard({ unsaved, backTo: `/workspace/${workspaceId}/explore/diagrams`, save });

  // -- The conversation ----------------------------------------------------

  async function ask(event?: FormEvent<HTMLFormElement>, idea?: string) {
    event?.preventDefault();
    const said = (idea ?? asking).trim();
    if (said === '' || modelId === '' || diagram === null || answering) return;
    setTalkError(null);
    // The model works on what is saved, so what is on screen is saved first.
    if (unsaved && !(await save())) return;
    const sent: DiagramTurn[] = [...talk, { role: 'user', content: said }];
    setTalk(sent);
    setAsking('');
    setAnswering(true);
    try {
      const answered = await askDiagram(diagram.id, modelId, sent);
      setTalk([...sent, { role: 'assistant', content: answered.answer }]);
      if (answered.changed) {
        remember(drawing);
        take(answered.diagram);
      }
    } catch (cause) {
      setTalkError(cause instanceof Error ? cause.message : t('The model could not answer.'));
      const now = await fetchDiagram(diagram.id).catch(() => null);
      if (now !== null && now.revision !== diagram.revision) {
        remember(drawing);
        take(now);
      }
    } finally {
      setAnswering(false);
    }
  }

  // -- Keys ---------------------------------------------------------------

  /** Enter or F2 on the one node or line selected types over its label. */
  function startLabelling() {
    if (selectedNodes.length === 1 && selectedEdges.length === 0) setLabelling({ kind: 'node', id: selectedNodes[0] });
    else if (selectedEdges.length === 1 && selectedNodes.length === 0) setLabelling({ kind: 'edge', id: selectedEdges[0] });
  }

  const keys = useRef({ undo, redo, save, remove, duplicate, copy, cut, paste: () => paste(), nudge, arrange, label: () => {}, escape: () => {} });
  keys.current = {
    undo,
    redo,
    save,
    remove,
    duplicate,
    copy,
    cut,
    paste: () => paste(),
    nudge,
    arrange,
    label: startLabelling,
    escape: () => {
      setSelectedNodes([]);
      setSelectedEdges([]);
      setMenu(null);
    },
  };
  useEffect(() => {
    const pressed = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement || target?.isContentEditable === true;
      if (matches(event, saveKey)) {
        event.preventDefault();
        void keys.current.save();
        return;
      }
      if (typing) return;
      const run = (action: () => unknown) => {
        event.preventDefault();
        action();
      };
      if (event.key === 'Escape') keys.current.escape();
      else if ((event.key === 'Enter' || event.key === 'F2') && !event.ctrlKey && !event.metaKey && !event.altKey) run(keys.current.label);
      else if (event.key === 'Delete' || event.key === 'Backspace') run(keys.current.remove);
      else if (matches(event, duplicateKey)) run(keys.current.duplicate);
      else if (matches(event, copyKey)) run(keys.current.copy);
      else if (matches(event, cutKey)) run(keys.current.cut);
      else if (matches(event, pasteKey)) run(keys.current.paste);
      else if (matches(event, undoKey)) run(keys.current.undo);
      else if (matches(event, redoKey) || ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'y')) run(keys.current.redo);
      else if (matches(event, arrangeKey)) run(() => keys.current.arrange('LR'));
      else if (matches(event, zoomInKey)) run(() => void flow.zoomIn());
      else if (matches(event, zoomOutKey)) run(() => void flow.zoomOut());
      else if (event.key.startsWith('Arrow') && !event.ctrlKey && !event.metaKey) {
        const step = event.shiftKey ? GRID : 1;
        const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
        const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
        run(() => keys.current.nudge(dx, dy));
      }
    };
    document.addEventListener('keydown', pressed);
    return () => document.removeEventListener('keydown', pressed);
  }, [undoKey, redoKey, saveKey, duplicateKey, copyKey, cutKey, pasteKey, zoomInKey, zoomOutKey, arrangeKey, flow]);

  // -- Drawing ------------------------------------------------------------

  const oneNode = selectedNodes.length === 1 && selectedEdges.length === 0 ? (byId.get(selectedNodes[0]) ?? null) : null;
  const oneEdge = selectedEdges.length === 1 && selectedNodes.length === 0 ? (drawing.edges.find((edge) => edge.id === selectedEdges[0]) ?? null) : null;
  const access = agentAccessOptions();

  if (missing) {
    return (
      <AppShell title={t('Diagram editor')} user={shellUser(session)} workspacePath={`/workspace/${workspaceId}`} showAdmin={session.admin} onSignOut={onSignOut} sidebar={null} hideSidebar>
        <p className={styles.missing}>{t('There is no such diagram here.')}</p>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={t('Diagram editor')}
      user={shellUser(session)}
      workspacePath={`/workspace/${workspaceId}`}
      showAdmin={session.admin}
      onSignOut={onSignOut}
      sidebar={null}
      hideSidebar
      fills
    >
      <div className={shell.toolbar}>
        <button
          type="button"
          className={shell.back}
          onClick={() => {
            const to = `/workspace/${workspaceId}/explore/diagrams`;
            if (!askBeforeLeaving(to)) navigate(to);
          }}
          data-testid="diagram-back"
        >
          ← {t('Diagrams')}
        </button>
        {naming !== null ? (
          <input
            className={shell.titleInput}
            value={naming}
            onChange={(event) => setNaming(event.target.value)}
            onBlur={() => void rename()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void rename();
              if (event.key === 'Escape') setNaming(null);
            }}
            aria-label={t('Name')}
            autoFocus
            data-testid="diagram-title-input"
          />
        ) : (
          <button type="button" className={shell.toolbarTitle} onClick={() => setNaming(diagram?.name ?? '')} title={`${diagram?.name ?? ''} - ${t('click to rename')}`} data-testid="diagram-title">
            {diagram?.name ?? ''}
          </button>
        )}
        {naming === null && (
          <button type="button" className={shell.tool} onClick={() => setNaming(diagram?.name ?? '')} title={t('Rename the diagram')} aria-label={t('Rename the diagram')}>
            <img src={pencilIcon} alt="" width={14} height={14} />
          </button>
        )}
        {unsaved && (
          <span className={shell.unsavedMark} data-testid="diagram-unsaved">
            {t('Unsaved')}
          </span>
        )}
        <div className={shell.toolbarRight}>
          <div className={styles.tools} role="toolbar" aria-label={t('Shapes')}>
            {SHAPES.map((one) => (
              <button
                key={one.kind}
                type="button"
                className={shell.tool}
                onClick={() => add(one.kind)}
                title={tf('Add {shape}', { shape: one.label() })}
                aria-label={tf('Add {shape}', { shape: one.label() })}
                data-testid={`diagram-add-${one.kind}`}
              >
                <img src={one.icon} alt="" width={16} height={16} />
              </button>
            ))}
          </div>
          <span className={shell.toolbarGap} aria-hidden="true" />
          <div className={styles.menuHolder}>
            <button type="button" className={form.ghost} onClick={() => setMenu(menu === 'layout' ? null : 'layout')} title={`${t('Arrange')} (${arrangeKey})`} data-testid="diagram-arrange">
              {t('Arrange')}
            </button>
            {menu === 'layout' && (
              <div className={styles.menu} role="menu">
                <button type="button" role="menuitem" className={styles.menuItem} onClick={() => arrange('LR')} data-testid="diagram-arrange-lr">
                  {t('Left to right')}
                </button>
                <button type="button" role="menuitem" className={styles.menuItem} onClick={() => arrange('TB')} data-testid="diagram-arrange-tb">
                  {t('Top to bottom')}
                </button>
              </div>
            )}
          </div>
          <div className={styles.menuHolder}>
            <button type="button" className={form.ghost} onClick={() => setMenu(menu === 'align' ? null : 'align')} disabled={selectedNodes.length < 2} data-testid="diagram-align">
              {t('Align')}
            </button>
            {menu === 'align' && (
              <div className={styles.menu} role="menu">
                {(
                  [
                    ['left', t('Left edges')],
                    ['centre', t('Centres')],
                    ['right', t('Right edges')],
                    ['top', t('Top edges')],
                    ['middle', t('Middles')],
                    ['bottom', t('Bottom edges')],
                  ] as const
                ).map(([how, label]) => (
                  <button key={how} type="button" role="menuitem" className={styles.menuItem} onClick={() => align(how)} data-testid={`diagram-align-${how}`}>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className={shell.toolbarGap} aria-hidden="true" />
          <button type="button" className={shell.tool} onClick={() => void flow.zoomOut()} title={`${t('Zoom out')} (${zoomOutKey})`} aria-label={t('Zoom out')} data-testid="diagram-zoom-out">
            −
          </button>
          <button type="button" className={shell.zoomLevel} onClick={() => void flow.fitView({ padding: 0.2, duration: 200 })} title={t('Fit to the canvas')} data-testid="diagram-zoom">
            {`${Math.round(viewport.zoom * 100)}%`}
          </button>
          <button type="button" className={shell.tool} onClick={() => void flow.zoomIn()} title={`${t('Zoom in')} (${zoomInKey})`} aria-label={t('Zoom in')} data-testid="diagram-zoom-in">
            +
          </button>
          <span className={shell.toolbarGap} aria-hidden="true" />
          <button type="button" className={shell.tool} onClick={undo} disabled={past.length === 0} title={`${t('Undo')} (${undoKey})`} aria-label={t('Undo')} data-testid="diagram-undo">
            <img src={undoIcon} alt="" width={16} height={16} />
          </button>
          <button type="button" className={shell.tool} onClick={redo} disabled={future.length === 0} title={`${t('Redo')} (${redoKey})`} aria-label={t('Redo')} data-testid="diagram-redo">
            <img src={redoIcon} alt="" width={16} height={16} />
          </button>
          <span className={shell.toolbarGap} aria-hidden="true" />
          <button type="button" className={form.ghost} onClick={duplicate} disabled={selectedNodes.length === 0} title={`${t('Duplicate')} (${duplicateKey})`} data-testid="diagram-duplicate">
            {t('Duplicate')}
          </button>
          <button type="button" className={form.ghost} onClick={remove} disabled={selectedNodes.length === 0 && selectedEdges.length === 0} title={t('Delete')} data-testid="diagram-delete">
            {t('Delete')}
          </button>
          <div className={styles.menuHolder}>
            <button type="button" className={form.ghost} onClick={() => setMenu(menu === 'export' ? null : 'export')} data-testid="diagram-export">
              {t('Export')}
            </button>
            {menu === 'export' && (
              <div className={`${styles.menu} ${styles.menuRight}`} role="menu">
                {(['png', 'svg', 'pdf', 'mermaid', 'json'] as const).map((format) => (
                  <button key={format} type="button" role="menuitem" className={styles.menuItem} onClick={() => void exportAs(format)} data-testid={`diagram-export-${format}`}>
                    {format === 'mermaid' ? 'Mermaid' : format.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="button" className={form.filled} onClick={() => void save()} disabled={!unsaved || busy} title={`${t('Save')} (${saveKey})`} data-testid="diagram-save">
            {t('Save')}
          </button>
        </div>
      </div>

      <div className={shell.editor}>
        <div className={styles.canvas} data-testid="diagram-canvas">
          {diagram === null ? (
            <div className={styles.loading}>{error === null ? <Loader /> : <p role="alert">{error}</p>}</div>
          ) : (
            <LabelEditingContext.Provider value={labelEditing}>
            <ReactFlow<ShapeNode, LinkEdge>
              nodes={nodes}
              edges={edges}
              nodeTypes={NODE_TYPES}
              edgeTypes={EDGE_TYPES}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeDragStart={() => begin()}
              onNodeDoubleClick={(_, node) => {
                setSelectedNodes([node.id]);
                setSelectedEdges([]);
                setLabelling({ kind: 'node', id: node.id });
              }}
              onEdgeDoubleClick={(_, edge) => {
                setSelectedEdges([edge.id]);
                setSelectedNodes([]);
                setLabelling({ kind: 'edge', id: edge.id });
              }}
              zoomOnDoubleClick={false}
              onNodeDragStop={(_, __, dragged) => onDragStop(dragged.map((node) => node.id))}
              onPaneClick={() => setMenu(null)}
              connectionMode={ConnectionMode.Loose}
              deleteKeyCode={null}
              multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
              snapToGrid
              snapGrid={[GRID, GRID]}
              minZoom={0.1}
              maxZoom={4}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={GRID * 3} size={1.5} />
            </ReactFlow>
            </LabelEditingContext.Provider>
          )}
          {answering && (
            <div className={chat.drawing} data-testid="diagram-drawing">
              <Loader label={t('Working on the diagram…')} delay={0} size={20} />
            </div>
          )}
          {drawing.nodes.length === 0 && diagram !== null && !answering && (
            <p className={styles.emptyHint}>{t('Add a shape from the bar above, or ask on the right.')}</p>
          )}
        </div>

        <div className={`${shell.panel} ${chat.panel}`} data-testid="diagram-panel">
          {diagram !== null && (
            <section className={styles.section} data-testid="diagram-section">
              <button
                type="button"
                className={styles.sectionHead}
                onClick={() => setDiagramFold(diagramOpen ? 'closed' : '')}
                aria-expanded={diagramOpen}
                data-testid="diagram-section-toggle"
              >
                <img src={chevronIcon} alt="" width={12} height={12} className={diagramOpen ? styles.chevronOpen : styles.chevron} />
                {t('Diagram')}
              </button>
              {diagramOpen && (
                <div className={styles.sectionBody} data-testid="diagram-about">
                  <label className={styles.field}>
                    <span>{t('Description')}</span>
                    <textarea
                      key={`${diagram.id}-${diagram.description ?? ''}`}
                      className={`${form.input} ${styles.description}`}
                      defaultValue={diagram.description ?? ''}
                      onBlur={(event) => void describe(event.target.value)}
                      maxLength={diagram.descriptionCharactersMost}
                      placeholder={t('What this diagram is for')}
                      data-testid="diagram-description-input"
                    />
                  </label>
                  <div className={styles.field}>
                    <span id="diagram-editor-agents">{t('Agents')}</span>
                    <Select
                      className={`${form.input} ${form.select}`}
                      value={diagram.agentAccess}
                      onChange={(picked) => void setAccess(picked as DiagramAgentAccess)}
                      aria-labelledby="diagram-editor-agents"
                      data-testid="diagram-editor-access"
                    >
                      {access.map((one) => (
                        <option key={one.value} value={one.value} data-hint={one.hint}>
                          {one.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
              )}
            </section>
          )}
          {oneNode !== null && (
            <div className={styles.inspector} data-testid="diagram-inspector">
              <h3 className={styles.inspectorHeading}>{t('Node')}</h3>
              <label className={styles.field}>
                <span>{t('Label')}</span>
                <input
                  className={form.input}
                  value={oneNode.label}
                  onFocus={begin}
                  onBlur={end}
                  onChange={(event) => setNode(oneNode.id, { label: event.target.value })}
                  maxLength={500}
                  data-testid="diagram-node-label"
                />
              </label>
              <label className={styles.field}>
                <span>{t('Shape')}</span>
                <Select
                  className={`${form.input} ${form.select}`}
                  value={oneNode.kind}
                  onChange={(picked) => {
                    change({ ...drawing, nodes: drawing.nodes.map((node) => (node.id === oneNode.id ? { ...node, kind: picked as DiagramNodeKind } : node)) });
                  }}
                  aria-label={t('Shape')}
                  data-testid="diagram-node-kind"
                >
                  {DIAGRAM_NODE_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {kindLabel(kind)}
                    </option>
                  ))}
                </Select>
              </label>
              <div className={styles.field}>
                <span>{t('Colour')}</span>
                <div className={styles.swatches} role="radiogroup" aria-label={t('Colour')}>
                  <button
                    type="button"
                    className={`${styles.swatch} ${styles.swatchNone} ${oneNode.color === undefined ? styles.swatchOn : ''}`}
                    onClick={() => change({ ...drawing, nodes: drawing.nodes.map((node) => (node.id === oneNode.id ? { ...node, color: undefined } : node)) })}
                    aria-label={t('No colour')}
                    title={t('No colour')}
                    data-testid="diagram-node-colour-none"
                  />
                  {SWATCHES.map((colour) => (
                    <button
                      key={colour}
                      type="button"
                      className={`${styles.swatch} ${oneNode.color === colour ? styles.swatchOn : ''}`}
                      style={{ background: colour }}
                      onClick={() => change({ ...drawing, nodes: drawing.nodes.map((node) => (node.id === oneNode.id ? { ...node, color: colour } : node)) })}
                      aria-label={colour}
                      title={colour}
                      data-testid="diagram-node-colour"
                    />
                  ))}
                </div>
              </div>
              <label className={styles.field}>
                <span className={styles.notesHead}>
                  {t('Notes')}
                  <span
                    className={`${styles.counter} ${(oneNode.notes ?? '').length >= noteMost ? styles.counterFull : ''}`}
                    data-testid="diagram-notes-counter"
                  >
                    {`${(oneNode.notes ?? '').length} / ${noteMost}`}
                  </span>
                </span>
                <textarea
                  className={`${form.input} ${styles.notes}`}
                  value={oneNode.notes ?? ''}
                  onFocus={begin}
                  onBlur={end}
                  onChange={(event) => setNode(oneNode.id, { notes: event.target.value === '' ? undefined : event.target.value.slice(0, noteMost) })}
                  maxLength={noteMost}
                  placeholder={t('What the box cannot say')}
                  data-testid="diagram-node-notes"
                />
              </label>
            </div>
          )}
          {oneEdge !== null && (
            <div className={styles.inspector} data-testid="diagram-edge-inspector">
              <h3 className={styles.inspectorHeading}>{t('Connection')}</h3>
              <label className={styles.field}>
                <span>{t('Label')}</span>
                <input
                  className={form.input}
                  value={oneEdge.label ?? ''}
                  onFocus={begin}
                  onBlur={end}
                  onChange={(event) => setEdge(oneEdge.id, { label: event.target.value === '' ? undefined : event.target.value })}
                  maxLength={500}
                  data-testid="diagram-edge-label-input"
                />
              </label>
              <label className={styles.field}>
                <span>{t('Line')}</span>
                <Select
                  className={`${form.input} ${form.select}`}
                  value={oneEdge.kind}
                  onChange={(picked) => change({ ...drawing, edges: drawing.edges.map((edge) => (edge.id === oneEdge.id ? { ...edge, kind: picked as DiagramEdgeKind } : edge)) })}
                  aria-label={t('Line')}
                  data-testid="diagram-edge-kind"
                >
                  {DIAGRAM_EDGE_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {edgeKindLabel(kind)}
                    </option>
                  ))}
                </Select>
              </label>
            </div>
          )}
          {selectedNodes.length + selectedEdges.length > 1 && (
            <p className={styles.selectedCount} data-testid="diagram-selected-count">
              {tf('{count} selected', { count: selectedNodes.length + selectedEdges.length })}
            </p>
          )}

          <div className={chat.talk} data-testid="diagram-chat">
            {talk.length === 0 && !answering && (
              <div className={chat.welcome} data-testid="diagram-welcome">
                <h2 className={chat.hello}>
                  {tf('Hi {name}!', { name: firstName })}
                  <span>{t('What shall we map?')}</span>
                </h2>
                <div className={chat.ideas}>
                  {(drawing.nodes.length > 0 ? [POLISH, ...IDEAS.slice(0, 3)] : IDEAS).map((idea) => (
                    <button
                      key={idea.icon}
                      type="button"
                      className={chat.idea}
                      disabled={modelId === '' || diagram === null}
                      onClick={() => void ask(undefined, idea.prompt())}
                      data-testid="diagram-idea"
                    >
                      <span className={chat.ideaIcon}>
                        <img src={idea.icon} alt="" width={18} height={18} />
                      </span>
                      <span className={chat.ideaText}>
                        <span className={chat.ideaTitle}>{idea.title()}</span>
                        <span className={chat.ideaLine}>{idea.line()}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {talk.map((turn, index) => (
              <div key={index} className={turn.role === 'user' ? chat.mine : chat.theirs} data-testid="diagram-chat-message" data-role={turn.role}>
                {turn.role === 'user' ? turn.content : <Markdown>{turn.content}</Markdown>}
              </div>
            ))}
            {answering && (
              <div className={chat.theirs}>
                <Loader label={t('Working on the diagram…')} delay={0} size={16} />
              </div>
            )}
            {talkError !== null && (
              <p className={form.error} role="alert" data-testid="diagram-chat-error">
                {talkError}
              </p>
            )}
            <div ref={talkEnd} />
          </div>

          <form className={chat.composer} onSubmit={(event) => void ask(event)}>
            <div className={chat.askBox}>
              <textarea
                className={chat.ask}
                value={asking}
                onChange={(event) => setAsking(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder={t('Describe what to draw or change')}
                aria-label={t('What to draw')}
                data-testid="diagram-chat-input"
              />
              <div className={chat.askBar}>
                <Select
                  className={`${form.input} ${form.select} ${chat.modelPill}`}
                  value={modelId}
                  onChange={(picked) => {
                    setModelId(picked);
                    try {
                      localStorage.setItem(modelKey(workspaceId), picked);
                    } catch {
                      // Remembered for this visit only.
                    }
                  }}
                  disabled={models === null || models.length === 0}
                  aria-label={t('Model')}
                  title={t('Model')}
                  data-testid="diagram-chat-model"
                >
                  {models !== null && models.length === 0 && <option value="">{t('This workspace has no chat model')}</option>}
                  {(models ?? []).map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name} · {model.providerName}
                    </option>
                  ))}
                </Select>
                <button
                  type="submit"
                  className={chat.send}
                  disabled={asking.trim() === '' || modelId === '' || answering || diagram === null}
                  title={answering ? t('Working on the diagram…') : t('Send')}
                  aria-label={t('Send')}
                  data-testid="diagram-chat-send"
                >
                  {answering ? <Loader label="" delay={0} size={14} /> : <img src={sendIcon} alt="" width={16} height={16} data-keeps-colour="" />}
                </button>
              </div>
            </div>
            {error !== null && diagram !== null && (
              <p className={form.error} role="alert" data-testid="diagram-error">
                {error}
              </p>
            )}
            <span className={chat.count}>{tf('{nodes} nodes, {edges} connections', { nodes: drawing.nodes.length, edges: drawing.edges.length })}</span>
          </form>
        </div>
      </div>
      <UnsavedWorkDialog
        subject={guard.asking ? (diagram?.name ?? t('This diagram')) : null}
        creating={false}
        onStay={guard.stay}
        onLeave={guard.leave}
        onSaveAndLeave={guard.saveAndLeave}
      />
    </AppShell>
  );
}
