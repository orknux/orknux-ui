import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  type ConnectionLineComponentProps,
  MarkerType,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useNodesInitialized,
  useReactFlow,
  useStore,
  useViewport,
} from '@xyflow/react';
import type { EdgeChange, FinalConnectionState, NodeChange, ReactFlowProps, Viewport } from '@xyflow/react';
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
  codeSourceOf,
  diagramSources,
  fetchDiagramSource,
  jiraKeyOf,
  sourceKindOf,
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
  DiagramTextAlign,
  DiagramTextValign,
  DiagramTurn,
  DiagramSource,
  DiagramSourceKind,
} from '../../api/diagrams';
import type { SessionUser } from '../../api/session';
import alignLeftIcon from '../../assets/align-left.svg';
import alignCenterIcon from '../../assets/align-center.svg';
import alignRightIcon from '../../assets/align-right.svg';
import alignTopIcon from '../../assets/align-vertical-top.svg';
import alignMiddleIcon from '../../assets/align-vertical-middle.svg';
import alignBottomIcon from '../../assets/align-vertical-bottom.svg';
import mapIcon from '../../assets/map.svg';
import messageIcon from '../../assets/message-square.svg';
import panelCollapseIcon from '../../assets/panel-collapse.svg';
import marqueeIcon from '../../assets/marquee.svg';
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
import rotateIcon from '../../assets/rotate-cw.svg';
import roundedIcon from '../../assets/rectangle-button.svg';
import squareIcon from '../../assets/square.svg';
import stickyIcon from '../../assets/sticky-note.svg';
import diamondIcon from '../../assets/diamond.svg';
import undoIcon from '../../assets/undo.svg';
import usersIcon from '../../assets/users.svg';
import codeIcon from '../../assets/code.svg';
import jiraIcon from '../../assets/ticket.svg';
import fitIcon from '../../assets/scale.svg';
import refreshIcon from '../../assets/refresh-cw.svg';
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
  useAddShortcut,
  useSelectShortcut,
  useArrangeShortcut,
  useDiagramFindShortcut,
  useDiagramModeShortcut,
  useDiagramRotateShortcut,
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
import { AlignmentGuides, EDGE_TYPES, GRID, LABEL_MOST, LINE_TRACES, LabelEditingContext, LinkEndsContext, LinkOpenContext, NODE_TYPES, SWATCH_ROW, SWATCHES, SuggestionGhost, TurnedResizeContext, ViewingContext, sameAll } from './DiagramCanvas';
import { DiagramAddMenu, rememberAdded } from './DiagramAddMenu';
import { shareNearest, turned } from './DiagramRoutes';
import { alignTo, boundsOf, stretched } from './DiagramGuides';
import type { Guide, GuideBox, GuideLine } from './DiagramGuides';
import type { LinkCard } from './DiagramCanvas';
import { restyled, wholeStyleOf } from './DiagramRichText';
import type { Linkable } from './DiagramLinkSearch';
import { fetchDocuments } from '../../api/documents';
import { fetchWireframes } from '../../api/wireframes';
import type { LinkEdge, LinkEnd, LinkEnds, ShapeNode, Suggestion, TurnedResize } from './DiagramCanvas';
import { EndIcon, LineIcon, MarkerDefs, RoutingIcon, endStyleLabel, headingOf, lineStyleLabel, markerId, nearestKind, routingLabel, styleOf } from './DiagramLineStyles';
import { ShapeIcon, outlineOf } from './DiagramShapes';
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

/** How narrow the side panel may be dragged, and how much of the canvas it must leave. */
const PANEL_NARROWEST = 300;
const CANVAS_NARROWEST = 320;
/** How short the settings above the chat may be dragged, and how much height the chat keeps. */
const CHAT_NARROWEST = 280;
/** How much of the canvas's corner the small map takes, its margin included: what stands above it is lifted by this. */
// The map's size, smaller than React Flow's own 200 by 150: it is for finding one's way, and the canvas is for the drawing.
const MAP_SIZE = { width: 150, height: 100 };
// The corner's tools stand left of the map, foot to foot with it: its width and the gap between them.
const MAP_BESIDE = { marginRight: MAP_SIZE.width + 15 + 8 };
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
  code: () => t('Code from GitHub'),
  jira: () => t('Jira issue'),
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
  code: { w: 480, h: 280 },
  jira: { w: 260, h: 110 },
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

/** Text colours offered for a shape's words: the in-place bar's, and the usual ink. */
const TEXT_COLOURS = ['#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#2563eb', '#9333ea', '#71717a', '#ffffff'];

/**
 * The words of a shape, or of every shape selected, styled whole: bold,
 * italic, underlined, struck through, and a colour. Written as the marks
 * the bar over words being typed writes, so a part styled there and the whole
 * styled here are one thing, exported and read by an agent alike.
 */
function TextStyleField({ labels, onChange }: { labels: string[]; onChange: (restyle: (label: string) => string) => void }) {
  const said = labels.filter((label) => label.trim() !== '');
  const looks = said.map(wholeStyleOf);
  const all = (key: 'bold' | 'italic' | 'underline' | 'strike') => looks.length > 0 && looks.every((look) => look[key] === true);
  const colour = looks.length > 0 && looks.every((look) => look.color !== undefined && look.color === looks[0].color) ? looks[0].color : undefined;
  const none = said.length === 0;
  return (
    <div className={styles.field} data-testid="diagram-text-style-field">
      <span>{t('Text')}</span>
      <div className={styles.strokeRow}>
        {([
          ['bold', 'B', t('Bold'), { fontWeight: 700 }],
          ['italic', 'I', t('Italic'), { fontStyle: 'italic' }],
          ['underline', 'U', t('Underline'), { textDecoration: 'underline' }],
          ['strike', 'S', t('Strikethrough'), { textDecoration: 'line-through' }],
        ] as const).map(([key, letter, name, look]) => (
          <button
            key={key}
            type="button"
            className={`${styles.textStyleToggle} ${all(key) ? styles.textStyleToggleOn : ''}`}
            style={look}
            disabled={none}
            aria-pressed={all(key)}
            onClick={() => {
              const on = !all(key);
              onChange((label) => restyled(label, { [key]: on }));
            }}
            title={name}
            aria-label={name}
            data-testid={`diagram-text-style-${key}`}
          >
            {letter}
          </button>
        ))}
      </div>
      <div className={styles.strokeRow}>
        <button
          type="button"
          className={`${styles.swatch} ${styles.swatchNone} ${colour === undefined ? styles.swatchOn : ''}`}
          disabled={none}
          onClick={() => onChange((label) => restyled(label, { color: null }))}
          title={t('Usual')}
          aria-label={t('Usual')}
          data-testid="diagram-text-colour-usual"
        />
        {TEXT_COLOURS.map((one) => (
          <button
            key={one}
            type="button"
            className={`${styles.swatch} ${colour === one ? styles.swatchOn : ''}`}
            style={{ background: one }}
            disabled={none}
            onClick={() => onChange((label) => restyled(label, { color: one }))}
            title={one}
            aria-label={one}
            data-testid={`diagram-text-colour-${one.slice(1)}`}
          />
        ))}
        <label className={`${styles.swatch} ${styles.swatchCustom} ${colour !== undefined && !TEXT_COLOURS.includes(colour) ? styles.swatchOn : ''}`} title={t('Another colour')}>
          <input
            type="color"
            className={styles.swatchPicker}
            value={colour ?? '#18181b'}
            disabled={none}
            aria-label={t('Another colour')}
            ref={(input) => {
              if (input === null) return;
              input.onchange = () => {
                const picked = input.value.toLowerCase();
                onChange((label) => restyled(label, { color: picked }));
              };
            }}
            onChange={() => {}}
          />
        </label>
      </div>
    </div>
  );
}

/** What a line looks like, as a new line copies it: everything but where it goes, what it says and how it bends. */
const LOOK_KEYS = ['kind', 'line', 'start', 'end', 'routing', 'color', 'width'] as const;

function kindLabel(kind: DiagramNodeKind): string {
  return SHAPES.find((one) => one.kind === kind)?.label() ?? MORE_SHAPES[kind]?.() ?? kind;
}

const freshId = (prefix: string) => `${prefix}${Math.random().toString(36).slice(2, 10)}`;

/** A React Flow handle id as the side it names, or undefined for a floating end (the box's middle, no handle). */
const asSide = (handle: string | null | undefined): DiagramSide | undefined =>
  DIAGRAM_SIDES.find((side) => side === handle);

/** A point, from a box's middle, as the box's own frame has it: turned back by however far the box is turned. */
function unturned(box: { x: number; y: number; w: number; h: number; rotation?: number }, fx: number, fy: number): [number, number] {
  const dx = fx - (box.x + box.w / 2);
  const dy = fy - (box.y + box.h / 2);
  return box.rotation ? turned(dx, dy, -box.rotation) : [dx, dy];
}

/**
 * Which side of a box a point is nearest, or undefined for its middle - a
 * floating end. The box is split into four side wedges around an inner quarter
 * that floats, so an end dropped anywhere past the middle pins to the side it
 * fell toward, rather than only when the small centre handle was hit exactly.
 */
function sideAt(box: { x: number; y: number; w: number; h: number; rotation?: number }, fx: number, fy: number): DiagramSide | undefined {
  // In the shape's own frame: the side a point fell toward is a side of the shape as it was drawn upright.
  const [dx, dy] = unturned(box, fx, fy);
  const nx = box.w > 0 ? dx / (box.w / 2) : 0;
  const ny = box.h > 0 ? dy / (box.h / 2) : 0;
  if (Math.abs(nx) < 0.5 && Math.abs(ny) < 0.5) return undefined;
  return Math.abs(nx) > Math.abs(ny) ? (nx > 0 ? 'right' : 'left') : (ny > 0 ? 'bottom' : 'top');
}
const snap = (value: number) => Math.round(value / GRID) * GRID;
/** How far off a shape's outline, in screen pixels, a dragged line end still lands on it. */
const LAND_REACH = 18;

/**
 * Where along [side] of a box a point falls, as a share of the side from its start - left to right along the top
 * and bottom, top to bottom down the sides, in the box's own upright frame - or nothing near the middle, where an
 * end pinned to a side always sat: within a twentieth of it, so a drop on a side's handle is that handle.
 */
function shareAt(box: { x: number; y: number; w: number; h: number; rotation?: number }, side: DiagramSide | undefined, fx: number, fy: number): number | undefined {
  if (side === undefined) return undefined;
  const [dx, dy] = unturned(box, fx, fy);
  const share = side === 'top' || side === 'bottom' ? (box.w > 0 ? dx / box.w + 0.5 : 0.5) : box.h > 0 ? dy / box.h + 0.5 : 0.5;
  const kept = Math.round(Math.min(1, Math.max(0, share)) * 1000) / 1000;
  return Math.abs(kept - 0.5) < 0.05 ? undefined : kept;
}

/** The point an end pinned at [share] along [side] of a box sits at, as the box is drawn - turned, if it is. */
function sidePoint(box: { x: number; y: number; w: number; h: number; rotation?: number }, side: DiagramSide, share: number | undefined) {
  const along = (share ?? 0.5) - 0.5;
  const [dx, dy] =
    side === 'top' ? [along * box.w, -box.h / 2] : side === 'bottom' ? [along * box.w, box.h / 2] : side === 'left' ? [-box.w / 2, along * box.h] : [box.w / 2, along * box.h];
  const [tx, ty] = box.rotation ? turned(dx, dy, box.rotation) : [dx, dy];
  return { x: box.x + box.w / 2 + tx, y: box.y + box.h / 2 + ty };
}

/** Which way each side of an upright box faces, and the side across from it. */
const FACING: Record<DiagramSide, [number, number]> = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] };
const ACROSS_FROM: Record<DiagramSide, DiagramSide> = { top: 'bottom', right: 'left', bottom: 'top', left: 'right' };
/** How far from a side a box may stand and still be the one a line is suggested to; how far off a suggested copy is put. */
const SUGGEST_REACH = 320;
const SUGGEST_GAP = 80;
/** How long the pointer rests on a side's handle before what a click would draw is shown, in milliseconds: a pointer only passing shows nothing. */
const SUGGEST_AFTER = 140;
/** How far a press on a handle moves before it is a line being dragged out and no longer a click, in pixels. */
const CLICK_SLACK = 4;

