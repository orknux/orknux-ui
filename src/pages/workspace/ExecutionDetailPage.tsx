import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Background,
  BackgroundVariant,
  Handle,
  Position,
  ReactFlow,
  useReactFlow,
} from '@xyflow/react';
import type { ReactFlowInstance, Viewport } from '@xyflow/react';
import type { Edge, Node, NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import {
  STATUS_LABEL,
  TRIGGER_LABEL,
  fetchExecution,
  fetchWorkspaceExecutions,
  formatDuration,
  rerunExecution,
  rerunExecutionStep,
  stopExecution,
} from '../../api/executions';
import { ImageZoom } from '../../components/ImageZoom';
import type { Picture } from '../../components/ImageZoom';
import type {
  ExecutionDetail,
  ExecutionPicture,
  ExecutionSpeech,
  ExecutionStep,
  StepStatus,
} from '../../api/executions';
import { NODE_KIND_LABEL } from '../../api/graph';
import type { NodeKind } from '../../api/graph';
import type { SessionUser } from '../../api/session';
import clockIcon from '../../assets/clock.svg';
import downloadIcon from '../../assets/download.svg';
import refreshIcon from '../../assets/refresh-cw.svg';
import searchIcon from '../../assets/search.svg';
import terminalIcon from '../../assets/terminal.svg';
import { AppShell } from '../../components/AppShell';
import { AutoRefresh } from '../../components/AutoRefresh';
import { BackLink } from '../../components/BackLink';
import { ResizeHandle, useDragSize, useRoom, useWindowHeight } from '../../components/DragSize';
import { FoldBody, FoldToggle, useFold } from '../../components/Fold';
import { Loader } from '../../components/Loader';
import { WorkspaceSidebar } from '../../components/WorkspaceSidebar';
import { shellUser } from '../../session/user';
import styles from './ExecutionDetailPage.module.css';
import { t } from '../../i18n';

export interface ExecutionDetailPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

const KIND_CLASS: Record<NodeKind, string> = {
  TRIGGER: 'trigger',
  AGENT: 'agent',
  ACTION: 'action',
  CONDITION: 'condition',
  OBJECT: 'objectNode',
  // Listed for completeness rather than because it happens: a session node is
  // a declaration the agent reads, so no run ever records a step of this kind.
  SESSION: 'session',
  IMAGE: 'image',
  DECISION: 'decision',
};

const STEP_STATUS_LABEL: Record<StepStatus, string> = {
  PENDING: 'Pending',
  RUNNING: 'Running',
  WAITING: 'Waiting',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
  SKIPPED: 'Skipped',
};

/** What each canvas node carries; React Flow keeps it under `data`. */
interface StepNodeData extends Record<string, unknown> {
  kind: NodeKind;
  name: string;
  description: string | null;
  status: StepStatus;
  duration: string;
  /** What actually happened to this step, once the run has ended. */
  outcome: StepOutcome;
}

/**
 * What a step's box says, which is not quite its status.
 *
 * A step still `PENDING` in a run that has ended was never reached, and the node
 * that ended the run is not merely "completed" — it is the answer that stopped
 * everything after it. Neither is a status the server keeps, because both are
 * about the run as a whole.
 */
type StepOutcome =
  | 'done'
  | 'failed'
  | 'running'
  | 'waiting'
  | 'not-met'
  | 'skipped'
  | 'start'
  | 'pending'
  | 'carried';

function outcomeOf(
  step: ExecutionStep,
  runEnded: boolean,
  stoppedAtNodeKey: string | null,
): StepOutcome {
  /*
   * Carried over answers the question this graph asks - what did this run do
   * with this node - and the answer is nothing. The status and the times beside
   * it were copied from the run this one was started from, so reading them as
   * work done here would be reading them wrong. The status behind the copy is
   * still in the panel, for anyone who wants it.
   */
  if (step.carriedOver) return 'carried';
  if (step.key === stoppedAtNodeKey) return 'not-met';
  if (step.kind === 'TRIGGER') return 'start';
  if (step.status === 'PENDING') return runEnded ? 'skipped' : 'pending';
  if (step.status === 'SKIPPED') return 'skipped';
  if (step.status === 'FAILED') return 'failed';
  if (step.status === 'RUNNING') return 'running';
  if (step.status === 'WAITING') return 'waiting';
  return 'done';
}

const OUTCOME_LABEL: Record<StepOutcome, string> = {
  done: 'Ran',
  failed: 'Failed',
  running: 'Running',
  waiting: 'Waiting',
  'not-met': t('Condition not met'),
  skipped: 'Skipped',
  start: t('Started here'),
  pending: 'Pending',
  carried: t('Carried over'),
};

/** The mark in the corner: what happened, at a glance. */
const OUTCOME_MARK: Record<StepOutcome, string> = {
  done: '✓',
  failed: '✕',
  running: '',
  waiting: '',
  'not-met': '✕',
  skipped: '–',
  start: '▶',
  pending: '',
  carried: '↻',
};

/** A node as it ran: the editor's card plus the outcome badge and its duration. */
function StepNodeView({ data, selected }: NodeProps) {
  const step = data as StepNodeData;
  const classes = [styles.node, styles[`outcome-${step.outcome}` as keyof typeof styles] as string];
  if (selected) classes.push(styles.nodeSelected);

  return (
    <div className={classes.filter(Boolean).join(' ')}>
      <span className={`${styles.accentBar} ${styles[KIND_CLASS[step.kind]]}`} aria-hidden="true" />
      {step.kind !== 'TRIGGER' && <Handle className={styles.handle} type="target" position={Position.Left} />}
      <Handle className={styles.handle} type="source" position={Position.Right} />

      <div className={styles.nodeContent}>
        <div className={styles.metaRow}>
          <span className={styles.kindLabel}>{NODE_KIND_LABEL[step.kind]}</span>
          <OutcomeMark outcome={step.outcome} />
        </div>
        <span className={styles.nodeName}>{step.name}</span>
        <span className={styles.outcomeLabel}>{OUTCOME_LABEL[step.outcome]}</span>
        <span className={styles.nodeDuration}>{step.duration}</span>
      </div>
    </div>
  );
}

/** The mark a node carries in its corner: what happened to it. */
function OutcomeMark({ outcome }: { outcome: StepOutcome }) {
  return (
    <span
      className={`${styles.stepBadge} ${styles[`mark-${outcome}` as keyof typeof styles] as string}`}
      title={OUTCOME_LABEL[outcome]}
      aria-label={OUTCOME_LABEL[outcome]}
    >
      {OUTCOME_MARK[outcome]}
    </span>
  );
}

const nodeTypes = { stepNode: StepNodeView };

/**
 * How big a step's box is, said rather than discovered.
 *
 * React Flow draws a node it has no measurement for with `visibility: hidden`,
 * and it throws every measurement away whenever the node objects are replaced -
 * which this page does on every read of the run, because the objects are built
 * from the answer. Normally the browser measures them again on the next frame
 * and nobody sees the gap. When the read lands in the same batch as the
 * measurement it did land, React never renders the state in between, the effect
 * that would observe the boxes again never re-runs, and the ResizeObserver has
 * no size change to report - so the nodes stay hidden for as long as the page is
 * open. That is the empty graph: four boxes, positioned, framed, and invisible.
 *
 * The size was never worth discovering. Every line in the box is one ellipsised
 * row, so it is exactly this size whatever the run put in it - the stylesheet
 * fixes the width and four rows fix the height. Given up front, there is no
 * state in which a node has no size, and no frame in which one is not drawn.
 *
 * It is given twice, and the second time is issue #259. `initialWidth` answers
 * "how big is a box nothing has measured yet", which is what decides whether a
 * node is drawn; `measured` answers "this box has been measured", which is what
 * decides whether the *lines* are drawn. React Flow keeps where a node's handles
 * are in its own bookkeeping, and it keeps them across a rebuild only for a node
 * whose object carries `measured` - `parseHandles` in @xyflow/system throws them
 * away for a node that does not. An edge is nothing but two handle positions, so
 * an edge whose node has none is not drawn at all: nodes on the canvas, no lines
 * between them, which is precisely what was reported.
 *
 * That is why the #235 fix did not cover this. It made the boxes appear and left
 * the lines behind them, and every read of the run erased all of them for a
 * frame - and for good whenever the frame that would put them back never came,
 * which is the same race #235 and #242 were about. These nodes are exactly as
 * tall as this says, so nothing is being claimed here that a measurement would
 * contradict; the editor's nodes hand `measured` back through `onNodesChange`
 * and this page, which has no such door, says it itself.
 */
const NODE_WIDTH = 200;
const NODE_HEIGHT = 90;

/**
 * Frames the graph on what is actually drawn.
 *
 * React Flow's own `fitView` does nothing in this canvas. It fits to the sizes it
 * has measured, and it never measures these nodes: `useNodesInitialized` reports
 * false forever, with the nodes rendered, absolutely positioned at their
 * coordinates, 200x92 each, and their handles in place. Every route into the fit
 * therefore did nothing — the `fitView` prop, which fits on initialisation, and the
 * two effects that called `fitView` themselves. The viewport kept its identity
 * transform, and a run wider than the card showed two of its four steps with
 * nothing to say the others were off to the right.
 *
 * So the viewport is computed here instead, from the one source that is definitely
 * right: the elements on the page. Each node carries its own `translate(x, y)` in
 * flow coordinates, and `offsetWidth`/`offsetHeight` are layout sizes, unaffected
 * by the scale on the ancestor — so the extent of the graph can be read off the DOM
 * whatever React Flow believes. `setViewport` only sets a transform and needs no
 * measurement of its own, which is why it works where `fitView` does not.
 */
function frameGraph(flow: ReactFlowInstance, canvas: HTMLElement): void {
  const drawn = [...canvas.querySelectorAll<HTMLElement>('.react-flow__node')];
  if (drawn.length === 0) return;

  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;

  for (const node of drawn) {
    const at = /translate\(\s*([-\d.]+)px,\s*([-\d.]+)px\s*\)/.exec(node.style.transform);
    if (at === null) continue;
    const x = Number(at[1]);
    const y = Number(at[2]);
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x + node.offsetWidth);
    bottom = Math.max(bottom, y + node.offsetHeight);
  }

  const width = right - left;
  const height = bottom - top;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;

  const room = { width: canvas.clientWidth, height: canvas.clientHeight };
  if (room.width === 0 || room.height === 0) return;

  /*
   * Never magnified. A run of two steps blown up to fill the card looks like a
   * different application than the same run with eight, and the nodes are drawn at
   * the size somebody chose.
   */
  const zoom = Math.min(room.width / (width * PADDING), room.height / (height * PADDING), 1);

  flow.setViewport({
    x: room.width / 2 - (left + width / 2) * zoom,
    y: room.height / 2 - (top + height / 2) * zoom,
    zoom,
  });
}

