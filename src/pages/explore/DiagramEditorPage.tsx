import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
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
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import {
  askDiagram,
  describeDiagram,
  DIAGRAM_END_STYLES,
  DIAGRAM_LINE_STYLES,
  DIAGRAM_NODE_KINDS,
  DIAGRAM_PNG_SCALES,
  diagramExportUrl,
  drawingOf,
  fetchDiagram,
  FLOWCHART_KINDS,
  UML_KINDS,
  renameDiagram,
  saveDiagram,
  setDiagramAgentAccess,
} from '../../api/diagrams';
import type {
  Diagram,
  DiagramPngScale,
  DiagramAgentAccess,
  DiagramDrawing,
  DiagramEdgeData,
  DiagramEndStyle,
  DiagramLineStyle,
  DiagramNodeData,
  DiagramNodeKind,
  DiagramTurn,
} from '../../api/diagrams';
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
import squareIcon from '../../assets/square.svg';
import stickyIcon from '../../assets/sticky-note.svg';
import diamondIcon from '../../assets/diamond.svg';
import undoIcon from '../../assets/undo.svg';
import usersIcon from '../../assets/users.svg';
import { ApiError } from '../../api/client';
import { AppShell } from '../../components/AppShell';
import { LivePointers, mergeById, Presence, useAutosave, useLiveRoom } from '../../components/LiveRoom';
import { ResizeHandle, useDragSize, useRoom } from '../../components/DragSize';
import { Loader } from '../../components/Loader';
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
import { DesignChat, useChatFiles, useChatModels } from '../design/DesignChat';
import type { ChatIdea } from '../design/DesignChat';
import shell from '../design/DesignImageEditorPage.module.css';
import chat from '../design/WireframeEditorPage.module.css';
import { EDGE_TYPES, LabelEditingContext, NODE_TYPES, SWATCH_ROW, SWATCHES } from './DiagramCanvas';
import type { LinkEdge, ShapeNode } from './DiagramCanvas';
import { EndIcon, LineIcon, MarkerDefs, endStyleLabel, lineStyleLabel, markerId, nearestKind, styleOf } from './DiagramLineStyles';
import { ShapeIcon } from './DiagramShapes';
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

/** How narrow the side panel may be dragged, and how much of the canvas it must leave. */
const PANEL_NARROWEST = 300;
const CANVAS_NARROWEST = 320;
/** How short the settings above the chat may be dragged, and how much height the chat keeps. */
const SETTINGS_SHORTEST = 60;
const CHAT_SHORTEST = 200;
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

/**
 * The drawn shapes put on the toolbar as well as in More shapes, where there is
 * room for them: the ones a flowchart or an architecture sketch reaches for
 * first. The rest are a click further in.
 */
const UP_FRONT: DiagramNodeKind[] = ['database', 'document', 'parallelogram', 'hexagon', 'cloud', 'actor', 'class', 'component'];

/** What the shapes in the More shapes menu are called; they are drawn by their own outlines there. */
const MORE_SHAPES: Partial<Record<DiagramNodeKind, () => string>> = {
  database: () => t('Database'),
  document: () => t('Document'),
  hexagon: () => t('Hexagon'),
  parallelogram: () => t('Parallelogram'),
  trapezoid: () => t('Trapezoid'),
  triangle: () => t('Triangle'),
  cloud: () => t('Cloud'),
  actor: () => t('Actor'),
  class: () => t('Class'),
  component: () => t('Component'),
  package: () => t('Package'),
  interface: () => t('Interface'),
  device: () => t('Device'),
  boundary: () => t('Boundary'),
  control: () => t('Control'),
  entity: () => t('Entity'),
};