/** The middle of a side of a box as it is drawn - turned, if the box is - and the way that side faces. */
function sideMiddle(box: { x: number; y: number; w: number; h: number; rotation?: number }, side: DiagramSide) {
  const [ux, uy] = FACING[side];
  const [nx, ny] = box.rotation ? turned(ux, uy, box.rotation) : [ux, uy];
  const reach = side === 'left' || side === 'right' ? box.w / 2 : box.h / 2;
  return { x: box.x + box.w / 2 + nx * reach, y: box.y + box.h / 2 + ny * reach, nx, ny };
}

/**
 * What a click on [side]'s handle of box [id] would draw. A line, where a box
 * it is not yet joined to stands that way within reach: the nearest, by the
 * gap between them. Otherwise a copy of the box, a little way off on that
 * side, with a line to it - unless something already stands there. Boxes
 * [skipped] - hidden, or on a locked layer - are neither joined nor copied.
 */
function suggestionFor(drawing: DiagramDrawing, skipped: (node: DiagramNodeData) => boolean, id: string, side: DiagramSide): Suggestion | null {
  const a = drawing.nodes.find((node) => node.id === id);
  if (a === undefined || skipped(a)) return null;
  const out = sideMiddle(a, side);
  const level = side === 'left' || side === 'right';
  const joined = new Set(drawing.edges.flatMap((edge) => (edge.from === id ? [edge.to] : edge.to === id ? [edge.from] : [])));
  const drawn = (to: { x: number; y: number; nx: number; ny: number }) => {
    const pull = Math.max(16, Math.min(SUGGEST_GAP, Math.hypot(to.x - out.x, to.y - out.y) / 2));
    return {
      path: `M ${out.x},${out.y} C ${out.x + out.nx * pull},${out.y + out.ny * pull} ${to.x + to.nx * pull},${to.y + to.ny * pull} ${to.x},${to.y}`,
      tip: { x: to.x, y: to.y, angle: (Math.atan2(-to.ny, -to.nx) * 180) / Math.PI },
    };
  };
  let nearest: { node: DiagramNodeData; gap: number } | null = null;
  for (const b of drawing.nodes) {
    if (b.id === id || b.kind === 'group' || b.kind === 'text' || joined.has(b.id) || skipped(b)) continue;
    const dx = b.x + b.w / 2 - out.x;
    const dy = b.y + b.h / 2 - out.y;
    // How far it stands the way the side faces, and how far off to one side of that.
    const along = dx * out.nx + dy * out.ny;
    const aside = Math.abs(dy * out.nx - dx * out.ny);
    const deep = (Math.abs(out.nx) * b.w + Math.abs(out.ny) * b.h) / 2;
    const wide = (Math.abs(out.ny) * b.w + Math.abs(out.nx) * b.h) / 2;
    const gap = along - deep;
    if (gap <= 0 || gap > SUGGEST_REACH || aside >= wide + (level ? a.h : a.w) / 2) continue;
    if (nearest === null || gap < nearest.gap) nearest = { node: b, gap };
  }
  if (nearest !== null) {
    const toSide = sideAt(nearest.node, out.x, out.y) ?? ACROSS_FROM[side];
    return { kind: 'line', from: id, side, to: nearest.node.id, toSide, ...drawn(sideMiddle(nearest.node, toSide)) };
  }
  // A group is not copied - it would be an empty frame - and words alone take no line's end.
  if (a.kind === 'group' || a.kind === 'text') return null;
  const reach = level ? a.w / 2 : a.h / 2;
  let x = a.x + out.nx * (2 * reach + SUGGEST_GAP);
  let y = a.y + out.ny * (2 * reach + SUGGEST_GAP);
  // On the grid the way it was moved, and level with the box it copies the other way.
  if (!a.rotation) {
    if (level) x = snap(x);
    else y = snap(y);
  }
  if (drawing.nodes.some((b) => b.id !== id && b.kind !== 'group' && !skipped(b) && x < b.x + b.w && x + a.w > b.x && y < b.y + b.h && y + a.h > b.y)) return null;
  const box = { x, y, w: a.w, h: a.h, ...(a.rotation ? { rotation: a.rotation } : {}) };
  const home = drawing.nodes
    .filter((group) => group.kind === 'group' && !skipped(group))
    .filter((group) => x + a.w / 2 >= group.x && x + a.w / 2 <= group.x + group.w && y + a.h / 2 >= group.y && y + a.h / 2 <= group.y + group.h)
    .sort((one, other) => one.w * one.h - other.w * other.h)[0];
  return { kind: 'copy', from: id, side, toSide: ACROSS_FROM[side], box, ...(home !== undefined ? { home: home.id } : {}), ...drawn(sideMiddle(box, ACROSS_FROM[side])) };
}

/** What a new shape says until it is typed over; a class starts with its compartments, so how to write one is on the canvas. */
function startingLabel(kind: DiagramNodeKind): string {
  return kind === 'group' ? t('Group') : kind === 'note' ? t('Note') : kind === 'text' ? t('Text') : kind === 'class' ? `${t('New node')}\n--\n\n--\n` : t('New node');
}

/** Where a shape's words can be put, across and down, as the side panel offers them. */
const TEXT_ACROSS: { value: DiagramTextAlign; icon: string; label: () => string }[] = [
  { value: 'left', icon: alignLeftIcon, label: () => t('Text to the left') },
  { value: 'center', icon: alignCenterIcon, label: () => t('Text in the centre') },
  { value: 'right', icon: alignRightIcon, label: () => t('Text to the right') },
];
const TEXT_DOWN: { value: DiagramTextValign; icon: string; label: () => string }[] = [
  { value: 'top', icon: alignTopIcon, label: () => t('Text at the top') },
  { value: 'middle', icon: alignMiddleIcon, label: () => t('Text in the middle') },
  { value: 'bottom', icon: alignBottomIcon, label: () => t('Text at the bottom') },
];
/** The smallest and the biggest a shape's words may be, in pixels - the server's own limits. */
const TEXT_LEAST = 6;
const TEXT_MOST = 96;

/**
 * What a code or a Jira shape shows, pasted or typed and put down with Enter:
 * a GitHub file's address, or an issue's key or address. Under it, what that
 * reads as, when it was read, Refresh, and why the last read failed - or that
 * the workspace has not chosen what reads it, with the way there.
 */
function SourceField({
  node,
  read,
  workspaceId,
  onSource,
  onRefresh,
}: {
  node: DiagramNodeData;
  read: DiagramSource | undefined;
  workspaceId: string | undefined;
  onSource: (source: string | undefined) => void;
  onRefresh: () => void;
}) {
  const code = node.kind === 'code';
  const [problem, setProblem] = useState<string | null>(null);
  const file = code && node.source !== undefined ? codeSourceOf(node.source) : null;
  const said = file !== null
    ? `${file.owner}/${file.repo} · ${file.path}${file.fromLine === undefined ? '' : ` · ${tf('lines {from}–{to}', { from: file.fromLine, to: file.toLine ?? file.fromLine })}`} · ${file.ref}`
    : !code && node.source !== undefined
      ? node.source
      : null;
  return (
    <div className={styles.field} data-testid="diagram-node-source-field">
      <label className={styles.field}>
        <span>{code ? t('GitHub file') : t('Jira issue')}</span>
        <input
          className={form.input}
          defaultValue={node.source ?? ''}
          autoFocus={node.source === undefined}
          placeholder={code ? 'https://github.com/owner/repo/blob/main/src/App.kt#L10-L40' : 'PROJ-123'}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            const typed = event.currentTarget.value.trim();
            if (typed === '') {
              setProblem(null);
              onSource(undefined);
              return;
            }
            const kept = code ? (codeSourceOf(typed) === null ? null : typed) : jiraKeyOf(typed);
            if (kept === null) {
              setProblem(code ? t('That is not a GitHub file’s address. Copy it from the file’s page; add #L10-L40 for some of its lines.') : t('That is neither an issue key like PROJ-123 nor an issue’s address.'));
              return;
            }
            setProblem(null);
            onSource(kept);
          }}
          data-testid="diagram-node-source"
        />
      </label>
      {problem !== null && <span className={styles.sourceProblem}>{problem}</span>}
      {said !== null && (
        <span className={styles.sourceSaid} data-testid="diagram-node-source-said">
          {said}
        </span>
      )}
      {read !== undefined && !read.configured ? (
        <span className={styles.sourceSaid}>
          {code ? t('The GitHub plugin is not loaded here, or is switched off.') : t('The Jira plugin is not loaded here, or is switched off.')}{' '}
          {workspaceId !== undefined && <a href={`/workspace/${workspaceId}/settings#diagram-sources`}>{t('See Workspace → Settings')}</a>}
        </span>
      ) : (
        node.source !== undefined && (
          <span className={styles.sourceRow}>
            <span className={styles.sourceSaid}>
              {read?.fetchedAt == null ? t('Not read yet') : tf('Read {when}', { when: new Date(read.fetchedAt).toLocaleString() })}
            </span>
            <button type="button" className={styles.textChoice} onClick={onRefresh} aria-label={t('Read it again')} title={t('Read it again')} data-testid="diagram-node-source-refresh">
              <img src={refreshIcon} alt="" width={16} height={16} />
            </button>
          </span>
        )
      )}
      {read?.failed != null && (
        <span className={styles.sourceProblem} data-testid="diagram-node-source-failed">
          {read.failed}
        </span>
      )}
    </div>
  );
}

/**
 * How big a shape's words are, typed. A size is taken the moment it is one the
 * server keeps, and what is half typed - the 1 of 18 - is left in the field
 * and not on the shape. Emptied, the shape writes at its usual size again,
 * which the field then shows faintly.
 */
function TextSizeField({ value, usual, onChange, onFocus, onBlur }: { value: number | undefined; usual: number; onChange: (size: number | undefined) => void; onFocus: () => void; onBlur: () => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === undefined ? '' : String(value));
  /*
   * One step from the size shown - the one typed, or the usual one written
   * faintly in the empty field. The browser's own arrows stepped an empty
   * field from its least, so they are hidden and these step instead.
   */
  const stepBy = (by: number) => {
    const from = shown.trim() !== '' && Number.isFinite(Number(shown)) ? Number(shown) : usual;
    const size = Math.min(TEXT_MOST, Math.max(TEXT_LEAST, Math.round(from) + by));
    setDraft(String(size));
    onChange(size);
  };
  return (
    <span className={styles.textSizeField}>
      <button type="button" className={styles.textSizeStep} onMouseDown={(event) => event.preventDefault()} onClick={() => stepBy(-1)} aria-label={t('Smaller')} title={t('Smaller')} data-testid="diagram-node-text-size-down">
        −
      </button>
      <input
        type="number"
        className={`${form.input} ${styles.textSize}`}
        min={TEXT_LEAST}
        max={TEXT_MOST}
        step={1}
        value={shown}
        placeholder={String(usual)}
        aria-label={t('Text size')}
        title={t('Text size, in pixels')}
        onFocus={onFocus}
        onBlur={() => {
          setDraft(null);
          onBlur();
        }}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
          event.preventDefault();
          stepBy(event.key === 'ArrowUp' ? 1 : -1);
        }}
        // Nor does the wheel turn it: a scroll past the panel changed the size of whatever was selected.
        onWheel={(event) => event.currentTarget.blur()}
        onChange={(event) => {
          const said = event.target.value;
          setDraft(said);
          if (said.trim() === '') {
            onChange(undefined);
            return;
          }
          const size = Number(said);
          if (Number.isInteger(size) && size >= TEXT_LEAST && size <= TEXT_MOST) onChange(size);
        }}
        data-testid="diagram-node-text-size"
      />
      <button type="button" className={styles.textSizeStep} onMouseDown={(event) => event.preventDefault()} onClick={() => stepBy(1)} aria-label={t('Larger')} title={t('Larger')} data-testid="diagram-node-text-size-up">
        +
      </button>
    </span>
  );
}

/** How near, in pixels on the screen, an edge or a middle comes to another box's before it is pulled level with it. */
const GUIDE_REACH = 5;

/** Which edges of a box a resize has moved, as the lines a guide may pull: across, then down. */
function edgesMoved(before: GuideBox, now: GuideBox): [GuideLine[], GuideLine[]] {
  const across: GuideLine[] = now.x !== before.x ? ['start'] : now.x + now.w !== before.x + before.w ? ['end'] : [];
  const down: GuideLine[] = now.y !== before.y ? ['start'] : now.y + now.h !== before.y + before.h ? ['end'] : [];
  return [across, down];
}

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