/** How much bigger than the graph the view is, so nothing sits against an edge. */
const PADDING = 1.2;

/**
 * Frames the graph when the run's steps change.
 *
 * Two frames — one for React to commit the nodes, one for the browser to lay them
 * out — and once more shortly after, for a layout that lands later still. Framing
 * twice is cheap and lands in the same place; not framing at all was the bug.
 *
 * Keyed on which steps there are rather than how many, so selecting one (which
 * rebuilds the node objects) does not yank the viewport back mid-inspection.
 */
function FitWhenReady({ signature, held, runId }: { signature: string; held: { current: boolean }; runId: string }) {
  const flow = useReactFlow();

  useEffect(() => {
    if (signature === '') return;
    /*
     * Where somebody left the canvas, put back before anything is framed.
     *
     * A browser reload - the F5 kind, or a tab restored - starts this page
     * from nothing, and framing on arrival threw away the zoom somebody had
     * settled on a minute earlier. The viewport is kept per run for the tab's
     * lifetime, written on every pan or zoom, and a page that finds one opens
     * on it and stays out of the way, the way a hand on the canvas does.
     */
    const kept = keptViewport(runId);
    if (kept !== null) {
      held.current = true;
      flow.setViewport(kept);
      return;
    }
    /*
     * Not once somebody has moved the canvas themselves.
     *
     * A run that is still going gains steps as it goes, and with the page
     * refreshing every second that is a new signature every second - so a
     * viewport framed on every one of them pulled the zoom back from under
     * whoever was looking at a node. Framing is for arriving at the page; a
     * hand on the canvas outranks it.
     */
    if (held.current) return;

    let cancelled = false;
    const frame = () => {
      const canvas = document.querySelector<HTMLElement>('.react-flow');
      if (!cancelled && canvas !== null) frameGraph(flow, canvas);
    };

    const first = requestAnimationFrame(() => requestAnimationFrame(frame));
    const again = window.setTimeout(frame, LATE_FIT_MS);

    return () => {
      cancelled = true;
      cancelAnimationFrame(first);
      window.clearTimeout(again);
    };
  }, [signature, flow, held]);

  return null;
}

/** Long enough for a slow layout, short enough not to be seen as a jump. */
const LATE_FIT_MS = 250;

/* -------------------------------------------------------------- the panels
 *
 * Three windows onto things much bigger than the window.
 *
 * The graph is a run's whole shape in 332px, which for anything past half a
 * dozen steps is a picture zoomed out until the boxes are unreadable. The log is
 * one long line per step and about four of them at a time. The node panel holds
 * a step's input and output as JSON and a picture it drew, in 390px.
 *
 * All three can be dragged now - the graph and the log by their bottom edge, the
 * node panel by its left edge, with the main column giving way - and each keeps
 * what it was dragged to. One key per panel, so making the log tall to read one
 * run does not also commit to a tall graph.
 *
 * The sizes they open at are the sizes they have always had, so nothing on this
 * page looks different until it is dragged.
 */