/** The size a new node starts at - the server's own defaults (`DiagramNodeKind`). */
const MADE: Record<DiagramNodeKind, { w: number; h: number }> = {
  box: { w: 160, h: 60 },
  rounded: { w: 160, h: 60 },
  ellipse: { w: 160, h: 70 },
  diamond: { w: 140, h: 90 },
  note: { w: 180, h: 100 },
  group: { w: 360, h: 240 },
  database: { w: 120, h: 80 },
  document: { w: 160, h: 80 },
  hexagon: { w: 160, h: 70 },
  parallelogram: { w: 170, h: 60 },
  trapezoid: { w: 170, h: 60 },
  triangle: { w: 120, h: 100 },
  cloud: { w: 180, h: 110 },
  actor: { w: 80, h: 110 },
  class: { w: 200, h: 120 },
  component: { w: 170, h: 70 },
  package: { w: 170, h: 90 },
  interface: { w: 80, h: 80 },
  device: { w: 170, h: 90 },
  boundary: { w: 90, h: 90 },
  control: { w: 90, h: 90 },
  entity: { w: 90, h: 90 },
};

function kindLabel(kind: DiagramNodeKind): string {
  return SHAPES.find((one) => one.kind === kind)?.label() ?? MORE_SHAPES[kind]?.() ?? kind;
}

const freshId = (prefix: string) => `${prefix}${Math.random().toString(36).slice(2, 10)}`;
const snap = (value: number) => Math.round(value / GRID) * GRID;

/** What Copy and Cut put down and Paste picks up: for the length of the tab, across diagrams. */
let clipboard: DiagramDrawing | null = null;

