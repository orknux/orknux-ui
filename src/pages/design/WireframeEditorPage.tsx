import { useEffect, useRef, useState } from 'react';
import type { FormEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { fetchModels } from '../../api/models';
import type { Model } from '../../api/models';
import type { SessionUser } from '../../api/session';
import { askWireframe, elementsOf, fetchWireframe, isBox, renameWireframe, saveWireframe } from '../../api/wireframes';
import type { Wireframe, WireframeElement, WireframeElementType, WireframeTurn } from '../../api/wireframes';
import arrowIcon from '../../assets/arrow-up-right.svg';
import dashboardIcon from '../../assets/layout-dashboard.svg';
import landingIcon from '../../assets/monitor.svg';
import phoneIcon from '../../assets/smartphone.svg';
import polishIcon from '../../assets/wand-sparkles.svg';
import settingsIcon from '../../assets/sliders-horizontal.svg';
import buttonIcon from '../../assets/rectangle-button.svg';
import frameIcon from '../../assets/frame.svg';
import imageIcon from '../../assets/image-placeholder.svg';
import inputIcon from '../../assets/text-cursor-input.svg';
import lineIcon from '../../assets/line.svg';
import handIcon from '../../assets/move.svg';
import noteIcon from '../../assets/sticky-note.svg';
import pencilIcon from '../../assets/pencil.svg';
import pointerIcon from '../../assets/pointer.svg';
import redoIcon from '../../assets/redo.svg';
import rectIcon from '../../assets/square.svg';
import textIcon from '../../assets/type.svg';
import undoIcon from '../../assets/undo.svg';
import { AppShell } from '../../components/AppShell';
import { Loader } from '../../components/Loader';
import { UnsavedWorkDialog } from '../../components/UnsavedWorkDialog';
import { askBeforeLeaving, useLeaveGuard } from '../../components/leaveGuard';
import form from '../../components/Dialog.module.css';
import { t, tf } from '../../i18n';
import {
  matches,
  useDuplicateShortcut,
  useRedoShortcut,
  useSaveShortcut,
  useUndoShortcut,
  useZoomInShortcut,
  useZoomOutShortcut,
} from '../../session/shortcut';
import { shellUser } from '../../session/user';
import shell from './DesignImageEditorPage.module.css';
import styles from './WireframeEditorPage.module.css';
import { boundsOf, WireframeShapes } from './WireframeDrawing';
import { WireframeExport } from './WireframeExport';
import { DesignChat } from './DesignChat';
import type { ChatIdea } from './DesignChat';
import { forgetUndo, keepUndo, restoreUndo } from './wireframeUndo';

export interface WireframeEditorPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

type Tool = 'select' | 'hand' | WireframeElementType;
type Point = { x: number; y: number };
/** Where the drawing sits on the canvas: its origin in screen pixels, and its scale. */
type View = { x: number; y: number; zoom: number };
type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'start' | 'end';

/** What the pointer is doing between going down and coming up. */
type Gesture =
  | { kind: 'pan'; from: Point; view: View }
  | { kind: 'move'; from: Point; before: WireframeElement[]; ids: string[]; only: string | null }
  | { kind: 'resize'; from: Point; before: WireframeElement[]; id: string; handle: Handle }
  | { kind: 'create'; from: Point; before: WireframeElement[]; id: string }
  | { kind: 'marquee'; from: Point; now: Point; kept: string[] };

/** The grid things snap to, in the drawing's pixels; Alt held lets go of it. */
const GRID = 8;
const ZOOM_STEP = 1.2;
const ZOOM_LEAST = 0.1;
const ZOOM_MOST = 6;
/** How many steps undo keeps. */
const UNDO_DEPTH = 100;
/** How long the history waits after a change before it is written to browser storage, so a drag is not written every frame. */
const UNDO_KEEP_MS = 250;
/** A drag shorter than this, on screen, is a click: the element is made at its usual size. */
const CLICK_SLOP = 4;
/** How near a frame's edge, on screen, a press takes the frame rather than the empty space inside it. */
const FRAME_EDGE = 8;

/** What each tool makes when clicked rather than dragged, and the words it starts with. */
const MADE: Record<WireframeElementType, { w: number; h: number; text?: () => string }> = {
  frame: { w: 390, h: 844, text: () => t('Screen') },
  rect: { w: 160, h: 100 },
  text: { w: 160, h: 24, text: () => t('Text') },
  button: { w: 120, h: 40, text: () => t('Button') },
  input: { w: 240, h: 40, text: () => t('Placeholder') },
  image: { w: 200, h: 140 },
  line: { w: 160, h: 0 },
  arrow: { w: 160, h: 0 },
  note: { w: 180, h: 120, text: () => t('Note') },
};

const TOOLS: { tool: Tool; icon: string; label: () => string }[] = [
  { tool: 'select', icon: pointerIcon, label: () => t('Select') },
  { tool: 'hand', icon: handIcon, label: () => t('Pan') },
  { tool: 'frame', icon: frameIcon, label: () => t('Frame') },
  { tool: 'rect', icon: rectIcon, label: () => t('Rectangle') },
  { tool: 'text', icon: textIcon, label: () => t('Text') },
  { tool: 'button', icon: buttonIcon, label: () => t('Button') },
  { tool: 'input', icon: inputIcon, label: () => t('Input') },
  { tool: 'image', icon: imageIcon, label: () => t('Image placeholder') },
  { tool: 'line', icon: lineIcon, label: () => t('Line') },
  { tool: 'arrow', icon: arrowIcon, label: () => t('Arrow') },
  { tool: 'note', icon: noteIcon, label: () => t('Sticky note') },
];

const freshId = () => `e${Math.random().toString(36).slice(2, 10)}`;
const snap = (value: number, free: boolean) => (free ? Math.round(value) : Math.round(value / GRID) * GRID);

/** A box with its corners put the right way round, so a drag up and left still makes one. */
function normalised(element: WireframeElement): WireframeElement {
  if (!isBox(element.type)) return element;
  const x = element.w < 0 ? element.x + element.w : element.x;
  const y = element.h < 0 ? element.y + element.h : element.y;
  return { ...element, x, y, w: Math.abs(element.w), h: Math.abs(element.h) };
}

/** Whether two boxes overlap: what a marquee selects. */
function touches(element: WireframeElement, area: { x: number; y: number; w: number; h: number }): boolean {
  const left = Math.min(element.x, element.x + element.w);
  const right = Math.max(element.x, element.x + element.w);
  const top = Math.min(element.y, element.y + element.h);
  const bottom = Math.max(element.y, element.y + element.h);
  return left <= area.x + area.w && right >= area.x && top <= area.y + area.h && bottom >= area.y;
}

/** What an empty chat offers to draw: a pressed card is sent as it is, so each prompt is whole on its own. */
type Idea = ChatIdea;

const IDEAS: Idea[] = [
  {
    icon: phoneIcon,
    title: () => t('Sign-in screen'),
    line: () => t('Email, password and a social row'),
    prompt: () => t('Draw a sign-in screen for a phone: a logo, email and password fields, a primary Sign in button, a Forgot password link and Google and Apple buttons.'),
  },
  {
    icon: dashboardIcon,
    title: () => t('Dashboard'),
    line: () => t('Sidebar, stat cards and a chart'),
    prompt: () => t('Draw a desktop dashboard: a left sidebar with navigation, a top bar with search, four stat cards and a large chart below them.'),
  },
  {
    icon: landingIcon,
    title: () => t('Landing page'),
    line: () => t('Hero, features and a call to action'),
    prompt: () => t('Draw a desktop landing page: a top navigation, a hero with a headline and two buttons, three feature cards and a closing call to action.'),
  },
  {
    icon: settingsIcon,
    title: () => t('Settings'),
    line: () => t('Grouped switches and a save bar'),
    prompt: () => t('Draw a settings screen: sections of labelled switches and inputs, and a bar at the bottom with Cancel and Save.'),
  },
];

/** Offered first once something is drawn: the drawing itself is the likeliest thing to ask about. */
const POLISH: Idea = {
  icon: polishIcon,
  title: () => t('Polish this screen'),
  line: () => t('Align, space and label what is drawn'),
  prompt: () => t('Tidy up what is drawn: align the elements to the grid, even out the spacing, and give every element a clear label.'),
};

/** The conversation is kept for the length of the browser tab, so a reload does not lose it. */
const talkKey = (id: string) => `orknux.wireframe.talk.${id}`;
const modelKey = (workspaceId: string) => `orknux.wireframe.model.${workspaceId}`;

/** The editor as the routes hold it: one page per wireframe, so another one opens afresh. */
export function WireframeEditorRoute(props: WireframeEditorPageProps) {
  const { wireframeId = '' } = useParams();
  return <WireframeEditorPage key={wireframeId} {...props} />;
}

/**
 * Where a wireframe is drawn: the canvas, its tools along the top, and down the
 * right a conversation with a chat model that draws in it. Issue #655.
 *
 * The image editor's shell - the bar, the canvas and the panel - so the two
 * editors in Design read as one product. The drawing is held here and written
 * by Save, as the image editor and the workflow editor write theirs; leaving
 * with changes asks first. What a model draws it saves itself, through the
 * orknux_* wireframe tools, and the canvas takes it up when it answers - after
 * this page's own changes are saved, so the model draws on what is on screen.
 * Its change is one step undo goes back over.
 */
export function WireframeEditorPage({ session, onSignOut }: WireframeEditorPageProps) {
  const firstName = (session.displayName?.trim() || session.username).split(/\s+/)[0];
  const { workspaceId = '', wireframeId = '' } = useParams();
  const navigate = useNavigate();
  const [wireframe, setWireframe] = useState<Wireframe | null>(null);
  const [missing, setMissing] = useState(false);
  const [elements, setElements] = useState<WireframeElement[]>([]);
  /** The drawing as last saved, to compare against. */
  const [saved, setSaved] = useState('[]');
  const [selected, setSelected] = useState<string[]>([]);
  const [tool, setTool] = useState<Tool>('select');
  const [view, setView] = useState<View>({ x: 40, y: 40, zoom: 1 });
  const [past, setPast] = useState<WireframeElement[][]>([]);
  const [future, setFuture] = useState<WireframeElement[][]>([]);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  /** The element whose words are being typed over, and what is typed. */
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [naming, setNaming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);

  const [models, setModels] = useState<Model[] | null>(null);
  const [modelId, setModelId] = useState('');
  const [talk, setTalk] = useState<WireframeTurn[]>([]);
  const [asking, setAsking] = useState('');
  const [answering, setAnswering] = useState(false);
  const [talkError, setTalkError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const fitted = useRef(false);

  const undoKey = useUndoShortcut();
  const redoKey = useRedoShortcut();
  const saveKey = useSaveShortcut();
  const duplicateKey = useDuplicateShortcut();
  const zoomInKey = useZoomInShortcut();
  const zoomOutKey = useZoomOutShortcut();

  const unsaved = wireframe !== null && JSON.stringify(elements) !== saved;

  // -- Loading ------------------------------------------------------------

  useEffect(() => {
    if (wireframeId === '') return;
    let left = false;
    fetchWireframe(wireframeId)
      .then((found) => {
        if (left) return;
        if (found === null) {
          forgetUndo(wireframeId);
          setMissing(true);
          return;
        }
        take(found);
      })
      .catch((cause: unknown) => {
        if (!left) setError(cause instanceof Error ? cause.message : t('Could not load the wireframe.'));
      });
    try {
      const kept = sessionStorage.getItem(talkKey(wireframeId));
      if (kept !== null) setTalk(JSON.parse(kept) as WireframeTurn[]);
    } catch {
      // Nothing kept, or nowhere to keep it: the conversation starts empty.
    }
    return () => {
      left = true;
    };
  }, [wireframeId]);

  useEffect(() => {
    if (workspaceId === '') return;
    fetchModels(workspaceId)
      .then((all) => {
        const chat = all.filter((one) => one.kind === 'CHAT' && one.enabled !== false);
        setModels(chat);
        let remembered: string | null = null;
        try {
          remembered = localStorage.getItem(modelKey(workspaceId));
        } catch {
          remembered = null;
        }
        setModelId(chat.some((one) => one.id === remembered) ? (remembered ?? '') : (chat[0]?.id ?? ''));
      })
      .catch(() => setModels([]));
  }, [workspaceId]);

  useEffect(() => {
    try {
      if (wireframeId !== '') sessionStorage.setItem(talkKey(wireframeId), JSON.stringify(talk));
    } catch {
      // A conversation that cannot be kept is still a conversation.
    }
  }, [talk, answering]);

  /** A wireframe as the server holds it, taken onto the canvas, with the history this browser kept of it if that history ends here. */
  function take(found: Wireframe) {
    const drawn = elementsOf(found);
    const kept = restoreUndo(found.id, found.revision, JSON.stringify(drawn));
    setWireframe(found);
    setElements(drawn);
    setSaved(JSON.stringify(drawn));
    setPast(kept?.past ?? []);
    setFuture(kept?.future ?? []);
    setSelected((held) => held.filter((id) => drawn.some((one) => one.id === id)));
    if (!fitted.current) {
      fitted.current = true;
      // After the canvas has its size.
      window.requestAnimationFrame(() => fit(drawn));
    }
  }

  // -- Undo ---------------------------------------------------------------

  // The history outlives a reload: written a moment after it settles, and at once when the page goes.
  const keeping = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (wireframe === null) return;
    const id = wireframe.id;
    const revision = wireframe.revision;
    const head = elements;
    const undo = { past, future };
    let written = false;
    const write = () => {
      if (written) return;
      written = true;
      keepUndo(id, revision, JSON.stringify(head), undo);
    };
    keeping.current = write;
    const timer = window.setTimeout(write, UNDO_KEEP_MS);
    return () => window.clearTimeout(timer);
  }, [wireframe, elements, past, future]);
  useEffect(() => {
    const leaving = () => keeping.current?.();
    window.addEventListener('pagehide', leaving);
    return () => {
      window.removeEventListener('pagehide', leaving);
      leaving();
    };
  }, []);

  /** A change worth undoing: the drawing it replaces goes on the stack. */
  function remember(before: WireframeElement[]) {
    setPast((held) => [...held, before].slice(-UNDO_DEPTH));
    setFuture([]);
  }
  function change(next: WireframeElement[]) {
    remember(elements);
    setElements(next);
  }
  function undo() {
    if (past.length === 0) return;
    const to = past[past.length - 1];
    setPast(past.slice(0, -1));
    setFuture((ahead) => [elements, ...ahead]);
    setElements(to);
    setEditing(null);
  }
  function redo() {
    if (future.length === 0) return;
    const [to, ...rest] = future;
    setFuture(rest);
    setPast((held) => [...held, elements]);
    setElements(to);
    setEditing(null);
  }

  // -- The view -----------------------------------------------------------

  function fit(drawn: WireframeElement[] = elements) {
    const area = canvasRef.current?.getBoundingClientRect();
    const bounds = boundsOf(drawn);
    if (area === undefined || bounds === null) {
      setView({ x: 40, y: 40, zoom: 1 });
      return;
    }
    const margin = 48;
    const zoom = Math.min(1, Math.max(ZOOM_LEAST, Math.min((area.width - margin * 2) / bounds.w, (area.height - margin * 2) / bounds.h)));
    setView({
      zoom,
      x: (area.width - bounds.w * zoom) / 2 - bounds.x * zoom,
      y: (area.height - bounds.h * zoom) / 2 - bounds.y * zoom,
    });
  }

  /** Zoomed by a factor about a point on the canvas, which stays where it is. */
  function zoomAbout(factor: number, at?: Point) {
    setView((held) => {
      const area = canvasRef.current?.getBoundingClientRect();
      const about = at ?? { x: (area?.width ?? 0) / 2, y: (area?.height ?? 0) / 2 };
      const zoom = Math.min(ZOOM_MOST, Math.max(ZOOM_LEAST, held.zoom * factor));
      const kept = zoom / held.zoom;
      return { zoom, x: about.x - (about.x - held.x) * kept, y: about.y - (about.y - held.y) * kept };
    });
  }

  // Wheel pans, and zooms with Ctrl held - attached by hand, since a passive listener cannot keep the page from zooming.
  useEffect(() => {
    const area = canvasRef.current;
    if (area === null) return;
    const wheeled = (event: WheelEvent) => {
      event.preventDefault();
      const box = area.getBoundingClientRect();
      if (event.ctrlKey || event.metaKey) {
        zoomAbout(event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, { x: event.clientX - box.left, y: event.clientY - box.top });
      } else {
        setView((held) => ({ ...held, x: held.x - event.deltaX, y: held.y - event.deltaY }));
      }
    };
    area.addEventListener('wheel', wheeled, { passive: false });
    return () => area.removeEventListener('wheel', wheeled);
  }, [wireframe !== null]);

  /** The pointer, in the drawing's own pixels. */
  function onDrawing(event: { clientX: number; clientY: number }): Point {
    const box = svgRef.current?.getBoundingClientRect();
    if (box === undefined) return { x: 0, y: 0 };
    return { x: (event.clientX - box.left - view.x) / view.zoom, y: (event.clientY - box.top - view.y) / view.zoom };
  }

  // -- Pointer ------------------------------------------------------------

  function pointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (answering) return;
    // A press away from the words being typed puts them down, and does nothing else.
    if (editing !== null) {
      commitEditing();
      return;
    }
    const at = onDrawing(event);
    const target = (event.target as Element).closest('[data-element-id]');
    const handle = ((event.target as Element).closest('[data-handle]')?.getAttribute('data-handle') ?? null) as Handle | null;
    event.currentTarget.setPointerCapture(event.pointerId);

    if (event.button === 1 || tool === 'hand' || spaceHeld) {
      setGesture({ kind: 'pan', from: { x: event.clientX, y: event.clientY }, view });
      return;
    }
    if (event.button !== 0) return;

    if (tool !== 'select') {
      const type = tool;
      const start = { x: snap(at.x, event.altKey), y: snap(at.y, event.altKey) };
      const made: WireframeElement = { id: freshId(), type, x: start.x, y: start.y, w: 0, h: 0 };
      const words = MADE[type].text?.();
      if (words !== undefined) made.text = words;
      // A frame goes under what is already drawn, so it never hides it.
      const before = elements;
      setElements(type === 'frame' ? [made, ...elements] : [...elements, made]);
      setSelected([made.id]);
      setGesture({ kind: 'create', from: start, before, id: made.id });
      return;
    }

    if (handle !== null && selected.length === 1) {
      setGesture({ kind: 'resize', from: at, before: elements, id: selected[0], handle });
      return;
    }

    let id = target?.getAttribute('data-element-id') ?? null;
    const pressed = id === null ? undefined : elements.find((one) => one.id === id);
    // A frame is the ground a screen is drawn on, so its empty inside is canvas, as in every drawing tool: a press
    // there lets the selection go. The frame is taken by its title, its edge, once it is selected, or while empty.
    if (pressed?.type === 'frame' && !selected.includes(pressed.id) && (event.target as Element).tagName !== 'text') {
      const edge = FRAME_EDGE / view.zoom;
      const nearEdge =
        Math.abs(at.x - pressed.x) <= edge || Math.abs(at.x - (pressed.x + pressed.w)) <= edge ||
        Math.abs(at.y - pressed.y) <= edge || Math.abs(at.y - (pressed.y + pressed.h)) <= edge;
      const holds = elements.some((one) => one.id !== pressed.id && touches(one, pressed));
      if (!nearEdge && holds) id = null;
    }
    if (id !== null) {
      const next = event.shiftKey
        ? selected.includes(id)
          ? selected.filter((one) => one !== id)
          : [...selected, id]
        : selected.includes(id)
          ? selected
          : [id];
      setSelected(next);
      // A click on one of several selected keeps only that one; a drag moves them all.
      const only = !event.shiftKey && next.length > 1 ? id : null;
      if (next.includes(id)) setGesture({ kind: 'move', from: at, before: elements, ids: next, only });
      return;
    }

    setSelected(event.shiftKey ? selected : []);
    setGesture({ kind: 'marquee', from: at, now: at, kept: event.shiftKey ? selected : [] });
  }

  function pointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (gesture === null) return;
    if (gesture.kind === 'pan') {
      setView({ ...gesture.view, x: gesture.view.x + event.clientX - gesture.from.x, y: gesture.view.y + event.clientY - gesture.from.y });
      return;
    }
    const at = onDrawing(event);
    const free = event.altKey;
    if (gesture.kind === 'marquee') {
      setGesture({ ...gesture, now: at });
      const area = { x: Math.min(gesture.from.x, at.x), y: Math.min(gesture.from.y, at.y), w: Math.abs(at.x - gesture.from.x), h: Math.abs(at.y - gesture.from.y) };
      const caught = elements.filter((one) => touches(one, area)).map((one) => one.id);
      setSelected([...new Set([...gesture.kept, ...caught])]);
      return;
    }
    if (gesture.kind === 'move') {
      const lead = gesture.before.find((one) => one.id === gesture.ids[0]);
      if (lead === undefined) return;
      const dx = snap(lead.x + at.x - gesture.from.x, free) - lead.x;
      const dy = snap(lead.y + at.y - gesture.from.y, free) - lead.y;
      setElements(gesture.before.map((one) => (gesture.ids.includes(one.id) ? { ...one, x: one.x + dx, y: one.y + dy } : one)));
      return;
    }
    if (gesture.kind === 'create') {
      const w = snap(at.x, free) - gesture.from.x;
      const h = snap(at.y, free) - gesture.from.y;
      setElements((held) => held.map((one) => (one.id === gesture.id ? { ...one, w, h } : one)));
      return;
    }
    if (gesture.kind === 'resize') {
      const was = gesture.before.find((one) => one.id === gesture.id);
      if (was === undefined) return;
      const x = snap(at.x, free);
      const y = snap(at.y, free);
      let next: WireframeElement;
      if (gesture.handle === 'start') next = { ...was, x, y, w: was.x + was.w - x, h: was.y + was.h - y };
      else if (gesture.handle === 'end') next = { ...was, w: x - was.x, h: y - was.y };
      else {
        let left = was.x;
        let top = was.y;
        let right = was.x + was.w;
        let bottom = was.y + was.h;
        if (gesture.handle.includes('w')) left = Math.min(x, right - 1);
        if (gesture.handle.includes('e')) right = Math.max(x, left + 1);
        if (gesture.handle.includes('n')) top = Math.min(y, bottom - 1);
        if (gesture.handle.includes('s')) bottom = Math.max(y, top + 1);
        next = { ...was, x: left, y: top, w: right - left, h: bottom - top };
      }
      setElements(gesture.before.map((one) => (one.id === gesture.id ? next : one)));
    }
  }

  function pointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    const done = gesture;
    setGesture(null);
    if (done === null || done.kind === 'pan' || done.kind === 'marquee') return;
    if (done.kind === 'create') {
      const made = elements.find((one) => one.id === done.id);
      if (made === undefined) return;
      const dragged = Math.abs(made.w) * view.zoom > CLICK_SLOP || Math.abs(made.h) * view.zoom > CLICK_SLOP;
      const sized = dragged ? normalised(made) : { ...made, w: MADE[made.type].w, h: MADE[made.type].h };
      const next = elements.map((one) => (one.id === made.id ? sized : one));
      remember(done.before);
      setElements(next);
      setTool('select');
      if (made.type === 'text' || made.type === 'note') setEditing({ id: made.id, text: made.text ?? '' });
      return;
    }
    // A press that moved nothing is a selection, not a step to undo.
    if (JSON.stringify(done.before) !== JSON.stringify(elements)) {
      remember(done.before);
      if (done.kind === 'resize') setElements((held) => held.map(normalised));
    } else if (done.kind === 'move' && done.only !== null) {
      setSelected([done.only]);
    }
    void event;
  }

  function doubleClick(event: ReactMouseEvent<SVGSVGElement>) {
    const id = (event.target as Element).closest('[data-element-id]')?.getAttribute('data-element-id');
    const element = elements.find((one) => one.id === id);
    if (element === undefined || !isBox(element.type)) return;
    setSelected([element.id]);
    setEditing({ id: element.id, text: element.text ?? '' });
  }

  /** The words typed into an element, written into the drawing as one step. */
  function commitEditing() {
    if (editing === null) return;
    const held = editing;
    setEditing(null);
    const element = elements.find((one) => one.id === held.id);
    if (element === undefined || (element.text ?? '') === held.text) return;
    change(elements.map((one) => (one.id === held.id ? { ...one, text: held.text === '' ? undefined : held.text } : one)));
  }

  // -- Edits from the keyboard and the panel -------------------------------

  function remove() {
    if (selected.length === 0) return;
    change(elements.filter((one) => !selected.includes(one.id)));
    setSelected([]);
  }

  function duplicate() {
    if (selected.length === 0) return;
    const copies = elements.filter((one) => selected.includes(one.id)).map((one) => ({ ...one, id: freshId(), x: one.x + GRID * 2, y: one.y + GRID * 2 }));
    change([...elements, ...copies]);
    setSelected(copies.map((one) => one.id));
  }

  function nudge(dx: number, dy: number) {
    if (selected.length === 0) return;
    change(elements.map((one) => (selected.includes(one.id) ? { ...one, x: one.x + dx, y: one.y + dy } : one)));
  }

  /** One field of the one element selected, from the panel. */
  function setField(id: string, patch: Partial<WireframeElement>) {
    change(elements.map((one) => (one.id === id ? normalised({ ...one, ...patch }) : one)));
  }

  // -- Saving -------------------------------------------------------------

  /** Writes the drawing. Answers whether it was written, for the leave guard and the chat. */
  async function save(): Promise<boolean> {
    if (wireframe === null) return false;
    if (!unsaved) return true;
    setBusy(true);
    setError(null);
    try {
      const written = await saveWireframe(wireframe.id, elements, wireframe.revision);
      setWireframe(written);
      setSaved(JSON.stringify(elementsOf(written)));
      setElements(elementsOf(written));
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not save the wireframe.'));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function rename() {
    if (naming === null || wireframe === null) return;
    const called = naming.trim();
    setNaming(null);
    if (called === '' || called === wireframe.name) return;
    try {
      const renamed = await renameWireframe(wireframe.id, called);
      setWireframe({ ...wireframe, name: renamed.name });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not rename the wireframe.'));
    }
  }

  const guard = useLeaveGuard({ unsaved, backTo: `/workspace/${workspaceId}/design/wireframes`, save });

  // -- The conversation ----------------------------------------------------

  async function ask(event?: FormEvent<HTMLFormElement>, idea?: string) {
    event?.preventDefault();
    const said = (idea ?? asking).trim();
    if (said === '' || modelId === '' || wireframe === null || answering) return;
    commitEditing();
    setTalkError(null);
    // The model draws on what is saved, so what is on screen is saved first.
    if (unsaved && !(await save())) return;
    const sent: WireframeTurn[] = [...talk, { role: 'user', content: said }];
    setTalk(sent);
    setAsking('');
    setAnswering(true);
    try {
      const answered = await askWireframe(wireframe.id, modelId, sent);
      setTalk([...sent, { role: 'assistant', content: answered.answer }]);
      if (answered.changed) {
        remember(elements);
        const drawn = elementsOf(answered.wireframe);
        setWireframe(answered.wireframe);
        setElements(drawn);
        setSaved(JSON.stringify(drawn));
        setSelected([]);
      }
    } catch (cause) {
      setTalkError(cause instanceof Error ? cause.message : t('The model could not answer.'));
      // What it drew before failing is saved: take it up.
      const now = await fetchWireframe(wireframe.id).catch(() => null);
      if (now !== null && now.revision !== wireframe.revision) {
        remember(elements);
        setWireframe(now);
        setElements(elementsOf(now));
        setSaved(JSON.stringify(elementsOf(now)));
      }
    } finally {
      setAnswering(false);
    }
  }

  // -- Keys ---------------------------------------------------------------

  const keys = useRef({ undo, redo, save, remove, duplicate, nudge, zoomIn: () => {}, zoomOut: () => {}, escape: () => {} });
  keys.current = {
    undo,
    redo,
    save,
    remove,
    duplicate,
    nudge,
    zoomIn: () => zoomAbout(ZOOM_STEP),
    zoomOut: () => zoomAbout(1 / ZOOM_STEP),
    escape: () => {
      setEditing(null);
      setSelected([]);
      setTool('select');
    },
  };
  useEffect(() => {
    const pressed = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement || (event.target as HTMLElement | null)?.isContentEditable === true;
      if (matches(event, saveKey)) {
        event.preventDefault();
        void keys.current.save();
        return;
      }
      if (typing) return;
      if (event.key === 'Escape') keys.current.escape();
      else if (event.key === ' ') {
        event.preventDefault();
        setSpaceHeld(true);
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        keys.current.remove();
      } else if (matches(event, duplicateKey)) {
        event.preventDefault();
        keys.current.duplicate();
      } else if (matches(event, undoKey)) {
        event.preventDefault();
        keys.current.undo();
      } else if (matches(event, redoKey) || ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'y')) {
        event.preventDefault();
        keys.current.redo();
      } else if (matches(event, zoomInKey) || ((event.ctrlKey || event.metaKey) && event.code === 'NumpadAdd')) {
        event.preventDefault();
        keys.current.zoomIn();
      } else if (matches(event, zoomOutKey) || ((event.ctrlKey || event.metaKey) && event.code === 'NumpadSubtract')) {
        event.preventDefault();
        keys.current.zoomOut();
      } else if (event.key.startsWith('Arrow')) {
        event.preventDefault();
        const step = event.shiftKey ? GRID : 1;
        const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
        const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
        keys.current.nudge(dx, dy);
      }
    };
    const released = (event: KeyboardEvent) => {
      if (event.key === ' ') setSpaceHeld(false);
    };
    document.addEventListener('keydown', pressed);
    document.addEventListener('keyup', released);
    return () => {
      document.removeEventListener('keydown', pressed);
      document.removeEventListener('keyup', released);
    };
  }, [undoKey, redoKey, saveKey, duplicateKey, zoomInKey, zoomOutKey]);

  // -- Drawing ------------------------------------------------------------

  const one = selected.length === 1 ? (elements.find((element) => element.id === selected[0]) ?? null) : null;
  const chosen = elements.filter((element) => selected.includes(element.id));
  const chosenBounds = boundsOf(chosen.map((element) => ({ ...element, type: element.type === 'frame' ? 'rect' : element.type })));
  // Where a model is drawing, on screen: what is selected, else what is drawn, else the whole canvas (null).
  const drawingBounds = chosenBounds ?? boundsOf(elements.map((element) => ({ ...element, type: element.type === 'frame' ? 'rect' : element.type })));
  const drawingArea =
    drawingBounds === null
      ? null
      : { left: drawingBounds.x * view.zoom + view.x, top: drawingBounds.y * view.zoom + view.y, width: drawingBounds.w * view.zoom, height: drawingBounds.h * view.zoom };
  const editingElement = editing === null ? null : (elements.find((element) => element.id === editing.id) ?? null);
  const handleSize = 8 / view.zoom;
  const step = view.zoom < 0.5 ? GRID * 4 : GRID * 2;
  const canvasCursor = gesture?.kind === 'pan' ? 'grabbing' : tool === 'hand' || spaceHeld ? 'grab' : tool === 'select' ? 'default' : 'crosshair';

  if (missing) {
    return (
      <AppShell
        title={t('Wireframe editor')}
        user={shellUser(session)}
        workspacePath={`/workspace/${workspaceId}`}
        showAdmin={session.admin}
        onSignOut={onSignOut}
        sidebar={null}
        hideSidebar
      >
        <p className={styles.missing}>{t('There is no such wireframe here.')}</p>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={t('Wireframe editor')}
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
            const to = `/workspace/${workspaceId}/design/wireframes`;
            if (!askBeforeLeaving(to)) navigate(to);
          }}
          data-testid="wireframe-back"
        >
          ← {t('Wireframes')}
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
            data-testid="wireframe-title-input"
          />
        ) : (
          <button
            type="button"
            className={shell.toolbarTitle}
            onClick={() => setNaming(wireframe?.name ?? '')}
            title={`${wireframe?.name ?? ''} - ${t('click to rename')}`}
            data-testid="wireframe-title"
          >
            {wireframe?.name ?? ''}
          </button>
        )}
        {naming === null && (
          <button
            type="button"
            className={shell.tool}
            onClick={() => setNaming(wireframe?.name ?? '')}
            title={t('Rename the wireframe')}
            aria-label={t('Rename the wireframe')}
          >
            <img src={pencilIcon} alt="" width={14} height={14} />
          </button>
        )}
        {unsaved && (
          <span className={shell.unsavedMark} data-testid="wireframe-unsaved">
            {t('Unsaved')}
          </span>
        )}
        <div className={shell.toolbarRight}>
          <div className={styles.tools} role="toolbar" aria-label={t('Tools')}>
            {TOOLS.map((one) => (
              <button
                key={one.tool}
                type="button"
                className={`${shell.tool} ${tool === one.tool ? styles.toolOn : ''}`}
                onClick={() => {
                  commitEditing();
                  setTool(one.tool);
                }}
                aria-pressed={tool === one.tool}
                title={one.label()}
                aria-label={one.label()}
                data-testid={`wireframe-tool-${one.tool}`}
              >
                <img src={one.icon} alt="" width={16} height={16} />
              </button>
            ))}
          </div>
          <span className={shell.toolbarGap} aria-hidden="true" />
          <button type="button" className={shell.tool} onClick={() => zoomAbout(1 / ZOOM_STEP)} title={`${t('Zoom out')} (${zoomOutKey})`} aria-label={t('Zoom out')} data-testid="wireframe-zoom-out">
            −
          </button>
          <button type="button" className={shell.zoomLevel} onClick={() => fit()} title={t('Fit to the canvas')} data-testid="wireframe-zoom">
            {`${Math.round(view.zoom * 100)}%`}
          </button>
          <button type="button" className={shell.tool} onClick={() => zoomAbout(ZOOM_STEP)} title={`${t('Zoom in')} (${zoomInKey})`} aria-label={t('Zoom in')} data-testid="wireframe-zoom-in">
            +
          </button>
          <span className={shell.toolbarGap} aria-hidden="true" />
          <button type="button" className={shell.tool} onClick={undo} disabled={past.length === 0} title={`${t('Undo')} (${undoKey})`} aria-label={t('Undo')} data-testid="wireframe-undo">
            <img src={undoIcon} alt="" width={16} height={16} />
          </button>
          <button type="button" className={shell.tool} onClick={redo} disabled={future.length === 0} title={`${t('Redo')} (${redoKey})`} aria-label={t('Redo')} data-testid="wireframe-redo">
            <img src={redoIcon} alt="" width={16} height={16} />
          </button>
          <span className={shell.toolbarGap} aria-hidden="true" />
          <button
            type="button"
            className={form.ghost}
            onClick={duplicate}
            disabled={selected.length === 0}
            title={`${t('Duplicate')} (${duplicateKey})`}
            data-testid="wireframe-duplicate"
          >
            {t('Duplicate')}
          </button>
          <button type="button" className={form.ghost} onClick={remove} disabled={selected.length === 0} title={t('Delete')} data-testid="wireframe-delete">
            {t('Delete')}
          </button>
          <WireframeExport id={wireframe?.id ?? null} name={wireframe?.name ?? ''} elements={elements} />
          <button type="button" className={form.filled} onClick={() => void save()} disabled={!unsaved || busy} title={`${t('Save')} (${saveKey})`} data-testid="wireframe-save">
            {t('Save')}
          </button>
        </div>
      </div>

      <div className={shell.editor}>
        <div className={styles.canvas} ref={canvasRef} data-testid="wireframe-canvas">
          {wireframe === null ? (
            <div className={styles.loading}>{error === null ? <Loader /> : <p role="alert">{error}</p>}</div>
          ) : (
            <svg
              ref={svgRef}
              className={styles.surface}
              style={{ cursor: canvasCursor }}
              onPointerDown={pointerDown}
              onPointerMove={pointerMove}
              onPointerUp={pointerUp}
              onDoubleClick={doubleClick}
              data-testid="wireframe-svg"
            >
              <defs>
                <pattern id="wireframe-grid" width={step * view.zoom} height={step * view.zoom} patternUnits="userSpaceOnUse" x={view.x} y={view.y}>
                  <circle cx={1} cy={1} r={1} className={styles.gridDot} />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#wireframe-grid)" />
              <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
                <WireframeShapes elements={elements} markerId="wireframe-editor-arrow" />
                {chosenBounds !== null && selected.length > 1 && (
                  <rect
                    x={chosenBounds.x}
                    y={chosenBounds.y}
                    width={chosenBounds.w}
                    height={chosenBounds.h}
                    className={styles.selectionBox}
                    data-testid="wireframe-selection"
                  />
                )}
                {chosen.map((element) =>
                  isBox(element.type) ? (
                    <rect
                      key={`chosen-${element.id}`}
                      x={element.x}
                      y={element.y}
                      width={element.w}
                      height={element.h}
                      className={styles.selected}
                      data-testid="wireframe-selected"
                    />
                  ) : (
                    <line
                      key={`chosen-${element.id}`}
                      x1={element.x}
                      y1={element.y}
                      x2={element.x + element.w}
                      y2={element.y + element.h}
                      className={styles.selected}
                      data-testid="wireframe-selected"
                    />
                  ),
                )}
                {one !== null && gesture?.kind !== 'create' &&
                  (isBox(one.type)
                    ? ([
                        ['nw', one.x, one.y],
                        ['n', one.x + one.w / 2, one.y],
                        ['ne', one.x + one.w, one.y],
                        ['e', one.x + one.w, one.y + one.h / 2],
                        ['se', one.x + one.w, one.y + one.h],
                        ['s', one.x + one.w / 2, one.y + one.h],
                        ['sw', one.x, one.y + one.h],
                        ['w', one.x, one.y + one.h / 2],
                      ] as [Handle, number, number][])
                    : ([
                        ['start', one.x, one.y],
                        ['end', one.x + one.w, one.y + one.h],
                      ] as [Handle, number, number][])
                  ).map(([handle, x, y]) => (
                    <rect
                      key={handle}
                      x={x - handleSize / 2}
                      y={y - handleSize / 2}
                      width={handleSize}
                      height={handleSize}
                      className={`${styles.handle} ${styles[`handle_${handle}`] ?? ''}`}
                      data-handle={handle}
                      data-testid={`wireframe-handle-${handle}`}
                    />
                  ))}
                {gesture?.kind === 'marquee' && (
                  <rect
                    x={Math.min(gesture.from.x, gesture.now.x)}
                    y={Math.min(gesture.from.y, gesture.now.y)}
                    width={Math.abs(gesture.now.x - gesture.from.x)}
                    height={Math.abs(gesture.now.y - gesture.from.y)}
                    className={styles.marquee}
                  />
                )}
              </g>
            </svg>
          )}
          {editing !== null && editingElement !== null && (
            <textarea
              className={styles.inPlace}
              style={{
                left: editingElement.x * view.zoom + view.x,
                top: (editingElement.type === 'frame' ? editingElement.y - 24 : editingElement.y) * view.zoom + view.y,
                width: Math.max(80, editingElement.w * view.zoom),
                height: editingElement.type === 'frame' ? 22 * view.zoom : Math.max(24, editingElement.h * view.zoom),
                fontSize: `${(typeof editingElement.props?.size === 'number' ? editingElement.props.size : 14) * view.zoom}px`,
              }}
              value={editing.text}
              onChange={(event) => setEditing({ id: editing.id, text: event.target.value })}
              onBlur={commitEditing}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  commitEditing();
                }
                if (event.key === 'Escape') setEditing(null);
              }}
              aria-label={t('Text')}
              autoFocus
              data-testid="wireframe-text-input"
            />
          )}
          {answering && wireframe !== null && (
            <div
              className={`${styles.drawingArea} ${drawingArea === null ? styles.drawingAreaWhole : ''}`}
              style={drawingArea ?? undefined}
              aria-hidden="true"
              data-testid="wireframe-drawing-area"
            />
          )}
          {answering && (
            <div className={styles.drawing} data-testid="wireframe-drawing">
              <Loader label={t('Drawing…')} delay={0} size={20} />
            </div>
          )}
          {elements.length === 0 && wireframe !== null && !answering && (
            <p className={styles.emptyHint}>{t('Pick a tool and draw, or ask on the right.')}</p>
          )}
        </div>

        <div className={`${shell.panel} ${styles.panel}`} data-testid="wireframe-panel">
          {one !== null && (
            <div className={styles.fields} data-testid="wireframe-fields">
              {(['x', 'y', 'w', 'h'] as const).map((field) => (
                <label key={field} className={styles.field}>
                  <span>{field.toUpperCase()}</span>
                  <input
                    className={`${form.input} ${form.inputMono}`}
                    type="number"
                    value={one[field]}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (Number.isFinite(value)) setField(one.id, { [field]: Math.round(value) });
                    }}
                    aria-label={field.toUpperCase()}
                    data-testid={`wireframe-field-${field}`}
                  />
                </label>
              ))}
              {one.type === 'button' && (
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={one.props?.variant === 'primary'}
                    onChange={(event) => {
                      const props = { ...(one.props ?? {}) };
                      if (event.target.checked) props.variant = 'primary';
                      else delete props.variant;
                      setField(one.id, { props });
                    }}
                    data-testid="wireframe-field-primary"
                  />
                  {t('Primary')}
                </label>
              )}
            </div>
          )}

          <DesignChat
            prefix="wireframe"
            firstName={firstName}
            question={t('What shall we sketch?')}
            ideas={elements.length > 0 ? [POLISH, ...IDEAS.slice(0, 3)] : IDEAS}
            ready={wireframe !== null}
            talk={talk}
            answering={answering}
            talkError={talkError}
            working={t('Drawing…')}
            asking={asking}
            onAsking={setAsking}
            onAsk={(event, idea) => void ask(event, idea)}
            models={models}
            modelId={modelId}
            onModel={(picked) => {
              setModelId(picked);
              try {
                localStorage.setItem(modelKey(workspaceId), picked);
              } catch {
                // Remembered for this visit only.
              }
            }}
            placeholder={t('Describe a screen to draw')}
            inputLabel={t('What to draw')}
            footer={
              <>
                {error !== null && wireframe !== null && (
                  <p className={form.error} role="alert">
                    {error}
                  </p>
                )}
                <span className={styles.count}>{tf('{count} elements', { count: elements.length })}</span>
              </>
            }
          />
        </div>
      </div>
      <UnsavedWorkDialog
        subject={guard.asking ? (wireframe?.name ?? t('This wireframe')) : null}
        creating={false}
        onStay={guard.stay}
        onLeave={guard.leave}
        onSaveAndLeave={guard.saveAndLeave}
      />
    </AppShell>
  );
}