const GRAPH_KEY = 'orknux.run.graph-height';
const LOGS_KEY = 'orknux.run.logs-height';
const PANEL_KEY = 'orknux.run.panel-width';

const DEFAULT_GRAPH = 332;
const DEFAULT_LOGS = 340;
const DEFAULT_PANEL = 390;

/*
 * How little each can be dragged to.
 *
 * The graph's floor is about two node boxes and the space between them - below
 * that there is no picture, only a corner of one. The log's is three or four
 * lines, which is what makes it a log rather than a strip. The panel's is the
 * width its own headings and buttons need before they start wrapping mid-word.
 */
const MIN_GRAPH = 160;
const MIN_LOGS = 120;
const MIN_PANEL = 300;

/*
 * And how much.
 *
 * The heights are capped against the window rather than at a number: "as tall as
 * this screen, less the page header" is a ceiling somebody can reach and cannot
 * drag past, where a fixed number is short on a tall screen and off the bottom
 * on a short one.
 *
 * The panel's ceiling is what the row can spare once the main column still has
 * room for a graph - it is the main column that gives way, and a rail dragged
 * over the whole page would leave nothing to look at the details of.
 */
const PAGE_CHROME = 160;
const MIN_MAIN = 460;

/** The handle's own track: the room between the two columns, which neither gets. */
const HANDLE_WIDTH = 24;

/** One press of an arrow key. Coarse enough that a few presses get somewhere. */
const NUDGE = 24;

/** Where a run's canvas is kept between reloads: this tab, this run. */
const viewportKey = (runId: string) => `run-view:${runId}`;

function keptViewport(runId: string): Viewport | null {
  try {
    const held = sessionStorage.getItem(viewportKey(runId));
    if (held === null) return null;
    const parsed = JSON.parse(held) as Partial<Viewport>;
    if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number' || typeof parsed.zoom !== 'number') return null;
    return { x: parsed.x, y: parsed.y, zoom: parsed.zoom };
  } catch {
    return null;
  }
}

function keepViewport(runId: string, viewport: Viewport): void {
  try {
    sessionStorage.setItem(viewportKey(runId), JSON.stringify(viewport));
  } catch {
    // A tab that keeps nothing frames on arrival, as it always did.
  }
}

/**
 * Why a run names a workflow it cannot open.
 *
 * Removing a workflow deletes the workspace's assignment and leaves the runs;
 * this is the whole of what the page can say about that, and it says it twice —
 * where the link used to be, and beside the name in the summary — because
 * neither place is where everybody looks.
 */
const REMOVED_NOTE = t('This workflow has been removed from the workspace. The run is kept; there is no workflow to open.');

