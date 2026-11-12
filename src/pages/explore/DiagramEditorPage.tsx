import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  MarkerType,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
  useStore,
  useViewport,
} from '@xyflow/react';
import type { Connection, EdgeChange, NodeChange, Viewport } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { ConfirmDialog } from '../../components/ConfirmDialog';

import {
  describeDiagram,
  DIAGRAM_END_STYLES,
  DIAGRAM_LINE_STYLES,
  DIAGRAM_NODE_KINDS,
  DIAGRAM_PNG_SCALES,
  DIAGRAM_ROUTINGS,
  deleteDiagram,
  DIAGRAM_SIDES,
  diagramExportUrl,
  drawingOf,
  fetchDiagram,
  fetchDiagrams,
  linkAllowed,
  PICTURE_TYPES,
  uploadDiagramPicture,
  linkedItem,
  STROKE_WIDTHS,
  ARCHITECTURE_KINDS,
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
  DiagramRouting,
  DiagramSide,
  DiagramTurn,
} from '../../api/diagrams';
import type { SessionUser } from '../../api/session';
import circleIcon from '../../assets/circle-dot.svg';
import dashboardIcon from '../../assets/layout-dashboard.svg';
import frameIcon from '../../assets/frame.svg';
import pictureIcon from '../../assets/image.svg';
import gitBranchIcon from '../../assets/git-branch.svg';
import networkIcon from '../../assets/network.svg';
import chevronIcon from '../../assets/chevron-down.svg';
// Bolder than the menu chevron: the find bar's and a layer's steps were read as faint marks rather than buttons.
import stepIcon from '../../assets/chevron-step.svg';
import clearIcon from '../../assets/x.svg';
import linkToolIcon from '../../assets/link.svg';
import textIcon from '../../assets/type.svg';
import { DiagramLinkSearch } from './DiagramLinkSearch';
import { copyText } from '../../components/clipboard';
import searchIcon from '../../assets/search.svg';
import copyIcon from '../../assets/copy.svg';
import layersIcon from '../../assets/layers.svg';
import eyeIcon from '../../assets/eye.svg';
import eyeOffIcon from '../../assets/eye-off.svg';
import lockIcon from '../../assets/lock.svg';
import unlockIcon from '../../assets/unlock.svg';
import plusIcon from '../../assets/plus.svg';
import trashIcon from '../../assets/trash-2.svg';
import { freshLayerId, hiddenLayers, layerOf, layersOf, lockedLayers, mergeLayers } from './diagramLayers';
import type { DiagramLayer } from '../../api/diagrams';
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
  useDiagramFindShortcut,
  useDiagramModeShortcut,
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
import { CLAUDE_CODE_MODEL, DesignChat, askThroughClaudeCode, useChatFiles, useChatModels } from '../design/DesignChat';
import type { ChatIdea } from '../design/DesignChat';
import shell from '../design/DesignImageEditorPage.module.css';
import chat from '../design/WireframeEditorPage.module.css';
import { EDGE_TYPES, LabelEditingContext, LinkOpenContext, NODE_TYPES, SWATCH_ROW, SWATCHES, ViewingContext } from './DiagramCanvas';
import type { LinkCard } from './DiagramCanvas';
import type { Linkable } from './DiagramLinkSearch';
import { fetchDocuments } from '../../api/documents';
import { fetchWireframes } from '../../api/wireframes';
import type { LinkEdge, ShapeNode } from './DiagramCanvas';
import { EndIcon, LineIcon, MarkerDefs, RoutingIcon, endStyleLabel, lineStyleLabel, markerId, nearestKind, routingLabel, styleOf } from './DiagramLineStyles';
import { ShapeIcon } from './DiagramShapes';
import { agentAccessOptions } from './DiagramsPage';
import { DiagramHistory } from './DiagramHistory';
import styles from './DiagramEditorPage.module.css';
import { laidOut } from './diagramLayout';
import type { LayoutDirection } from './diagramLayout';
import { askKept, keptAskOf, resumeKept } from '../../api/editorAsks';

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
/** How wide a picture is put on the diagram at most, in pixels; bigger ones are drawn smaller, in proportion. */
const PICTURE_WIDE = 320;
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
  // Words alone, with nothing drawn around them: a title, a heading over part of the diagram, a remark.
  { kind: 'text', icon: textIcon, label: () => t('Text') },
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
  image: () => t('Picture'),
  link: () => t('Link'),
  subroutine: () => t('Subroutine'),
  'manual-input': () => t('Manual input'),
  delay: () => t('Delay'),
  display: () => t('Display'),
  'off-page': () => t('Off-page link'),
  documents: () => t('Documents'),
  step: () => t('Step'),
  callout: () => t('Callout'),
  octagon: () => t('Stop'),
  star: () => t('Star'),
  queue: () => t('Queue'),
  storage: () => t('Storage'),
  server: () => t('Server'),
  browser: () => t('Browser'),
  mobile: () => t('Mobile'),
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
  image: { w: 240, h: 160 },
  link: { w: 220, h: 64 },
  text: { w: 200, h: 40 },
  subroutine: { w: 170, h: 60 },
  'manual-input': { w: 170, h: 70 },
  delay: { w: 150, h: 70 },
  display: { w: 170, h: 70 },
  'off-page': { w: 100, h: 80 },
  documents: { w: 170, h: 90 },
  step: { w: 170, h: 60 },
  callout: { w: 180, h: 90 },
  octagon: { w: 100, h: 100 },
  star: { w: 120, h: 120 },
  queue: { w: 180, h: 60 },
  storage: { w: 120, h: 100 },
  server: { w: 120, h: 100 },
  browser: { w: 200, h: 120 },
  mobile: { w: 80, h: 140 },
};

/** The colours offered for an outline or a line: the strong ones, which read on paper. */
const STROKE_COLOURS = ['#3f3f46', '#2563eb', '#16a34a', '#ca8a04', '#ea580c', '#dc2626', '#9333ea', '#db2777', '#0891b2'];

/**
 * How a box's outline or a line is stroked: a colour - the usual ink, one of
 * a row, or any other from the picker - and a thickness. Undefined is the
 * usual, which is what every box and line had before either could be set.
 */
function StrokeField({ label, colour, width, onChange, testId }: {
  label: string;
  colour: string | undefined;
  width: number | undefined;
  onChange: (next: { colour: string | undefined; width: number | undefined }) => void;
  testId: string;
}) {
  return (
    <div className={styles.field} data-testid={testId}>
      <span>{label}</span>
      <div className={styles.strokeRow}>
        <button
          type="button"
          className={`${styles.swatch} ${styles.swatchNone} ${colour === undefined ? styles.swatchOn : ''}`}
          onClick={() => onChange({ colour: undefined, width })}
          title={t('Usual')}
          aria-label={t('Usual')}
          data-testid={`${testId}-usual`}
        />
        {STROKE_COLOURS.slice(1).map((one) => (
          <button
            key={one}
            type="button"
            className={`${styles.swatch} ${colour === one ? styles.swatchOn : ''}`}
            style={{ background: one }}
            onClick={() => onChange({ colour: one, width })}
            title={one}
            aria-label={one}
            data-testid={`${testId}-colour`}
          />
        ))}
        <label className={`${styles.swatch} ${styles.swatchCustom} ${colour !== undefined && !STROKE_COLOURS.includes(colour) ? styles.swatchOn : ''}`} title={t('Another colour')}>
          <input
            type="color"
            className={styles.swatchPicker}
            value={colour ?? '#3f3f46'}
            aria-label={t('Another colour')}
            ref={(input) => {
              if (input === null) return;
              input.onchange = () => onChange({ colour: input.value.toLowerCase(), width });
            }}
            onChange={() => {}}
          />
        </label>
      </div>
      <Select
        className={`${form.input} ${form.select}`}
        value={width === undefined ? '' : String(width)}
        onChange={(picked) => onChange({ colour, width: picked === '' ? undefined : Number(picked) })}
        aria-label={tf('{what} thickness', { what: label })}
        data-testid={`${testId}-width`}
      >
        <option value="">{t('Usual thickness')}</option>
        {STROKE_WIDTHS.map((one) => (
          <option key={one} value={String(one)}>
            {tf('{n} px', { n: String(one) })}
          </option>
        ))}
      </Select>
    </div>
  );
}

function kindLabel(kind: DiagramNodeKind): string {
  return SHAPES.find((one) => one.kind === kind)?.label() ?? MORE_SHAPES[kind]?.() ?? kind;
}

const freshId = (prefix: string) => `${prefix}${Math.random().toString(36).slice(2, 10)}`;

/** A React Flow handle id as the side it names, or undefined for a floating end (the box's middle, no handle). */
const asSide = (handle: string | null | undefined): DiagramSide | undefined =>
  DIAGRAM_SIDES.find((side) => side === handle);
const snap = (value: number) => Math.round(value / GRID) * GRID;

/** What Copy and Cut put down and Paste picks up: for the length of the tab, across diagrams. */
let clipboard: DiagramDrawing | null = null;
/*
 * Whether what was copied in an editor is newer than whatever the system
 * clipboard holds. Copying boxes writes nowhere the browser can read back
 * (an address that is not https has no clipboard to write to), so a paste
 * cannot tell from the text alone whose it is. Set by a copy here; cleared by
 * a copy of text on the page or by leaving the window, which is where text
 * from another program comes from.
 */