/**
 * How far in the canvas is, as the toolbar says it. A part of its own, as the
 * pointers below are: the page read the viewport itself, so every frame of a
 * pan or a zoom drew the whole editor again - toolbar, panel and chat - which
 * on a big diagram is what made moving about it drag.
 */
function ZoomReadout() {
  const zoom = useStore((state) => state.transform[2]);
  return <>{`${Math.round(zoom * 100)}%`}</>;
}

/** Where everybody else points, kept in place as the canvas is moved. */
function PointersOnCanvas({ pointers }: { pointers: Parameters<typeof LivePointers>[0]['pointers'] }) {
  const viewport = useViewport();
  return <LivePointers pointers={pointers} place={(x, y) => ({ left: x * viewport.zoom + viewport.x, top: y * viewport.zoom + viewport.y })} />;
}

/**
 * What the canvas is told to call, as functions that stay the same ones from
 * one drawing of the page to the next and call whatever was handed last.
 * React Flow hands these down to every box and every line, and each of those
 * is drawn again when one it holds is a new function - which one written
 * where it is passed always is. So a box dragged across a diagram of six
 * hundred drew all six hundred and their lines again for every pixel.
 */
function useSteady<T extends object>(now: T): T {
  const latest = useRef(now);
  useLayoutEffect(() => {
    latest.current = now;
  });
  const names = useRef(Object.keys(now));
  return useMemo(() => {
    const steady: Record<string, unknown> = {};
    for (const name of names.current) {
      steady[name] = (...given: unknown[]) => (latest.current as Record<string, (...all: unknown[]) => unknown>)[name](...given);
    }
    return steady as T;
  }, []);
}

/** The handlers of the canvas that are kept steady - see [useSteady]. */
type CanvasCalls = Required<
  Pick<
    ReactFlowProps<ShapeNode, LinkEdge>,
    | 'onNodesChange'
    | 'onEdgesChange'
    | 'onConnect'
    | 'onConnectStart'
    | 'onConnectEnd'
    | 'onEdgeMouseEnter'
    | 'onEdgeMouseLeave'
    | 'onNodeDragStart'
    | 'onNodeDoubleClick'
    | 'onEdgeDoubleClick'
    | 'onNodeDragStop'
    | 'onSelectionDragStart'
    | 'onSelectionDragStop'
    | 'onPaneClick'
    | 'onNodeContextMenu'
    | 'onEdgeContextMenu'
    | 'onSelectionContextMenu'
    | 'onPaneContextMenu'
    | 'onMoveStart'
    | 'onMoveEnd'
  >
>;

// Said once, for the same reason: a list or an object written where it is passed is a new one each time.
const MANY_KEYS = ['Shift', 'Meta', 'Control'];
const MIDDLE_BUTTON = [1];
const NO_ATTRIBUTION = { hideAttribution: true };
/*
 * On the map a shape with no colour of its own is coloured by its kind - one
 * colour for every box, another for every ellipse - so the map shows what is
 * where, and not a page of white boxes alike. Only on the map: the drawing is
 * untouched. The tints are the palette's middle row, so nothing on the map is
 * a colour the drawing could not have.
 */