export function ExecutionDetailPage({ session, onSignOut }: ExecutionDetailPageProps) {
  const { workspaceId = '', executionId = '' } = useParams();

  const [run, setRun] = useState<ExecutionDetail | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [logFilter, setLogFilter] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const navigate = useNavigate();
  const [rerunning, setRerunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    if (executionId === '') return;
    setRefreshing(true);
    fetchExecution(executionId)
      .then((found) => {
        if (found === null) {
          setLoadError(t('That run does not exist, or you do not have access to it.'));
          return;
        }
        setRun(found);
      })
      .catch((cause: unknown) => {
        setLoadError(cause instanceof Error ? cause.message : t('Could not load the run.'));
      })
      .finally(() => setRefreshing(false));
  }, [executionId]);

  useEffect(load, [load]);

  const runEnded = run !== null && run.status !== 'RUNNING';

  /*
   * Which of the three cards are folded to their headings. Remembered per card
   * and for every run, in `Fold`; see there for why.
   */
  const [summaryOpen, toggleSummary] = useFold('run.summary');
  const [graphOpen, toggleGraph] = useFold('run.graph');
  const [logsOpen, toggleLogs] = useFold('run.logs');

  /**
   * React Flow fits the view when it mounts, which is before the card has been
   * laid out — so it fitted an empty box and the graph landed off-screen. It is
   * fitted again once there is something to fit and somewhere to fit it into.
   */
  const [flow, setFlow] = useState<ReactFlowInstance | null>(null);

  const nodes: Node[] = useMemo(
    () =>
      (run?.steps ?? []).map((step) => ({
        id: step.key,
        type: 'stepNode',
        position: { x: step.x, y: step.y },
        // What the box measures, before anything has measured it, and what it
        // measures once something has - which is what keeps the lines. See above.
        initialWidth: NODE_WIDTH,
        initialHeight: NODE_HEIGHT,
        measured: { width: NODE_WIDTH, height: NODE_HEIGHT },
        selected: step.key === selectedKey,
        data: {
          kind: step.kind,
          name: step.name,
          description: step.description,
          status: step.status,
          duration: formatDuration(step.durationSeconds),
          outcome: outcomeOf(step, runEnded, run?.stoppedAtNodeKey ?? null),
        } satisfies StepNodeData,
      })),
    [run, selectedKey, runEnded],
  );

  /** Which steps the graph is showing, so a refit follows the run and not the cursor. */
  const signature = useMemo(() => nodes.map((node) => node.id).join('|'), [nodes]);

  /**
   * Whether anybody has moved the canvas by hand.
   *
   * A ref rather than state: nothing is drawn differently because of it, and a
   * re-render for every pan would be a re-render for every pixel of one.
   */
  const viewHeld = useRef(false);

  /*
   * What the three panels have been dragged to.
   *
   * `src/components/DragSize.tsx` is the whole of the mechanism - the pointer,
   * the keyboard, the clamp and the one line of storage - and it is the same one
   * the function editor's divider uses. What is said here is only what this page
   * knows: which edge each panel is taken hold of by, and how little and how much
   * of it is any use.
   */
  const tall = useWindowHeight();
  const graph = useDragSize({
    storageKey: GRAPH_KEY,
    initial: DEFAULT_GRAPH,
    min: MIN_GRAPH,
    max: Math.max(MIN_GRAPH, tall - PAGE_CHROME),
    edge: 'bottom',
    nudge: NUDGE,
  });
  const logs = useDragSize({
    storageKey: LOGS_KEY,
    initial: DEFAULT_LOGS,
    min: MIN_LOGS,
    max: Math.max(MIN_LOGS, tall - PAGE_CHROME),
    edge: 'bottom',
    nudge: NUDGE,
  });
  /** The row the column and the panel share, watched: the panel's ceiling is a share of it. */
  const [setLayout, room] = useRoom('width');
  const widestPanel = Math.max(MIN_PANEL, room - HANDLE_WIDTH - MIN_MAIN);
  const panel = useDragSize({
    storageKey: PANEL_KEY,
    initial: DEFAULT_PANEL,
    min: MIN_PANEL,
    // Null until the row has been measured; a ceiling worked out from a width of
    // zero is the floor, and would throw away a stored width on the first pass.
    max: room === 0 ? null : widestPanel,
    edge: 'left',
    nudge: NUDGE,
  });

  const edges: Edge[] = useMemo(() => {
    const outcomes = new Map(
      (run?.steps ?? []).map((step) => [
        step.key,
        outcomeOf(step, runEnded, run?.stoppedAtNodeKey ?? null),
      ]),
    );
    return (run?.edges ?? []).map((edge) => {
      // A path the run never took is drawn as one it never took.
      const notTaken = outcomes.get(edge.target) === 'skipped';
      /*
       * The line a run can only take on a failure, in the colour it is drawn in
       * the editor. Two lines leave a node that handles its own failure and
       * arrive somewhere different; drawn in the same grey, the picture says the
       * run branched and nothing about why.
       */
      const failure = edge.branch === 'FAILURE';
      return {
        // The branch is in the id: an action's two ways out can reach the same
        // node, and without it those are one line drawn twice.
        id: `${edge.source}-${edge.branch ?? 'plain'}->${edge.target}`,
        source: edge.source,
        target: edge.target,
        animated: outcomes.get(edge.target) === 'running',
        className: notTaken ? styles.edgeSkipped : undefined,
        style: failure ? { stroke: 'var(--color-danger)', strokeWidth: 2 } : undefined,
      };
    });
  }, [run, runEnded]);

  useEffect(() => {
    if (flow === null || nodes.length === 0) return;
    const fit = () => {
      /*
       * Not once somebody has moved the canvas, or a reload put it back where
       * they left it. This is the second framing path on the page, keyed on
       * the nodes - which are rebuilt on every refresh of the run, every
       * second while it goes - and it was the one that kept pulling the zoom
       * back after the first had learnt to stop: the refresh rebuilt the
       * nodes, this ran, and the hand on the canvas counted for nothing.
       */
      if (viewHeld.current) return;
      const element = document.querySelector<HTMLElement>('.react-flow');
      if (element !== null) frameGraph(flow, element);
    };
    const frame = requestAnimationFrame(fit);

    // The card is laid out after the graph mounts, and the panel opening
    // changes its width; both are a reason to fit again.
    const canvas = document.querySelector(`.${styles.canvas}`);
    const observer = canvas === null ? null : new ResizeObserver(fit);
    if (canvas !== null) observer?.observe(canvas);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [flow, nodes]);

  const selected = run?.steps.find((step) => step.key === selectedKey) ?? null;

  // With a node selected the log narrows to that node, as the design shows it.
  const visibleLogs = (run?.logs ?? []).filter((line) => {
    if (selected !== null && line.nodeKey !== selected.key) return false;
    if (logFilter.trim() === '') return true;
    return line.message.toLowerCase().includes(logFilter.trim().toLowerCase());
  });

  /**
   * Starts a run from this one and follows it the moment it exists. Issue #540.
   *
   * With the inline engine - Temporal off, which is how a development server
   * runs - a run happens on the thread that asked for it, so the mutation does
   * not answer until the whole new run has finished: minutes, for an agent. The
   * new run was visibly going on its own page while this button read
   * "Queueing…" for all of it. So while the answer is awaited, the newest runs
   * of this workflow are looked at once a second, and the one whose startedFrom
   * is this run is followed as soon as it appears. Temporal answers at once
   * and the answer wins; either way somebody lands on the new run.
   */
  async function followRerun(start: () => Promise<ExecutionDetail>) {
    const pressed = Date.now();
    let followed = false;
    const go = (id: string) => {
      if (followed) return;
      followed = true;
      // Cleared as it leaves: the new run's page may be this component again,
      // and would otherwise inherit a button still reading "Queueing…".
      setRerunning(false);
      navigate(`/workspace/${workspaceId}/executions/${id}`);
    };
    const watch = window.setInterval(() => {
      if (followed || !run) return;
      void (async () => {
        const recent = await fetchWorkspaceExecutions(workspaceId, 0, 5, { workflowId: run.workflowId });
        for (const candidate of recent.content) {
          if (followed) return;
          // Only runs started since the press; a second either side for clocks.
          if (new Date(candidate.startedAt).getTime() < pressed - 1000) continue;
          if (candidate.id === executionId) continue;
          const detail = await fetchExecution(candidate.id);
          if (detail?.startedFrom === executionId) go(candidate.id);
        }
      })().catch(() => undefined);
    }, 1000);
    try {
      const queued = await start();
      go(queued.id);
    } finally {
      window.clearInterval(watch);
    }
  }

  async function handleRerun() {
    if (rerunning) return;
    setRerunning(true);
    try {
      await followRerun(() => rerunExecution(executionId));
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : t('Could not re-run.'));
    } finally {
      /*
        Always, rather than only when it failed. A navigation that does not
        happen - a route that will not match, a guard that sends somebody
        elsewhere - would otherwise leave the button saying "Queueing…" for
        good, which is the bug this is fixing rather than a smaller cousin of it.
      */
      setRerunning(false);
    }
  }

  /*
   * Asks the run to stop. The engine ends it before its next step and a stopped
   * run is terminal, so this shows the run as it comes back - running still,
   * until the engine notices - and the auto-refresh reads it becoming stopped.
   * Issue #395.
   */
  async function handleStop() {
    if (stopping) return;
    setStopping(true);
    try {
      setRun(await stopExecution(executionId));
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : t('Could not stop the run.'));
    } finally {
      setStopping(false);
    }
  }

  /*
   * The panel calls this and shows what comes back out of it. It deliberately
   * does not catch: which steps can be started from is the server's judgement,
   * and the panel puts the server's own sentence beside the button it refused.
   */
  async function rerunFromStep(nodeKey: string) {
    // A run started from a step is still a new run; follow it as Re-run does,
    // as soon as it exists rather than once it has finished. Issue #514, #540.
    await followRerun(() => rerunExecutionStep(executionId, nodeKey));
  }

  function downloadLogs() {
    const text = (run?.logs ?? [])
      .map((line) => `[${timeOf(line.at)}] ${line.message}`)
      .join('\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `run-${executionId}.log`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell
      title={run?.workflowName}
      user={shellUser(session)}
      workspacePath={`/workspace/${workspaceId}`}
      showAdmin={session.admin}
      onSignOut={onSignOut}
      sidebar={<WorkspaceSidebar workspaceId={workspaceId} />}
      /*
       * A run is a long page - a summary, a graph, and a step for every node -
       * so it scrolls inside the frame rather than growing it. Growing pushed
       * everything below the fold, the attribution bar included, which is the
       * one thing on the page that has to stay where it is.
       */
      scrollContent
    >
      {/* Outside the columns: the header belongs to the page, so the cards and
          the node panel both start under it rather than the panel starting level
          with the breadcrumb. */}
      <div className={styles.headerRow}>
        <header className={styles.contentHeader}>
            <p className={styles.breadcrumb}>
              <BackLink to={`/workspace/${workspaceId}/executions`} label={t('Executions')} />
              <Link className={styles.crumbLink} to={`/workspace/${workspaceId}/executions`}>
                {t('Executions')}
              </Link>
              <span className={styles.crumbSeparator}>/</span>
              <span className={styles.crumbCurrent}>Run #{executionId}</span>
            </p>

            <div className={styles.statusHeader}>
              <div className={styles.headerLeft}>
                {run !== null && (
                  <span className={`${styles.statusBadge} ${styles[run.status.toLowerCase()]}`}>
                    <span className={styles.statusDot} aria-hidden="true" />
                    {STATUS_LABEL[run.status]}
                  </span>
                )}
                <h1 className={styles.title}>{run?.workflowName ?? '…'}</h1>
                {/*
                  A run outlives the workflow's place in the workspace. Once the
                  assignment is gone there is nothing at the other end of this
                  link — it rendered "No workflow assignment with id 373", which
                  reads as a broken page rather than as a workflow that was
                  removed — so what is offered instead is the sentence saying so.
                  The name in the heading beside it is still the run's own.
                */}
                {run !== null &&
                  (run.workflowAssigned ? (
                    <Link className={styles.viewWorkflow} to={`/workspace/${workspaceId}/workflows/${run.workflowId}/editor`}>
                      {t('View Workflow')}
                    </Link>
                  ) : (
                    <span className={styles.workflowGone} title={REMOVED_NOTE}>
                      {t('Workflow removed')}
                    </span>
                  ))}
                <span className={styles.duration}>
                  <img src={clockIcon} alt="" width={14} height={14} />
                  {formatDuration(run?.durationSeconds ?? null)}
                </span>
              </div>
              {/* A run in flight changes on its own; this is how the page keeps up. */}
              {/* Reloading is skipped while a load is in flight, so the timer
                  cannot stack ticks behind a slow one. */}
              <button
                type="button"
                className={styles.refresh}
                onClick={load}
                disabled={refreshing}
                title={t('Reload this run')}
              >
                <img src={refreshIcon} alt="" width={14} height={14} />
                {refreshing ? t('Refreshing…') : 'Refresh'}
              </button>
              <AutoRefresh onRefresh={load} busy={refreshing} />
              {/* Only while it is running: a stopped run is terminal, so once
                  it has ended there is nothing to stop. Issue #395. */}
              {run?.status === 'RUNNING' && (
                <button type="button" className={styles.stop} onClick={handleStop} disabled={stopping}>
                  {stopping ? t('Stopping…') : t('Stop')}
                </button>
              )}
              <button type="button" className={styles.rerun} onClick={handleRerun} disabled={run === null || rerunning}>
                <img src={refreshIcon} alt="" width={14} height={14} />
                {rerunning ? t('Queueing…') : 'Re-run'}
              </button>
              {/*
                What this page shows is what each node did. Every attempt behind
                that is Temporal's history — a screen that already exists, so it
                is offered rather than rebuilt. Absent where nothing is exposed.
              */}
              {run?.temporalUrl != null && run.temporalUrl !== '' && (
                <a
                  className={styles.refresh}
                  href={run.temporalUrl}
                  target="_blank"
                  rel="noreferrer"
                  title={t('This run in Temporal, attempt by attempt')}
                >{t('Open in Temporal')}</a>
              )}
            </div>
        </header>
      </div>

      <div
        className={[
          styles.layout,
          selected === null ? null : styles.layoutWithPanel,
          // While the rail is being dragged the whole row says so: the pointer is
          // captured by the handle and can be well outside it, and a press that
          // began on the handle would otherwise sweep a selection across the
          // column it crosses.
          panel.dragging ? styles.layoutDragging : null,
        ]
          .filter((one) => one !== null)
          .join(' ')}
        ref={setLayout}
      >
        <div className={styles.main}>
          {loadError !== null ? (
            <section className={styles.card}>
              <p className={styles.loadError} role="alert">
                {loadError}
              </p>
            </section>
          ) : run === null ? (
            <section className={styles.card}>
              <Loader />
            </section>
          ) : (
            <>
              <section className={styles.card}>
                <h2 className={styles.cardTitle}>
                  <FoldToggle open={summaryOpen} onToggle={toggleSummary} controls="run-summary">
                    {t('Summary')}
                  </FoldToggle>
                </h2>
                <FoldBody id="run-summary" open={summaryOpen}>
                <dl className={styles.summary}>
                  <SummaryRow label={t('Run ID')}>#{executionId}</SummaryRow>
                  {/* Where this run came from, for a run that came of re-running
                      another. Only the id is kept, and only the id is needed:
                      the workflow is the same one named two rows below. */}
                  {run?.startedFrom != null && (
                    <SummaryRow label={t('Started from')}>
                      <Link
                        className={styles.summaryLink}
                        to={`/workspace/${workspaceId}/executions/${run.startedFrom}`}
                      >
                        Run #{run.startedFrom}
                      </Link>
                    </SummaryRow>
                  )}
                  <SummaryRow label={t('Status')}>
                    {run !== null && (
                      <span className={`${styles.statusBadge} ${styles[run.status.toLowerCase()]}`}>
                        <span className={styles.statusDot} aria-hidden="true" />
                        {STATUS_LABEL[run.status]}
                      </span>
                    )}
                  </SummaryRow>
                  <SummaryRow label={t('Workflow')}>
                    {run === null ? (
                      '—'
                    ) : (
                      <>
                        {run.workflowName}
                        {!run.workflowAssigned && <span className={styles.removedNote}>{REMOVED_NOTE}</span>}
                      </>
                    )}
                  </SummaryRow>
                  <SummaryRow label={t('Triggered by')}>
                    {run === null ? '—' : TRIGGER_LABEL[run.trigger]}
                  </SummaryRow>
                  <SummaryRow label={t('Started')} mono>
                    {formatStamp(run?.startedAt)}
                  </SummaryRow>
                  <SummaryRow label={t('Finished')} mono>
                    {formatStamp(run?.finishedAt ?? null)}
                  </SummaryRow>
                  <SummaryRow label={t('Duration')}>{formatDuration(run?.durationSeconds ?? null)}</SummaryRow>
                  {run?.error != null && (
                    <SummaryRow label={t('Error')}>
                      <span className={styles.summaryError}>{run.error}</span>
                    </SummaryRow>
                  )}
                  {run?.stoppedAtNodeKey != null &&
                    (() => {
                      const stopped = run.steps.find((step) => step.key === run.stoppedAtNodeKey);
                      const name = stopped?.name ?? run.stoppedAtNodeKey;
                      return (
                        <SummaryRow label={t('Condition not met')}>
                          {/* The question that was asked is a click away, in the catalogue. */}
                          {stopped?.conditionId != null ? (
                            <Link
                              className={styles.summaryStopped}
                              to={`/workspace/${workspaceId}/conditions/${stopped.conditionId}`}
                            >
                              {name}
                            </Link>
                          ) : (
                            <span className={styles.summaryStopped}>{name}</span>
                          )}
                        </SummaryRow>
                      );
                    })()}
                </dl>
                </FoldBody>
              </section>

              <section className={styles.card}>
                <div className={styles.graphHeader}>
                  <h2 className={styles.cardTitle}>
                    <FoldToggle open={graphOpen} onToggle={toggleGraph} controls="run-graph-section">
                      {t('Workflow Graph')}
                    </FoldToggle>
                  </h2>
                  {run !== null && (
                    <span className={`${styles.graphStatus} ${styles[run.status.toLowerCase()]}`}>
                      <span className={styles.statusDot} aria-hidden="true" />
                      {STATUS_LABEL[run.status]}
                    </span>
                  )}
                </div>

                {/*
                  Folded, the canvas is not hidden but gone: React Flow is
                  unmounted and mounts afresh on the way back, the same as on
                  arriving at the page. A canvas kept under `display: none`
                  measures as nothing, and the framing and the handles it keeps
                  would then be worked out from a box of zero - so unfolding
                  starts from the path that is known to draw. The nodes carry
                  their size and `measured` (see NODE_WIDTH), `onInit` hands
                  over the new instance, and `FitWhenReady` frames it or puts
                  back the viewport this tab kept for the run.
                */}
                <FoldBody id="run-graph-section" open={graphOpen}>
                {run !== null && run.steps.length === 0 ? (
                  <p className={styles.notice}>{t('No step detail was recorded for this run.')}</p>
                ) : (
                  <div className={styles.canvas} id="run-graph" style={{ height: graph.size }}>
                    <ReactFlow
                      onInit={(instance) => setFlow(instance)}
                      nodes={nodes}
                      edges={edges}
                      nodeTypes={nodeTypes}
                      onNodeClick={(_, node) => setSelectedKey(node.id)}
                      // A pan or a zoom by hand; see `viewHeld`. React Flow
                      // does not raise these for a viewport set in code, so
                      // the framing this page does cannot switch itself off.
                      onMoveStart={() => {
                        viewHeld.current = true;
                      }}
                      // And where it ended up, kept for a reload of this tab.
                      onMoveEnd={(_, viewport) => {
                        viewHeld.current = true;
                        keepViewport(executionId, viewport);
                      }}
                      onPaneClick={() => setSelectedKey(null)}
                      nodesDraggable={false}
                      nodesConnectable={false}
                      edgesFocusable={false}
                      // No fitView prop: it used to do nothing (see frameGraph) and,
                      // once the nodes were measured, did the wrong thing - a fit on
                      // initialisation, clamped to a minimum zoom of 0.5, landing on
                      // top of the viewport a reload had just put back. The page
                      // frames the graph itself, and a run wider than the card sits
                      // below 0.5, so the floor is lowered to what framing shows.
                      minZoom={0.1}
                      proOptions={{ hideAttribution: true }}
                    >
                      <FitWhenReady signature={signature} held={viewHeld} runId={executionId} />
                      <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#27272a" />
                    </ReactFlow>
                  </div>
                )}

                {/*
                  The graph's bottom edge, taken hold of.

                  Only where there is a graph: the card draws a sentence instead
                  when the run recorded no steps, and a handle for the height of a
                  sentence is a control that does nothing.

                  Nothing here tells React Flow about the new height. It does not
                  need telling - the canvas already has a ResizeObserver on it
                  that reframes the graph, which is what the panel opening used to
                  be the only reason for - and the flow fills whatever box it is
                  given, so a drag that arrives before the reframe shows more
                  background rather than a clipped picture.
                */}
                {run !== null && run.steps.length > 0 && (
                  <ResizeHandle
                    orientation="horizontal"
                    label={t('Height of the workflow graph')}
                    controls="run-graph"
                    valueNow={graph.size}
                    valueMin={MIN_GRAPH}
                    valueMax={Math.max(MIN_GRAPH, tall - PAGE_CHROME)}
                    title={t('Drag to change the height; double-click to put it back')}
                    dragging={graph.dragging}
                    handlers={graph.handlers}
                  />
                )}
                </FoldBody>
              </section>

              <section className={styles.card}>
                <div className={styles.logsHeader}>
                  <h2 className={styles.logsTitle}>
                    <FoldToggle open={logsOpen} onToggle={toggleLogs} controls="run-logs-section">
                      <img src={terminalIcon} alt="" width={16} height={16} />
                      Logs{selected === null ? '' : ` — ${selected.name}`}
                    </FoldToggle>
                  </h2>
                  <div className={styles.logControls}>
                    {/* The filter goes with the lines it filters; the download
                        does not need them on the screen, so it stays. */}
                    {logsOpen && (
                    <span className={styles.logSearch}>
                      <img src={searchIcon} alt="" width={12} height={12} />
                      <input
                        className={styles.logSearchField}
                        type="search"
                        placeholder={t('Filter logs...')}
                        value={logFilter}
                        onChange={(event) => setLogFilter(event.target.value)}
                        aria-label={t('Filter logs')}
                      />
                    </span>
                    )}
                    <button
                      type="button"
                      className={styles.download}
                      onClick={downloadLogs}
                      aria-label={t('Download logs')}
                      title={t('Download logs')}
                    >
                      <img src={downloadIcon} alt="" width={14} height={14} />
                    </button>
                  </div>
                </div>

                <FoldBody id="run-logs-section" open={logsOpen}>
                <div className={styles.terminal} id="run-logs" style={{ height: logs.size }}>
                  {visibleLogs.length === 0 ? (
                    <p className={styles.terminalEmpty}>
                      {run?.logs.length === 0 ? t('This run produced no log.') : t('Nothing matches that filter.')}
                    </p>
                  ) : (
                    visibleLogs.map((line) => (
                      <p key={line.id} className={styles.terminalLine}>
                        <span className={styles.terminalTime}>[{timeOf(line.at)}]</span>
                        <span className={styles[`level${line.level}`]}>{line.message}</span>
                      </p>
                    ))
                  )}
                </div>

                {/*
                  A log line here is one long line, and about four of them fitted
                  in the 340px this box has always been. It is the panel on this
                  page most worth dragging and the one with least to go wrong: a
                  taller box is more lines and nothing else.
                */}
                <ResizeHandle
                  orientation="horizontal"
                  label={t('Height of the log')}
                  controls="run-logs"
                  valueNow={logs.size}
                  valueMin={MIN_LOGS}
                  valueMax={Math.max(MIN_LOGS, tall - PAGE_CHROME)}
                  title={t('Drag to change the height; double-click to put it back')}
                  dragging={logs.dragging}
                  handlers={logs.handlers}
                />
                </FoldBody>
              </section>
            </>
          )}
        </div>

        {selected !== null && (
          /*
            The panel's left edge, standing in the gap that used to be between the
            column and the rail. `.layoutWithPanel` takes that gap away, so the
            two are exactly as far apart as they have always been and there is
            something in between to take hold of.
          */
          <ResizeHandle
            orientation="vertical"
            className={styles.panelHandle}
            label={t('Width of the node details')}
            controls="run-node-details"
            valueNow={panel.size}
            valueMin={MIN_PANEL}
            valueMax={widestPanel}
            title={t('Drag to change the width; double-click to put it back')}
            dragging={panel.dragging}
            handlers={panel.handlers}
          />
        )}

        {selected !== null && (
          <NodeDetailsPanel
            /* Keyed on the step so that moving to another node starts the panel
               again, rather than carrying one node's refusal over to the next. */
            key={selected.key}
            step={selected}
            workspaceId={workspaceId}
            pictures={(run?.pictures ?? []).filter((picture) => picture.nodeKey === selected.key)}
            speeches={(run?.speeches ?? []).filter((speech) => speech.nodeKey === selected.key)}
            runEnded={run !== null && run.status !== 'RUNNING'}
            width={panel.size}
            onRerunFromHere={rerunFromStep}
            onClose={() => setSelectedKey(null)}
          />
        )}
      </div>
    </AppShell>
  );
}