let clipboardFresh = false;
if (typeof window !== 'undefined') {
  window.addEventListener('blur', () => {
    clipboardFresh = false;
  });
  window.addEventListener('copy', () => {
    clipboardFresh = false;
  });
  window.addEventListener('cut', () => {
    clipboardFresh = false;
  });
}

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
  // The whole diagram, from the toolbar's Delete, asked first.
  const [deletingDiagram, setDeletingDiagram] = useState(false);
  // The diagram's versions, in a dialog over the editor.
  const [historyOpen, setHistoryOpen] = useState(false);
  const flow = useReactFlow();
  const viewport = useViewport();
  /*
   * The box a link named (`?node=`), waiting for the canvas to be ready to
   * show it. Centring it the moment the drawing arrived ran before React Flow
   * had measured the canvas, so on a large diagram the box was selected and
   * left far off the screen; fitting the whole drawing never showed this,
   * because React Flow holds a fit back until it can do it.
   */
  const pendingNode = useRef<string | null>(null);
  const paneWidth = useStore((state) => state.width);
  const paneHeight = useStore((state) => state.height);
  const nodesReady = useNodesInitialized();

  const [diagram, setDiagram] = useState<Diagram | null>(null);
  const [missing, setMissing] = useState(false);
  const [drawing, setDrawing] = useState<DiagramDrawing>({ nodes: [], edges: [] });
  const [saved, setSaved] = useState('');
  const [selectedNodes, setSelectedNodes] = useState<string[]>([]);
  /*
   * Viewing rather than editing: the diagram is read - panned, zoomed, a box
   * selected to read its notes - and nothing moves, however it is clicked or
   * dragged. Remembered for this diagram in this browser, so one somebody
   * opens to read stays that way; a person's choice, not the diagram's, so
   * nobody else and no agent is held to it.
   */
  const viewingKey = `orknux.diagram.viewing.${diagramId}`;
  const [viewing, setViewingState] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(viewingKey) === '1';
    } catch {
      return false;
    }
  });
  function setViewing(next: boolean) {
    setViewingState(next);
    setLabelling(null);
    setMenu(null);
    try {
      if (next) window.localStorage.setItem(viewingKey, '1');
      else window.localStorage.removeItem(viewingKey);
    } catch {
      // A browser that keeps nothing forgets the choice; the page still works.
    }
  }
  /*
   * Where the canvas was looking, kept for this diagram in this browser and
   * taken back on the next load: a reload put a big diagram back to fitted,
   * and whoever was working in one corner of it had to find the corner again.
   * Read once, as the page mounts - the canvas reports a move of its own
   * before the diagram has arrived, and that must not count as where it was.
   * A link to a box still goes to the box.
   */
  const viewKey = `orknux.diagram.view.${diagramId}`;
  const keptView = useRef<Viewport | null>(null);
  const viewRead = useRef(false);
  if (!viewRead.current) {
    viewRead.current = true;
    try {
      const held = JSON.parse(window.localStorage.getItem(viewKey) ?? 'null') as Viewport | null;
      if (held !== null && [held.x, held.y, held.zoom].every((one) => typeof one === 'number' && Number.isFinite(one)) && held.zoom > 0) keptView.current = held;
    } catch {
      // Nothing kept, or nowhere to keep it: the diagram is fitted.
    }
  }
  /** Set once the diagram is on the canvas, so the moves that put it there are not taken for the person's. */
  const viewSettled = useRef(false);
  const [selectedEdges, setSelectedEdges] = useState<string[]>([]);
  const [past, setPast] = useState<DiagramDrawing[]>([]);
  const [future, setFuture] = useState<DiagramDrawing[]>([]);
  const [naming, setNaming] = useState<string | null>(null);
  const [, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<'layout' | 'align' | 'export' | 'shapes' | 'layers' | 'link' | 'picture' | null>(null);
  const [pictureAddress, setPictureAddress] = useState('');
  /**
   * Whom this tab follows, by login: the canvas keeps their pointer in its
   * middle as it moves, until they leave, or this person moves the canvas.
   */
  const [following, setFollowing] = useState<string | null>(null);
  /** The picture boxes whose file is still going up, drawn with a spinner until it lands. */
  const [uploading, setUploading] = useState<ReadonlySet<string>>(new Set());
  /** The right-click menu, where it was opened; on what is selected. */
  const [rightMenu, setRightMenu] = useState<{ x: number; y: number } | null>(null);
  const rightMenuNow = useRef(rightMenu);
  rightMenuNow.current = rightMenu;
  /**
   * The layer new shapes go on; null is the top one. And the layers hidden in
   * this browser while viewing: in View nothing is saved, so hiding a layer to
   * read the rest is this person's alone, and goes when they edit.
   */
  const [activeLayer, setActiveLayer] = useState<string | null>(null);
  const [hiddenHere, setHiddenHere] = useState<ReadonlySet<string>>(new Set());
  const [renamingLayer, setRenamingLayer] = useState<{ id: string; name: string } | null>(null);
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

  const { models, modelId, choose } = useChatModels(workspaceId, modelKey, true);
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
  const findKey = useDiagramFindShortcut();
  const modeKey = useDiagramModeShortcut();
  /**
   * Finding a box or a line by its words. A diagram of forty services and
   * sixty topics is one where the browser's own find sees nothing - the boxes
   * are drawn, not text it reads - and the person scrolled the canvas looking.
   * Matches a box's label or notes and a line's label, ignoring case; Enter
   * goes to the next and Shift+Enter back, each selected and brought to the
   * middle, in both modes, since finding changes nothing.
   */
  const [query, setQuery] = useState('');
  const [hit, setHit] = useState(0);
  /**
   * The workspace's other diagrams, which a box can link to: read once, so a
   * link says the diagram's name as it is now and a deleted one says so - as a
   * link to a document does in a document.
   */
  const [others, setOthers] = useState<Linkable[] | null>(null);
  /** A word that something happened - a link copied - shown on the canvas for a moment. */
  const [notice, setNoticeState] = useState<string | null>(null);
  const noticeTimer = useRef<number | null>(null);
  function setNotice(said: string) {
    setNoticeState(said);
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNoticeState(null), 2500);
  }
  /** The selected link card's search is open, to point it somewhere else. */
  const [relinking, setRelinking] = useState(false);
  useEffect(() => {
    let left = false;
    // And its documents and wireframes, which a box links to the same way. One failing leaves the rest.
    void Promise.all([
      fetchDiagrams(workspaceId).catch(() => []),
      fetchDocuments(workspaceId).catch(() => []),
      fetchWireframes(workspaceId).catch(() => []),
    ]).then(([diagrams, documents, wireframes]) => {
      if (left) return;
      setOthers([
        ...diagrams.map((one): Linkable => ({ kind: 'diagram', id: one.id, name: one.name, catalogName: one.catalogName, about: one.description ?? undefined })),
        ...documents.map((one): Linkable => ({ kind: 'document', id: one.id, name: one.name, catalogName: one.catalogName, about: one.excerpt })),
        ...wireframes.map((one): Linkable => ({ kind: 'wireframe', id: one.id, name: one.name, catalogName: one.catalogName })),
      ]);
    });
    return () => {
      left = true;
    };
  }, [workspaceId]);
  const finder = useRef<HTMLInputElement>(null);

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
    setDrawing({
      nodes: mergeById(base.nodes, mine.nodes, theirs.nodes),
      edges: mergeById(base.edges, mine.edges, theirs.edges),
      layers: mergeLayers(base, mine, theirs),
    });
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
        const node = asked === null ? undefined : drawingOf(found).nodes.find((one) => one.id === asked);
        if (node === undefined && keptView.current !== null) {
          // Taken back once the canvas has a size and its boxes are measured, as a linked box is centred:
          // set any sooner, React Flow's own first fit can land on top of it.
          pendingView.current = keptView.current;
        } else if (node === undefined) {
          // Fitted once its boxes are measured: a fit before that fits nothing, and the view stays where it began.
          pendingView.current = 'fit';
        } else {
          setSelectedNodes([node.id]);
          pendingNode.current = node.id;
        }
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

  // The kept view, taken back at the same moment.
  const pendingView = useRef<Viewport | 'fit' | null>(null);
  useEffect(() => {
    const view = pendingView.current;
    if (view === null || paneWidth === 0 || paneHeight === 0 || !nodesReady) return;
    pendingView.current = null;
    if (view === 'fit') void flow.fitView({ padding: 0.2, maxZoom: 1 });
    else void flow.setViewport(view);
    viewSettled.current = true;
  }, [paneWidth, paneHeight, nodesReady, flow]);

  // The linked box, centred once the canvas has a size and its boxes are measured.
  useEffect(() => {
    const asked = pendingNode.current;
    if (asked === null || paneWidth === 0 || paneHeight === 0 || !nodesReady) return;
    const node = byId.get(asked);
    if (node === undefined) return;
    pendingNode.current = null;
    void flow.setCenter(node.x + node.w / 2, node.y + node.h / 2, { zoom: 1 });
    viewSettled.current = true;
  }, [paneWidth, paneHeight, nodesReady, byId, flow]);

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
  const layers = layersOf(drawing);
  /** Where a new shape goes: the chosen layer while it is there, else the top one. Undefined while there is only Base. */
  const placing = drawing.layers === undefined || drawing.layers.length === 0
    ? undefined
    : (layers.find((one) => one.id === activeLayer) ?? layers[layers.length - 1]).id;
  const hiddenNow = useMemo(() => hiddenLayers(drawing, viewing ? hiddenHere : new Set()), [drawing, viewing, hiddenHere]);
  const lockedNow = useMemo(() => lockedLayers(drawing), [drawing]);

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
        data: { kind: node.kind, label: node.label, color: node.color, noted: (node.notes ?? '') !== '', link: node.link, image: node.image, loading: uploading.has(node.id) },
          // Its own outline, read by the shape's CSS through these, so every kind of shape takes it the same way.
          style: {
            ...(node.border !== undefined ? { '--node-border': node.border } : {}),
            ...(node.borderWidth !== undefined ? { '--node-border-width': `${node.borderWidth}px`, '--node-stroke': String(node.borderWidth) } : {}),
          } as CSSProperties,
        width: node.w,
        height: node.h,
        initialWidth: node.w,
        initialHeight: node.h,
        measured: { width: node.w, height: node.h },
        selected: selectedNodes.includes(node.id),
        zIndex: node.kind === 'group' ? -1 : undefined,
        // A hidden layer's boxes are not drawn; a locked one's are drawn and cannot be picked up.
        hidden: hiddenNow.has(layerOf(node, drawing)),
        ...(lockedNow.has(layerOf(node, drawing)) ? { draggable: false, selectable: false, connectable: false, deletable: false } : {}),
      };
    });
  }, [drawing, byId, selectedNodes, hiddenNow, lockedNow]);

  const edges = useMemo<LinkEdge[]>(
    () =>
      drawing.edges.map((edge) => {
        const { line, start, end } = styleOf(edge);
        // The arrow is React Flow's own closed arrow, as it always was; the other marks are this page's markers.
        const mark = (style: DiagramEndStyle, atEnd: boolean) =>
          style === 'arrow'
            ? { type: MarkerType.ArrowClosed, width: 18, height: 18, ...(edge.color !== undefined ? { color: edge.color } : {}), ...(atEnd ? {} : { orient: 'auto-start-reverse' }) }
            : (markerId(style, atEnd) ?? undefined);
        const fromHidden = hiddenNow.has(layerOf(byId.get(edge.from) ?? {}, drawing));
        const toHidden = hiddenNow.has(layerOf(byId.get(edge.to) ?? {}, drawing));
        const locked = lockedNow.has(layerOf(edge, drawing));
        return {
          // Hidden with its layer, or with either of its boxes.
          hidden: hiddenNow.has(layerOf(edge, drawing)) || fromHidden || toHidden,
          ...(locked ? { selectable: false, deletable: false } : {}),
          id: edge.id,
          source: edge.from,
          target: edge.to,
          // A pinned end names its box's handle, so React Flow sits its reconnect anchor on that side; a floating end names none.
          ...(edge.fromSide !== undefined ? { sourceHandle: edge.fromSide } : {}),
          ...(edge.toSide !== undefined ? { targetHandle: edge.toSide } : {}),
          type: 'link' as const,
          data: { line, label: edge.label, routing: edge.routing ?? 'straight', fromSide: edge.fromSide, toSide: edge.toSide, points: edge.points, labelAt: edge.labelAt, color: edge.color, width: edge.width },
          markerEnd: mark(end, true),
          markerStart: mark(start, false),
          selected: selectedEdges.includes(edge.id),
        };
      }).map((edge) =>
        /*
         * A selected box lights every line it has, in or out, so where it
         * reaches is seen at a glance rather than traced line by line.
         */
        selectedNodes.includes(edge.source) || selectedNodes.includes(edge.target)
          ? { ...edge, data: { ...edge.data, touched: true }, zIndex: 1 }
          : edge,
      ),
    [drawing, selectedEdges, selectedNodes, hiddenNow, lockedNow, byId],
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
    // Viewing, only a selection changes; a drag or a resize that slipped through moves nothing.
    if (viewing) changes = changes.filter((one) => one.type === 'select');
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
    if (viewing || connection.source === connection.target) return;
    const made: DiagramEdgeData = {
      id: freshId('e'),
      from: connection.source,
      to: connection.target,
      kind: 'arrow',
      line: 'solid',
      start: 'none',
      end: 'arrow',
      // Drawn from or onto a particular side of a box pins that end there; onto the box's middle, it floats.
      ...(asSide(connection.sourceHandle) !== undefined ? { fromSide: asSide(connection.sourceHandle) } : {}),
      ...(asSide(connection.targetHandle) !== undefined ? { toSide: asSide(connection.targetHandle) } : {}),
    };
    change({ ...drawing, edges: [...drawing.edges, made] });
    setSelectedNodes([]);
    setSelectedEdges([made.id]);
  }

  /**
   * An arrow's end dragged to a new place. Dropped on another box it re-points
   * there; dropped on a side's handle it pins to that side, and on a box's
   * middle it floats again. The other end is left exactly as it was.
   */
  function onReconnect(previous: LinkEdge, connection: Connection) {
    // A line to its own box is left as it was, as a new one from a box to itself is.
    if (viewing || connection.source === connection.target) return;
    const fromSide = asSide(connection.sourceHandle);
    const toSide = asSide(connection.targetHandle);
    change({
      ...drawing,
      edges: drawing.edges.map((edge) =>
        edge.id === previous.id
          ? { ...edge, from: connection.source, to: connection.target, fromSide, toSide }
          : edge,
      ),
    });
    setSelectedEdges([previous.id]);
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
      label: kind === 'group' ? t('Group') : kind === 'note' ? t('Note') : kind === 'text' ? t('Text') : kind === 'class' ? `${t('New node')}\n--\n\n--\n` : t('New node'),
      x: snap(middle.x - size.w / 2 + offset),
      y: snap(middle.y - size.h / 2 + offset),
      w: size.w,
      h: size.h,
      layer: placing,
    };
    change({ ...drawing, nodes: kind === 'group' ? [made, ...drawing.nodes] : [...drawing.nodes, made] });
    setSelectedNodes([made.id]);
    setSelectedEdges([]);
  }

  /**
   * Pictures put on the diagram: each file uploaded beside it and drawn in a
   * box of its own proportions, no wider than [PICTURE_WIDE], where [at] says
   * - where they were dropped - or in the middle. An address on the web goes
   * straight into the box, which the browser fetches.
   */
  const pictureInput = useRef<HTMLInputElement>(null);
  async function addPictures(files: File[], addresses: string[], at?: { x: number; y: number }) {
    if (diagram === null || viewing) return;
    const box = document.querySelector('[data-testid="diagram-canvas"]')?.getBoundingClientRect();
    const middle = at ?? (box === undefined ? { x: 0, y: 0 } : flow.screenToFlowPosition({ x: box.left + box.width / 2, y: box.top + box.height / 2 }));
    const made: DiagramNodeData[] = [];
    const place = (image: string | undefined, width: number | null, height: number | null) => {
      const ratio = width !== null && height !== null && width > 0 ? height / width : MADE.image.h / MADE.image.w;
      const w = Math.min(PICTURE_WIDE, width ?? MADE.image.w);
      const h = Math.max(24, Math.round(w * ratio));
      const step = made.length * GRID * 2;
      const one: DiagramNodeData = { id: freshId('n'), kind: 'image', label: '', ...(image !== undefined ? { image } : {}), x: snap(middle.x - w / 2 + step), y: snap(middle.y - h / 2 + step), w, h, layer: placing };
      made.push(one);
      return one.id;
    };
    /** A picture's size in pixels, read by the browser from wherever it is. */
    const sized = (source: string) =>
      new Promise<{ w: number | null; h: number | null }>((done) => {
        const probe = new Image();
        probe.onload = () => done({ w: probe.naturalWidth, h: probe.naturalHeight });
        probe.onerror = () => done({ w: null, h: null });
        probe.referrerPolicy = 'no-referrer';
        probe.src = source;
      });
    // Each file's box goes down at once, at the file's own proportions, with a spinner in it until its upload lands.
    const waiting: { id: string; file: File }[] = [];
    for (const file of files.filter((one) => PICTURE_TYPES.includes(one.type))) {
      const local = URL.createObjectURL(file);
      const size = await sized(local);
      URL.revokeObjectURL(local);
      waiting.push({ id: place(undefined, size.w, size.h), file });
    }
    for (const address of addresses) {
      const size = await sized(address);
      place(address, size.w, size.h);
    }
    if (made.length === 0) return;
    remember(now.current.drawing);
    setDrawing((held) => ({ ...held, nodes: [...held.nodes, ...made] }));
    setSelectedNodes(made.map((one) => one.id));
    setSelectedEdges([]);
    setUploading((held) => new Set([...held, ...waiting.map((one) => one.id)]));
    await Promise.all(
      waiting.map(async ({ id, file }) => {
        try {
          const kept = await uploadDiagramPicture(diagram.id, file);
          setDrawing((held) => ({ ...held, nodes: held.nodes.map((node) => (node.id === id ? { ...node, image: kept.id } : node)) }));
        } catch (cause) {
          // Gone again, with why: a box that will never get its picture is not one to leave behind.
          setDrawing((held) => ({ ...held, nodes: held.nodes.filter((node) => node.id !== id) }));
          setError(cause instanceof Error ? cause.message : t('That picture could not be added.'));
        } finally {
          setUploading((held) => {
            const next = new Set(held);
            next.delete(id);
            return next;
          });
        }
      }),
    );
  }

  /*
   * A picture pasted - a screenshot, an image copied from a page - goes on
   * the diagram as a picture box, in the middle of what is in view. Only
   * where nothing that takes text has the focus: there, a paste is text.
   */
  const addPicturesRef = useRef(addPictures);
  addPicturesRef.current = addPictures;
  /** Where the pointer is on the canvas, in the diagram's own units; null while it is elsewhere. What is pasted lands there. */
  const pointerAt = useRef<{ x: number; y: number } | null>(null);
  const pasteTextRef = useRef(pasteText);
  const labellingNow = useRef(labelling);
  labellingNow.current = labelling;
  /** A box made to lead to [link], its words left as they are. */
  const linkNodeRef = useRef<(id: string, link: string) => void>(() => undefined);
  linkNodeRef.current = (id: string, link: string) => {
    change({ ...drawing, nodes: drawing.nodes.map((node) => (node.id === id ? { ...node, link } : node)) });
    setNotice(t('Linked'));
  };
  pasteTextRef.current = pasteText;
  useEffect(() => {
    const pasted = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      /*
       * An address pasted over selected words of a box being typed into makes
       * those words a link, as in a document: the words stay, and the box
       * leads to the address. Not selected, an address is just more text.
       */
      if (target instanceof HTMLTextAreaElement && target.dataset.testid === 'diagram-label-editor' && target.selectionStart !== target.selectionEnd) {
        const address = event.clipboardData?.getData('text/plain').trim() ?? '';
        const typingIn = labellingNow.current;
        if (typingIn?.kind === 'node' && /^(https?:\/\/|mailto:)\S+$/i.test(address)) {
          event.preventDefault();
          linkNodeRef.current(typingIn.id, address);
          return;
        }
      }
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable === true) return;
      const files = Array.from(event.clipboardData?.files ?? []).filter((one) => PICTURE_TYPES.includes(one.type));
      const text = event.clipboardData?.getData('text/plain').trim() ?? '';
      // An address copied that is plainly a picture's, by its ending.
      const addresses = files.length === 0 && /^https?:\/\/\S+\.(?:png|jpe?g|gif|webp)(?:\?\S*)?$/i.test(text) ? [text] : [];
      event.preventDefault();
      // Under the pointer, as a paste lands in any drawing program; in the middle of the view when it is off the canvas.
      const at = pointerAt.current ?? undefined;
      if (files.length > 0 || addresses.length > 0) void addPicturesRef.current(files, addresses, at);
      // Text, unless boxes were copied here since: those are what Ctrl+V means then.
      else if (text !== '' && !(clipboardFresh && clipboard !== null)) pasteTextRef.current(text, at);
      else keys.current.paste();
    };
    window.addEventListener('paste', pasted);
    return () => window.removeEventListener('paste', pasted);
  }, []);

  // -- Layers ---------------------------------------------------------------

  /** The list written out whole, Base made a real layer the first time another is added. */
  function relayer(next: DiagramLayer[]) {
    change({ ...drawing, layers: next });
  }

  function addLayer() {
    const made: DiagramLayer = { id: freshLayerId(drawing), name: tf('Layer {n}', { n: String(layers.length + 1) }), visible: true, locked: false };
    relayer([...layers, made]);
    setActiveLayer(made.id);
  }

  /** Shown or not: saved for everybody while editing, this browser's own while viewing. */
  function toggleShown(layer: DiagramLayer) {
    if (viewing) {
      setHiddenHere((held) => {
        const next = new Set(held);
        if (next.has(layer.id)) next.delete(layer.id);
        else next.add(layer.id);
        return next;
      });
      return;
    }
    relayer(layers.map((one) => (one.id === layer.id ? { ...one, visible: !one.visible } : one)));
    // What goes out of sight stops being selected, so a Delete cannot reach it.
    if (layer.visible) {
      setSelectedNodes((held) => held.filter((id) => layerOf(byId.get(id) ?? {}, drawing) !== layer.id));
      setSelectedEdges([]);
    }
  }

  function toggleLocked(layer: DiagramLayer) {
    relayer(layers.map((one) => (one.id === layer.id ? { ...one, locked: !one.locked } : one)));
    if (!layer.locked) {
      setSelectedNodes((held) => held.filter((id) => layerOf(byId.get(id) ?? {}, drawing) !== layer.id));
      setSelectedEdges([]);
    }
  }

  function renameLayer(layer: DiagramLayer, name: string) {
    const called = name.trim();
    setRenamingLayer(null);
    if (called === '' || called === layer.name) return;
    relayer(layers.map((one) => (one.id === layer.id ? { ...one, name: called } : one)));
  }

  /** One place up or down the stack; up is drawn over more. */
  function moveLayer(layer: DiagramLayer, by: -1 | 1) {
    const at = layers.findIndex((one) => one.id === layer.id);
    const to = at + by;
    if (to < 0 || to >= layers.length) return;
    const next = [...layers];
    [next[at], next[to]] = [next[to], next[at]];
    /*
     * The current layer is held by its id, so it goes with its row. Nothing
     * chosen meant "the top one", which is a place rather than a layer: the
     * top layer moved down and the light stayed at the top, on whichever
     * layer took its place.
     */
    if (activeLayer === null && placing !== undefined) setActiveLayer(placing);
    relayer(next);
  }

  /**
   * A layer taken away, and what was on it kept: moved onto the layer below
   * it, or above where it was the bottom one. Deleting the boxes as well is
   * what Delete on a selection is for, and losing a drawing to a click on a
   * layer's bin is the worse surprise.
   */
  function removeLayer(layer: DiagramLayer) {
    if (layers.length < 2) return;
    const at = layers.findIndex((one) => one.id === layer.id);
    const heir = layers[at === 0 ? 1 : at - 1].id;
    const left = layers.filter((one) => one.id !== layer.id);
    const onto = (item: { layer?: string }) => (layerOf(item, drawing) === layer.id ? heir : layerOf(item, drawing));
    change({
      ...drawing,
      layers: left,
      nodes: drawing.nodes.map((node) => ({ ...node, layer: onto(node) })),
      edges: drawing.edges.map((edge) => ({ ...edge, layer: onto(edge) })),
    });
    if (activeLayer === layer.id) setActiveLayer(heir);
  }

  /** What is selected put on [layer], and the lines between selected boxes with it. */
  function moveSelectionTo(layer: DiagramLayer) {
    const boxes = new Set(selectedNodes);
    const lines = new Set(selectedEdges);
    change({
      ...drawing,
      layers,
      nodes: drawing.nodes.map((node) => (boxes.has(node.id) ? { ...node, layer: layer.id } : node)),
      edges: drawing.edges.map((edge) => (lines.has(edge.id) || (boxes.has(edge.from) && boxes.has(edge.to)) ? { ...edge, layer: layer.id } : edge)),
    });
  }

  function remove() {
    if (selectedNodes.length === 0 && selectedEdges.length === 0) return;
    const gone = new Set(selectedNodes);
    change({
      ...drawing,
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
    if (held !== null) hold(held);
  }

  function cut() {
    const held = picked();
    if (held === null) return;
    hold(held);
    remove();
  }

  /** Boxes copied: kept for pasting here, and their words handed to the system clipboard where there is one. */
  function hold(held: DiagramDrawing) {
    clipboard = held;
    clipboardFresh = true;
    const words = held.nodes.map((node) => node.label ?? '').filter((one) => one.trim() !== '').join('\n');
    if (words !== '') void navigator.clipboard?.writeText(words).catch(() => undefined);
  }

  /**
   * A link card, in the middle of what is in view, leading to [link] and
   * named [name] - the name it is drawn with until what it leads to is known
   * by its own, which then wins, so a renamed document is not shown by its
   * old name.
   */
  function addLink(link: string, name: string) {
    if (viewing) return;
    const size = MADE.link;
    const box = document.querySelector('[data-testid="diagram-canvas"]')?.getBoundingClientRect();
    const middle = box === undefined ? { x: 0, y: 0 } : flow.screenToFlowPosition({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
    const offset = (drawing.nodes.length % 6) * GRID * 3;
    const made: DiagramNodeData = { id: freshId('n'), kind: 'link', label: name, link, x: snap(middle.x - size.w / 2 + offset), y: snap(middle.y - size.h / 2 + offset), w: size.w, h: size.h, layer: placing };
    change({ ...drawing, nodes: [...drawing.nodes, made] });
    setSelectedNodes([made.id]);
    setSelectedEdges([]);
  }

  /**
   * Text pasted onto the canvas, from another program or a page: put down as
   * text - words alone, with no box around them - in the middle of what is in
   * view, sized to them. Pasting did nothing at all before, unless boxes had
   * been copied here.
   */
  function pasteText(text: string, at?: { x: number; y: number }) {
    if (viewing) return;
    const lines = text.replace(/\s+$/, '').split(/\r?\n/);
    const longest = Math.max(...lines.map((one) => one.length));
    // Sized to the words: as wide as the longest line up to a column's width, as tall as they wrap to.
    const w = snap(Math.min(480, Math.max(MADE.text.w / 2, longest * 7.5 + 16)));
    const wrapped = lines.reduce((sum, one) => sum + Math.max(1, Math.ceil((one.length * 7.5) / (w - 16))), 0);
    const h = snap(Math.min(800, Math.max(MADE.text.h, wrapped * 20 + 12)));
    const box = document.querySelector('[data-testid="diagram-canvas"]')?.getBoundingClientRect();
    const middle = box === undefined ? { x: 0, y: 0 } : flow.screenToFlowPosition({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
    const centre = at ?? middle;
    const made: DiagramNodeData = { id: freshId('n'), kind: 'text', label: lines.join('\n'), x: snap(centre.x - w / 2), y: snap(centre.y - h / 2), w, h, layer: placing };
    change({ ...drawing, nodes: [...drawing.nodes, made] });
    setSelectedNodes([made.id]);
    setSelectedEdges([]);
  }

  function paste(from: DiagramDrawing | null = clipboard, at?: { x: number; y: number } | null) {
    if (from === null || from.nodes.length === 0) return;
    const renamed = new Map(from.nodes.map((node) => [node.id, freshId('n')]));
    // Pasted under the pointer where there is one, the copied boxes' middle on it; a duplicate sits just off its original.
    const left = Math.min(...from.nodes.map((node) => node.x));
    const top = Math.min(...from.nodes.map((node) => node.y));
    const right = Math.max(...from.nodes.map((node) => node.x + node.w));
    const bottom = Math.max(...from.nodes.map((node) => node.y + node.h));
    const dx = at == null ? PASTE_OFFSET : snap(at.x - (left + right) / 2);
    const dy = at == null ? PASTE_OFFSET : snap(at.y - (top + bottom) / 2);
    const nodes = from.nodes.map((node) => ({
      ...node,
      id: renamed.get(node.id) as string,
      x: node.x + dx,
      y: node.y + dy,
      parent: node.parent === undefined ? undefined : (renamed.get(node.parent) ?? (byId.has(node.parent) ? node.parent : undefined)),
      // Its own layer where this diagram has it - copied from another, it may not - else where new shapes go.
      layer: layers.some((one) => one.id === node.layer) ? node.layer : placing,
    }));
    const edges = from.edges.map((edge) => ({
      ...edge,
      layer: layers.some((one) => one.id === edge.layer) ? edge.layer : placing,
      id: freshId('e'),
      from: renamed.get(edge.from) as string,
      to: renamed.get(edge.to) as string,
    }));
    change({ ...drawing, nodes: [...drawing.nodes, ...nodes], edges: [...drawing.edges, ...edges] });
    setSelectedNodes(nodes.map((node) => node.id));
    setSelectedEdges([]);
  }

  function duplicate() {
    paste(picked());
  }

  /**
   * What is selected drawn over or under the rest: the order of the drawing's
   * lists is the order things are drawn, last on top. Front and back go all
   * the way; forward and backward pass one thing.
   */
  function restack(where: 'front' | 'forward' | 'backward' | 'back') {
    const order = <T extends { id: string }>(list: T[], chosen: Set<string>): T[] => {
      if (chosen.size === 0) return list;
      const mine = list.filter((one) => chosen.has(one.id));
      const rest = list.filter((one) => !chosen.has(one.id));
      if (where === 'front') return [...rest, ...mine];
      if (where === 'back') return [...mine, ...rest];
      const next = [...list];
      const indices = next.map((one, at) => (chosen.has(one.id) ? at : -1)).filter((at) => at >= 0);
      if (where === 'forward') {
        for (const at of indices.reverse()) if (at + 1 < next.length && !chosen.has(next[at + 1].id)) [next[at], next[at + 1]] = [next[at + 1], next[at]];
      } else {
        for (const at of indices) if (at > 0 && !chosen.has(next[at - 1].id)) [next[at], next[at - 1]] = [next[at - 1], next[at]];
      }
      return next;
    };
    change({ ...drawing, nodes: order(drawing.nodes, new Set(selectedNodes)), edges: order(drawing.edges, new Set(selectedEdges)) });
  }

  /** What is selected put on the layer above or below its own, or the top or bottom one. */
  function shiftLayer(where: 'up' | 'down' | 'top' | 'bottom') {
    if (layers.length < 2) return;
    const to = (item: { layer?: string }) => {
      const at = layers.findIndex((one) => one.id === layerOf(item, drawing));
      const next = where === 'top' ? layers.length - 1 : where === 'bottom' ? 0 : Math.min(layers.length - 1, Math.max(0, at + (where === 'up' ? 1 : -1)));
      return layers[next].id;
    };
    const boxes = new Set(selectedNodes);
    const lines = new Set(selectedEdges);
    change({
      ...drawing,
      layers,
      nodes: drawing.nodes.map((node) => (boxes.has(node.id) ? { ...node, layer: to(node) } : node)),
      edges: drawing.edges.map((edge) => (lines.has(edge.id) ? { ...edge, layer: to(edge) } : edge)),
    });
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
    /*
     * Laid out in rows or columns, a line reads best in right angles between
     * them - so a line still straight, as every line starts, is bent; one a
     * person made curved is theirs and is left curved.
     */
    const laid = laidOut(drawing, direction);
    // Corners found for where the boxes were are no use where they are now.
    change({ ...laid, edges: laid.edges.map(({ points: _old, labelAt: _at, ...edge }) => ((edge.routing ?? 'straight') === 'straight' ? { ...edge, routing: 'right-angles' } : edge)) });
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
          mine = {
            nodes: mergeById(base.nodes, mine.nodes, theirs.nodes),
            edges: mergeById(base.edges, mine.edges, theirs.edges),
            layers: mergeLayers(base, mine, theirs),
          };
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

  /*
   * A question asked before this page was loaded again - a reload in the
   * middle of an answer - is waited for as though it had just been sent: the
   * working row, then the answer under the question and the diagram taken up
   * where the answer changed it.
   */
  const resumed = useRef(false);
  useEffect(() => {
    if (diagram === null || resumed.current) return;
    resumed.current = true;
    const askId = keptAskOf('diagram', diagram.id);
    if (askId === null) return;
    const id = diagram.id;
    const revision = diagram.revision;
    setAnswering(true);
    resumeKept('diagram', id, askId)
      .then(async (settled) => {
        setTalk((was) => [...was, { role: 'assistant', content: settled.answer ?? '' }]);
        const now = settled.changed === true ? await fetchDiagram(id).catch(() => null) : null;
        if (now !== null && now.revision !== revision) take(now);
      })
      .catch((cause: unknown) => setTalkError(cause instanceof Error ? cause.message : t('The model could not answer.')))
      .finally(() => setAnswering(false));
    // Once, for the diagram this page opened on; `take` and the setters are the page's own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagram]);

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
      const answered =
        modelId === CLAUDE_CODE_MODEL
          ? await askThroughClaudeCode(workspaceId, `the diagram ${diagram.name}`, sent, diagram.revision, () => fetchDiagram(diagram.id)).then(
              (asked) => ({ answer: asked.answer, changed: asked.changed, diagram: asked.item }),
            )
          : await askKept('diagram', diagram.id, modelId, sent).then(async (settled) => {
              const found = settled.changed === true ? await fetchDiagram(diagram.id).catch(() => null) : null;
              return { answer: settled.answer ?? '', changed: found !== null, diagram: found };
            });
      setTalk([...sent, { role: 'assistant', content: answered.answer }]);
      if (answered.changed && answered.diagram !== null) {
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

  const keys = useRef({ undo, redo, save, remove, duplicate, copy, cut, paste: () => paste(clipboard, pointerAt.current), nudge, arrange, label: () => {}, escape: () => {} });
  keys.current = {
    undo,
    redo,
    save,
    remove,
    duplicate,
    copy,
    cut,
    paste: () => paste(clipboard, pointerAt.current),
    nudge,
    arrange,
    label: startLabelling,
    escape: () => {
      // An open right-click menu is closed first, keeping what it was opened on selected.
      if (rightMenuNow.current !== null) {
        setRightMenu(null);
        return;
      }
      setSelectedNodes([]);
      setSelectedEdges([]);
      setMenu(null);
    },
  };
  const viewingNow = useRef(viewing);
  viewingNow.current = viewing;

  const found = useMemo(() => {
    const said = query.trim().toLowerCase();
    if (said === '') return [] as { kind: 'node' | 'edge'; id: string }[];
    const has = (text: string | undefined) => (text ?? '').toLowerCase().includes(said);
    return [
      ...drawing.nodes.filter((one) => has(one.label) || has(one.notes)).map((one) => ({ kind: 'node' as const, id: one.id })),
      ...drawing.edges.filter((one) => has(one.label)).map((one) => ({ kind: 'edge' as const, id: one.id })),
    ];
  }, [query, drawing]);
  /** Selects match [index], wrapping round, and puts it in the middle of the canvas. */
  const goTo = (index: number) => {
    if (found.length === 0) return;
    const at = ((index % found.length) + found.length) % found.length;
    setHit(at);
    const one = found[at];
    const zoom = { zoom: Math.max(flow.getZoom(), 0.8), duration: 250 };
    if (one.kind === 'node') {
      const node = drawing.nodes.find((held) => held.id === one.id);
      if (node === undefined) return;
      setSelectedEdges([]);
      setSelectedNodes([node.id]);
      void flow.setCenter(node.x + node.w / 2, node.y + node.h / 2, zoom);
    } else {
      const edge = drawing.edges.find((held) => held.id === one.id);
      const from = drawing.nodes.find((held) => held.id === edge?.from);
      const to = drawing.nodes.find((held) => held.id === edge?.to);
      if (edge === undefined || from === undefined || to === undefined) return;
      setSelectedNodes([]);
      setSelectedEdges([edge.id]);
      void flow.setCenter((from.x + from.w / 2 + to.x + to.w / 2) / 2, (from.y + from.h / 2 + to.y + to.h / 2) / 2, zoom);
    }
  };
  // Typing goes to the first match, as a browser's find does; a match that went away starts again.
  const goToRef = useRef(goTo);
  goToRef.current = goTo;
  useEffect(() => {
    setHit(0);
    if (query.trim() !== '') goToRef.current(0);
    // Only on what is typed: a drawing that changes under a search keeps its place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);
  useEffect(() => {
    const pressed = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement || target?.isContentEditable === true;
      if (matches(event, saveKey)) {
        event.preventDefault();
        void keys.current.save();
        return;
      }
      // Find, from anywhere on the page - typing in a note included - since it moves nothing.
      if (matches(event, findKey)) {
        event.preventDefault();
        finder.current?.focus();
        finder.current?.select();
        return;
      }
      // View or Edit, from anywhere on the page - a note being typed in is left when it turns to View.
      if (matches(event, modeKey)) {
        event.preventDefault();
        setViewing(!viewingNow.current);
        return;
      }
      if (typing) return;
      const run = (action: () => unknown) => {
        event.preventDefault();
        action();
      };
      if (event.key === 'Escape') keys.current.escape();
      else if (matches(event, zoomInKey)) run(() => void flow.zoomIn());
      else if (matches(event, zoomOutKey)) run(() => void flow.zoomOut());
      // Viewing, nothing below changes the drawing, so none of it is answered.
      else if (viewingNow.current) return;
      else if ((event.key === 'Enter' || event.key === 'F2') && !event.ctrlKey && !event.metaKey && !event.altKey) run(keys.current.label);
      else if (event.key === 'Delete' || event.key === 'Backspace') run(keys.current.remove);
      else if (matches(event, duplicateKey)) run(keys.current.duplicate);
      else if (matches(event, copyKey)) run(keys.current.copy);
      else if (matches(event, cutKey)) run(keys.current.cut);
      // The browser's own paste key is left to the paste event, which can see a picture on the clipboard; another key pastes here.
      else if (matches(event, pasteKey)) {
        if (!((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v')) run(keys.current.paste);
      }
      else if (matches(event, undoKey)) run(keys.current.undo);
      else if (matches(event, redoKey) || ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'y')) run(keys.current.redo);
      else if (matches(event, arrangeKey)) run(() => keys.current.arrange('LR'));
      else if (event.key.startsWith('Arrow') && !event.ctrlKey && !event.metaKey) {
        const step = event.shiftKey ? GRID : 1;
        const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
        const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
        run(() => keys.current.nudge(dx, dy));
      }
    };
    document.addEventListener('keydown', pressed);
    return () => document.removeEventListener('keydown', pressed);
  }, [undoKey, redoKey, saveKey, duplicateKey, copyKey, cutKey, pasteKey, zoomInKey, zoomOutKey, arrangeKey, findKey, modeKey, flow]);

  // -- Drawing ------------------------------------------------------------

  const oneNode = selectedNodes.length === 1 && selectedEdges.length === 0 ? (byId.get(selectedNodes[0]) ?? null) : null;
  // Another box picked: its link is shown as it is, not with the last one's search still open.
  useEffect(() => setRelinking(false), [oneNode?.id]);
  // Following: their pointer kept in the middle, at this tab's own zoom; gone with them when they leave.
  const followed = following === null ? undefined : live.pointers.find((one) => one.login === following && one.x !== null && one.y !== null);
  /*
   * Where each person's pointer was last seen on the canvas. A click on an
   * avatar went nowhere whenever their pointer was off the canvas at that
   * moment - over the toolbar, the side panel, another window - which is most
   * of the time somebody is not drawing, so only following, which waits for
   * them to move, seemed to work.
   */
  const lastPointer = useRef(new Map<string, { x: number; y: number }>());
  const jumpWhenSeen = useRef<string | null>(null);
  useEffect(() => {
    live.pointers.forEach((one) => {
      if (one.x === null || one.y === null) return;
      lastPointer.current.set(one.login, { x: one.x, y: one.y });
      if (jumpWhenSeen.current === one.login) {
        jumpWhenSeen.current = null;
        void flow.setCenter(one.x, one.y, { zoom: flow.getZoom(), duration: 300 });
      }
    });
  }, [live.pointers, flow]);
  useEffect(() => {
    if (following === null) return;
    if (!live.others.some((one) => one.login === following)) {
      setFollowing(null);
      return;
    }
    if (followed !== undefined) void flow.setCenter(followed.x as number, followed.y as number, { zoom: flow.getZoom(), duration: 120 });
  }, [following, followed?.x, followed?.y, live.others, flow]);
  const linkCtx = useMemo(
    () => ({
      describe: (link: string): LinkCard => {
        const item = linkedItem(link);
        if (item === null) return { name: link, where: t('Opens in a new tab'), missing: false };
        const other = others?.find((one) => one.kind === item.kind && one.id === item.id);
        const said = { diagram: t('Diagram'), document: t('Document'), wireframe: t('Wireframe') }[item.kind];
        if (other === undefined) return { name: `${said} ${item.id}`, where: '', missing: others !== null };
        return { name: other.name, where: tf('{kind} in {catalog}', { kind: said, catalog: other.catalogName }), excerpt: other.about, missing: false };
      },
      open: (link: string) => {
        const item = linkedItem(link);
        if (item !== null) {
          const to = `/workspace/${workspaceId}/${item.kind === 'diagram' ? 'explore/diagrams' : `design/${item.kind}s`}/${item.id}`;
          if (!askBeforeLeaving(to)) navigate(to);
        } else if (linkAllowed(link)) {
          window.open(link, '_blank', 'noopener,noreferrer');
        }
      },
    }),
    [others, workspaceId, navigate],
  );
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
        <Presence
          others={live.others}
          onJump={(login) => {
            const there = live.pointers.find((one) => one.login === login && one.x !== null && one.y !== null);
            const known = there !== undefined ? { x: there.x as number, y: there.y as number } : lastPointer.current.get(login);
            if (known !== undefined) void flow.setCenter(known.x, known.y, { zoom: flow.getZoom(), duration: 300 });
            // Never seen on the canvas yet: gone to the moment they are.
            else jumpWhenSeen.current = login;
          }}
          following={following}
          onFollow={setFollowing}
        />
        <div className={shell.toolbarRight}>
          {/* In View the tools stay where they are, drawn disabled: a bar that changed shape with the mode moved everything after it. */}
          <fieldset className={styles.toolGroup} disabled={viewing} data-testid="diagram-edit-tools">
          <span className={shell.toolbarGap} aria-hidden="true" />
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
            {/*
              A picture, from a file or from an address on the web - asked
              which, since a toolbar button that only opened a file chooser
              left an address to be found in the side panel afterwards. Or
              dropped on the canvas, or pasted.
            */}
            <div className={styles.menuHolder}>
              <button
                type="button"
                className={shell.tool}
                onClick={() => setMenu(menu === 'picture' ? null : 'picture')}
                title={t('Add a picture')}
                aria-label={t('Add a picture')}
                aria-expanded={menu === 'picture'}
                data-testid="diagram-add-picture"
              >
                <img src={pictureIcon} alt="" width={16} height={16} />
              </button>
              {menu === 'picture' && (
                <div className={`${styles.menu} ${styles.addMenu}`} role="dialog" aria-label={t('Add a picture')} data-testid="diagram-picture-menu">
                  <button
                    type="button"
                    className={styles.menuItem}
                    onClick={() => {
                      setMenu(null);
                      pictureInput.current?.click();
                    }}
                    data-testid="diagram-picture-file"
                  >
                    {t('From your computer…')}
                  </button>
                  <span className={styles.menuHeading}>{t('From a web address')}</span>
                  <form
                    className={styles.addressRow}
                    onSubmit={(event) => {
                      event.preventDefault();
                      const said = pictureAddress.trim();
                      if (!/^https?:\/\/\S+$/i.test(said)) return;
                      setMenu(null);
                      setPictureAddress('');
                      void addPictures([], [said]);
                    }}
                  >
                    <input
                      className={styles.addressField}
                      value={pictureAddress}
                      onChange={(event) => setPictureAddress(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') setMenu(null);
                      }}
                      placeholder="https://…"
                      aria-label={t('The picture\'s web address')}
                      aria-invalid={pictureAddress.trim() !== '' && !/^https?:\/\/\S+$/i.test(pictureAddress.trim())}
                      autoFocus
                      data-testid="diagram-picture-address"
                    />
                    <button type="submit" className={styles.addressAdd} disabled={!/^https?:\/\/\S+$/i.test(pictureAddress.trim())} data-testid="diagram-picture-address-add">
                      {t('Add')}
                    </button>
                  </form>
                </div>
              )}
            </div>
            {/* A link card: another diagram, a document, a wireframe or a web page, found by name or pasted. */}
            <div className={styles.menuHolder}>
              <button
                type="button"
                className={shell.tool}
                onClick={() => setMenu(menu === 'link' ? null : 'link')}
                title={t('Add a link')}
                aria-label={t('Add a link')}
                aria-expanded={menu === 'link'}
                data-testid="diagram-add-link"
              >
                <img src={linkToolIcon} alt="" width={16} height={16} />
              </button>
              {menu === 'link' && (
                <div className={`${styles.menu} ${styles.addMenu} ${styles.linkMenu}`} role="dialog" aria-label={t('Add a link')} data-testid="diagram-link-menu">
                  {/*
                    A text element selected is made a link itself, its words
                    shown: opened on the web address with them filled in. With
                    anything else selected, or nothing, a link card is added.
                  */}
                  <DiagramLinkSearch
                    items={others}
                    exceptId={diagramId}
                    autoFocus
                    initialFilter={oneNode?.kind === 'text' ? 'web' : 'all'}
                    initialWords={oneNode?.kind === 'text' ? oneNode.label : ''}
                    onCancel={() => setMenu(null)}
                    onPick={(link, name) => {
                      setMenu(null);
                      if (oneNode?.kind === 'text') {
                        const words = /^(https?:|mailto:)/i.test(link) ? name : oneNode.label;
                        change({ ...drawing, nodes: drawing.nodes.map((node) => (node.id === oneNode.id ? { ...node, link, label: words } : node)) });
                      } else {
                        addLink(link, name);
                      }
                    }}
                  />
                </div>
              )}
            </div>
            <input
              ref={pictureInput}
              type="file"
              accept={PICTURE_TYPES.join(',')}
              multiple
              hidden
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = '';
                void addPictures(files, []);
              }}
              data-testid="diagram-picture-input"
            />
            {UP_FRONT.map((kind, at) => (
              <button
                key={kind}
                type="button"
                className={`${shell.tool} ${styles.upFront} ${at >= UP_FRONT.length / 2 ? styles.upFrontLater : ''}`}
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
                    [t('Architecture'), ARCHITECTURE_KINDS],
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
          </fieldset>
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
          <fieldset className={styles.toolGroup} disabled={viewing}>
          <span className={shell.toolbarGap} aria-hidden="true" />
          <button type="button" className={shell.tool} onClick={undo} disabled={past.length === 0} title={`${t('Undo')} (${undoKey})`} aria-label={t('Undo')} data-testid="diagram-undo">
            <img src={undoIcon} alt="" width={16} height={16} />
          </button>
          <button type="button" className={shell.tool} onClick={redo} disabled={future.length === 0} title={`${t('Redo')} (${redoKey})`} aria-label={t('Redo')} data-testid="diagram-redo">
            <img src={redoIcon} alt="" width={16} height={16} />
          </button>
          <span className={shell.toolbarGap} aria-hidden="true" />
          {/*
            Icons, with their words in the tooltip: as words the two made the
            bar wrap at 1440 pixels once it held the search and the mode switch,
            which moved the canvas down.
          */}
          <button type="button" className={shell.tool} onClick={duplicate} disabled={selectedNodes.length === 0} title={`${t('Duplicate')} (${duplicateKey})`} aria-label={t('Duplicate')} data-testid="diagram-duplicate">
            <img src={copyIcon} alt="" width={16} height={16} />
          </button>
          {/* The diagram itself, asked first: what is selected goes with the Delete key. */}
          <button type="button" className={shell.tool} onClick={() => setDeletingDiagram(true)} disabled={diagram === null} title={t('Delete this diagram')} aria-label={t('Delete this diagram')} data-testid="diagram-delete">
            <img src={trashIcon} alt="" width={16} height={16} />
          </button>
          </fieldset>
          <button type="button" className={form.ghost} onClick={() => setHistoryOpen(true)} disabled={diagram === null} data-testid="diagram-history">
            {t('History')}
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

      <DiagramHistory
        diagramId={historyOpen && diagram !== null ? diagram.id : null}
        name={diagram?.name ?? ''}
        revision={diagram?.revision ?? 0}
        beforeRestore={save}
        onRestored={async () => {
          // Taken whole: the version is what the diagram is now, and undo cannot walk back past it.
          const found = diagram === null ? null : await fetchDiagram(diagram.id);
          if (found === null) return;
          take(found);
          setPast([]);
          setFuture([]);
        }}
        onClose={() => setHistoryOpen(false)}
      />
      <ConfirmDialog
        subject={deletingDiagram ? (diagram?.name ?? null) : null}
        kind="removeDiagram"
        onClose={() => setDeletingDiagram(false)}
        onConfirm={async () => {
          if (diagram === null) return;
          await deleteDiagram(diagram.id);
          setDeletingDiagram(false);
          navigate(`/workspace/${workspaceId}/explore/diagrams`);
        }}
      />

      <div className={shell.editor} ref={editorRoom}>
        <div
          className={styles.canvas}
          data-testid="diagram-canvas"
          onMouseMove={(event) => {
            const at = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
            pointerAt.current = at;
            live.point(at.x, at.y);
          }}
          onMouseLeave={() => {
            pointerAt.current = null;
            live.point(null, null);
          }}
          onDragOver={(event) => {
            if (viewing) return;
            if (Array.from(event.dataTransfer.types).some((type) => type === 'Files' || type === 'text/uri-list')) event.preventDefault();
          }}
          onDrop={(event) => {
            if (viewing) return;
            const files = Array.from(event.dataTransfer.files).filter((one) => PICTURE_TYPES.includes(one.type));
            // A picture dragged from another page arrives as its address.
            const addresses = files.length > 0 ? [] : event.dataTransfer.getData('text/uri-list').split('\n').map((one) => one.trim()).filter((one) => /^https?:\/\//i.test(one));
            if (files.length === 0 && addresses.length === 0) return;
            event.preventDefault();
            void addPictures(files, addresses, flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
          }}
        >
          {diagram === null ? (
            <div className={styles.loading}>{error === null ? <Loader /> : <p role="alert">{error}</p>}</div>
          ) : (
            <>
            {/* Drawn over the whole page, outside the canvas, so nothing on the canvas can sit over it. */}
            {rightMenu !== null && !viewing && (selectedNodes.length > 0 || selectedEdges.length > 0) && createPortal(
              <>
                {/* Anywhere else closes it, as a menu does. */}
                <div className={styles.rightMenuShade} onMouseDown={() => setRightMenu(null)} onContextMenu={(event) => { event.preventDefault(); setRightMenu(null); }} />
                <div
                  className={styles.rightMenu}
                  role="menu"
                  style={{ left: Math.max(8, Math.min(rightMenu.x, window.innerWidth - 280)), top: Math.max(8, rightMenu.y) }}
                  /*
                   * Lifted by its own height, measured once drawn: a guess at
                   * that height was short by the Layer section, and a menu
                   * opened low ran under the bottom of the window. Taller than
                   * the window, it starts at the top and scrolls.
                   */
                  ref={(menu) => {
                    if (menu === null) return;
                    const room = window.innerHeight - 8;
                    const height = menu.getBoundingClientRect().height;
                    if (rightMenu.y + height > room) menu.style.top = `${Math.max(8, room - height)}px`;
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') setRightMenu(null);
                  }}
                  data-testid="diagram-right-menu"
                >
                  {selectedNodes.length > 0 && (
                    <button type="button" role="menuitem" className={styles.menuItem} onClick={() => { duplicate(); setRightMenu(null); }} data-testid="diagram-right-duplicate">
                      {t('Duplicate')}
                    </button>
                  )}
                  <button type="button" role="menuitem" className={styles.menuItem} onClick={() => { remove(); setRightMenu(null); }} data-testid="diagram-right-delete">
                    {t('Delete')}
                  </button>
                  {/*
                    The address of this diagram opened on this box: selected and
                    brought to the middle, for a chat, a ticket or a document to
                    point at one part of a big diagram.
                  */}
                  {selectedNodes.length === 1 && selectedEdges.length === 0 && (
                    <button
                      type="button"
                      role="menuitem"
                      className={styles.menuItem}
                      onClick={() => {
                        const address = `${window.location.origin}/workspace/${workspaceId}/explore/diagrams/${diagramId}?node=${encodeURIComponent(selectedNodes[0])}`;
                        void copyText(address).then((done) => setNotice(done ? t('Link copied') : address));
                        setRightMenu(null);
                      }}
                      data-testid="diagram-right-copy-link"
                    >
                      {t('Copy link')}
                    </button>
                  )}
                  {selectedNodes.length > 0 && (
                    <div className={styles.rightMenuSection}>
                      <span className={styles.rightMenuHead}>{t('Fill')}</span>
                      <div className={styles.strokeRow}>
                        <button
                          type="button"
                          className={`${styles.swatch} ${styles.swatchNone}`}
                          onClick={() => change({ ...drawing, nodes: drawing.nodes.map((node) => (selectedNodes.includes(node.id) ? { ...node, color: undefined } : node)) })}
                          title={t('No colour')}
                          aria-label={t('No colour')}
                        />
                        {SWATCHES.slice(0, SWATCH_ROW).map((colour) => (
                          <button
                            key={colour}
                            type="button"
                            className={styles.swatch}
                            style={{ background: colour }}
                            onClick={() => change({ ...drawing, nodes: drawing.nodes.map((node) => (selectedNodes.includes(node.id) ? { ...node, color: colour } : node)) })}
                            title={colour}
                            aria-label={colour}
                            data-testid="diagram-right-fill"
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  {selectedNodes.length > 0 ? (
                    <StrokeField
                      label={t('Outline')}
                      colour={byId.get(selectedNodes[0])?.border}
                      width={byId.get(selectedNodes[0])?.borderWidth}
                      onChange={({ colour, width }) =>
                        change({ ...drawing, nodes: drawing.nodes.map((node) => (selectedNodes.includes(node.id) ? { ...node, border: colour, borderWidth: width } : node)) })
                      }
                      testId="diagram-right-outline"
                    />
                  ) : (
                    <StrokeField
                      label={t('Line colour')}
                      colour={drawing.edges.find((edge) => edge.id === selectedEdges[0])?.color}
                      width={drawing.edges.find((edge) => edge.id === selectedEdges[0])?.width}
                      onChange={({ colour, width }) =>
                        change({ ...drawing, edges: drawing.edges.map((edge) => (selectedEdges.includes(edge.id) ? { ...edge, color: colour, width } : edge)) })
                      }
                      testId="diagram-right-line"
                    />
                  )}
                  <div className={styles.rightMenuSection}>
                    <span className={styles.rightMenuHead}>{t('Order')}</span>
                    {([
                      ['front', t('Bring to front')],
                      ['forward', t('Bring forward')],
                      ['backward', t('Send backward')],
                      ['back', t('Send to back')],
                    ] as const).map(([where, said]) => (
                      <button key={where} type="button" role="menuitem" className={styles.menuItem} onClick={() => restack(where)} data-testid={`diagram-right-order-${where}`}>
                        {said}
                      </button>
                    ))}
                  </div>
                  {layers.length > 1 && (
                    <div className={styles.rightMenuSection}>
                      <span className={styles.rightMenuHead}>{t('Layer')}</span>
                      {([
                        ['up', t('Layer up')],
                        ['down', t('Layer down')],
                        ['top', t('Top layer')],
                        ['bottom', t('Bottom layer')],
                      ] as const).map(([where, said]) => (
                        <button key={where} type="button" role="menuitem" className={styles.menuItem} onClick={() => shiftLayer(where)} data-testid={`diagram-right-layer-${where}`}>
                          {said}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>,
              document.body,
            )}
            <LinkOpenContext.Provider value={linkCtx}>
            <ViewingContext.Provider value={viewing}>
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
              onReconnect={onReconnect}
              edgesReconnectable={!viewing}
              onNodeDragStart={() => {
                if (!viewing) begin();
              }}
              nodesDraggable={!viewing}
              nodesConnectable={!viewing}
              onNodeDoubleClick={(_, node) => {
                setSelectedNodes([node.id]);
                setSelectedEdges([]);
                // A link card is opened by a double click, as a file is: its name comes from what it leads to.
                const held = byId.get(node.id);
                if (held?.kind === 'link' && held.link !== undefined && held.link !== '') {
                  linkCtx.open(held.link);
                  return;
                }
                if (!viewing) setLabelling({ kind: 'node', id: node.id });
              }}
              onEdgeDoubleClick={(_, edge) => {
                setSelectedEdges([edge.id]);
                setSelectedNodes([]);
                if (!viewing) setLabelling({ kind: 'edge', id: edge.id });
              }}
              zoomOnDoubleClick={false}
              onNodeDragStop={(_, __, dragged) => {
                if (!viewing) onDragStop(dragged.map((node) => node.id));
              }}
              onPaneClick={() => {
                setMenu(null);
                setRightMenu(null);
              }}
              /*
               * A right click on a box or a line selects it, where it was not
               * already, and opens what can be done to it there. Not in View,
               * where nothing is changed: the browser's own menu stays.
               */
              onNodeContextMenu={(event, node) => {
                if (viewing) return;
                event.preventDefault();
                if (!selectedNodes.includes(node.id)) {
                  setSelectedNodes([node.id]);
                  setSelectedEdges([]);
                }
                setRightMenu({ x: event.clientX, y: event.clientY });
              }}
              onEdgeContextMenu={(event, edge) => {
                if (viewing) return;
                event.preventDefault();
                if (!selectedEdges.includes(edge.id)) {
                  setSelectedEdges([edge.id]);
                  setSelectedNodes([]);
                }
                setRightMenu({ x: event.clientX, y: event.clientY });
              }}
              onSelectionContextMenu={(event) => {
                if (viewing) return;
                event.preventDefault();
                setRightMenu({ x: event.clientX, y: event.clientY });
              }}
              onPaneContextMenu={() => setRightMenu(null)}
              // Moving the canvas by hand stops following: the person wants to look elsewhere. A move the code makes has no event.
              onMoveStart={(event) => {
                if (event !== null && following !== null) setFollowing(null);
              }}
              onMoveEnd={(_event, view) => {
                if (!viewSettled.current) return;
                try {
                  window.localStorage.setItem(viewKey, JSON.stringify({ x: view.x, y: view.y, zoom: view.zoom }));
                } catch {
                  // A browser that keeps nothing fits the diagram again next time.
                }
              }}
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
              {notice !== null && (
                <Panel position="bottom-center" className={styles.notice} data-testid="diagram-notice">
                  <span role="status">{notice}</span>
                </Panel>
              )}
              {/*
                Search and the mode, on the canvas they act on rather than in
                the toolbar: there they made the title and the tools too wide
                for one row at 1440 pixels, and the canvas moved down. Search at
                the top middle, so the corner a click clears the selection in
                stays empty canvas.
              */}
              <Panel position="top-center" className={styles.canvasCorner}>
              <div className={styles.finder} role="search">
                <label className={`${styles.finderField} ${query.trim() !== '' ? styles.finderSearching : ''}`} data-searching={query.trim() !== '' ? '' : undefined}>
                <img src={searchIcon} alt="" width={14} height={14} className={styles.finderIcon} />
                <input
                  ref={finder}
                  type="search"
                  className={styles.finderBox}
                  value={query}
                  placeholder={tf('Find ({key})', { key: findKey })}
                  aria-label={t('Find in the diagram')}
                  data-testid="diagram-find"
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      goTo(event.shiftKey ? hit - 1 : hit + 1);
                    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                      // The list down the left is walked from the box as well as from inside it.
                      event.preventDefault();
                      goTo(event.key === 'ArrowDown' ? hit + 1 : hit - 1);
                    } else if (event.key === 'Escape') {
                      event.preventDefault();
                      setQuery('');
                      event.currentTarget.blur();
                    }
                  }}
                />
                {query.trim() !== '' && (
                  <>
                    <span className={styles.finderCount} data-testid="diagram-find-count" aria-live="polite">
                      {found.length === 0 ? t('None') : tf('{at} of {all}', { at: String(hit + 1), all: String(found.length) })}
                    </span>
                    {/* The same steps as Shift+Enter and Enter, for a mouse. */}
                    <button
                      type="button"
                      className={`${shell.tool} ${styles.finderStep}`}
                      onClick={() => goTo(hit - 1)}
                      disabled={found.length === 0}
                      title={t('Previous match (Shift+Enter)')}
                      aria-label={t('Previous match')}
                      data-testid="diagram-find-previous"
                    >
                      <img src={stepIcon} alt="" width={16} height={16} className={styles.finderUp} />
                    </button>
                    <button
                      type="button"
                      className={`${shell.tool} ${styles.finderStep}`}
                      onClick={() => goTo(hit + 1)}
                      disabled={found.length === 0}
                      title={t('Next match (Enter)')}
                      aria-label={t('Next match')}
                      data-testid="diagram-find-next"
                    >
                      <img src={stepIcon} alt="" width={16} height={16} />
                    </button>
                    {/*
                      Clearing, at the end of the row and there whenever there is
                      a search. The browser's own cross sat between the words and
                      the count, and came and went with the pointer.
                    */}
                    <button
                      type="button"
                      className={`${shell.tool} ${styles.finderStep}`}
                      onClick={() => {
                        setQuery('');
                        finder.current?.focus();
                      }}
                      title={t('Clear the search (Escape)')}
                      aria-label={t('Clear the search')}
                      data-testid="diagram-find-clear"
                    >
                      <img src={clearIcon} alt="" width={14} height={14} />
                    </button>
                  </>
                )}
                </label>
              </div>
              </Panel>
              {/*
                What the search found, all of it, down the left of the canvas
                while there is a search: a match is read here by its words
                rather than found by stepping through the canvas one at a time.
                The one the canvas is on is lit and kept in view; a click goes
                to another. Gone with the search.
              */}
              {query.trim() !== '' && (
                <Panel position="top-left" className={`${styles.canvasCorner} ${styles.findResults}`}>
                  <div
                    role="listbox"
                    aria-label={t('Matches')}
                    data-testid="diagram-find-results"
                    onKeyDown={(event) => {
                      /*
                       * Up and down walk the matches, and the focus goes with
                       * the lit one. Stopped here: on the page the same keys
                       * nudge what is selected, and what is selected is the
                       * match - so stepping through the list moved the boxes.
                       */
                      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') return;
                      event.preventDefault();
                      event.stopPropagation();
                      const next = event.key === 'Home' ? 0 : event.key === 'End' ? found.length - 1 : event.key === 'ArrowDown' ? hit + 1 : hit - 1;
                      goTo(next);
                      const list = event.currentTarget;
                      requestAnimationFrame(() => list.querySelector<HTMLElement>('[aria-selected="true"]')?.focus());
                    }}
                  >
                    <div className={styles.findResultsHead}>
                      {found.length === 0 ? t('No matches') : tf('{n} matches', { n: String(found.length) })}
                    </div>
                    {found.map((one, at) => {
                      const node = one.kind === 'node' ? drawing.nodes.find((held) => held.id === one.id) : undefined;
                      const edge = one.kind === 'edge' ? drawing.edges.find((held) => held.id === one.id) : undefined;
                      const nameOf = (id: string | undefined) => drawing.nodes.find((held) => held.id === id)?.label || id || '';
                      const title = node !== undefined ? node.label || node.id : (edge?.label ?? '');
                      const said = query.trim().toLowerCase();
                      // Where it matched, when that is not the words shown: a box found by its notes says the bit around it.
                      const notes = node?.notes ?? '';
                      const inNotes = node !== undefined && !(node.label ?? '').toLowerCase().includes(said) && notes.toLowerCase().includes(said);
                      const from = notes.toLowerCase().indexOf(said);
                      const snippet = inNotes ? `${from > 20 ? '…' : ''}${notes.slice(Math.max(0, from - 20), from + said.length + 30).replace(/\s+/g, ' ')}…` : null;
                      return (
                        <button
                          key={`${one.kind}-${one.id}`}
                          type="button"
                          role="option"
                          aria-selected={at === hit}
                          ref={at === hit ? (element) => element?.scrollIntoView({ block: 'nearest' }) : undefined}
                          className={`${styles.findResult} ${at === hit ? styles.findResultOn : ''}`}
                          onClick={() => goTo(at)}
                          data-testid="diagram-find-result"
                        >
                          <span className={styles.findResultKind}>{node !== undefined ? kindLabel(node.kind) : t('Line')}</span>
                          <span className={styles.findResultTitle}>{title}</span>
                          {edge !== undefined && <span className={styles.findResultMore}>{`${nameOf(edge.from)} → ${nameOf(edge.to)}`}</span>}
                          {snippet !== null && <span className={styles.findResultMore}>{snippet}</span>}
                        </button>
                      );
                    })}
                  </div>
                </Panel>
              )}
              <Panel position="top-right" className={styles.canvasCorner}>
              {/*
                View or edit, for the person looking: viewing, the diagram can be
                read and moved around in and not changed. Saved for this diagram in
                this browser only - nobody else, and no agent, is held to it.
              */}
              <div className={styles.modeSwitch} role="radiogroup" aria-label={t('Mode')} data-testid="diagram-mode">
                <button
                  type="button"
                  role="radio"
                  aria-checked={viewing}
                  className={`${styles.modeOption} ${viewing ? styles.modeOn : ''}`}
                  onClick={() => setViewing(true)}
                  title={`${t('Read the diagram without changing it')} (${modeKey})`}
                  data-testid="diagram-mode-view"
                >
                  {t('View')}
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={!viewing}
                  className={`${styles.modeOption} ${!viewing ? styles.modeOn : ''}`}
                  onClick={() => setViewing(false)}
                  title={`${t('Change the diagram')} (${modeKey})`}
                  data-testid="diagram-mode-edit"
                >
                  {t('Edit')}
                </button>
              </div>
              </Panel>
              {/*
                Layers, as draw.io has them, top of the stack first: in the
                canvas's bottom right corner, out of the toolbar, and opening
                upwards. Usable in View too: hiding a layer to read the rest is
                reading.
              */}
              <Panel position="bottom-right">
              <div className={`${styles.menuHolder} ${styles.layersCorner}`}>
                <button
                  type="button"
                  className={`${form.ghost} ${styles.layersButton}`}
                  onClick={() => setMenu(menu === 'layers' ? null : 'layers')}
                  aria-expanded={menu === 'layers'}
                  title={t('Layers')}
                  data-testid="diagram-layers"
                >
                  <img src={layersIcon} alt="" width={20} height={20} />
                  {/* The count only: the icon says what it is, and the word made the bar wrap at a laptop's width. */}
                  {layers.length > 1 ? String(layers.length) : null}
                </button>
                {menu === 'layers' && (
                  <div className={`${styles.menu} ${styles.layersMenu}`} role="menu" data-testid="diagram-layers-menu">
                    {[...layers].reverse().map((layer) => {
                      const shown = layer.visible && !(viewing && hiddenHere.has(layer.id));
                      const current = placing === layer.id || (placing === undefined && layers.length === 1);
                      // Boxes and lines both: a layer holding only lines - one kind of flow - is not empty.
                      const onIt =
                        drawing.nodes.filter((node) => layerOf(node, drawing) === layer.id).length +
                        drawing.edges.filter((edge) => layerOf(edge, drawing) === layer.id).length;
                      return (
                        <div key={layer.id} className={`${styles.layerRow} ${current && !viewing ? styles.layerCurrent : ''}`} data-current={current ? '' : undefined} data-testid={`diagram-layer-${layer.id}`}>
                          <button
                            type="button"
                            className={styles.layerToggle}
                            onClick={() => toggleShown(layer)}
                            title={shown ? t('Hide this layer') : t('Show this layer')}
                            aria-label={shown ? t('Hide this layer') : t('Show this layer')}
                            aria-pressed={shown}
                            data-testid={`diagram-layer-shown-${layer.id}`}
                          >
                            <img src={shown ? eyeIcon : eyeOffIcon} alt="" width={14} height={14} />
                          </button>
                          <button
                            type="button"
                            className={styles.layerToggle}
                            onClick={() => toggleLocked(layer)}
                            disabled={viewing}
                            title={layer.locked ? t('Unlock this layer') : t('Lock this layer')}
                            aria-label={layer.locked ? t('Unlock this layer') : t('Lock this layer')}
                            aria-pressed={layer.locked}
                            data-testid={`diagram-layer-locked-${layer.id}`}
                          >
                            <img src={layer.locked ? lockIcon : unlockIcon} alt="" width={14} height={14} />
                          </button>
                          {renamingLayer?.id === layer.id ? (
                            <input
                              className={styles.layerName}
                              value={renamingLayer.name}
                              autoFocus
                              aria-label={t('Layer name')}
                              onChange={(event) => setRenamingLayer({ id: layer.id, name: event.target.value })}
                              onBlur={() => renameLayer(layer, renamingLayer.name)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') renameLayer(layer, renamingLayer.name);
                                else if (event.key === 'Escape') setRenamingLayer(null);
                              }}
                              data-testid={`diagram-layer-name-${layer.id}`}
                            />
                          ) : (
                            <button
                              type="button"
                              className={styles.layerPick}
                              onClick={() => setActiveLayer(layer.id)}
                              onDoubleClick={() => !viewing && setRenamingLayer({ id: layer.id, name: layer.name })}
                              title={viewing ? layer.name : t('New shapes go on this layer. Double-click to rename it.')}
                              disabled={viewing}
                              data-testid={`diagram-layer-pick-${layer.id}`}
                            >
                              <span className={styles.layerLabel}>{layer.name}</span>
                              <span className={styles.layerCount}>{onIt}</span>
                            </button>
                          )}
                          <fieldset className={styles.toolGroup} disabled={viewing}>
                            <button type="button" className={styles.layerToggle} onClick={() => moveLayer(layer, 1)} title={t('Move up')} aria-label={t('Move up')}>
                              <img src={stepIcon} alt="" width={16} height={16} className={styles.finderUp} />
                            </button>
                            <button type="button" className={styles.layerToggle} onClick={() => moveLayer(layer, -1)} title={t('Move down')} aria-label={t('Move down')}>
                              <img src={stepIcon} alt="" width={16} height={16} />
                            </button>
                            <button
                              type="button"
                              className={`${styles.layerToggle} ${styles.layerMove}`}
                              onClick={() => moveSelectionTo(layer)}
                              disabled={selectedNodes.length === 0 && selectedEdges.length === 0}
                              title={t('Move what is selected onto this layer')}
                              aria-label={t('Move what is selected onto this layer')}
                              data-testid={`diagram-layer-move-${layer.id}`}
                            >
                              ⇥
                            </button>
                            <button
                              type="button"
                              className={styles.layerToggle}
                              onClick={() => removeLayer(layer)}
                              disabled={layers.length < 2}
                              title={t('Delete this layer; what is on it moves to the layer below')}
                              aria-label={t('Delete this layer')}
                              data-testid={`diagram-layer-delete-${layer.id}`}
                            >
                              <img src={trashIcon} alt="" width={14} height={14} />
                            </button>
                          </fieldset>
                        </div>
                      );
                    })}
                    <button type="button" className={`${styles.menuItem} ${styles.menuItemIcon}`} onClick={addLayer} disabled={viewing} data-testid="diagram-layer-add">
                      <img src={plusIcon} alt="" width={14} height={14} />
                      {t('Add layer')}
                    </button>
                  </div>
                )}
              </div>
              </Panel>
              <LivePointers pointers={live.pointers} place={(x, y) => ({ left: x * viewport.zoom + viewport.x, top: y * viewport.zoom + viewport.y })} />
            </ReactFlow>
            </LabelEditingContext.Provider>
            </ViewingContext.Provider>
            </LinkOpenContext.Provider>
            </>
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
          {/* Viewing, what is shown here is read and not changed: every field in it is off at once. */}
          <fieldset className={styles.panelFields} disabled={viewing} data-testid="diagram-panel-fields">
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
                    <img src={chevronIcon} alt="" width={14} height={14} />
                  </button>
                </div>
              </div>
              {oneNode.kind === 'image' && (
                <label className={styles.field}>
                  <span>{t('Picture address')}</span>
                  <input
                    className={form.input}
                    defaultValue={/^\d+$/.test(oneNode.image ?? '') ? '' : (oneNode.image ?? '')}
                    key={`${oneNode.id}-${oneNode.image ?? ''}`}
                    placeholder={/^\d+$/.test(oneNode.image ?? '') ? t('Uploaded; or an address, then Enter') : 'https://…'}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter') return;
                      event.preventDefault();
                      const said = event.currentTarget.value.trim();
                      if (!/^https?:\/\/\S+$/i.test(said)) return;
                      change({ ...drawing, nodes: drawing.nodes.map((node) => (node.id === oneNode.id ? { ...node, image: said } : node)) });
                    }}
                    data-testid="diagram-node-picture-address"
                  />
                </label>
              )}
              <StrokeField
                label={t('Outline')}
                colour={oneNode.border}
                width={oneNode.borderWidth}
                onChange={({ colour, width }) =>
                  change({ ...drawing, nodes: drawing.nodes.map((node) => (node.id === oneNode.id ? { ...node, border: colour, borderWidth: width } : node)) })
                }
                testId="diagram-node-outline-field"
              />
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
              {/*
                Where the box leads: another diagram, picked by name - a box
                that stands for a system drawn elsewhere links to that drawing -
                or a web address. Opened from the button in its corner.
              */}
              {/*
                Where a link card leads: what it leads to now, opened from
                here, and the same search the toolbar's Link button opens to
                change it. A box made before link cards keeps the link it
                has, shown here to open or take away, but a new one is a card.
              */}
              {(oneNode.kind === 'link' || (oneNode.link !== undefined && oneNode.link !== '')) && (
                <div className={styles.field} data-testid="diagram-node-link-field">
                  <span>{oneNode.kind === 'link' ? t('Leads to') : t('Link')}</span>
                  {oneNode.link !== undefined && oneNode.link !== '' && !relinking ? (
                    <div className={styles.linkChosen}>
                      <button
                        type="button"
                        className={styles.linkChosenName}
                        onClick={() => linkCtx.open(oneNode.link as string)}
                        title={linkCtx.describe(oneNode.link).where}
                        data-testid="diagram-node-link-open"
                      >
                        {linkCtx.describe(oneNode.link).name}
                      </button>
                      {oneNode.kind === 'link' ? (
                        <button type="button" className={styles.addressAdd} onClick={() => setRelinking(true)} disabled={viewing} data-testid="diagram-node-link-change">
                          {t('Change')}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={shell.tool}
                          onClick={() => change({ ...drawing, nodes: drawing.nodes.map((one) => (one.id === oneNode.id ? { ...one, link: undefined } : one)) })}
                          title={t('Remove link')}
                          aria-label={t('Remove link')}
                          data-testid="diagram-node-link-remove"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ) : (
                    !viewing && (
                      <DiagramLinkSearch
                        key={oneNode.id}
                        items={others}
                        exceptId={diagramId}
                        autoFocus={relinking}
                        onCancel={() => setRelinking(false)}
                        onPick={(link, name) => {
                          setRelinking(false);
                          change({ ...drawing, nodes: drawing.nodes.map((one) => (one.id === oneNode.id ? { ...one, link, label: name } : one)) });
                        }}
                      />
                    )
                  )}
                </div>
              )}
              {/* A web link card shows words of its own; another diagram, document or wireframe is shown by its own name. */}
              {oneNode.kind === 'link' && oneNode.link !== undefined && /^(https?:|mailto:)/i.test(oneNode.link) && (
                <label className={styles.field}>
                  <span>{t('Text to show')}</span>
                  <input
                    className={styles.addressField}
                    value={oneNode.label}
                    onFocus={begin}
                    onBlur={end}
                    onChange={(event) => setNode(oneNode.id, { label: event.target.value })}
                    disabled={viewing}
                    data-testid="diagram-node-link-text"
                  />
                </label>
              )}
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
                    <label className={styles.field}>
                      <span>{t('Routing')}</span>
                      <Select
                        className={`${form.input} ${form.select}`}
                        value={oneEdge.routing ?? 'straight'}
                        onChange={(picked) =>
                          // A new way to run is a new path: the corners routed for the old one go.
                          change({ ...drawing, edges: drawing.edges.map((edge) => (edge.id === oneEdge.id ? { ...edge, routing: picked as DiagramRouting, points: undefined, labelAt: undefined } : edge)) })
                        }
                        aria-label={t('Routing')}
                        data-testid="diagram-edge-routing"
                      >
                        {DIAGRAM_ROUTINGS.map((routing) => (
                          <option key={routing} value={routing}>
                            <span className={styles.styleOption}>
                              <RoutingIcon routing={routing} />
                              {routingLabel(routing)}
                            </span>
                          </option>
                        ))}
                      </Select>
                    </label>
                    <StrokeField
                      label={t('Line colour')}
                      colour={oneEdge.color}
                      width={oneEdge.width}
                      onChange={({ colour, width }) =>
                        change({ ...drawing, edges: drawing.edges.map((edge) => (edge.id === oneEdge.id ? { ...edge, color: colour, width } : edge)) })
                      }
                      testId="diagram-edge-stroke-field"
                    />
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
          </fieldset>
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
            // Viewing, nothing is asked to change the diagram; Edit opens the conversation again.
            ready={diagram !== null && !viewing}
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
            placeholder={viewing ? t('Switch to Edit to change the diagram') : t('Describe what to draw or change')}
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