const MAP_TINTS = SWATCHES.slice(SWATCH_ROW + 1, SWATCH_ROW * 2);
// The shapes most drawn, each its own; any other kind takes one of the same eight by its name.
const MAP_TINT_OF: Partial<Record<string, number>> = { box: 0, ellipse: 1, diamond: 2, note: 3, hexagon: 4, database: 5, document: 6, rounded: 7 };
function tintOf(kind: string): string {
  const fixed = MAP_TINT_OF[kind];
  if (fixed !== undefined) return MAP_TINTS[fixed];
  let hash = 0;
  for (const letter of kind) hash = (hash * 31 + letter.charCodeAt(0)) >>> 0;
  return MAP_TINTS[hash % MAP_TINTS.length];
}
const mapFill = (node: ShapeNode) => node.data.color ?? (node.data.kind === 'group' ? 'var(--diagram-group)' : node.data.kind === 'text' ? 'transparent' : tintOf(node.data.kind));
const mapStroke = (node: ShapeNode) => ((node.selected ?? false) ? 'var(--diagram-select)' : node.data.kind === 'text' ? 'var(--diagram-muted)' : 'var(--diagram-ink)');

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
  /** The line the pointer is on: its ends show their grips before it is selected. */
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
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
  /** The small map of the whole diagram in the canvas's corner: drawn unless this person put it away. */
  const [mapFold, setMapFold] = useSieve('diagram.editor.minimap');
  const mapShown = mapFold !== 'off';
  /** Whether a drag on empty canvas draws a rectangle that selects, where it otherwise moves the canvas; remembered. */
  const [marqueeFold, setMarqueeFold] = useSieve('diagram.editor.marquee');
  /*
   * Space held is looking, not editing: the canvas moves under the pointer and
   * nothing is picked, dragged or joined - the shapes are drawn as View draws
   * them until it is let go. Not while typing, where a space is a space.
   */
  const [spaceHeld, setSpaceHeld] = useState(false);
  useEffect(() => {
    const typing = (target: EventTarget | null) =>
      target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable);
    const down = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || typing(event.target)) return;
      event.preventDefault();
      if (!event.repeat) setSpaceHeld(true);
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpaceHeld(false);
    };
    const away = () => setSpaceHeld(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', away);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', away);
    };
  }, []);
  const marquee = marqueeFold === 'on';
  /** The Add menu the shortcut opens: where on the screen, and where on the drawing what is picked goes. */
  const [addMenu, setAddMenu] = useState<{ x: number; y: number; at: { x: number; y: number } } | null>(null);
  /** What a click on the handle under the pointer would draw, shown faintly; see [suggestionFor]. */
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const suggestWait = useRef<number | null>(null);
  const suggestOn = useRef<string | null>(null);
  /** A line being dragged out of a handle: nothing is suggested under it. */
  const connecting = useRef(false);

  const { models, modelId, choose } = useChatModels(workspaceId, modelKey, true);
  const [talk, setTalk] = useState<DiagramTurn[]>([]);
  const [asking, setAsking] = useState('');
  const files = useChatFiles(workspaceId);
  const [answering, setAnswering] = useState(false);
  const [talkError, setTalkError] = useState<string | null>(null);

  /** The drawing as it was when a drag, a resize or a typed field began, so the whole gesture is one step. */
  const gestureStart = useRef<DiagramDrawing | null>(null);
  /** The alignment guides on the canvas while a box is dragged or resized, and the axes they hold it on. */
  const [guides, setGuides] = useState<Guide[]>([]);
  const guideLock = useRef({ x: false, y: false });

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
  const rotateKey = useDiagramRotateShortcut();
  // The workflow editor's own two, so the same key adds and the same key selects on either canvas.
  const addKey = useAddShortcut();
  const selectKey = useSelectShortcut();
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

  /** The drawing as it would be sent, made once per change and not once per reader of it: a big diagram is a long string. */
  const drawn = useMemo(() => JSON.stringify(drawing), [drawing]);
  const unsaved = diagram !== null && drawn !== saved;

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
  const labelMost = diagram?.labelCharactersMost ?? LABEL_MOST;
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
    // A line given a new look is the one the next line copies, as much as the one made last.
    const before = new Map(drawing.edges.map((edge) => [edge.id, edge]));
    const looked = next.edges.filter((edge) => {
      const was = before.get(edge.id);
      return was !== undefined && LOOK_KEYS.some((key) => was[key] !== edge[key]);
    });
    if (looked.length > 0) lastLine.current = looked[looked.length - 1].id;
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

  /*
   * The objects React Flow is handed, kept from one rebuild to the next
   * wherever nothing a shape or a line is drawn from has changed. React Flow
   * keeps its own record of a node for as long as it is handed the same
   * object and draws again only what arrives new - so a box dragged across a
   * big diagram redraws itself and the lines it carries, where every box and
   * every line was made again, and drawn again, for each pixel of the way.
   * A box is keyed on what is drawn and not on its object in the drawing: one
   * inside a group being dragged is a new object there, and exactly where it
   * was inside its group.
   */
  /*
   * What code and Jira shapes last read, by kind and source. Lazy on purpose:
   * the diagram opens on the copies the server kept, or nothing, and only once
   * it is drawn are the shapes whose copy is missing or stale read again - and
   * only those in view, one at a time, so a diagram of fifty files neither waits
   * for GitHub nor asks it fifty things at once. A source is asked once a visit;
   * Refresh in the side panel asks again regardless.
   */
  const [reads, setReads] = useState<ReadonlyMap<string, DiagramSource>>(new Map());
  /** Whether the copies have come: until they have, nothing is read, or a fresh copy would be read again. */
  const [readsLoaded, setReadsLoaded] = useState(false);
  const asked = useRef(new Set<string>());
  const [moved, setMoved] = useState(0);
  const diagramIdNow = diagram?.id;
  useEffect(() => {
    if (diagramIdNow === undefined) return;
    let gone = false;
    asked.current = new Set();
    setReadsLoaded(false);
    diagramSources(diagramIdNow)
      .then((found) => {
        if (gone) return;
        setReads(new Map(found.map((one) => [`${one.kind}|${one.source}`, one])));
        setReadsLoaded(true);
      })
      .catch(() => {
        if (!gone) setReadsLoaded(true);
      });
    return () => {
      gone = true;
    };
  }, [diagramIdNow]);
  const readSource = useCallback(
    async (kind: DiagramSourceKind, source: string, force: boolean) => {
      if (diagramIdNow === undefined) return;
      const key = `${kind}|${source}`;
      asked.current.add(key);
      try {
        const read = await fetchDiagramSource(diagramIdNow, kind, source, force);
        setReads((before) => new Map(before).set(key, read));
      } catch (problem) {
        const failed = problem instanceof Error ? problem.message : String(problem);
        setReads((before) => {
          const held = before.get(key);
          return new Map(before).set(key, { kind, source, body: held?.body ?? null, fetchedAt: held?.fetchedAt ?? null, stale: false, failed, configured: held?.configured ?? true });
        });
      }
    },
    [diagramIdNow],
  );
  // Read through refs, so a render that changes neither which shapes read nor where they are does not restart the wait.
  const drawingForReads = useRef(drawing);
  drawingForReads.current = drawing;
  const readsNow = useRef(reads);
  readsNow.current = reads;
  const sourcesKey = useMemo(
    () =>
      drawing.nodes
        .filter((node) => sourceKindOf(node.kind) !== null && node.source !== undefined)
        .map((node) => `${node.kind}|${node.source}|${node.x}|${node.y}|${node.w}|${node.h}`)
        .join('\n'),
    [drawing],
  );
  /*
   * One pass at a time, and a trigger never cancels one that is waiting: a
   * diagram fitted into view moves the view several times as it settles, and
   * a wait restarted on each move never ended. A trigger during a pass asks
   * for another after it.
   */
  const passing = useRef<'idle' | 'waiting' | 'running' | 'again'>('idle');
  const readsAlive = useRef(true);
  useEffect(() => () => {
    readsAlive.current = false;
  }, []);
  const passRef = useRef<() => void>(() => undefined);
  passRef.current = () => {
    if (passing.current === 'running') {
      passing.current = 'again';
      return;
    }
    if (passing.current !== 'idle') return;
    passing.current = 'waiting';
    window.setTimeout(async () => {
      passing.current = 'running';
      try {
        const { x, y, zoom } = flow.getViewport();
        const left = -x / zoom;
        const top = -y / zoom;
        const right = left + paneWidth / zoom;
        const bottom = top + paneHeight / zoom;
        const due = drawingForReads.current.nodes.filter((node) => {
          const kind = sourceKindOf(node.kind);
          if (kind === null || node.source === undefined) return false;
          const key = `${kind}|${node.source}`;
          if (asked.current.has(key)) return false;
          const held = readsNow.current.get(key);
          if (held !== undefined && (!held.stale || !held.configured)) return false;
          return node.x < right && node.x + node.w > left && node.y < bottom && node.y + node.h > top;
        });
        for (const node of due) {
          if (!readsAlive.current) return;
          const kind = sourceKindOf(node.kind) as DiagramSourceKind;
          if (asked.current.has(`${kind}|${node.source}`)) continue;
          await readSource(kind, node.source as string, false);
        }
      } finally {
        const again = (passing.current as string) === 'again';
        passing.current = 'idle';
        if (again && readsAlive.current) passRef.current();
      }
    }, 150);
  };
  useEffect(() => {
    // After the paint: a moment later, so the diagram is drawn before anything is asked of GitHub or Jira.
    if (diagramIdNow === undefined || !readsLoaded || sourcesKey === '' || paneWidth === 0) return;
    passRef.current();
  }, [diagramIdNow, readsLoaded, sourcesKey, moved, paneWidth, paneHeight]);

  const builtNodes = useRef(new Map<string, { key: readonly unknown[]; built: ShapeNode }>());
  const builtEdges = useRef(new Map<string, { key: readonly unknown[]; built: LinkEdge }>());
  const madeEdges = useRef<LinkEdge[]>([]);

  const nodes = useMemo<ShapeNode[]>(() => {
    const ordered = [...drawing.nodes].sort((a, b) => {
      const groups = Number(b.kind === 'group') - Number(a.kind === 'group');
      return depthOf(a, byId) - depthOf(b, byId) || groups;
    });
    const chosen = new Set(selectedNodes);
    const kept = new Map<string, { key: readonly unknown[]; built: ShapeNode }>();
    const made = ordered.map((node) => {
      const parent = node.parent === undefined ? undefined : byId.get(node.parent);
      const x = node.x - (parent?.x ?? 0);
      const y = node.y - (parent?.y ?? 0);
      const noted = (node.notes ?? '') !== '';
      const loading = uploading.has(node.id);
      const selected = chosen.has(node.id);
      const hidden = hiddenNow.has(layerOf(node, drawing));
      const locked = lockedNow.has(layerOf(node, drawing));
      const readKind = sourceKindOf(node.kind);
      const read = readKind === null || node.source === undefined ? undefined : reads.get(`${readKind}|${node.source}`);
      const key = [
        x, y, parent?.id, node.kind, node.label, node.color, noted, node.link, node.image, loading, node.rotation,
        node.align, node.valign, node.textSize, node.border, node.borderWidth, node.w, node.h, selected, hidden, locked,
        node.textFit, node.source, read,
      ];
      const before = builtNodes.current.get(node.id);
      if (before !== undefined && sameAll(before.key, key)) {
        kept.set(node.id, before);
        return before.built;
      }
      const built: ShapeNode = {
        id: node.id,
        type: 'shape',
        position: { x, y },
        parentId: parent?.id,
        data: {
          kind: node.kind,
          label: node.label,
          color: node.color,
          noted,
          link: node.link,
          image: node.image,
          loading,
          rotation: node.rotation,
          align: node.align,
          valign: node.valign,
          textSize: node.textSize,
          textFit: node.textFit,
          source: node.source,
          read,
        },
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
        selected,
        zIndex: node.kind === 'group' ? -1 : undefined,
        // A hidden layer's boxes are not drawn; a locked one's are drawn and cannot be picked up.
        hidden,
        ...(locked ? { draggable: false, selectable: false, connectable: false, deletable: false } : {}),
      };
      kept.set(node.id, { key, built });
      return built;
    });
    builtNodes.current = kept;
    return made;
  }, [drawing, byId, selectedNodes, hiddenNow, lockedNow, uploading, reads]);

  const edges = useMemo<LinkEdge[]>(() => {
    const chosen = new Set(selectedEdges);
    const chosenNodes = new Set(selectedNodes);
    const kept = new Map<string, { key: readonly unknown[]; built: LinkEdge }>();
    const made = drawing.edges.map((edge) => {
      const selected = chosen.has(edge.id);
      /*
       * A selected box lights every line it has, in or out, so where it
       * reaches is seen at a glance rather than traced line by line.
       */
      const touched = chosenNodes.has(edge.from) || chosenNodes.has(edge.to);
      // Hidden with its layer, or with either of its boxes.
      const hidden =
        hiddenNow.has(layerOf(edge, drawing)) ||
        hiddenNow.has(layerOf(byId.get(edge.from) ?? {}, drawing)) ||
        hiddenNow.has(layerOf(byId.get(edge.to) ?? {}, drawing));
      const locked = lockedNow.has(layerOf(edge, drawing));
      // The line's own object in the drawing, which moving a box leaves alone: a line is made again only when it is changed.
      const key = [edge, selected, touched, hidden, locked];
      const before = builtEdges.current.get(edge.id);
      if (before !== undefined && sameAll(before.key, key)) {
        kept.set(edge.id, before);
        return before.built;
      }
      const { line, start, end } = styleOf(edge);
      // The arrow is React Flow's own closed arrow, as it always was; the other marks are this page's markers.
      const mark = (style: DiagramEndStyle, atEnd: boolean) =>
        style === 'arrow'
          ? { type: MarkerType.ArrowClosed, width: 18, height: 18, ...(edge.color !== undefined ? { color: edge.color } : {}), ...(atEnd ? {} : { orient: 'auto-start-reverse' }) }
          : (markerId(style, atEnd) ?? undefined);
      const built: LinkEdge = {
        hidden,
        ...(locked ? { selectable: false, deletable: false } : {}),
        id: edge.id,
        source: edge.from,
        target: edge.to,
        // A pinned end names its box's handle, so React Flow sits its reconnect anchor on that side; a floating end names none.
        ...(edge.fromSide !== undefined ? { sourceHandle: edge.fromSide } : {}),
        ...(edge.toSide !== undefined ? { targetHandle: edge.toSide } : {}),
        type: 'link' as const,
        data: {
          line,
          label: edge.label,
          routing: edge.routing ?? 'straight',
          fromSide: edge.fromSide,
          toSide: edge.toSide,
          fromAt: edge.fromAt,
          toAt: edge.toAt,
          points: edge.points,
          labelAt: edge.labelAt,
          color: edge.color,
          width: edge.width,
          heading: headingOf(start, end),
          ...(touched ? { touched: true } : {}),
        },
        markerEnd: mark(end, true),
        markerStart: mark(start, false),
        selected,
        ...(touched ? { zIndex: 1 } : {}),
      };
      kept.set(edge.id, { key, built });
      return built;
    });
    builtEdges.current = kept;
    // The list itself too: handed the one it already has, the canvas has nothing to look through, and moving a box changes no line.
    if (sameAll(madeEdges.current, made)) return madeEdges.current;
    madeEdges.current = made;
    return made;
  }, [drawing, selectedEdges, selectedNodes, hiddenNow, lockedNow, byId]);

  /** A node and everything inside it moved by the same amount. */
  function shifted(
    from: DiagramDrawing,
    id: string,
    dx: number,
    dy: number,
    index: Map<string, DiagramNodeData> = new Map(from.nodes.map((node) => [node.id, node])),
  ): DiagramDrawing {
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
    // The boxes by id, made once for the changes that find nothing moved and again only after one that did.
    let index: Map<string, DiagramNodeData> | null = null;
    const held = (id: string) => {
      index ??= new Map(next.nodes.map((node) => [node.id, node]));
      return index.get(id);
    };
    // What the pointer has hold of in this batch: the boxes it is dragging, or the one it is resizing.
    const dragging: string[] = [];
    let resizing: string | null = null;
    let resized: string | null = null;
    for (const one of changes) {
      if (one.type === 'select') {
        picked = one.selected ? [...new Set([...picked, one.id])] : picked.filter((id) => id !== one.id);
      } else if (one.type === 'position' && one.position !== undefined) {
        const node = held(one.id);
        if (node === undefined) continue;
        const parent = node.parent === undefined ? undefined : held(node.parent);
        const x = Math.round(one.position.x + (parent?.x ?? 0));
        const y = Math.round(one.position.y + (parent?.y ?? 0));
        if (x !== node.x || y !== node.y) {
          next = shifted(next, node.id, x - node.x, y - node.y, index ?? undefined);
          index = null;
        }
        if (one.dragging === true) dragging.push(one.id);
      } else if (one.type === 'dimensions' && one.dimensions !== undefined && one.resizing !== undefined) {
        if (one.resizing) begin();
        const w = Math.max(GRID * 3, Math.round(one.dimensions.width));
        const h = Math.max(GRID * 3, Math.round(one.dimensions.height));
        next = { ...next, nodes: next.nodes.map((node) => (node.id === one.id ? { ...node, w, h } : node)) };
        index = null;
        if (one.resizing) resizing = one.id;
        else resized = one.id;
        if (!one.resizing) window.requestAnimationFrame(() => end());
      }
    }
    if (dragging.length > 0) {
      /*
       * Dragged, a box follows the pointer a pixel at a time and is pulled
       * level with a box near it - the guides say with which. The pull is on
       * what is dragged as a whole, so a selection keeps its own arrangement.
       */
      const byNow = new Map(next.nodes.map((node) => [node.id, node]));
      const tops = dragging.filter((id) => !dragging.some((other) => other !== id && within(id, other, byNow)));
      const moving = boundsOf(tops.map((id) => byNow.get(id)).filter((node): node is DiagramNodeData => node !== undefined));
      const level = moving === null ? null : alignTo(moving, othersFor(next, dragging, byNow), GUIDE_REACH / flow.getZoom());
      if (level !== null && (level.dx !== 0 || level.dy !== 0)) {
        for (const id of tops) next = shifted(next, id, level.dx, level.dy);
      }
      showGuides(level?.guides ?? []);
    } else if (resizing !== null) {
      const byNow = new Map(next.nodes.map((node) => [node.id, node]));
      const now = byNow.get(resizing);
      const before = gestureStart.current?.nodes.find((node) => node.id === resizing);
      // A picture keeps its proportions and a turned shape has corners of its own: neither is pulled by one edge.
      if (now !== undefined && before !== undefined && now.kind !== 'image' && !now.rotation) {
        const [across, down] = edgesMoved(before, now);
        const level = alignTo(now, othersFor(next, [now.id], byNow), GUIDE_REACH / flow.getZoom(), across, down, true);
        const box = stretched(now, level.dx, level.dy, across, down);
        if (box.w >= GRID * 3 && box.h >= GRID * 3) {
          if (level.dx !== 0 || level.dy !== 0) next = { ...next, nodes: next.nodes.map((node) => (node.id === now.id ? { ...node, ...box } : node)) };
          showGuides(level.guides);
        } else {
          showGuides([]);
        }
      }
    } else if (resized !== null) {
      /*
       * Let go of, the edges that were moved settle on the grid - the ones a
       * guide is holding level stay where the guide put them, and the edges
       * that were not moved are not touched.
       */
      const now = next.nodes.find((node) => node.id === resized);
      const before = gestureStart.current?.nodes.find((node) => node.id === resized);
      if (now !== undefined && before !== undefined && now.kind !== 'image' && !now.rotation) {
        const [across, down] = edgesMoved(before, now);
        const lock = guideLock.current;
        let { x, y, w, h } = now;
        if (!lock.x && across.includes('start')) {
          const right = x + w;
          x = Math.min(snap(x), right - GRID * 3);
          w = right - x;
        } else if (!lock.x && across.includes('end')) {
          w = Math.max(GRID * 3, snap(x + w) - x);
        }
        if (!lock.y && down.includes('start')) {
          const bottom = y + h;
          y = Math.min(snap(y), bottom - GRID * 3);
          h = bottom - y;
        } else if (!lock.y && down.includes('end')) {
          h = Math.max(GRID * 3, snap(y + h) - y);
        }
        if (x !== now.x || y !== now.y || w !== now.w || h !== now.h) {
          next = { ...next, nodes: next.nodes.map((node) => (node.id === now.id ? { ...node, x, y, w, h } : node)) };
        }
      }
      showGuides([]);
    }
    if (picked !== selectedNodes) setSelectedNodes(picked);
    if (next !== drawing) setDrawing(next);
  }

  /** The boxes a dragged or resized one may be brought level with: those on screen, shown, and not being moved with it. */
  function othersFor(from: DiagramDrawing, moved: string[], index: Map<string, DiagramNodeData>): GuideBox[] {
    const { x, y, zoom } = flow.getViewport();
    const left = -x / zoom;
    const top = -y / zoom;
    const right = left + paneWidth / zoom;
    const bottom = top + paneHeight / zoom;
    return from.nodes.filter(
      (node) =>
        !hiddenNow.has(layerOf(node, from)) &&
        !moved.some((id) => within(node.id, id, index)) &&
        node.x < right && node.x + node.w > left && node.y < bottom && node.y + node.h > top,
    );
  }

  /** The guides drawn, and which axes they hold - so letting go does not move onto the grid what a guide has just put level. */
  function showGuides(next: Guide[]) {
    guideLock.current = { x: next.some((one) => one.axis === 'x'), y: next.some((one) => one.axis === 'y') };
    setGuides((held) => (held.length === next.length && held.every((one, at) => sameAll(Object.values(one), Object.values(next[at]))) ? held : next));
  }

  function onEdgesChange(changes: EdgeChange<LinkEdge>[]) {
    let picked = selectedEdges;
    for (const one of changes) {
      if (one.type === 'select') picked = one.selected ? [...new Set([...picked, one.id])] : picked.filter((id) => id !== one.id);
    }
    if (picked !== selectedEdges) setSelectedEdges(picked);
  }

  // A new connection is made on its end, which carries the drop position; see onConnectEnd.
  function onConnect() {}

  /** The smallest shape a point falls inside - what a dragged arrow end lands on, if anything. */
  /** The smallest shape under a point - or within [reach] of its outline, for an end let go on the outline or just off it. */
  function nodeUnder(fx: number, fy: number, reach = 0) {
    return drawing.nodes
      .filter((node) => {
        if (node.kind === 'text') return false;
        // Inside the shape where it is drawn, which for a turned one is not inside its upright box.
        const [dx, dy] = unturned(node, fx, fy);
        return Math.abs(dx) <= node.w / 2 + reach && Math.abs(dy) <= node.h / 2 + reach;
      })
      .sort((a, b) => a.w * a.h - b.w * b.h)[0];
  }

  function pointerFlow(event: MouseEvent | TouchEvent) {
    const where = 'changedTouches' in event ? event.changedTouches[0] : event;
    return flow.screenToFlowPosition({ x: where.clientX, y: where.clientY });
  }

  /**
   * A new arrow, let go of after a drag out of a box's side. Where its far end
   * lands decides it: dropped on a side of a box it pins there, on the box's
   * middle it floats, on empty canvas nothing is made. Done on end rather than
   * onConnect so an end landing anywhere on a box pins to the side it fell
   * toward, not only on the small centre handle.
   *
   * Curved, as a line drawn by hand starts: it bends out of the side it leaves
   * and into the one it meets, where a straight one cut across at whatever
   * angle the two boxes happened to make. Said on the line itself, since a
   * line that names no routing is a straight one - every line drawn before
   * this, and every one an agent draws without saying.
   */
  /**
   * Where a line being drawn out of [fromId] lands, the pointer at (fx, fy):
   * the shape it reaches, the side and the point along it - what the line
   * dragged shows and what it is made with, by the one sum, so the preview
   * never promises the middle of a side the line is then not pinned to.
   *
   * The shape is the one React Flow snapped to, or the one under the pointer
   * or just off its outline. The side is the one the pointer is toward, not
   * the snapped handle's: near a corner React Flow snaps to whichever handle
   * is nearer, often the next side's, and the line was pinned to that side.
   * The handle's side is the answer only where the pointer is in the middle.
   */
  function connectLanding(fromId: string, toNodeId: string | null | undefined, toHandleId: string | null | undefined, fx: number, fy: number) {
    const snapped = toNodeId != null && toNodeId !== fromId ? byId.get(toNodeId) : undefined;
    const onto = snapped ?? nodeUnder(fx, fy, LAND_REACH / flow.getZoom());
    if (onto === undefined || onto.id === fromId) return null;
    const side = sideAt(onto, fx, fy) ?? (snapped !== undefined ? asSide(toHandleId) : undefined);
    return { onto, side, at: shareAt(onto, side, fx, fy) };
  }
  const connectLandingNow = useRef(connectLanding);
  connectLandingNow.current = connectLanding;
  /*
   * The line being drawn, ending where it will land - the point of the side
   * it will pin to - rather than at the handle React Flow snapped it to, in
   * the middle of a side it would not be pinned to. Made once: it reads the
   * sum through the ref above.
   */
  const ConnectionPreview = useMemo(
    () =>
      function ConnectionPreview({ fromNode, fromX, fromY, toX, toY, toNode, toHandle, pointer }: ConnectionLineComponentProps<ShapeNode>) {
        // The pointer arrives in the canvas's own pixels - React Flow turns the line's end into the diagram's units and not this.
        const [panX, panY, zoom] = useStore((state) => state.transform);
        const landing = connectLandingNow.current(fromNode.id, toNode?.id, toHandle?.id, (pointer.x - panX) / zoom, (pointer.y - panY) / zoom);
        const end =
          landing === null
            ? { x: toX, y: toY }
            : landing.side === undefined
              ? { x: landing.onto.x + landing.onto.w / 2, y: landing.onto.y + landing.onto.h / 2 }
              : sidePoint(landing.onto, landing.side, landing.at);
        return (
          <g data-testid="diagram-connection-preview" data-x={Math.round(end.x)} data-y={Math.round(end.y)}>
            <path className={styles.connectionPreview} d={`M ${fromX} ${fromY} L ${end.x} ${end.y}`} />
            {landing !== null && <circle className={styles.connectionPreviewEnd} cx={end.x} cy={end.y} r={4} />}
          </g>
        );
      },
    [],
  );

  function onConnectEnd(event: MouseEvent | TouchEvent, state: FinalConnectionState) {
    connecting.current = false;
    if (viewing || state.fromNode == null) return;
    const at = pointerFlow(event);
    const landing = connectLanding(state.fromNode.id, state.toNode?.id, state.toHandle?.id, at.x, at.y);
    if (landing === null) return;
    const { onto, side: toSide, at: toAt } = landing;
    const fromSide = asSide(state.fromHandle?.id);
    const made: DiagramEdgeData = {
      id: freshId('e'),
      from: state.fromNode.id,
      to: onto.id,
      ...lineLooks(),
      ...(fromSide !== undefined ? { fromSide } : {}),
      ...(toSide !== undefined ? { toSide } : {}),
      ...(toAt !== undefined ? { toAt } : {}),
    };
    lastLine.current = made.id;
    change({ ...drawing, edges: [...drawing.edges, made] });
    setSelectedNodes([]);
    setSelectedEdges([made.id]);
  }

  /**
   * Where an end of a line would land, let go of at a point: the box under it
   * and the side of that box it fell toward - no side for its middle, where an
   * end floats. Nothing where there is no box there, or the box is the one the
   * line's other end is on: the end is then left exactly as it was.
   */
  function landingOf(edgeId: string, end: LinkEnd, fx: number, fy: number) {
    const edge = drawing.edges.find((one) => one.id === edgeId);
    if (viewing || edge === undefined) return null;
    // On the outline or just off it counts: that is where an end pinned to a point of a side is let go.
    const onto = nodeUnder(fx, fy, LAND_REACH / flow.getZoom());
    if (onto === undefined || onto.id === (end === 'to' ? edge.from : edge.to)) return null;
    const side = sideAt(onto, fx, fy);
    return { onto, side, at: shareAt(onto, side, fx, fy) };
  }

  /**
   * A line's ends, dragged by the grips the canvas draws on them. Landed on a
   * side of a box an end pins there and leaves from it; on the box's middle it
   * floats; on another box it re-points the line. The drop position decides
   * the side, so an end pins wherever on a box it is dropped, and the other
   * end is untouched. Both ends, the same way: a line's start is an end too.
   */
  /*
   * Read through a ref and handed to the canvas as one object that changes only
   * with what it shows: every line reads this, and a new object on every
   * render was every line drawn again on every render.
   */
  const linkEndsNow = useRef<Omit<LinkEnds, 'hovered'>>({ aim: () => null, drop: () => {}, bend: () => {}, slide: () => {}, pick: () => {} });
  linkEndsNow.current = {
    // Shown while it is dragged: the middle of the side it would pin to, or of the box it would float on.
    aim: (edgeId, end, fx, fy) => {
      const landing = landingOf(edgeId, end, fx, fy);
      if (landing === null) return null;
      const { onto, side, at } = landing;
      // The point of the side it would pin to, turned with its box; the box's middle where it would float.
      return side === undefined ? { x: onto.x + onto.w / 2, y: onto.y + onto.h / 2 } : sidePoint(onto, side, at);
    },
    drop: (edgeId, end, fx, fy) => {
      const landing = landingOf(edgeId, end, fx, fy);
      if (landing === null) return;
      const { onto, side, at } = landing;
      change({
        ...drawing,
        edges: drawing.edges.map((one) =>
          one.id === edgeId ? (end === 'to' ? { ...one, to: onto.id, toSide: side, toAt: at } : { ...one, from: onto.id, fromSide: side, fromAt: at }) : one,
        ),
      });
      setSelectedNodes([]);
      setSelectedEdges([edgeId]);
    },
    pick: (edgeId, typing) => {
      setSelectedNodes([]);
      setSelectedEdges([edgeId]);
      if (typing && !viewing) setLabelling({ kind: 'edge', id: edgeId });
    },
    // Its label slid along it: kept that share of the way along, whatever the line goes on to do.
    slide: (edgeId, share) => {
      if (viewing) return;
      change({ ...drawing, edges: drawing.edges.map((one) => (one.id === edgeId ? { ...one, labelAt: share } : one)) });
      setSelectedNodes([]);
      setSelectedEdges([edgeId]);
    },
    // A run dragged aside: the line keeps the corners it was left with, until its routing is chosen again.
    bend: (edgeId, corners) => {
      if (viewing) return;
      change({
        ...drawing,
        edges: drawing.edges.map((one) => (one.id === edgeId ? { ...one, points: corners.length > 0 ? corners : undefined, labelAt: undefined } : one)),
      });
      setSelectedNodes([]);
      setSelectedEdges([edgeId]);
    },
  };
  const linkEnds = useMemo<LinkEnds>(
    () => ({
      hovered: viewing ? null : hoveredEdge,
      aim: (edgeId, end, fx, fy) => linkEndsNow.current.aim(edgeId, end, fx, fy),
      drop: (edgeId, end, fx, fy) => linkEndsNow.current.drop(edgeId, end, fx, fy),
      bend: (edgeId, corners) => linkEndsNow.current.bend(edgeId, corners),
      slide: (edgeId, share) => linkEndsNow.current.slide(edgeId, share),
      pick: (edgeId, typing) => linkEndsNow.current.pick(edgeId, typing),
    }),
    [viewing, hoveredEdge],
  );

  /**
   * What was dragged, let go of. It settles on the grid - by one amount for
   * all of it, taken from the box that was held, so a selection keeps its
   * arrangement - except along an axis a guide is holding it level on. Then
   * each lands in the smallest group under its middle, or in none.
   *
   * On the grid here and not while it moves: snapped as it was dragged, a box
   * stood still until the pointer had gone four pixels and then jumped eight.
   */
  function onDragStop(grabbed: string | undefined, dragged: string[]) {
    let next = drawing;
    let index = new Map(next.nodes.map((node) => [node.id, node]));
    const lock = guideLock.current;
    const lead = index.get(grabbed ?? dragged[0] ?? '');
    if (lead !== undefined) {
      const dx = lock.x ? 0 : snap(lead.x) - lead.x;
      const dy = lock.y ? 0 : snap(lead.y) - lead.y;
      if (dx !== 0 || dy !== 0) {
        const tops = dragged.filter((id) => !dragged.some((other) => other !== id && within(id, other, index)));
        for (const id of tops) next = shifted(next, id, dx, dy);
        index = new Map(next.nodes.map((node) => [node.id, node]));
      }
    }
    showGuides([]);
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

  /** A new node of [kind]: in the middle of what is on screen, or with its middle [at] a point of the drawing. */
  function add(kind: DiagramNodeKind, at?: { x: number; y: number }) {
    const size = MADE[kind];
    const box = document.querySelector('[data-testid="diagram-canvas"]')?.getBoundingClientRect();
    const middle = at ?? (box === undefined ? { x: 0, y: 0 } : flow.screenToFlowPosition({ x: box.left + box.width / 2, y: box.top + box.height / 2 }));
    // Each new one a little further on than the last, so a row of clicks is not one pile; one put where the pointer is goes exactly there.
    const offset = at !== undefined ? 0 : (drawing.nodes.length % 6) * GRID * 3;
    const made: DiagramNodeData = {
      id: freshId('n'),
      kind,
      label: startingLabel(kind),
      x: snap(middle.x - size.w / 2 + offset),
      y: snap(middle.y - size.h / 2 + offset),
      w: size.w,
      h: size.h,
      layer: placing,
    };
    change({ ...drawing, nodes: kind === 'group' ? [made, ...drawing.nodes] : [...drawing.nodes, made] });
    setSelectedNodes([made.id]);
    setSelectedEdges([]);
    // From the toolbar or the Add menu alike: what was reached for leads the menu next time.
    rememberAdded(kind);
  }

  /**
   * The Add menu, opened by its key where the pointer is - or in the middle of
   * the canvas when the pointer is somewhere else - so a diagram is built from
   * the keyboard as a workflow is: the key, the arrows, Enter.
   */
  function openAddMenu() {
    const box = document.querySelector('[data-testid="diagram-canvas"]')?.getBoundingClientRect();
    if (box === undefined) return;
    const held = pointerOnScreen.current;
    const over = held !== null && held.x >= box.left && held.x <= box.right && held.y >= box.top && held.y <= box.bottom;
    const x = over ? held.x : box.left + box.width / 2;
    const y = over ? held.y : box.top + box.height / 2;
    setMenu(null);
    setRightMenu(null);
    setAddMenu({ x, y, at: flow.screenToFlowPosition({ x, y }) });
  }

  /** What the Add menu's pick makes: a shape where the menu was opened; a picture or a link through its own menu, which asks what. */
  function addPicked(kind: DiagramNodeKind) {
    const at = addMenu?.at;
    setAddMenu(null);
    // A picture or a link is made through its own menu, which [add] is not: it is remembered here.
    if (kind === 'image' || kind === 'link') rememberAdded(kind);
    // A code or a Jira shape is made empty, and asks for what it shows in the side panel, focused there.
    if (kind === 'image') setMenu('picture');
    else if (kind === 'link') setMenu('link');
    else add(kind, at);
  }

  // -- Suggested lines -------------------------------------------------------

  const suggestionNow = useRef((_id: string, _side: DiagramSide): Suggestion | null => null);
  suggestionNow.current = (id, side) =>
    suggestionFor(drawing, (node) => hiddenNow.has(layerOf(node, drawing)) || lockedNow.has(layerOf(node, drawing)), id, side);

  /**
   * The pointer over the canvas: resting on a side's handle, what a click
   * there would draw is shown after a moment; anywhere else, nothing is. Not
   * while a button is down - that is a drag, of a box or of a line.
   */
  function hoverHandle(target: EventTarget | null, buttons: number) {
    const handle = viewing || connecting.current || buttons !== 0 || !(target instanceof Element) ? null : target.closest('.react-flow__handle');
    const id = handle?.getAttribute('data-nodeid') ?? null;
    const side = asSide(handle?.getAttribute('data-handleid'));
    const key = id !== null && side !== undefined ? `${id}:${side}` : null;
    if (key === suggestOn.current) return;
    suggestOn.current = key;
    if (suggestWait.current !== null) window.clearTimeout(suggestWait.current);
    suggestWait.current = null;
    setSuggestion(null);
    if (id === null || side === undefined) return;
    suggestWait.current = window.setTimeout(() => {
      suggestWait.current = null;
      setSuggestion(suggestionNow.current(id, side));
    }, SUGGEST_AFTER);
  }
  useEffect(
    () => () => {
      if (suggestWait.current !== null) window.clearTimeout(suggestWait.current);
    },
    [],
  );

  const lastLine = useRef<string | null>(null);
  /**
   * How a new line looks: as the line made last looks now - its style, its two
   * ends, its routing, colour and thickness - so a diagram drawn in dashed grey
   * right angles goes on being drawn that way without each line being set by
   * hand. The first line of a diagram is a curved arrow. Where it goes, and
   * what it says, are its own.
   */
  function lineLooks(): Pick<DiagramEdgeData, 'kind' | 'line' | 'start' | 'end' | 'routing' | 'color' | 'width'> {
    // The one made last on this visit; after a reload, the last in the drawing, which is where a new one goes.
    const last = drawing.edges.find((edge) => edge.id === lastLine.current) ?? drawing.edges[drawing.edges.length - 1];
    if (last === undefined) return { kind: 'arrow', line: 'solid', start: 'none', end: 'arrow', routing: 'curved' };
    const { line, start, end } = styleOf(last);
    return {
      kind: last.kind,
      line,
      start,
      end,
      routing: last.routing ?? 'straight',
      ...(last.color !== undefined ? { color: last.color } : {}),
      ...(last.width !== undefined ? { width: last.width } : {}),
    };
  }

  /** The suggestion, taken by a click on its handle: the line, and for a copy the box it ends on, its label ready to be typed. */
  function takeSuggestion(shown: Suggestion) {
    const source = byId.get(shown.from);
    suggestOn.current = null;
    setSuggestion(null);
    if (source === undefined) return;
    const line = (to: string): DiagramEdgeData => ({
      id: freshId('e'),
      from: source.id,
      to,
      ...lineLooks(),
      fromSide: shown.side,
      ...(shown.toSide !== undefined ? { toSide: shown.toSide } : {}),
    });
    if (shown.kind === 'line' && shown.to !== undefined) {
      const made = line(shown.to);
      lastLine.current = made.id;
      change({ ...drawing, edges: [...drawing.edges, made] });
      setSelectedNodes([]);
      setSelectedEdges([made.id]);
      return;
    }
    if (shown.box === undefined) return;
    // A picture or a link card is not made twice by a click: what follows one is a box.
    const kind: DiagramNodeKind = source.kind === 'image' || source.kind === 'link' ? 'rounded' : source.kind;
    const copy: DiagramNodeData = {
      id: freshId('n'),
      kind,
      label: startingLabel(kind),
      x: shown.box.x,
      y: shown.box.y,
      w: shown.box.w,
      h: shown.box.h,
      layer: source.layer,
      ...(shown.home !== undefined ? { parent: shown.home } : {}),
      ...(source.color !== undefined ? { color: source.color } : {}),
      ...(source.border !== undefined ? { border: source.border } : {}),
      ...(source.borderWidth !== undefined ? { borderWidth: source.borderWidth } : {}),
      ...(source.rotation !== undefined ? { rotation: source.rotation } : {}),
      ...(source.align !== undefined ? { align: source.align } : {}),
      ...(source.valign !== undefined ? { valign: source.valign } : {}),
      ...(source.textSize !== undefined ? { textSize: source.textSize } : {}),
    };
    const joined = line(copy.id);
    lastLine.current = joined.id;
    change({ ...drawing, nodes: [...drawing.nodes, copy], edges: [...drawing.edges, joined] });
    setSelectedNodes([copy.id]);
    setSelectedEdges([]);
    setLabelling({ kind: 'node', id: copy.id });
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
  /** The same, on the screen: where a menu opened from the keyboard is put. */
  const pointerOnScreen = useRef<{ x: number; y: number } | null>(null);
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
      const typingBox = target?.closest('[data-testid="diagram-label-editor"]');
      if (typingBox != null && window.getSelection()?.isCollapsed === false) {
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

  /** What is selected: its boxes, the connections between them, and any line picked on its own - so a line alone can be copied and cut too. */
  function picked(): DiagramDrawing | null {
    if (selectedNodes.length === 0 && selectedEdges.length === 0) return null;
    const ids = new Set(selectedNodes);
    const lines = new Set(selectedEdges);
    return {
      nodes: drawing.nodes.filter((node) => ids.has(node.id)),
      edges: drawing.edges.filter((edge) => lines.has(edge.id) || (ids.has(edge.from) && ids.has(edge.to))),
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
    // An address alone is a shape that shows it: a GitHub file's code, a Jira issue's card, or a card leading anywhere else.
    if (/^https?:\/\/\S+$/i.test(text)) {
      pasteAddress(text, at);
      return;
    }
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

  /** A pasted address made a shape: code for a GitHub file, a card for a Jira issue, a link card for the rest. */
  function pasteAddress(address: string, at?: { x: number; y: number }) {
    const kind: DiagramNodeKind = codeSourceOf(address) !== null ? 'code' : jiraKeyOf(address) !== null ? 'jira' : 'link';
    const size = MADE[kind];
    const box = document.querySelector('[data-testid="diagram-canvas"]')?.getBoundingClientRect();
    const middle = box === undefined ? { x: 0, y: 0 } : flow.screenToFlowPosition({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
    const centre = at ?? middle;
    const made: DiagramNodeData = {
      id: freshId('n'),
      kind,
      label: '',
      x: snap(centre.x - size.w / 2),
      y: snap(centre.y - size.h / 2),
      w: size.w,
      h: size.h,
      layer: placing,
      ...(kind === 'link' ? { link: address } : { source: kind === 'jira' ? (jiraKeyOf(address) as string) : address }),
    };
    change({ ...drawing, nodes: [...drawing.nodes, made] });
    setSelectedNodes([made.id]);
    setSelectedEdges([]);
  }

  function paste(from: DiagramDrawing | null = clipboard, at?: { x: number; y: number } | null) {
    if (from === null || (from.nodes.length === 0 && from.edges.length === 0)) return;
    if (from.nodes.length === 0) {
      // Lines alone go back between the boxes they joined, where those are still here: a line cut and pasted is put back.
      const lines = from.edges
        .filter((edge) => byId.has(edge.from) && byId.has(edge.to))
        .map((edge) => ({ ...edge, id: freshId('e'), layer: layers.some((one) => one.id === edge.layer) ? edge.layer : placing }));
      if (lines.length === 0) return;
      change({ ...drawing, edges: [...drawing.edges, ...lines] });
      setSelectedNodes([]);
      setSelectedEdges(lines.map((edge) => edge.id));
      return;
    }
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
    // A line goes to the copy of each box it joined, or to the box itself where only the line was picked at that end.
    const edges = from.edges
      .map((edge) => ({
        ...edge,
        layer: layers.some((one) => one.id === edge.layer) ? edge.layer : placing,
        id: freshId('e'),
        from: renamed.get(edge.from) ?? (byId.has(edge.from) ? edge.from : ''),
        to: renamed.get(edge.to) ?? (byId.has(edge.to) ? edge.to : ''),
      }))
      .filter((edge) => edge.from !== '' && edge.to !== '');
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

  /**
   * The selected shapes turned a quarter turn clockwise about their own
   * middles. A group is not turned: it is a frame around other shapes, and
   * what is inside it is placed by the canvas's own axes.
   */
  function rotate() {
    const chosen = new Set(selectedNodes);
    if (!drawing.nodes.some((node) => chosen.has(node.id) && node.kind !== 'group')) return;
    change({
      ...drawing,
      nodes: drawing.nodes.map((node) =>
        chosen.has(node.id) && node.kind !== 'group' ? { ...node, rotation: (((node.rotation ?? 0) + 90) % 360) || undefined } : node,
      ),
    });
  }

  /** A turned shape dragged by a corner: the upright box it comes to, as its own resizer worked it out. */
  const turnedResizeNow = useRef<TurnedResize>({ start: () => {}, to: () => {}, end: () => {} });
  turnedResizeNow.current = {
    start: () => begin(),
    to: (id: string, box: { x: number; y: number; w: number; h: number }) => {
      if (viewing) return;
      setNode(id, { x: box.x, y: box.y, w: Math.max(GRID * 3, box.w), h: Math.max(GRID * 3, box.h) });
    },
    end: () => window.requestAnimationFrame(() => end()),
  };
  // One object for as long as the page is open: every shape reads it, and a new one would draw them all again.
  const turnedResize = useMemo<TurnedResize>(
    () => ({
      start: () => turnedResizeNow.current.start(),
      to: (id, box) => turnedResizeNow.current.to(id, box),
      end: () => turnedResizeNow.current.end(),
    }),
    [],
  );

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

  // The commit reads the drawing as it is now through a ref, so what every shape and line is handed changes only with what is being typed over.
  const commitNow = useRef(commitLabel);
  commitNow.current = commitLabel;
  const labelEditing = useMemo(
    () => ({ target: labelling, commit: (text: string) => commitNow.current(text), cancel: () => setLabelling(null), most: labelMost }),
    [labelling, labelMost],
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
  useAutosave(unsaved, drawn, answering || gestureStart.current !== null, save);

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

  const keys = useRef({ undo, redo, save, remove, duplicate, rotate, copy, cut, paste: () => paste(clipboard, pointerAt.current), nudge, arrange, label: () => {}, escape: () => {}, addMenu: () => {}, marquee: () => {} });
  keys.current = {
    undo,
    redo,
    save,
    remove,
    duplicate,
    rotate,
    copy,
    cut,
    paste: () => paste(clipboard, pointerAt.current),
    nudge,
    arrange,
    label: startLabelling,
    addMenu: openAddMenu,
    marquee: () => setMarqueeFold(marquee ? '' : 'on'),
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
      else if (matches(event, rotateKey)) run(keys.current.rotate);
      else if (matches(event, addKey)) run(keys.current.addMenu);
      else if (matches(event, selectKey)) run(keys.current.marquee);
      else if (event.key.startsWith('Arrow') && !event.ctrlKey && !event.metaKey) {
        const step = event.shiftKey ? GRID : 1;
        const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
        const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
        run(() => keys.current.nudge(dx, dy));
      }
    };
    document.addEventListener('keydown', pressed);
    return () => document.removeEventListener('keydown', pressed);
  }, [undoKey, redoKey, saveKey, duplicateKey, copyKey, cutKey, pasteKey, zoomInKey, zoomOutKey, arrangeKey, findKey, modeKey, rotateKey, addKey, selectKey, flow]);

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
  /*
   * The chat is a panel of its own on the canvas's left, open unless it was
   * folded away - which this browser remembers - and dragged wider by its
   * right edge. The two panels share what the canvas leaves them.
   */
  const [chatFold, setChatFold] = useSieve('diagram.editor.chat');
  const chatShown = chatFold !== 'hidden';
  const chatWidest = editorWidth > 0 ? Math.max(CHAT_NARROWEST, editorWidth - CANVAS_NARROWEST - PANEL_NARROWEST) : null;
  const chatWidth = useDragSize({ storageKey: 'orknux.diagram.chat-width', initial: 340, min: CHAT_NARROWEST, max: chatWidest, edge: 'right' });
  const panelWidest = editorWidth > 0 ? Math.max(PANEL_NARROWEST, editorWidth - CANVAS_NARROWEST - (chatShown ? chatWidth.size : 0)) : null;
  const panelWidth = useDragSize({ storageKey: 'orknux.diagram.panel-width', initial: 340, min: PANEL_NARROWEST, max: panelWidest, edge: 'left' });

  // The conversation, drawn in its own panel on the left of the canvas.
  const chatPart = (
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
    />
  );

  const calls = useSteady<CanvasCalls>({
    onNodesChange,
    onEdgesChange,
    onConnect,
    onConnectStart: () => {
      connecting.current = true;
      hoverHandle(null, 1);
    },
    onConnectEnd,
    onEdgeMouseEnter: (_, edge) => setHoveredEdge(edge.id),
    onEdgeMouseLeave: (_, edge) => setHoveredEdge((now) => (now === edge.id ? null : now)),
    onNodeDragStart: () => {
      if (!viewing) begin();
    },
    onNodeDoubleClick: (_, node) => {
      setSelectedNodes([node.id]);
      setSelectedEdges([]);
      // A link card is opened by a double click, as a file is: its name comes from what it leads to.
      const held = byId.get(node.id);
      if (held?.kind === 'link' && held.link !== undefined && held.link !== '') {
        linkCtx.open(held.link);
        return;
      }
      if (!viewing) setLabelling({ kind: 'node', id: node.id });
    },
    onEdgeDoubleClick: (event, edge) => {
      setSelectedEdges([edge.id]);
      setSelectedNodes([]);
      if (viewing) return;
      // The label goes where the line was double-clicked, not where the line's middle happens to be.
      const trace = LINE_TRACES.get(edge.id);
      if (trace !== undefined && trace.length > 1) {
        const share = Math.round(shareNearest(trace, flow.screenToFlowPosition({ x: event.clientX, y: event.clientY })) * 1000) / 1000;
        change({ ...drawing, edges: drawing.edges.map((one) => (one.id === edge.id ? { ...one, labelAt: share } : one)) });
      }
      setLabelling({ kind: 'edge', id: edge.id });
    },
    onNodeDragStop: (_, node, dragged) => {
      if (!viewing) onDragStop(node.id, dragged.map((one) => one.id));
    },
    // A selection dragged by the frame round it is the same gesture, and React Flow names it differently.
    onSelectionDragStart: () => {
      if (!viewing) begin();
    },
    onSelectionDragStop: (_, dragged) => {
      if (!viewing) onDragStop(undefined, dragged.map((one) => one.id));
    },
    onPaneClick: () => {
      setMenu(null);
      setRightMenu(null);
    },
    // A right click on a box or a line selects it, where it was not already, and opens what can be done to it there. Not in View: the browser's own menu stays.
    onNodeContextMenu: (event, node) => {
      if (viewing) return;
      event.preventDefault();
      if (!selectedNodes.includes(node.id)) {
        setSelectedNodes([node.id]);
        setSelectedEdges([]);
      }
      setRightMenu({ x: event.clientX, y: event.clientY });
    },
    onEdgeContextMenu: (event, edge) => {
      if (viewing) return;
      event.preventDefault();
      if (!selectedEdges.includes(edge.id)) {
        setSelectedEdges([edge.id]);
        setSelectedNodes([]);
      }
      setRightMenu({ x: event.clientX, y: event.clientY });
    },
    onSelectionContextMenu: (event) => {
      if (viewing) return;
      event.preventDefault();
      setRightMenu({ x: event.clientX, y: event.clientY });
    },
    onPaneContextMenu: () => setRightMenu(null),
    // Moving the canvas by hand stops following: the person wants to look elsewhere. A move the code makes has no event.
    onMoveStart: (event) => {
      if (event !== null && following !== null) setFollowing(null);
    },
    onMoveEnd: (_event, view) => {
      // Shapes moved into view may be read now.
      setMoved((count) => count + 1);
      if (!viewSettled.current) return;
      try {
        window.localStorage.setItem(viewKey, JSON.stringify({ x: view.x, y: view.y, zoom: view.zoom }));
      } catch {
        // A browser that keeps nothing fits the diagram again next time.
      }
    },
  });

  // After every hook: a diagram gone while it is open changes no hook's place in the order.
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
            <ZoomReadout />
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
          <button
            type="button"
            className={shell.tool}
            onClick={rotate}
            disabled={!selectedNodes.some((id) => byId.get(id) !== undefined && byId.get(id)?.kind !== 'group')}
            title={`${t('Rotate')} (${rotateKey})`}
            aria-label={t('Rotate')}
            data-testid="diagram-rotate"
          >
            <img src={rotateIcon} alt="" width={16} height={16} />
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
        {chatShown ? (
          <>
            <div className={`${shell.panel} ${chat.panel} ${styles.chatPanel}`} id="diagram-chat" style={{ flexBasis: chatWidth.size }} data-testid="diagram-chat-panel">
              <div className={styles.chatPanelHead}>
                <button
                  type="button"
                  className={styles.chatFold}
                  onClick={() => setChatFold('hidden')}
                  aria-expanded
                  aria-controls="diagram-chat"
                  aria-label={t('Hide the chat')}
                  title={t('Hide the chat')}
                  data-testid="diagram-chat-hide"
                >
                  <img src={panelCollapseIcon} alt="" width={14} height={14} className={styles.chatFoldBack} />
                </button>
              </div>
              {chatPart}
            </div>
            <ResizeHandle
              className={styles.panelHandle}
              orientation="vertical"
              label={t('Width of the chat')}
              controls="diagram-chat"
              valueNow={chatWidth.size}
              valueMin={CHAT_NARROWEST}
              valueMax={chatWidest ?? chatWidth.size}
              title={t('Drag to change the width; double-click to put it back')}
              dragging={chatWidth.dragging}
              handlers={chatWidth.handlers}
            />
          </>
        ) : null}
        <div
          className={`${styles.canvas} ${spaceHeld ? styles.canvasLooking : ''}`}
          data-looking={spaceHeld ? 'true' : undefined}
          data-testid="diagram-canvas"
          onMouseMove={(event) => {
            const at = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
            pointerAt.current = at;
            pointerOnScreen.current = { x: event.clientX, y: event.clientY };
            live.point(at.x, at.y);
          }}
          onMouseLeave={() => {
            pointerAt.current = null;
            pointerOnScreen.current = null;
            live.point(null, null);
            hoverHandle(null, 0);
          }}
          onMouseOver={(event) => hoverHandle(event.target, event.buttons)}
          /*
           * A click on the handle whose suggestion is showing takes it. Before
           * the canvas hears of the click, so the box the handle belongs to is
           * not selected in its place.
           */
          onClickCapture={(event) => {
            if (suggestion === null || viewing || !(event.target instanceof Element)) return;
            const handle = event.target.closest('.react-flow__handle');
            if (handle === null || handle.getAttribute('data-nodeid') !== suggestion.from || handle.getAttribute('data-handleid') !== suggestion.side) return;
            event.stopPropagation();
            takeSuggestion(suggestion);
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
                  {selectedNodes.some((id) => byId.get(id) !== undefined && byId.get(id)?.kind !== 'group') && (
                    // Left open, so a shape can be turned twice or three times from the one menu.
                    <button type="button" role="menuitem" className={styles.menuItem} onClick={rotate} data-testid="diagram-right-rotate">
                      {`${t('Rotate')} (${rotateKey})`}
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
            {addMenu !== null && !viewing && (
              <DiagramAddMenu
                at={addMenu}
                basics={[
                  ...SHAPES.map((one) => ({ kind: one.kind, icon: one.icon, label: one.label() })),
                  { kind: 'image' as const, icon: pictureIcon, label: t('Picture') },
                  { kind: 'link' as const, icon: linkToolIcon, label: t('Link') },
                  { kind: 'code' as const, icon: codeIcon, label: t('Code from GitHub') },
                  { kind: 'jira' as const, icon: jiraIcon, label: t('Jira issue') },
                ]}
                labelOf={kindLabel}
                closeKey={addKey}
                onPick={addPicked}
                onClose={() => setAddMenu(null)}
              />
            )}
            <LinkOpenContext.Provider value={linkCtx}>
            <ViewingContext.Provider value={viewing || spaceHeld}>
            <TurnedResizeContext.Provider value={turnedResize}>
            <LabelEditingContext.Provider value={labelEditing}>
            <LinkEndsContext.Provider value={linkEnds}>
            {/* Inside the canvas, so the marks take its ink and paper. */}
            <MarkerDefs />
            <ReactFlow<ShapeNode, LinkEdge>
              nodes={nodes}
              edges={edges}
              nodeTypes={NODE_TYPES}
              edgeTypes={EDGE_TYPES}
              {...calls}
              // A press on a handle that barely moves is a click, which takes the suggestion shown there; further, and it is a line dragged out.
              connectionDragThreshold={CLICK_SLACK}
              connectOnClick={false}
              // An end is moved by the grip the canvas draws on it - see LinkEnds - and not by React Flow's unseen anchors.
              edgesReconnectable={false}
              nodesDraggable={!viewing && !spaceHeld}
              nodesConnectable={!viewing && !spaceHeld}
              elementsSelectable={!spaceHeld}
              zoomOnDoubleClick={false}
              connectionMode={ConnectionMode.Loose}
              connectionLineComponent={ConnectionPreview}
              deleteKeyCode={null}
              multiSelectionKeyCode={MANY_KEYS}
              /*
               * Rectangle select: a drag on empty canvas draws a rectangle and
               * selects what it touches, and the canvas is moved with the
               * middle button - the right one keeps its menu. Off, a drag
               * moves the canvas and Shift-drag selects, as it always has.
               */
              selectionOnDrag={marquee && !viewing && !spaceHeld}
              panOnDrag={marquee && !viewing && !spaceHeld ? MIDDLE_BUTTON : true}
              selectionMode={SelectionMode.Partial}
              minZoom={0.1}
              maxZoom={4}
              proOptions={NO_ATTRIBUTION}
            >
              <Background variant={BackgroundVariant.Dots} gap={GRID * 3} size={1.5} />
              <AlignmentGuides guides={guides} />
              <SuggestionGhost suggestion={viewing ? null : suggestion} />
              {mapShown && (
                <MiniMap<ShapeNode>
                  position="bottom-right"
                  className={styles.minimap}
                  style={MAP_SIZE}
                  bgColor="var(--diagram-desk)"
                  maskColor="var(--diagram-map-mask)"
                  maskStrokeColor="var(--diagram-select)"
                  maskStrokeWidth={2}
                  nodeColor={mapFill}
                  nodeStrokeColor={mapStroke}
                  nodeStrokeWidth={3}
                  nodeBorderRadius={3}
                  ariaLabel={t('Map of the diagram')}
                  pannable
                  zoomable
                />
              )}
              <Panel position="bottom-right" style={mapShown ? MAP_BESIDE : undefined}>
                <div className={styles.cornerTools} data-testid="diagram-corner-tools">
                  {!viewing && (
                    <button
                      type="button"
                      className={styles.cornerTool}
                      onClick={() => setMarqueeFold(marquee ? '' : 'on')}
                      aria-pressed={marquee}
                      aria-label={`${t('Rectangle select')} (${selectKey})`}
                      title={`${t('Rectangle select')} (${selectKey})\n${marquee ? t('On: a drag on the canvas selects what it touches; the middle button pans.') : t('Off: a drag on the canvas pans. Shift-drag selects at any time.')}`}
                      data-testid="diagram-select-mode"
                    >
                      <img src={marqueeIcon} alt="" width={16} height={16} />
                    </button>
                  )}
                  <button
                    type="button"
                    className={styles.cornerTool}
                    onClick={() => setMapFold(mapShown ? 'off' : '')}
                    aria-pressed={mapShown}
                    aria-label={t('Map of the diagram')}
                    title={mapShown ? t('Hide the map') : t('Show the map')}
                    data-testid="diagram-minimap-toggle"
                  >
                    <img src={mapIcon} alt="" width={16} height={16} />
                  </button>
                </div>
              </Panel>
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
              {/* Folded, the chat is only its button, in the canvas's top left corner as the layers are in the right. */}
              {!chatShown && (
                <Panel position="top-left">
                  <div className={`${styles.layersCorner} ${styles.chatCorner}`}>
                    <button
                      type="button"
                      className={`${form.ghost} ${styles.layersButton}`}
                      onClick={() => setChatFold('')}
                      aria-expanded={false}
                      aria-label={t('Show the chat')}
                      title={t('Show the chat')}
                      data-testid="diagram-chat-show"
                    >
                      <img src={messageIcon} alt="" width={18} height={18} />
                    </button>
                  </div>
                </Panel>
              )}
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
              <Panel position="top-right" className={`${styles.canvasCorner} ${styles.topRight}`}>
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
              {/*
                Layers, as draw.io has them, top of the stack first: beside View
                and Edit in the canvas's top right corner, out of the toolbar, and
                opening downwards. Usable in View too: hiding a layer to read the
                rest is reading.
              */}
              <div className={`${styles.menuHolder} ${styles.layersCorner}`}>
                <button
                  type="button"
                  className={`${form.ghost} ${styles.layersButton}`}
                  onClick={() => setMenu(menu === 'layers' ? null : 'layers')}
                  aria-expanded={menu === 'layers'}
                  title={t('Layers')}
                  data-testid="diagram-layers"
                >
                  <img src={layersIcon} alt="" width={18} height={18} />
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
              <PointersOnCanvas pointers={live.pointers} />
            </ReactFlow>
            </LinkEndsContext.Provider>
            </LabelEditingContext.Provider>
            </TurnedResizeContext.Provider>
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
          style={{ flexBasis: panelWidth.size }}
          data-testid="diagram-panel"
        >
          <div className={styles.panelSettings} id="diagram-panel-settings" data-testid="diagram-panel-settings">
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
                  maxLength={labelMost}
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
              {/* A code card keeps its own dark paper, which its highlighting is coloured for. */}
              {oneNode.kind !== 'code' && (
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
              )}
              {oneNode.kind !== 'image' && oneNode.kind !== 'code' && oneNode.kind !== 'jira' && oneNode.kind !== 'link' && (
                <TextStyleField
                  labels={[oneNode.label]}
                  onChange={(restyle) => change({ ...drawing, nodes: drawing.nodes.map((node) => (node.id === oneNode.id ? { ...node, label: restyle(node.label) } : node)) })}
                />
              )}
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
              {(oneNode.kind === 'code' || oneNode.kind === 'jira') && (
                <SourceField
                  key={oneNode.id}
                  node={oneNode}
                  read={(() => {
                    const kind = sourceKindOf(oneNode.kind);
                    return kind === null || oneNode.source === undefined ? undefined : reads.get(`${kind}|${oneNode.source}`);
                  })()}
                  workspaceId={workspaceId}
                  onSource={(source) => change({ ...drawing, nodes: drawing.nodes.map((node) => (node.id === oneNode.id ? { ...node, source } : node)) })}
                  onRefresh={() => {
                    const kind = sourceKindOf(oneNode.kind);
                    if (kind !== null && oneNode.source !== undefined) void readSource(kind, oneNode.source, true);
                  }}
                />
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
              {oneNode.kind !== 'group' && (
                <label className={styles.field}>
                  <span>{t('Rotation')}</span>
                  <span className={styles.rotationRow}>
                    <input
                      type="number"
                      className={form.input}
                      min={0}
                      max={359}
                      step={15}
                      value={oneNode.rotation ?? 0}
                      aria-label={t('Rotation in degrees')}
                      onFocus={begin}
                      onBlur={end}
                      onChange={(event) => {
                        const said = Number(event.target.value);
                        if (!Number.isFinite(said)) return;
                        // Brought into one turn, as the server keeps it: 360 is upright, and -90 is 270.
                        const whole = ((Math.round(said) % 360) + 360) % 360;
                        setNode(oneNode.id, { rotation: whole === 0 ? undefined : whole });
                      }}
                      data-testid="diagram-node-rotation"
                    />
                    <button type="button" className={shell.tool} onClick={rotate} title={`${t('Rotate')} (${rotateKey})`} aria-label={t('Rotate')} data-testid="diagram-node-rotate">
                      <img src={rotateIcon} alt="" width={16} height={16} />
                    </button>
                  </span>
                </label>
              )}
              {(() => {
                // Where its words sit is offered for a shape that has room to move them in: not a card, a picture, a class's compartments or an icon's caption.
                const seated =
                  oneNode.kind !== 'link' && oneNode.kind !== 'image' && oneNode.kind !== 'code' && oneNode.kind !== 'jira' && oneNode.kind !== 'class' && outlineOf(oneNode.kind, oneNode.w, oneNode.h)?.icon !== true;
                // What the kind does by itself is kept as nothing at all, so a drawing says only what somebody chose.
                const usualAcross: DiagramTextAlign = oneNode.kind === 'text' || oneNode.kind === 'group' ? 'left' : 'center';
                const usualDown: DiagramTextValign = oneNode.kind === 'group' ? 'top' : 'middle';
                const across = oneNode.align ?? usualAcross;
                const down = oneNode.valign ?? usualDown;
                return (
                  <div className={styles.field} data-testid="diagram-node-text">
                    <span>{t('Text')}</span>
                    <div className={styles.textRow}>
                      {seated && (
                        <>
                          <span className={styles.textGroup} role="group" aria-label={t('Text across')}>
                            {TEXT_ACROSS.map((one) => (
                              <button
                                key={one.value}
                                type="button"
                                className={styles.textChoice}
                                aria-pressed={across === one.value}
                                aria-label={one.label()}
                                title={one.label()}
                                onClick={() => setNode(oneNode.id, { align: one.value === usualAcross ? undefined : one.value })}
                                data-testid={`diagram-node-align-${one.value}`}
                              >
                                <img src={one.icon} alt="" width={16} height={16} />
                              </button>
                            ))}
                          </span>
                          <span className={styles.textGroup} role="group" aria-label={t('Text down')}>
                            {TEXT_DOWN.map((one) => (
                              <button
                                key={one.value}
                                type="button"
                                className={styles.textChoice}
                                aria-pressed={down === one.value}
                                aria-label={one.label()}
                                title={one.label()}
                                onClick={() => setNode(oneNode.id, { valign: one.value === usualDown ? undefined : one.value })}
                                data-testid={`diagram-node-valign-${one.value}`}
                              >
                                <img src={one.icon} alt="" width={16} height={16} />
                              </button>
                            ))}
                          </span>
                        </>
                      )}
                      <TextSizeField
                        key={oneNode.id}
                        value={oneNode.textFit === true ? undefined : oneNode.textSize}
                        usual={oneNode.kind === 'group' || oneNode.kind === 'image' ? 13 : oneNode.kind === 'code' ? 12 : 14}
                        onChange={(size) => setNode(oneNode.id, { textSize: size, textFit: undefined })}
                        onFocus={begin}
                        onBlur={end}
                      />
                      {seated && (
                        <button
                          type="button"
                          className={styles.textChoice}
                          aria-pressed={oneNode.textFit === true}
                          aria-label={t('Fit the text to the shape')}
                          title={t('Fit the text to the shape')}
                          onClick={() => setNode(oneNode.id, { textFit: oneNode.textFit === true ? undefined : true })}
                          data-testid="diagram-node-text-fit"
                        >
                          <img src={fitIcon} alt="" width={16} height={16} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })()}
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
                  maxLength={labelMost}
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
                    <div className={styles.fieldPair}>
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
                    </div>
                    {/* A line bent by hand is made straight - or curved - again here, as well as bend by bend on the canvas. */}
                    {(oneEdge.points?.length ?? 0) > 0 && (oneEdge.routing ?? 'straight') !== 'right-angles' && (
                      <button
                        type="button"
                        className={form.ghost}
                        onClick={() => change({ ...drawing, edges: drawing.edges.map((edge) => (edge.id === oneEdge.id ? { ...edge, points: undefined, labelAt: undefined } : edge)) })}
                        data-testid="diagram-edge-unbend"
                      >
                        {oneEdge.points?.length === 1 ? t('Take out its bend') : tf('Take out its {count} bends', { count: oneEdge.points?.length ?? 0 })}
                      </button>
                    )}
                    <StrokeField
                      label={t('Line colour')}
                      colour={oneEdge.color}
                      width={oneEdge.width}
                      onChange={({ colour, width }) =>
                        change({ ...drawing, edges: drawing.edges.map((edge) => (edge.id === oneEdge.id ? { ...edge, color: colour, width } : edge)) })
                      }
                      testId="diagram-edge-stroke-field"
                    />
                    <div className={styles.fieldPair}>
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
                    </div>
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
          {/* Several shapes: their fill and their words, all at once - the side panel says what one shape's does. */}
          {selectedNodes.length > 1 && (() => {
            const many = drawing.nodes.filter((node) => selectedNodes.includes(node.id) && node.kind !== 'code' && node.kind !== 'image');
            if (many.length === 0) return null;
            const fills = new Set(many.map((node) => node.color));
            const fill = fills.size === 1 ? [...fills][0] : null;
            const paint = (colour: string | undefined) => change({ ...drawing, nodes: drawing.nodes.map((node) => (many.some((one) => one.id === node.id) ? { ...node, color: colour } : node)) });
            return (
              <>
                <div className={styles.field} data-testid="diagram-many-fill">
                  <span>{t('Colour')}</span>
                  <div className={styles.strokeRow}>
                    <button type="button" className={`${styles.swatch} ${styles.swatchNone} ${fill === undefined ? styles.swatchOn : ''}`} onClick={() => paint(undefined)} aria-label={t('No colour')} title={t('No colour')} data-testid="diagram-many-fill-none" />
                    {SWATCHES.map((colour) => (
                      <button key={colour} type="button" className={`${styles.swatch} ${fill === colour ? styles.swatchOn : ''}`} style={{ background: colour }} onClick={() => paint(colour)} aria-label={colour} title={colour} data-testid="diagram-many-fill-colour" />
                    ))}
                  </div>
                </div>
                {many.some((node) => node.kind !== 'jira' && node.kind !== 'link') && (
                  <TextStyleField
                    labels={many.filter((node) => node.kind !== 'jira' && node.kind !== 'link').map((node) => node.label)}
                    onChange={(restyle) => change({ ...drawing, nodes: drawing.nodes.map((node) => (many.some((one) => one.id === node.id) && node.kind !== 'jira' && node.kind !== 'link' ? { ...node, label: restyle(node.label) } : node)) })}
                  />
                )}
              </>
            );
          })()}
          </fieldset>
          </div>
          {/* Here and not in the chat's foot: the chat may be folded away, and a diagram that did not save has to say so. */}
          {error !== null && diagram !== null && (
            <p className={form.error} role="alert" data-testid="diagram-error">
              {error}
            </p>
          )}
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