function SummaryRow({ label, mono = false, children }: { label: string; mono?: boolean; children: React.ReactNode }) {
  return (
    <div className={styles.summaryRow}>
      <dt className={styles.summaryLabel}>{label}</dt>
      <dd className={mono ? `${styles.summaryValue} ${styles.mono}` : styles.summaryValue}>{children}</dd>
    </div>
  );
}

/** What the selected node was handed and what it produced. */
function NodeDetailsPanel({
  step,
  workspaceId,
  pictures,
  speeches,
  runEnded,
  width,
  onRerunFromHere,
  onClose,
}: {
  step: ExecutionStep;
  workspaceId: string;
  /** The pictures this step's image node drew, if it is one; empty otherwise. */
  pictures: ExecutionPicture[];
  /** What this step said out loud, if it is one that speaks; empty otherwise. */
  speeches: ExecutionSpeech[];
  /** True once the run has finished, so a pending step was never reached. */
  runEnded: boolean;
  /** What the rail has been dragged to; the page owns the number, the panel wears it. */
  width: number;
  /** Starts the workflow again from this step; rejects with the server's words. */
  onRerunFromHere: (nodeKey: string) => Promise<void>;
  onClose: () => void;
}) {
  /*
   * A step's input and output are JSON of any length, in a rail beside a graph.
   * Folded for every step and every run at once, like the cards beside it: the
   * point is not to scroll past an input of a thousand lines on every node.
   */
  const [inputOpen, toggleInput] = useFold('run.step-input');
  const [outputOpen, toggleOutput] = useFold('run.step-output');

  /** Which of this step's pictures is open over the page, or null while none is. */
  const [zoomed, setZoomed] = useState<Picture | null>(null);

  const [rerunning, setRerunning] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  async function handleRerunFromHere() {
    if (rerunning) return;
    setRerunning(true);
    setRefusal(null);
    try {
      await onRerunFromHere(step.key);
    } catch (cause) {
      /*
       * Shown as the server wrote it. It knows why a step cannot be started
       * from - the branch the earlier run took, a node the graph has since
       * lost, a field that was never produced - and guessing at those rules
       * here would mean a second, worse copy of them going stale on its own.
       */
      setRefusal(cause instanceof Error ? cause.message : t('Could not re-run from this step.'));
    } finally {
      // Always. Issue #514: cleared only on the failure, a re-run that worked
      // left this button reading "Queueing…" until the page was reloaded.
      setRerunning(false);
    }
  }

  /** Where the step's catalogue entry lives, when it came from one. */
  const definition =
    step.conditionId != null
      ? { label: t('Condition'), to: `/workspace/${workspaceId}/conditions/${step.conditionId}` }
      : step.actionId != null
        ? { label: t('Action'), to: `/workspace/${workspaceId}/actions/${step.actionId}` }
        : step.agentId != null
          ? { label: t('Agent'), to: `/workspace/${workspaceId}/agents/${step.agentId}/settings` }
          : null;

  return (
    <aside className={styles.panel} id="run-node-details" style={{ width }} aria-label={t('Node details')}>
      <div className={styles.panelHeader}>
        <h2 className={styles.panelTitle}>{t('Node Details')}</h2>
        <button type="button" className={styles.panelClose} onClick={onClose} aria-label={t('Close node details')}>
          ✕
        </button>
      </div>
      <p className={styles.panelSubtitle}>{t('Execution info for selected node')}</p>

      <PanelField label={t('Node name')}>{step.name}</PanelField>
      <PanelField label={t('Node type')}>{NODE_KIND_LABEL[step.kind]}</PanelField>
      {definition !== null && (
        <PanelField label={t('Defined by')}>
          <Link className={styles.panelLink} to={definition.to}>
            {`Open ${definition.label.toLowerCase()}`}
          </Link>
        </PanelField>
      )}
      {/* The conversation this step talked into, when it kept one. An agent
          node with a session wired to it writes its turns there, and this is
          the way from the run to it. Issue #387. */}
      {step.sessionId !== null && (
        <PanelField label={t('Session')}>
          <Link className={styles.panelLink} to={`/workspace/${workspaceId}/sessions/${step.sessionId}`}>
            {t('Open session')}
          </Link>
        </PanelField>
      )}
      <PanelField label={t('Status')}>
        <span className={`${styles.statusBadge} ${styles[stepStatusClass(step.status)]}`}>
          <span className={styles.statusDot} aria-hidden="true" />
          {/* A step still pending in a run that has ended was never reached. */}
          {step.status === 'PENDING' && runEnded ? t('Not reached') : STEP_STATUS_LABEL[step.status]}
        </span>
        {/* The status here, and the duration and times under it, belong to the
            run this one was started from rather than to this one. Unsaid, they
            read as work that happened here, which is the misleading part. */}
        {step.carriedOver && (
          <span className={styles.carriedNote}>{t('Carried over from the earlier run')}</span>
        )}
      </PanelField>
      {/*
        Which way the run left this step by. A condition answers Yes or No; an
        action that handles its own failure answers Failure, which is the one
        worth a sentence - a step that failed and a run that carried on look
        like a contradiction until the page says the failure was the answer.
      */}
      {step.branch !== null && (
        <PanelField label={t('Branch')}>
          {step.branch === 'FAILURE' ? (
            <>
              {t('Failure')}
              <span className={styles.carriedNote}>
                {t('The run carried on down this node\'s failure line rather than stopping here.')}
              </span>
            </>
          ) : step.branch === 'YES' ? (
            'Yes'
          ) : step.branch === 'OPTION' ? (
            <code>{step.branchOption ?? ''}</code>
          ) : step.branch === 'UNSURE' ? (
            t('Unsure')
          ) : (
            'No'
          )}
        </PanelField>
      )}
      {/*
        Said only where it says something. Every step has attempts, and one is
        what every step without a retry policy spends - a field reading 1 on
        every node in every run is a row nobody reads twice.
      */}
      {step.attempts > 1 && <PanelField label={t('Attempts')}>{step.attempts}</PanelField>}
      <PanelField label={t('Duration')}>{formatDuration(step.durationSeconds)}</PanelField>
      <PanelField label={t('Started')}>{timeOf(step.startedAt)}</PanelField>
      <PanelField label={t('Finished')}>{timeOf(step.finishedAt)}</PanelField>

      {/* The button the issue asked for. Never disabled on a rule worked out in
          the browser - only while the request it started is still out. */}
      <div className={styles.panelAction}>
        <button
          type="button"
          className={styles.rerunStep}
          onClick={handleRerunFromHere}
          disabled={rerunning}
        >
          <img src={refreshIcon} alt="" width={14} height={14} />
          {rerunning ? t('Queueing…') : t('Re-run from here')}
        </button>
        {refusal !== null && (
          <p className={styles.rerunRefusal} role="alert">
            {refusal}
          </p>
        )}
      </div>

      {step.error !== null && (
        <>
          <h3 className={styles.panelHeading}>{t('Error')}</h3>
          <pre className={`${styles.payload} ${styles.payloadError}`}>{step.error}</pre>
        </>
      )}

      <h3 className={styles.panelHeading}>
        <FoldToggle open={inputOpen} onToggle={toggleInput} controls="run-step-input">
          {t('Input')}
        </FoldToggle>
      </h3>
      <FoldBody id="run-step-input" open={inputOpen}>
        <pre className={styles.payload}>{prettyJson(step.input)}</pre>
      </FoldBody>

      <h3 className={styles.panelHeading}>
        <FoldToggle open={outputOpen} onToggle={toggleOutput} controls="run-step-output">
          {t('Output')}
        </FoldToggle>
      </h3>
      <FoldBody id="run-step-output" open={outputOpen}>
        <pre className={styles.payload}>{prettyJson(step.output)}</pre>
      </FoldBody>

      {pictures.length > 0 && (
        <>
          <h3 className={styles.panelHeading}>{pictures.length === 1 ? t('Picture') : t('Pictures')}</h3>
          <div className={styles.pictures}>
            {pictures.map((picture) => (
              <figure key={picture.id} className={styles.picture}>
                {/*
                  Clicking it opens it, the same gesture and the same viewer a
                  picture in a chat answers to.

                  The panel is a column beside a graph, so a picture arrives in
                  it at a few hundred pixels - which is a thumbnail of the thing
                  the step exists to have made. Downloading it was the only way
                  to see what was drawn, and that leaves the run behind.

                  A button rather than an onClick on the image, for the reason
                  Markdown's is one: it is a control, so it is reachable by
                  keyboard and says what it does.
                */}
                <button
                  type="button"
                  className={styles.pictureZoom}
                  onClick={() => setZoomed({ src: picture.url, alt: picture.prompt })}
                  aria-label={t('Open this picture larger')}
                  title={t('Click to open this picture larger')}
                >
                  {/* The bytes are served by ExecutionPictureAPI; a 404 draws the
                      broken-image icon, which is what says a picture was swept. */}
                  <img src={picture.url} alt={picture.prompt} className={styles.pictureImage} />
                </button>
                <figcaption className={styles.pictureCaption}>
                  <span className={styles.picturePrompt} title={picture.prompt}>{picture.prompt}</span>
                  <a className={styles.pictureDownload} href={picture.url} download={picture.filename}>
                    {t('Download')}
                  </a>
                </figcaption>
              </figure>
            ))}
          </div>

          <ImageZoom picture={zoomed} onClose={() => setZoomed(null)} />
        </>
      )}

      {/*
        What the step said out loud. Issue #264.

        A player rather than a download alone: the point of the file is that
        somebody listens to it, and a run page that could only hand it over
        would make checking what a node said a trip through a file manager.
        The words are printed beside it because audio cannot be skimmed - four
        of these are four identical rows without them.
      */}
      {speeches.length > 0 && (
        <>
          <h3 className={styles.panelHeading}>{speeches.length === 1 ? t('Audio') : t('Audio clips')}</h3>
          <div className={styles.speeches}>
            {speeches.map((speech) => (
              <figure key={speech.id} className={styles.speech}>
                {/* The bytes are served by ExecutionSpeechAPI; a 404 leaves the
                    player with nothing, which is what says it was swept. */}
                <audio className={styles.speechPlayer} controls preload="none" src={speech.url} />
                <figcaption className={styles.speechCaption}>
                  <span className={styles.speechSaid} title={speech.said}>{speech.said}</span>
                  <a className={styles.speechDownload} href={speech.url} download={speech.filename}>
                    {t('Download')}
                  </a>
                </figcaption>
              </figure>
            ))}
          </div>
        </>
      )}
    </aside>
  );
}

function PanelField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.panelField}>
      <span className={styles.panelLabel}>{label}</span>
      <span className={styles.panelValue}>{children}</span>
    </div>
  );
}

/** A running step reads like a running run, a failed one like a failed run. */
function stepStatusClass(status: StepStatus): string {
  switch (status) {
    case 'COMPLETED':
      return 'completed';
    case 'FAILED':
      return 'failed';
    // A waiting step has not finished, so it reads like one still going.
    case 'RUNNING':
    case 'WAITING':
      return 'running';
    default:
      return 'pending';
  }
}

/** "Jan 26, 2024 14:32:05", as the summary shows it. */
function formatStamp(iso: string | null | undefined): string {
  if (iso === null || iso === undefined) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const day = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
  return `${day} ${timeOf(iso)}`;
}

/** "14:32:05" — the log and the panel show the time alone. */
function timeOf(iso: string | null): string {
  if (iso === null) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

/** Payloads are stored as the engine wrote them; indent them when they are JSON. */
function prettyJson(raw: string | null): string {
  if (raw === null || raw.trim() === '') return '—';
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}