/** What an empty chat offers: a pressed card is sent as it is. */
type Idea = ChatIdea;

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
  const [, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<'layout' | 'align' | 'export' | 'shapes' | null>(null);
  /*
   * How many pixels a PNG has for each one the diagram is drawn at. Twice by
   * default, so it is sharp on a high-density screen and in a slide; the server
   * draws it, and holds it to the widest picture it draws at all.
   */
  const [pngScale, setPngScale] = useState<DiagramPngScale>(2);
  /** Whether the Diagram section is folded away, remembered for the person: open unless they folded it. */
  const [diagramFold, setDiagramFold] = useSieve('diagram.editor.diagram-section');
  // The pale row only, until somebody asks for the stronger and deeper ones; remembered.
  const [coloursFold, setColoursFold] = useSieve('diagram.editor.colours');
  const coloursOpen = coloursFold === 'open';
  const diagramOpen = diagramFold !== 'closed';
  /** The label being typed over in place, on the canvas. */
  const [labelling, setLabelling] = useState<{ kind: 'node' | 'edge'; id: string } | null>(null);

  const { models, modelId, choose } = useChatModels(workspaceId, modelKey);
  const [talk, setTalk] = useState<DiagramTurn[]>([]);
  const [asking, setAsking] = useState('');
  const files = useChatFiles(workspaceId);
  const [answering, setAnswering] = useState(false);
  const [talkError, setTalkError] = useState<string | null>(null);

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

  /*
   * Working on it together, as the workflow editor does: who else is here,
   * where they point, and their saves taken in as they land - merged node by
   * node into what is unsaved here. Issue #683. Read through refs, because a
   * save or a fetch that lands reads the editor as it is then, not as it was.
   */
  const now = useRef({ diagram, drawing, saved, unsaved });
  now.current = { diagram, drawing, saved, unsaved };
  const saving = useRef(false);
  const live = useLiveRoom('diagram', diagram?.id ?? null, () => void catchUp());

  /** Somebody else saved: their diagram taken in, and anything unsaved here merged into it. */
  async function catchUp() {
    const held = now.current.diagram;
    if (held === null || saving.current) return;
    const found = await fetchDiagram(held.id).catch(() => null);
    if (found === null || found.revision === now.current.diagram?.revision) return;
    if (!now.current.unsaved && gestureStart.current === null) {
      take(found);
      return;
    }
    const theirs = drawingOf(found);
    const base = JSON.parse(now.current.saved) as DiagramDrawing;
    const mine = now.current.drawing;
    setDiagram(found);
    setSaved(JSON.stringify(theirs));
    setDrawing({ nodes: mergeById(base.nodes, mine.nodes, theirs.nodes), edges: mergeById(base.edges, mine.edges, theirs.edges) });
  }
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
    try {
      if (diagramId !== '') sessionStorage.setItem(talkKey(diagramId), JSON.stringify(talk));
    } catch {
      // A conversation that cannot be kept is still a conversation.
    }
  }, [talk, diagramId]);

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
      drawing.edges.map((edge) => {
        const { line, start, end } = styleOf(edge);
        // The arrow is React Flow's own closed arrow, as it always was; the other marks are this page's markers.
        const mark = (style: DiagramEndStyle, atEnd: boolean) =>
          style === 'arrow'
            ? { type: MarkerType.ArrowClosed, width: 18, height: 18, ...(atEnd ? {} : { orient: 'auto-start-reverse' }) }
            : (markerId(style, atEnd) ?? undefined);
        return {
          id: edge.id,
          source: edge.from,
          target: edge.to,
          type: 'link' as const,
          data: { line, label: edge.label },
          markerEnd: mark(end, true),
          markerStart: mark(start, false),
          selected: selectedEdges.includes(edge.id),
        };
      }),
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
    const made: DiagramEdgeData = { id: freshId('e'), from: connection.source, to: connection.target, kind: 'arrow', line: 'solid', start: 'none', end: 'arrow' };
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
      // A class starts with its compartments, so how to write one is on the canvas rather than in a hint.
      label: kind === 'group' ? t('Group') : kind === 'note' ? t('Note') : kind === 'class' ? `${t('New node')}\n--\n\n--\n` : t('New node'),
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

  /**
   * Saves what is drawn over the revision it was drawn from. Refused because
   * somebody saved first, theirs is read, this drawing is merged into it node
   * by node, and it is sent again. What was drawn while the save was on its
   * way stays drawn, to go with the next one.
   */
  async function save(): Promise<boolean> {
    if (diagram === null) return false;
    if (!unsaved) return true;
    if (saving.current) return false;
    saving.current = true;
    setBusy(true);
    setError(null);
    let over = diagram;
    let base = JSON.parse(saved) as DiagramDrawing;
    let mine = drawing;
    const sent = JSON.stringify(drawing);
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const stored = await saveDiagram(over.id, mine, over.revision, live.viewer);
          const drawn = drawingOf(stored);
          setDiagram(stored);
          setSaved(JSON.stringify(drawn));
          if (JSON.stringify(now.current.drawing) === sent) setDrawing(drawn);
          return true;
        } catch (cause) {
          if (!(cause instanceof ApiError && cause.code === 'DiagramChanged')) throw cause;
          const found = await fetchDiagram(over.id);
          if (found === null) throw cause;
          const theirs = drawingOf(found);
          mine = { nodes: mergeById(base.nodes, mine.nodes, theirs.nodes), edges: mergeById(base.edges, mine.edges, theirs.edges) };
          base = theirs;
          over = found;
        }
      }
      return false;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not save the diagram.'));
      return false;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  // Saved as it is drawn, once it has been still for Admin Settings' pause.
  useAutosave(unsaved, JSON.stringify(drawing), answering || gestureStart.current !== null, save);

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
    link.href = diagramExportUrl(diagram.id, format, pngScale);
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
    if ((said === '' && files.attached.length === 0) || modelId === '' || diagram === null || answering || files.attaching) return;
    setTalkError(null);
    // The model works on what is saved, so what is on screen is saved first.
    if (unsaved && !(await save())) return;
    const attachments = files.take();
    const sent: DiagramTurn[] = [...talk, { role: 'user', content: said, ...(attachments.length > 0 ? { attachments } : {}) }];
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

  /*
   * The panel is dragged wider, and the line between its settings and the chat
   * up or down. Fixed, the settings of a diagram with a long description and a
   * node with notes took the height and left the chat a strip at the bottom.
   */
  const [editorRoom, editorWidth] = useRoom('width');
  const [panelRoom, panelHeight] = useRoom('height');
  const [settingsRoom, settingsDrawn] = useRoom('height', 'border');
  const panelWidest = editorWidth > 0 ? Math.max(PANEL_NARROWEST, editorWidth - CANVAS_NARROWEST) : null;
  const panelWidth = useDragSize({ storageKey: 'orknux.diagram.panel-width', initial: 340, min: PANEL_NARROWEST, max: panelWidest, edge: 'left' });
  const settingsTallest = panelHeight > 0 ? Math.max(SETTINGS_SHORTEST, panelHeight - CHAT_SHORTEST) : null;
  const settingsHeight = useDragSize({
    storageKey: 'orknux.diagram.panel-settings-height',
    initial: null,
    measured: settingsDrawn,
    min: SETTINGS_SHORTEST,
    max: settingsTallest,
    edge: 'bottom',
  });

  if (missing) {
    return (
      <AppShell title={t('Diagram editor')} user={shellUser(session)} workspacePath={`/workspace/${workspaceId}`} showAdmin={session.admin} onSignOut={onSignOut} sidebar={null} hideSidebar>
        <p className={styles.missing}>
          {t('There is no such diagram here.')}{' '}
          <Link to={`/workspace/${workspaceId}/explore/diagrams`} data-testid="missing-back">
            {t('Back to diagrams')}
          </Link>
        </p>
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
        <Presence others={live.others} />
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
            {UP_FRONT.map((kind) => (
              <button
                key={kind}
                type="button"
                className={`${shell.tool} ${styles.upFront}`}
                onClick={() => add(kind)}
                title={tf('Add {shape}', { shape: kindLabel(kind) })}
                aria-label={tf('Add {shape}', { shape: kindLabel(kind) })}
                data-testid={`diagram-tool-${kind}`}
              >
                <ShapeIcon kind={kind} />
              </button>
            ))}
            <div className={styles.menuHolder}>
              <button
                type="button"
                className={shell.tool}
                onClick={() => setMenu(menu === 'shapes' ? null : 'shapes')}
                title={t('More shapes')}
                aria-label={t('More shapes')}
                aria-expanded={menu === 'shapes'}
                data-testid="diagram-more-shapes"
              >
                <img src={chevronIcon} alt="" width={14} height={14} />
              </button>
              {menu === 'shapes' && (
                <div className={`${styles.menu} ${styles.moreShapes}`} role="menu">
                  {([
                    [t('Flowchart'), FLOWCHART_KINDS],
                    ['UML', UML_KINDS],
                  ] as const).map(([heading, kinds]) => (
                    <Fragment key={heading}>
                      <span className={styles.menuHeading}>{heading}</span>
                      {kinds.map((kind) => (
                        <button
                          key={kind}
                          type="button"
                          role="menuitem"
                          className={`${styles.menuItem} ${styles.menuItemIcon}`}
                          onClick={() => {
                            add(kind);
                            setMenu(null);
                          }}
                          data-testid={`diagram-add-${kind}`}
                        >
                          <ShapeIcon kind={kind} />
                          {kindLabel(kind)}
                        </button>
                      ))}
                    </Fragment>
                  ))}
                </div>
              )}
            </div>
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
                {(['png', 'svg', 'pdf', 'mermaid', 'json'] as const).map((format) =>
                  format === 'png' ? (
                    <div key={format} className={styles.menuRow}>
                      <button type="button" role="menuitem" className={styles.menuItem} onClick={() => void exportAs(format)} data-testid="diagram-export-png">
                        PNG
                      </button>
                      <span className={styles.scales} role="radiogroup" aria-label={t('PNG scale')} data-testid="diagram-export-scale">
                        {DIAGRAM_PNG_SCALES.map((scale) => (
                          <button
                            key={scale}
                            type="button"
                            role="radio"
                            aria-checked={pngScale === scale}
                            className={pngScale === scale ? `${styles.scale} ${styles.scaleOn}` : styles.scale}
                            onClick={() => setPngScale(scale)}
                            data-testid={`diagram-export-scale-${scale}`}
                          >
                            {scale}×
                          </button>
                        ))}
                      </span>
                    </div>
                  ) : (
                    <button key={format} type="button" role="menuitem" className={styles.menuItem} onClick={() => void exportAs(format)} data-testid={`diagram-export-${format}`}>
                      {format === 'mermaid' ? 'Mermaid' : format.toUpperCase()}
                    </button>
                  ),
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={shell.editor} ref={editorRoom}>
        <div
          className={styles.canvas}
          data-testid="diagram-canvas"
          onMouseMove={(event) => {
            const at = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
            live.point(at.x, at.y);
          }}
          onMouseLeave={() => live.point(null, null)}
        >
          {diagram === null ? (
            <div className={styles.loading}>{error === null ? <Loader /> : <p role="alert">{error}</p>}</div>
          ) : (
            <LabelEditingContext.Provider value={labelEditing}>
            {/* Inside the canvas, so the marks take its ink and paper. */}
            <MarkerDefs />
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
              <LivePointers pointers={live.pointers} place={(x, y) => ({ left: x * viewport.zoom + viewport.x, top: y * viewport.zoom + viewport.y })} />
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

        <ResizeHandle
          className={styles.panelHandle}
          orientation="vertical"
          label={t('Width of the panel')}
          controls="diagram-panel"
          valueNow={panelWidth.size}
          valueMin={PANEL_NARROWEST}
          valueMax={panelWidest ?? panelWidth.size}
          title={t('Drag to change the width; double-click to put it back')}
          dragging={panelWidth.dragging}
          handlers={panelWidth.handlers}
        />
        <div
          className={`${shell.panel} ${chat.panel}`}
          id="diagram-panel"
          ref={panelRoom}
          style={{ flexBasis: panelWidth.size }}
          data-testid="diagram-panel"
        >
          <div
            className={styles.panelSettings}
            id="diagram-panel-settings"
            ref={settingsRoom}
            style={settingsHeight.size === null ? undefined : { height: settingsHeight.size, maxHeight: 'none' }}
            data-testid="diagram-panel-settings"
          >
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
                    <span id="diagram-editor-agents">{t('What agents may do with it')}</span>
                    <Select
                      className={`${form.input} ${form.select}`}
                      value={diagram.agentAccess}
                      title={access.find((one) => one.value === diagram.agentAccess)?.hint}
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
                  {(coloursOpen || (oneNode.color !== undefined && SWATCHES.slice(SWATCH_ROW).includes(oneNode.color)) ? SWATCHES : SWATCHES.slice(0, SWATCH_ROW)).map((colour, at) => (
                    <button
                      key={colour}
                      type="button"
                      className={`${styles.swatch} ${oneNode.color === colour ? styles.swatchOn : ''}`}
                      // Rows after the first stand under it, past the No colour mark; the picker and the toggle end the first.
                      style={{ background: colour, ...(at >= SWATCH_ROW && at % SWATCH_ROW === 0 ? { gridColumnStart: 2 } : {}), ...(at >= SWATCH_ROW ? { gridRow: Math.floor(at / SWATCH_ROW) + 1 } : {}) }}
                      onClick={() => change({ ...drawing, nodes: drawing.nodes.map((node) => (node.id === oneNode.id ? { ...node, color: colour } : node)) })}
                      aria-label={colour}
                      title={colour}
                      data-testid="diagram-node-colour"
                    />
                  ))}
                  {/* Any other colour: the browser's own picker, taken once it is closed rather than at every step of a drag through it. */}
                  <label
                    className={`${styles.swatch} ${styles.swatchCustom} ${oneNode.color !== undefined && !SWATCHES.includes(oneNode.color) ? styles.swatchOn : ''}`}
                    style={oneNode.color !== undefined && !SWATCHES.includes(oneNode.color) ? { background: oneNode.color } : undefined}
                    title={t('Another colour')}
                  >
                    <input
                      type="color"
                      className={styles.swatchPicker}
                      value={oneNode.color ?? '#ffffff'}
                      aria-label={t('Another colour')}
                      ref={(input) => {
                        if (input === null) return;
                        input.onchange = () => {
                          const picked = input.value.toLowerCase();
                          change({ ...drawing, nodes: drawing.nodes.map((node) => (node.id === oneNode.id ? { ...node, color: picked } : node)) });
                        };
                      }}
                      onChange={() => {}}
                      data-testid="diagram-node-colour-custom"
                    />
                  </label>
                  <button
                    type="button"
                    className={`${styles.swatchMore} ${coloursOpen ? styles.swatchMoreOpen : ''}`}
                    onClick={() => setColoursFold(coloursOpen ? '' : 'open')}
                    aria-expanded={coloursOpen}
                    aria-label={coloursOpen ? t('Fewer colours') : t('More colours')}
                    title={coloursOpen ? t('Fewer colours') : t('More colours')}
                    data-testid="diagram-node-colour-more"
                  >
                    <img src={chevronIcon} alt="" width={12} height={12} />
                  </button>
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
              {(() => {
                const style = styleOf(oneEdge);
                // Each picker changes its own part; the old kind beside them follows, for a reader that knows only it.
                const restyle = (patch: Partial<typeof style>) => {
                  const next = { ...style, ...patch };
                  change({
                    ...drawing,
                    edges: drawing.edges.map((edge) =>
                      edge.id === oneEdge.id ? { ...edge, ...next, kind: nearestKind(next.line, next.start, next.end) } : edge,
                    ),
                  });
                };
                return (
                  <>
                    <label className={styles.field}>
                      <span>{t('Line style')}</span>
                      <Select
                        className={`${form.input} ${form.select}`}
                        value={style.line}
                        onChange={(picked) => restyle({ line: picked as DiagramLineStyle })}
                        aria-label={t('Line style')}
                        data-testid="diagram-edge-line"
                      >
                        {DIAGRAM_LINE_STYLES.map((line) => (
                          <option key={line} value={line}>
                            <span className={styles.styleOption}>
                              <LineIcon style={line} />
                              {lineStyleLabel(line)}
                            </span>
                          </option>
                        ))}
                      </Select>
                    </label>
                    {([
                      ['start', t('At the start'), false],
                      ['end', t('At the end'), true],
                    ] as const).map(([side, label, atEnd]) => (
                      <label key={side} className={styles.field}>
                        <span>{label}</span>
                        <Select
                          className={`${form.input} ${form.select}`}
                          value={style[side]}
                          onChange={(picked) => restyle({ [side]: picked as DiagramEndStyle })}
                          aria-label={label}
                          data-testid={`diagram-edge-${side}`}
                        >
                          {DIAGRAM_END_STYLES.map((end) => (
                            <option key={end} value={end}>
                              <span className={styles.styleOption}>
                                <EndIcon style={end} atEnd={atEnd} />
                                {endStyleLabel(end)}
                              </span>
                            </option>
                          ))}
                        </Select>
                      </label>
                    ))}
                  </>
                );
              })()}
            </div>
          )}
          {selectedNodes.length + selectedEdges.length > 1 && (
            <p className={styles.selectedCount} data-testid="diagram-selected-count">
              {tf('{count} selected', { count: selectedNodes.length + selectedEdges.length })}
            </p>
          )}
          </div>
          <ResizeHandle
            orientation="horizontal"
            label={t('Height of the settings above the chat')}
            controls="diagram-panel-settings"
            valueNow={settingsHeight.size ?? Math.round(settingsDrawn)}
            valueMin={SETTINGS_SHORTEST}
            valueMax={settingsTallest ?? Math.round(settingsDrawn)}
            title={t('Drag to change the height; double-click to put it back')}
            dragging={settingsHeight.dragging}
            handlers={settingsHeight.handlers}
          />

          <DesignChat
            prefix="diagram"
            firstName={firstName}
            question={t('What shall we map?')}
            ideas={drawing.nodes.length > 0 ? [POLISH, ...IDEAS.slice(0, 3)] : IDEAS}
            ready={diagram !== null}
            talk={talk}
            answering={answering}
            talkError={talkError}
            working={t('Working on the diagram…')}
            asking={asking}
            onAsking={setAsking}
            onAsk={(event, idea) => void ask(event, idea)}
            models={models}
            modelId={modelId}
            onModel={choose}
            placeholder={t('Describe what to draw or change')}
            inputLabel={t('What to draw')}
            files={files}
            footer={
              <>
                {error !== null && diagram !== null && (
                  <p className={form.error} role="alert" data-testid="diagram-error">
                    {error}
                  </p>
                )}
                <span className={chat.count}>{tf('{nodes} nodes, {edges} connections', { nodes: drawing.nodes.length, edges: drawing.edges.length })}</span>
              </>
            }
          />
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
