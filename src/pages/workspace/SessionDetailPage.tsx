import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { readingShare, startChat, writingParts } from '../../api/chat';
import { FoldToggle } from '../../components/FoldToggle';
import { fetchInstallationSettings } from '../../api/installation';
import {
  EVENT_KINDS,
  EVENT_KIND_LABEL,
  fetchLlmSession,
  fetchSessionWriting,
  fetchLlmSessionEvents,
  removeLlmSession,
  fetchLlmSessionFamily,
  fetchSessionScratchpads,
  fetchSessionScratchpad,
  fetchSessionExecutions,
  createSessionScratchpad,
  writeSessionScratchpad,
  deleteSessionScratchpad,
} from '../../api/llmSessions';
import type {
  LlmSession,
  LlmSessionEvent,
  LlmSessionEventKind,
  LlmSessionEventOrder,
  LlmSessionEventPage,
  LlmSessionMember,
  SessionAgentDetails,
  SessionExecutionLink,
  SessionScratchpad,
  SessionScratchpadContent,
  SessionWriting,
} from '../../api/llmSessions';
import { STATUS_LABEL } from '../../api/executions';
import {
  deleteBoxPort,
  disableBoxPort,
  enableBoxPort,
  fetchSessionBoxLog,
  fetchSessionBoxPorts,
  fetchSessionBoxes,
} from '../../api/boxes';
import type { SessionBox, BoxEvent, BoxPort } from '../../api/boxes';
import { fetchSessionRequests, type InteractionRequest } from '../../api/interactions';
import { InteractionCard, placeRequests } from '../../components/InteractionCard';
import playIcon from '../../assets/play.svg';
import pauseIcon from '../../assets/pause.svg';
import trashIcon from '../../assets/trash-2.svg';
import { fetchSessionTodos } from '../../api/todos';
import { fetchSessionWatchers } from '../../api/watchers';
import type { Watcher } from '../../api/watchers';
import { statusLabel as watcherStatus, duration } from './WorkspaceWatchersPage';
import { fetchSessionTimers } from '../../api/sessionTimers';
import type { SessionTimer } from '../../api/sessionTimers';
import type { SessionTodo } from '../../api/todos';
import type { SessionUser } from '../../api/session';
import { timeAgo } from '../../api/tools';
import checkIcon from '../../assets/check.svg';
import chevronDown12Icon from '../../assets/chevron-down-12.svg';
import refreshIcon from '../../assets/refresh-cw.svg';
import searchIcon from '../../assets/search.svg';
import { AppShell } from '../../components/AppShell';
import { BackLink } from '../../components/BackLink';
import { AutoRefresh } from '../../components/AutoRefresh';
import { CompactPagination } from '../../components/CompactPagination';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { FieldHint } from '../../components/FieldHint';
import { Loader } from '../../components/Loader';
import { WorkspaceSidebar } from '../../components/WorkspaceSidebar';
import { usePageWithin } from '../../components/pageWithin';
import { shellUser } from '../../session/user';
import styles from './SessionDetailPage.module.css';
import { BoxOutput } from './BoxOutput';
import { t, tf } from '../../i18n';
import { moment, zoned } from '../../session/timeZone';

export interface SessionDetailPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

const PAGE_SIZE = 20;
const PAGE_SIZES = [20, 50, 100];
const SEARCH_PAUSE_MS = 300;
/** How often an active box session's log is asked for what is new. */
const BOX_POLL_MS = 2000;

/** "14:03:27" - a box log is read within one sitting, so the day is on hover. */
function clockOf(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? iso : at.toLocaleTimeString(undefined, zoned());
}

function parsed(data: string): unknown {
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}

/** The event's JSON, indented, or the text as it came where it is not JSON. */
function prettyJson(data: string): string {
  const value = parsed(data);
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

/** Keys that say what an event was about, read first and in this order. */
const BOX_SUMMARY_KEYS = ['command', 'cmd', 'path', 'exitCode', 'exit_code', 'status', 'message', 'error', 'output', 'stdout', 'stderr'];

/**
 * One line out of an event's JSON: the keys that say what happened first, then
 * any other plain values, cut to what fits a row. Nothing here knows every
 * event a box writes, so it reads what is there rather than a list of types.
 */
function boxSummary(data: string): string {
  const value = parsed(data);
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return oneLine(typeof value === 'string' ? value : JSON.stringify(value));
  }
  const held = value as Record<string, unknown>;
  const plain = (one: unknown) => typeof one === 'string' || typeof one === 'number' || typeof one === 'boolean';
  const keys = [
    ...BOX_SUMMARY_KEYS.filter((key) => key in held),
    // The execution id is what the output is read by, not something a reader of the line needs.
    ...Object.keys(held).filter((key) => !BOX_SUMMARY_KEYS.includes(key) && key !== 'executionId'),
  ].filter((key) => plain(held[key]) || (Array.isArray(held[key]) && (held[key] as unknown[]).every(plain)));
  const parts = keys.map((key) => {
    const one = held[key];
    const text = Array.isArray(one) ? one.join(' ') : String(one);
    if (key === 'command' || key === 'cmd') return `$ ${text}`;
    return `${key}: ${text}`;
  });
  return oneLine(parts.length === 0 ? JSON.stringify(held) : parts.join(' · '));
}

/** The execution an event is about, where it names one - what its output is read by. */
function executionOf(data: string): string | null {
  const value = parsed(data);
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = (value as Record<string, unknown>).executionId;
  return typeof id === 'string' && id !== '' ? id : typeof id === 'number' ? String(id) : null;
}

function oneLine(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > 200 ? `${flat.slice(0, 199)}…` : flat;
}

const ORDERS: { label: string; order: LlmSessionEventOrder }[] = [
  { label: t('Time'), order: 'AT' },
  { label: t('Kind'), order: 'KIND' },
];

/**
 * How much of one line is shown before it is folded.
 *
 * A tool call's arguments are whatever the model sent, and a file written by an
 * agent arrives as one of them - so a transcript with nothing holding it back is
 * one event per screen, and the shape of the conversation is lost.
 */
const FOLD_OVER_CHARS = 600;

/** The class each kind's badge and rule take, so four things read as four things. */
const KIND_CLASS: Record<LlmSessionEventKind, string> = {
  AGENT: 'kindAgent',
  TOOL: 'kindTool',
  USER: 'kindUser',
  SYSTEM: 'kindSystem',
  // A colour of its own, red with a tint behind it: in the agent's colour a
  // thought and the answer after it looked the same.
  THINKING: 'kindThinking',
  // A note the agent kept for itself — its own rule, so a reader scanning the
  // log picks out the few lines that were meant to survive it. Issue #409.
  NOTE: 'kindNote',
  // The agent's setup is drawn as its own block rather than a line, so this
  // only colours the filter chip: muted, like the machinery's own notes,
  // because it is the record of what answered and not part of the
  // conversation. Issue #441.
  AGENT_DETAILS: 'kindSystem',
};

/**
 * A tool call is the arguments as the model sent them, which is usually JSON and
 * is not always: indent what parses and leave the rest exactly as it arrived.
 */
function readable(kind: LlmSessionEventKind, content: string | null): string {
  const raw = content ?? '';
  if (kind !== 'TOOL') return raw;
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

/** The clock down the left of the transcript: the time of day, to the second. */
function timeOfDay(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return at.toLocaleTimeString(undefined, zoned({ hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
}

/** Which day a line falls on, so a fortnight of conversation is not one wall. */
function dayOf(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  return at.toLocaleDateString(undefined, zoned({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }));
}

/**
 * One block of a line: the text, folded while it is longer than a line should be.
 *
 * Its own component because a tool line has two of them now - what was asked and
 * what came back - and each folds on its own. Sharing one `open` between them
 * would mean opening a long answer to read a short call.
 */
function Block({
  text,
  code,
  label,
  folded,
}: {
  text: string;
  code: boolean;
  label?: string;
  /** Whether it is open, where the line's head holds the toggle rather than the block. */
  folded?: { open: boolean };
}) {
  const long = text.length > FOLD_OVER_CHARS;
  const [held, setOpen] = useState(false);
  const open = folded?.open ?? held;

  return (
    <>
      {label !== undefined && <p className={styles.blockLabel}>{label}</p>}
      {long && folded === undefined && <FoldToggle text={text} open={open} onToggle={() => setOpen((was) => !was)} />}
      {/*
        A tool's arguments are code and are read as code; what was said is
        prose, and monospacing prose makes a conversation look like a log.
      */}
      <pre className={`${styles.content} ${code ? styles.code : ''} ${long && !open ? styles.folded : ''}`}>
        {text}
      </pre>
    </>
  );
}

/**
 * How long a model thought, in words a person reads rather than milliseconds.
 *
 * Coarse on purpose: nobody waiting on a model cares about the last hundred
 * milliseconds of a two-minute think, and a figure that precise reads as a
 * measurement of the machine rather than an account of the wait.
 */
function thoughtFor(millis: number): string {
  const seconds = millis / 1000;
  if (seconds < 10) return `${seconds.toFixed(1)}s`;
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${Math.round(seconds - minutes * 60)}s`;
}

/** How many bytes a piece of text is, the unit the scratchpad budget is spent in. */
function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** A byte count in the words a person reads: bytes under a kilobyte, then KB. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/** One line of the transcript: what happened, and for a tool, what came back. */
function EventLine({ event, workspaceId }: { event: LlmSessionEvent; workspaceId: string }) {
  const text = readable(event.kind, event.content);
  const [open, setOpen] = useState(false);
  /* A turn summarised to fit its window: the settings that decide how are a press away. */
  const compacted = event.kind === 'SYSTEM' && (event.content ?? '').startsWith("The turn outgrew the model's window");

  /*
   * What the tool answered, where it answered anything.
   *
   * This was recorded from the start and never drawn, and the reason it was
   * not is written on the schema: a tool can return a whole file, and a
   * transcript that pastes one in is a transcript nobody can read. What
   * changed is that the recorder now trims a long field rather than keeping
   * every byte of it, so what reaches this page is the shape of the answer and
   * not its weight - and the shape is most of what somebody is looking for.
   *
   * Only for TOOL. The other kinds have nothing on the far side of them: an
   * agent's line is what it said, and there is no second half to show.
   */
  const answered = event.kind === 'TOOL' ? readable(event.kind, event.result) : '';
  /*
   * A line with one long block says its size and folds from its own head, on
   * the line with the time and "still thinking", rather than on a row of its
   * own under them. A tool line keeps one per block, since each folds alone.
   */
  const headFold = answered.trim() === '' && text.trim() !== '' && text.length > FOLD_OVER_CHARS;

  return (
    <article className={`${styles.event} ${styles[KIND_CLASS[event.kind]]}`}>
      <div className={styles.eventHead}>
        <span className={styles.kindBadge}>{EVENT_KIND_LABEL[event.kind]}</span>
        <span className={styles.actor}>{event.actor}</span>
        {/*
          How long the thinking went on for, or that it is still going.

          A thinking line is written while the model is still doing it and
          carries no duration until it stops - so "no duration yet" is the
          record's way of saying the model has not finished, and saying so is
          the difference between a page that looks live and one that looks
          stuck. It settles by itself as the line is refreshed.
        */}
        {event.kind === 'THINKING' && (
          <span className={event.millis === null ? styles.stillThinking : styles.thoughtFor}>
            {event.millis === null ? t('still thinking') : `thought for ${thoughtFor(event.millis)}`}
          </span>
        )}
        {/* The time sits right before the toggle where the line folds from its head. */}
        {headFold ? (
          <FoldToggle text={text} open={open} onToggle={() => setOpen((was) => !was)}>
            <span className={styles.at} title={moment(event.at)} data-at={event.at}>
              {timeOfDay(event.at)}
            </span>
          </FoldToggle>
        ) : (
          <span className={styles.at} title={moment(event.at)} data-at={event.at}>
            {timeOfDay(event.at)}
          </span>
        )}
      </div>
      {text.trim() === '' && answered.trim() === '' ? (
        <p className={styles.nothing}>{t('Nothing was recorded on this line.')}</p>
      ) : (
        <>
          {text.trim() !== '' && (
            <Block
              text={text}
              code={event.kind === 'TOOL'}
              label={answered === '' ? undefined : t('Asked')}
              folded={headFold ? { open } : undefined}
            />
          )}

          {/*
            Labelled only when there are two blocks. A single block under a
            heading that says "Asked" with nothing answering it reads as a
            missing half rather than as all there was.
          */}
          {answered.trim() !== '' && <Block text={answered} code label={t('Answered')} />}
          {compacted && (
            <Link className={styles.lineLink} to={`/workspace/${workspaceId}/settings#compaction`} data-compaction-settings="">
              {t('Change how turns are summarised')}
            </Link>
          )}

          {/*
            A call still running has arguments and no answer, and saying so is
            worth a line: the alternative is a tool that looks like it returned
            nothing, which is what a tool that failed looks like too.
          */}
          {event.kind === 'TOOL' && event.result === null && (
            <p className={styles.nothing}>{t('No answer was recorded for this call.')}</p>
          )}
        </>
      )}
    </article>
  );
}

/**
 * The agent's setup, where in the log an agent started answering with it.
 * Issues #391, #441.
 *
 * A block in the transcript rather than a line of it, drawn at each
 * AGENT_DETAILS event: the first one opens the log with the context its words
 * were said in, and every later one marks where a different agent took the
 * thread or the same agent was edited between turns. It used to be drawn once,
 * above the transcript, from a snapshot the session kept of whichever agent
 * opened it - right about the first turn and silently wrong about the rest of
 * a shared session.
 *
 * Collapsed by default - the system prompt alone can be a page, and a log with
 * three of these open would be three pages of prompt between the turns - and
 * opened on a press. The closed header still says who and with what model, so a
 * reader scanning the log sees the handover without opening anything.
 *
 * The name leads to the agent, and is a link beside the toggle rather than
 * inside it: a link within a button is a control within a control, and pressing
 * it would open the block on the way to the page. Plain text on a line written
 * before the id was kept, which is the only case there is nowhere to go. Issue
 * #454.
 */
function AgentDetailsBlock({
  details,
  at,
  workspaceId,
}: {
  details: SessionAgentDetails;
  at: string;
  workspaceId: string;
}) {
  const [open, setOpen] = useState(false);

  /*
    What the prompt costs, as a phrase rather than a number on its own.
    Issue #515: "12.4k tokens" is a thing somebody can act on; "12,412" beside
    a heading is a number they have to work out the units of.

    Four characters to a token, which is what the rest of the product budgets a
    context window with - see CHARS_PER_TOKEN on the server. It is an estimate
    and the hover says so, because the real count is the model's own tokeniser
    and differs between models.
  */
  const promptCost = (() => {
    const written = details.systemPrompt?.trim() ?? '';
    if (written === '') return null;
    const tokens = Math.round(written.length / 4);
    const shown = tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : `${tokens}`;
    return t('~{n} tokens').replace('{n}', shown);
  })();

  return (
    <section className={styles.agentDetails} aria-label={t('Agent details')} data-agent-details={details.agent}>
      <div className={styles.agentHead}>
        <button
          type="button"
          className={styles.agentToggle}
          aria-expanded={open}
          data-agent-details-toggle=""
          onClick={() => setOpen((was) => !was)}
        >
          <span className={styles.agentCaret} aria-hidden="true">{open ? '▾' : '▸'}</span>
          <span className={styles.agentTitle}>{t('Agent details')}</span>
        </button>
        <span className={styles.agentWho}>
          {' · '}
          {details.agentId === null ? (
            details.agent
          ) : (
            <Link
              className={styles.agentLink}
              to={`/workspace/${workspaceId}/agents/${details.agentId}/settings`}
              aria-label={t('Open the agent\'s definition')}
              data-agent-details-link={details.agentId}
            >
              {details.agent}
            </Link>
          )}
          {details.model != null ? ` · ${details.model}` : ''}
        </span>
        <span className={styles.at} title={moment(at)} data-at={at}>
          {timeOfDay(at)}
        </span>
      </div>
      {open && (
        <dl className={styles.agentGrid}>
          {/*
            Always drawn, and "none" where there was nothing. Issue #454: the row
            was left out where the prompt was empty, so a reader could not tell
            an agent that was told nothing from a record that did not keep what
            it was told - and until that issue the field held only
            `agent.systemPrompt`, so most agents drew no row at all.
          */}
          <div className={styles.agentRow}>
            <dt className={styles.agentKey}>
              {t('System prompt')}
              {/*
                What it costs, beside what it says. Issue #515.

                The prompt is the one part of a turn nobody chose the length of
                at the time - it is assembled from the agent's own words, its
                skills, its tools and whatever the turn lent - and it is paid
                for on every single call. A reader looking at a session and
                wondering where the window went had to count it themselves.

                An estimate, and it says so: the real number is the model's own
                tokeniser and differs by model. Four characters to a token is
                what the rest of the product budgets with.
              */}
              {promptCost !== null && (
                <span className={styles.agentCost} title={t('Estimated, at four characters to a token')}>
                  {promptCost}
                </span>
              )}
            </dt>
            <dd className={styles.agentValue} data-agent-details-prompt="">
              <pre className={styles.agentPrompt}>
                {details.systemPrompt != null && details.systemPrompt.trim() !== ''
                  ? details.systemPrompt
                  : t('none')}
              </pre>
            </dd>
          </div>
          {/*
            Tools is every tool the model was handed - the grants, the built-ins
            and what the turn lent - and Findable tools, drawn only where there is
            one, is the part found rather than carried under the agent's
            ceiling. Two lines rather than one with a marker, because "which of
            these did the model actually have in front of it" is the question
            a reader of a ceilinged agent's log is asking. Issue #446.
          */}
          {([
            [t('Tools'), details.tools],
            [t('Findable tools'), details.findable],
            [t('Skills'), details.skills],
            [t('Memory'), details.memory],
            [t('Connections'), details.connections],
          ] as const).map(([label, list]) =>
            list.length === 0 ? null : (
              <div key={label} className={styles.agentRow}>
                <dt className={styles.agentKey}>{label}</dt>
                <dd className={styles.agentValue}>{list.join(', ')}</dd>
              </div>
            ),
          )}
        </dl>
      )}
    </section>
  );
}

/**
 * The workflow run or runs that wrote into this session. Issue #420.
 *
 * A session is keyed by what a run computed rather than by the run, so more than
 * one run can land in one - and each records which session its agent talked
 * into. Read the other way round, that names the run behind a session: one
 * button where a single run wrote it, and a list that opens where several did,
 * each row enough to tell them apart. A session nothing wrote into - a chat -
 * draws nothing at all, which is why the whole control is absent rather than
 * empty.
 */
function SessionRuns({ workspaceId, sessionId }: { workspaceId: string; sessionId: string }) {
  const [links, setLinks] = useState<SessionExecutionLink[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (sessionId === '') return undefined;
    let abandoned = false;
    setOpen(false);
    fetchSessionExecutions(sessionId)
      .then((found) => {
        if (!abandoned) setLinks(found);
      })
      .catch(() => {
        if (!abandoned) setLinks(null);
      });
    return () => {
      abandoned = true;
    };
  }, [sessionId]);

  // Nothing wrote into it, or the lookup failed: no control rather than an empty one.
  if (links === null || links.length === 0) return null;

  const label = links.length === 1 ? t('Workflow run') : t('Workflow runs');

  const row = (link: SessionExecutionLink) => (
    <Link
      key={link.id}
      className={styles.runRow}
      to={`/workspace/${workspaceId}/executions/${link.id}`}
      data-session-run={link.id}
    >
      <span className={styles.runName}>{link.workflowName}</span>
      {/* Which run: two runs of one workflow read the same otherwise, and the
          number is what anybody quoting one says. Issue #464. */}
      <span className={styles.runMeta}>
        {`#${link.id}`}
        {' · '}
        {t(STATUS_LABEL[link.status])}
        {' · '}
        {timeAgo(link.startedAt)}
      </span>
    </Link>
  );

  return (
    <div className={styles.runs}>
      <span className={styles.runsLabel}>
        {label}
        <FieldHint label={t('Workflow runs')}>
          {t('The workflow run or runs whose agent steps wrote into this session. Opening one shows what it did.')}
        </FieldHint>
      </span>
      {/*
        The newest run, always drawn, and the rest behind a press.

        It used to be a bare count where there was more than one, so a session
        several runs had written into showed a number and no run at all - which
        is the one thing anybody opening this wants: the run that last said
        something. Newest first throughout, which is the order the server
        answers in. Issue #463.
      */}
      {row(links[0])}
      {links.length > 1 && (
        <button
          type="button"
          className={styles.runsToggle}
          aria-expanded={open}
          data-session-runs-toggle=""
          onClick={() => setOpen((was) => !was)}
        >
          {open ? '▾' : '▸'} {links.length - 1} {t('more')}
        </button>
      )}
      {open && links.length > 1 && <div className={styles.runsList}>{links.slice(1).map(row)}</div>}
    </div>
  );
}

/**
 * One session, read.
 *
 * The transcript is its own query rather than a field on the session, because a
 * fortnight of conversation is more than a page holds - so the search, the kind
 * filter and the sort all belong to this page rather than to what it is reading.
 */
/** One row of the Timers panel: every reminder set with one note - the next one due, if any, and how often it rang. */
interface TimerRow {
  note: string;
  /** The soonest of them still waiting, or null when none is. */
  dueAt: string | null;
  /** The latest ring, or null when none has rung. */
  rangAt: string | null;
  rang: number;
}

/**
 * The Timers panel's rows, one per note: those with a reminder waiting first,
 * soonest first, then those that only rang, latest first.
 *
 * Per note rather than per reminder, waiting and rung together, because an
 * agent re-arming a reminder every few seconds sets a new one on every ring:
 * one row each was a panel of identical rows, and a waiting row beside the rung
 * ones appeared and folded away on every ring. One row that says "Due in 3 s ·
 * rang 11 times" stays where it is.
 */
function timerRows(timers: SessionTimer[]): TimerRow[] {
  const byNote = new Map<string, TimerRow>();
  /* Newest first, as the server answers, so the first ring of a note met is its latest. */
  for (const one of timers) {
    const row = byNote.get(one.note) ?? { note: one.note, dueAt: null, rangAt: null, rang: 0 };
    if (one.rangAt === null) {
      if (row.dueAt === null || one.dueAt < row.dueAt) row.dueAt = one.dueAt;
    } else {
      row.rang += 1;
      row.rangAt ??= one.rangAt;
    }
    byNote.set(one.note, row);
  }
  const rows = [...byNote.values()];
  return [
    ...rows.filter((one) => one.dueAt !== null).sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? '')),
    ...rows.filter((one) => one.dueAt === null),
  ];
}

/** "Due in 3 s", and how often it rang before where it has. */
function timerDue(row: TimerRow & { dueAt: string }): string {
  const time = duration(Math.max(0, Math.round((new Date(row.dueAt).getTime() - Date.now()) / 1000)));
  if (row.rang === 0) return tf('Due in {time}', { time });
  if (row.rang === 1) return tf('Due in {time} · rang once', { time });
  return tf('Due in {time} · rang {count} times', { time, count: row.rang });
}

export function SessionDetailPage({ session, onSignOut }: SessionDetailPageProps) {
  const { workspaceId = '', sessionId = '' } = useParams();

  const navigate = useNavigate();

  const [removing, setRemoving] = useState(false);
  /*
   * Whether this installation lets a conversation be thrown away.
   *
   * True until the answer arrives, which is how it has always been - and the
   * server refuses it either way, so a moment of offering a control that is
   * about to disappear is better than one that flashes into existence.
   */
  const [removable, setRemovable] = useState(true);
  /** True while a chat is being opened, so a second press does not open a second one. */
  const [continuing, setContinuing] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [held, setHeld] = useState<LlmSession | null>(null);
  const [missing, setMissing] = useState(false);
  const [events, setEvents] = useState<LlmSessionEventPage | null>(null);
  const [page, setPage] = usePageWithin(sessionId);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  /*
   * Nothing ticked is every kind, which is what the server means by an empty
   * list as well. So the filter is drawn as four things that can be switched
   * off rather than four that have to be switched on, and switching the last
   * one off returns to the whole transcript instead of emptying the page.
   */
  const [kinds, setKinds] = useState<LlmSessionEventKind[]>([]);
  const [order, setOrder] = useState<LlmSessionEventOrder>('AT');
  /*
   * Newest first, because that is what the page is opened for: the last tool
   * call, the answer, the refusal. Oldest first is one press away and is what
   * somebody wants when following a turn through rather than seeing how it
   * ended.
   */
  const [ascending, setAscending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /*
   * The session itself: its key, its count, when it was last spoken in.
   *
   * Its own call, and now its own callback, because a refresh has to move
   * both halves of this page. The line above the transcript says how many
   * lines there are and how long ago the last one was, and a transcript that
   * gained three lines under a heading still saying "last spoken in 4
   * minutes" is worse than one that did not refresh at all.
   */
  const loadSession = useCallback(() => {
    if (sessionId === '') return;
    fetchLlmSession(sessionId)
      .then((found) => {
        setHeld(found);
        setMissing(found === null);
      })
      .catch(() => setMissing(true));
  }, [sessionId]);

  useEffect(loadSession, [loadSession]);

  /* Whether the installation allows this at all; see `removable`. */
  useEffect(() => {
    let abandoned = false;
    fetchInstallationSettings()
      .then((held) => {
        if (!abandoned) setRemovable(held.sessionsRemovable);
      })
      .catch(() => undefined);
    return () => {
      abandoned = true;
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), SEARCH_PAUSE_MS);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => setPage(1), [debouncedSearch, kinds, order, ascending, pageSize]);

  const load = useCallback(() => {
    if (sessionId === '') return;
    setLoading(true);
    setError(null);
    fetchLlmSessionEvents(sessionId, {
      search: debouncedSearch || undefined,
      kinds,
      page: page - 1,
      size: pageSize,
      order,
      ascending,
    })
      .then((found) => {
        setEvents(found);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        setEvents(null);
        setError(cause instanceof Error ? cause.message : t('Could not load the transcript.'));
        setLoading(false);
      });
  }, [sessionId, debouncedSearch, kinds, page, pageSize, order, ascending]);

  useEffect(load, [load]);

  /*
   * What a press, and a tick, both do.
   *
   * A session is written by agents while somebody watches it, which is what
   * makes this page worth refreshing at all: the run is still going, and the
   * next tool call is the thing being waited for.
   */
  /*
   * The session's scratchpads: the working files an agent kept within the
   * conversation, listed below the sessions panel. Issue #429.
   *
   * Its own, and the shared ones of the sessions it was started under - the same
   * files the agent's tools see. Listed without their content, which is fetched
   * one at a time when one is opened.
   */
  const [scratchpads, setScratchpads] = useState<SessionScratchpad[] | null>(null);
  const loadScratchpads = useCallback(() => {
    if (sessionId === '') return;
    fetchSessionScratchpads(sessionId)
      .then(setScratchpads)
      .catch(() => setScratchpads(null));
  }, [sessionId]);
  useEffect(loadScratchpads, [loadScratchpads]);

  /*
   * The box sessions this session opened, listed below the scratchpads. Each
   * is a sandbox an agent ran commands in; clicking one reads its log in place
   * of the transcript.
   */
  const [sessionBoxes, setSessionBoxes] = useState<SessionBox[] | null>(null);
  /** Which session the list above answered for, so a link's `?box=` is never judged against the last session's boxes. */
  const [sessionBoxesFor, setSessionBoxesFor] = useState<string | null>(null);
  const loadSessionBoxes = useCallback(() => {
    if (sessionId === '') return;
    fetchSessionBoxes(sessionId)
      .then((list) => {
        setSessionBoxes(list);
        setSessionBoxesFor(sessionId);
      })
      .catch(() => {
        setSessionBoxes(null);
        setSessionBoxesFor(sessionId);
      });
  }, [sessionId]);
  useEffect(loadSessionBoxes, [loadSessionBoxes]);

  /*
   * The agent's to-do list, below the boxes: the plan it keeps with its todo_*
   * tools. Read-only here - the plan is the agent's, and a person editing it
   * underneath would be a plan the agent did not make.
   */
  const [todos, setTodos] = useState<SessionTodo[] | null>(null);
  const loadTodos = useCallback(() => {
    if (sessionId === '') return;
    fetchSessionTodos(sessionId)
      .then(setTodos)
      .catch(() => setTodos(null));
  }, [sessionId]);
  useEffect(loadTodos, [loadTodos]);

  /*
   * The watchers this session set, running ones first: what the agent is
   * waiting on, which the transcript only shows as the call that set it.
   */
  const [watchers, setWatchers] = useState<Watcher[] | null>(null);
  const loadWatchers = useCallback(() => {
    if (sessionId === '') return;
    fetchSessionWatchers(sessionId)
      .then(setWatchers)
      .catch(() => setWatchers(null));
  }, [sessionId]);
  useEffect(loadWatchers, [loadWatchers]);

  /*
   * The reminders this session's agent set, waiting ones first: what will wake
   * it, which the transcript shows only as the call that set it.
   */
  const [timers, setTimers] = useState<SessionTimer[] | null>(null);
  const loadTimers = useCallback(() => {
    if (sessionId === '') return;
    fetchSessionTimers(sessionId)
      .then(setTimers)
      .catch(() => setTimers(null));
  }, [sessionId]);
  useEffect(loadTimers, [loadTimers]);

  /*
   * The ports agents asked to expose out of their box sessions, below the
   * notes, and the questions put to a person on their behalf - which the
   * transcript draws where they were asked. Nothing opens until somebody says
   * so; this is where they say it, and where they change their mind.
   */
  const [ports, setPorts] = useState<BoxPort[] | null>(null);
  const [portBusy, setPortBusy] = useState<string | null>(null);
  const [portError, setPortError] = useState<string | null>(null);
  const [requests, setRequests] = useState<InteractionRequest[]>([]);
  const loadPorts = useCallback(() => {
    if (sessionId === '') return;
    fetchSessionBoxPorts(sessionId)
      .then(setPorts)
      .catch(() => setPorts(null));
    fetchSessionRequests(sessionId)
      .then(setRequests)
      .catch(() => setRequests([]));
  }, [sessionId]);
  useEffect(loadPorts, [loadPorts]);

  async function actOnPort(port: BoxPort, act: (id: string) => Promise<unknown>) {
    setPortBusy(port.id);
    setPortError(null);
    try {
      await act(port.id);
    } catch (cause) {
      setPortError(cause instanceof Error ? cause.message : t('Could not change that port.'));
    } finally {
      setPortBusy(null);
      loadPorts();
    }
  }

  /*
   * What the model is writing this second - a call being spelled out, or its
   * answer - which is in no line of the transcript until it lands. A model
   * putting a file into one call writes for minutes, and the page showed
   * nothing moving in that time.
   */
  const [writing, setWriting] = useState<SessionWriting | null>(null);
  const loadWriting = useCallback(() => {
    if (sessionId === '') return;
    fetchSessionWriting(sessionId)
      .then(setWriting)
      .catch(() => setWriting(null));
  }, [sessionId]);
  useEffect(loadWriting, [loadWriting]);

  const refresh = useCallback(() => {
    loadSession();
    load();
    /*
     * And the pads, which an agent writes while somebody is watching this page.
     * They were loaded once and then only after an edit of your own, so a file
     * a running agent had just written was not there until a reload - on the
     * one screen whose whole point is watching work happen. Issue #479.
     */
    loadScratchpads();
    loadSessionBoxes();
    /*
     * And the to-dos, on the same refresh rather than on a todo_* event in the
     * transcript: the transcript drawn is one page of it, filtered and searched
     * as the reader likes, so the event that changed the list is often not in
     * what was fetched - and a list that moves only when its tool call happens
     * to be on screen is a list that is sometimes wrong. The query is one read
     * of the session store. The notes need nothing of their own: they come
     * with the session, which loadSession above reads on the same beat.
     */
    loadTodos();
    loadWatchers();
    loadTimers();
    loadWriting();
    loadPorts();
  }, [loadSession, load, loadScratchpads, loadSessionBoxes, loadTodos, loadWatchers, loadTimers, loadWriting, loadPorts]);

  const filtered = debouncedSearch.trim() !== '' || kinds.length > 0;

  /** Which line each question goes before, for those asked within the lines on this page. */
  const placedRequests = (() => {
    const content = events?.content ?? [];
    if (order !== 'AT' || content.length === 0) return new Map<number, InteractionRequest[]>();
    // From the lines' own times rather than the sort control: what is on the page is what is placed among.
    const times = content.map((event) => Date.parse(event.at));
    const first = Math.min(...times);
    const last = Math.max(...times);
    const within = requests.filter((request) => {
      const asked = Date.parse(request.createdAt);
      return asked >= first && asked <= last;
    });
    return placeRequests(content, (event) => event.at, within, times[0] <= times[times.length - 1]);
  })();

  /*
   * The session's family: the main one and every session an agent in it
   * started by asking another agent. Issue #379.
   *
   * Opened from the top right and kept open across a switch, because a
   * switch is a navigation - the transcript on the left is a session page,
   * and the panel is the same panel on the next one. The query string is
   * what carries "open" from one page to the next.
   */
  const [family, setFamily] = useState<LlmSessionMember[] | null>(null);
  const loadFamily = useCallback(() => {
    if (sessionId === '') return;
    fetchLlmSessionFamily(sessionId)
      .then(setFamily)
      .catch(() => setFamily(null));
  }, [sessionId]);
  useEffect(loadFamily, [loadFamily]);
  /* Status dots follow the transcript's refresh, so a subagent finishing goes orange with it. */
  useEffect(() => {
    loadFamily();
  }, [events, loadFamily]);
  /*
   * The panel is simply there - beside the transcript, level with the search
   * bar - listing the session alone where it asked no other agent, like every
   * other panel in the column says it has nothing rather than vanishing. It
   * was a button that opened it; a thing that exists should not have to be
   * asked for. Issue #388.
   */
  const hasFamily = family !== null && family.length > 0;

  /*
   * Which subview the body is showing: the transcript, one scratchpad's content,
   * or the form for a new one. The three are mutually exclusive - opening a pad
   * closes the form, and going back to the transcript closes both - so the
   * subtitle reads as one place at a time rather than a silent body swap.
   */
  const [openPad, setOpenPad] = useState<string | null>(null);
  const [padContent, setPadContent] = useState<SessionScratchpadContent | null>(null);
  const [padDraft, setPadDraft] = useState('');
  const [padLoading, setPadLoading] = useState(false);
  const [padError, setPadError] = useState<string | null>(null);
  const [savingPad, setSavingPad] = useState(false);
  /** The pad the confirm dialog is asking about, or null when it is closed. */
  const [removingPad, setRemovingPad] = useState<string | null>(null);
  /** Whether the new-scratchpad form is open, and what has been typed into it. */
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newContent, setNewContent] = useState('');
  const [creatingBusy, setCreatingBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  /**
   * The box session whose log the body is showing, or null. A fourth subview
   * beside the three above, and exclusive with them the same way.
   */
  const [openBox, setOpenBox] = useState<string | null>(null);
  const [boxEvents, setBoxEvents] = useState<BoxEvent[]>([]);
  /** Where the next poll starts, so it brings only what is new. */
  const [boxNextSeq, setBoxNextSeq] = useState<number | null>(null);
  /** Null while the log has not answered; otherwise the box's own word on whether it could hand it over. */
  const [boxAvailable, setBoxAvailable] = useState<{ available: boolean; message: string | null } | null>(null);
  /** Newest first unless the reader turned it round; remembered in this browser. */
  const [boxNewestFirst, setBoxNewestFirst] = useState<boolean>(() => {
    try {
      return localStorage.getItem('orknux.box-log.order') !== 'oldest';
    } catch {
      return true;
    }
  });
  const turnBoxLog = useCallback(() => {
    setBoxNewestFirst((held) => {
      try {
        localStorage.setItem('orknux.box-log.order', held ? 'oldest' : 'newest');
      } catch {
        /* a convenience only */
      }
      return !held;
    });
  }, []);
  const [boxError, setBoxError] = useState<string | null>(null);
  /** Which events are drawn with their whole JSON. */
  const [boxExpanded, setBoxExpanded] = useState<number[]>([]);
  /**
   * Which executions are open, and under which of their lines the output is
   * drawn. Keyed by the execution rather than the event, so its started and
   * finished lines open and close the same output rather than two copies of it.
   */
  const [boxOpenExecutions, setBoxOpenExecutions] = useState<Record<string, number>>({});
  /** Execution lines whose raw JSON is shown as well as their output. */
  const [boxJsonShown, setBoxJsonShown] = useState<number[]>([]);
  /** The box session open now, for an answer to check it is still wanted when it lands. */
  const openBoxNow = useRef<string | null>(null);
  openBoxNow.current = openBox;

  /*
   * `?box=` names a box session to open on arrival - the link an agent hands a
   * person. Held here until the session's boxes have answered, and only then
   * opened or, where the session has no such box, dropped for the transcript.
   */
  const [searchParams, setSearchParams] = useSearchParams();
  const boxFromUrl = useRef<string | null>(null);

  /* A different session is a different set of pads; drop back to its transcript. */
  useEffect(() => {
    setOpenPad(null);
    setPadContent(null);
    setCreating(false);
    setOpenBox(null);
    boxFromUrl.current = new URLSearchParams(window.location.search).get('box');
  }, [sessionId]);

  /* The address says which box session is open, replaced rather than pushed so Back leaves the page. */
  const boxInUrl = searchParams.get('box');
  useEffect(() => {
    if (boxFromUrl.current !== null || openBox === boxInUrl) return;
    setSearchParams(
      (held) => {
        const next = new URLSearchParams(held);
        if (openBox === null) next.delete('box');
        else next.set('box', openBox);
        return next;
      },
      { replace: true },
    );
  }, [openBox, boxInUrl, setSearchParams]);

  const backToTranscript = useCallback(() => {
    setOpenPad(null);
    setPadContent(null);
    setPadError(null);
    setCreating(false);
    setOpenBox(null);
  }, []);

  /** Reads a box session's log from the start, in place of the transcript. */
  const openSessionBox = useCallback(
    (id: string) => {
      if (sessionId === '') return;
      setCreating(false);
      setOpenPad(null);
      setPadContent(null);
      setOpenBox(id);
      setBoxEvents([]);
      setBoxNextSeq(null);
      setBoxAvailable(null);
      setBoxError(null);
      setBoxExpanded([]);
      setBoxOpenExecutions({});
      setBoxJsonShown([]);
      fetchSessionBoxLog(sessionId, id)
        .then((log) => {
          if (openBoxNow.current !== id) return;
          setBoxEvents(log.events);
          setBoxNextSeq(log.nextSeq);
          setBoxAvailable({ available: log.available, message: log.message });
        })
        .catch((cause: unknown) => {
          if (openBoxNow.current !== id) return;
          setBoxError(cause instanceof Error ? cause.message : t('Could not read the box log.'));
        });
    },
    [sessionId],
  );

  /* A linked box session, opened once the session's boxes say it is one of them; otherwise the transcript, and the address says so. */
  useEffect(() => {
    const wanted = boxFromUrl.current;
    if (wanted === null || sessionBoxesFor !== sessionId) return;
    boxFromUrl.current = null;
    if (sessionBoxes?.some((one) => one.id === wanted)) {
      openSessionBox(wanted);
      return;
    }
    setSearchParams(
      (held) => {
        const next = new URLSearchParams(held);
        next.delete('box');
        return next;
      },
      { replace: true },
    );
  }, [sessionBoxes, sessionBoxesFor, sessionId, openSessionBox, setSearchParams]);

  /** What has been written since the last read, added under what is there. */
  const followBox = useCallback(() => {
    if (sessionId === '' || openBox === null || boxNextSeq === null) return;
    const asked = openBox;
    fetchSessionBoxLog(sessionId, asked, boxNextSeq)
      .then((log) => {
        if (openBoxNow.current !== asked) return;
        setBoxEvents((held) => {
          const seen = new Set(held.map((one) => one.seq));
          return [...held, ...log.events.filter((one) => !seen.has(one.seq))];
        });
        setBoxNextSeq(log.nextSeq);
        setBoxAvailable({ available: log.available, message: log.message });
        setBoxError(null);
      })
      .catch((cause: unknown) => {
        if (openBoxNow.current !== asked) return;
        setBoxError(cause instanceof Error ? cause.message : t('Could not read the box log.'));
      });
  }, [sessionId, openBox, boxNextSeq]);

  const openBoxRow = sessionBoxes?.find((one) => one.id === openBox) ?? null;

  /*
   * An open log is asked again every couple of seconds from where the last
   * answer ended, for as long as it is open. It used to stop when the panel
   * said the session was no longer active - but the panel is only as fresh as
   * its last load, so a session it had not caught up with drew nothing new
   * until the page was refreshed by hand. Asking costs one small query; a
   * closed session simply answers with nothing.
   */
  useEffect(() => {
    if (openBox === null || boxNextSeq === null) return;
    const timer = window.setInterval(followBox, BOX_POLL_MS);
    return () => window.clearInterval(timer);
  }, [openBox, boxNextSeq, followBox]);

  const openScratchpad = useCallback(
    (name: string) => {
      if (sessionId === '') return;
      setOpenBox(null);
      setCreating(false);
      setOpenPad(name);
      setPadContent(null);
      setPadError(null);
      setPadLoading(true);
      fetchSessionScratchpad(sessionId, name)
        .then((pad) => {
          setPadLoading(false);
          if (pad === null) {
            setPadError(t('That scratchpad is no longer here.'));
            return;
          }
          setPadContent(pad);
          setPadDraft(pad.content);
        })
        .catch((cause: unknown) => {
          setPadLoading(false);
          setPadError(cause instanceof Error ? cause.message : t('Could not open that scratchpad.'));
        });
    },
    [sessionId],
  );

  const savePad = useCallback(() => {
    if (padContent === null || sessionId === '') return;
    setSavingPad(true);
    setPadError(null);
    writeSessionScratchpad(sessionId, padContent.name, padDraft)
      .then((updated) => {
        setSavingPad(false);
        setPadContent(updated);
        setPadDraft(updated.content);
        loadScratchpads();
      })
      .catch((cause: unknown) => {
        setSavingPad(false);
        setPadError(cause instanceof Error ? cause.message : t('That could not be saved.'));
      });
  }, [padContent, padDraft, sessionId, loadScratchpads]);

  const startCreate = useCallback(() => {
    setOpenBox(null);
    setCreating(true);
    setOpenPad(null);
    setPadContent(null);
    setCreateError(null);
    setNewName('');
    setNewDescription('');
    setNewContent('');
  }, []);

  const submitNew = useCallback(() => {
    if (sessionId === '') return;
    setCreatingBusy(true);
    setCreateError(null);
    createSessionScratchpad(sessionId, newName.trim(), newDescription.trim() || null, newContent)
      .then((created) => {
        setCreatingBusy(false);
        setCreating(false);
        loadScratchpads();
        openScratchpad(created.name);
      })
      .catch((cause: unknown) => {
        setCreatingBusy(false);
        setCreateError(cause instanceof Error ? cause.message : t('That scratchpad could not be created.'));
      });
  }, [sessionId, newName, newDescription, newContent, loadScratchpads, openScratchpad]);

  /**
   * The editor's box, so the room under it is measured rather than counted.
   *
   * A scratchpad is a document - a page of HTML, a story, a file of code - and
   * the box it was read in was 360px of one, with the rest of the window empty
   * below it. What is written here is `--pad-room`: how much of the frame is
   * left under where the editor actually starts, the way the plugin catalog's
   * panes are given theirs (see `--catalog-room` there). A row added above the
   * editor moves the number instead of making it wrong, which is the one thing
   * a constant in the stylesheet could never do. Issue #457.
   *
   * On every render and on resize. Reading a rect is cheap, and this is a screen
   * somebody is looking at rather than a loop.
   */
  const editorBox = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    function measure() {
      const box = editorBox.current;
      if (box === null) return;

      /*
       * Measured against the frame the page scrolls inside rather than against
       * the window, and from a distance that does not change as it scrolls.
       *
       * `rect.top` alone would have been the window's answer, and it moves when
       * the page is scrolled: a keystroke re-renders, the box is measured from
       * further up, and the editor grows by however far somebody had scrolled -
       * which makes more to scroll. Where the box starts *within* the frame is
       * the same number at every scroll position, so the height it is given is
       * too.
       *
       * Everything under it comes out of the same walk: the room the shell keeps
       * at the foot of every page, and the clearance the pad view takes back out
       * of it (see `.padView` in the stylesheet).
       */
      let frame: HTMLElement = document.documentElement;
      let tail = 0;
      for (let up = box.parentElement; up !== null; up = up.parentElement) {
        const style = getComputedStyle(up);
        tail += (Number.parseFloat(style.marginBottom) || 0) + (Number.parseFloat(style.paddingBottom) || 0);
        if (/auto|scroll/.test(style.overflowY)) {
          frame = up;
          break;
        }
      }
      const above =
        box.getBoundingClientRect().top - frame.getBoundingClientRect().top + frame.scrollTop;

      // A floor, so a short window leaves a document somebody can still read
      // rather than a sliver - a page taller than its window scrolls, which is
      // the ordinary way out of that.
      const room = Math.max(frame.clientHeight - above - tail, 260);
      box.style.setProperty('--pad-room', `${Math.round(room)}px`);
    }

    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  });

  /* The body shows the transcript only when no pad is open and the form is shut. */
  const showScratchpad = openPad !== null || creating;
  const showBox = openBox !== null;
  const showTranscript = !showScratchpad && !showBox;
  /* The newest box session, which the Box tab opens when none is open yet. */
  const newestBox =
    sessionBoxes === null || sessionBoxes.length === 0
      ? null
      : sessionBoxes.reduce((newest, one) => (one.createdAt > newest.createdAt ? one : newest));
  const showAside = !missing && held !== null;

  return (
    <AppShell
      user={shellUser(session)}
      workspacePath={`/workspace/${workspaceId}`}
      showAdmin={session.admin}
      onSignOut={onSignOut}
      sidebar={<WorkspaceSidebar workspaceId={workspaceId} />}
      title={held?.key}
      scrollContent
    >
      <header className={styles.contentHeader}>
        <p className={styles.breadcrumb}>
          <BackLink to={`/workspace/${workspaceId}/sessions`} label={t('Sessions')} />
          <Link className={styles.crumbLink} to={`/workspace/${workspaceId}/sessions`}>
            {t('Sessions')}
          </Link>
          <span className={styles.crumbSeparator}>/</span>
          <span className={styles.crumbCurrent}>{held?.key ?? 'Session'}</span>
        </p>

        {missing ? (
          <p className={styles.gone} role="alert">
            {t('There is no such session, or it is not one you can see.')}
          </p>
        ) : (
          <>
            <div className={styles.titleRow}>
              <h1 className={styles.title}>{held?.key ?? '…'}</h1>
              {/*
                Two presses rather than a dialog, the way the other destructive
                controls here work. Nothing makes a session again - it exists
                because a run computed its key - so this is the one act on this
                page that cannot be undone by repeating what caused it.
              */}
              {held !== null && (
                <div className={styles.actions}>
                  {/*
                    Refreshing first, and leftmost of the actions: it is the
                    one here that changes nothing, and it sits beside the two
                    that do.

                    The interval is the shared one every other watchable
                    screen uses, not a setting of this page - somebody who has
                    decided how often they want to be interrupted has decided
                    it everywhere.
                  */}
                  <AutoRefresh onRefresh={refresh} busy={loading} defaultSeconds={1} />
                  {/* The label does not change: a word that flips every few
                      seconds under auto-refresh is movement, not information. */}
                  <button
                    type="button"
                    className={styles.refresh}
                    onClick={refresh}
                    /* Disabled only while the first load is in flight, not on
                       every auto-refresh: a button that dimmed and undimmed each
                       second read as blinking. Once the transcript is here the
                       button stays pressable. Issue #421. */
                    disabled={loading && events === null}
                  >
                    <img src={refreshIcon} alt="" width={14} height={14} />
                    {t('Refresh')}
                  </button>
                  {/*
                    Picking the conversation up by hand.

                    A session is written by agents going to work, and this is
                    the one way a person joins one: the chat it opens is bound
                    to this session, starts holding what was already said, and
                    writes what is said next back here — so the transcript below
                    keeps growing and the next run to read it finds what a
                    person told it.
                  */}
                  <button
                    type="button"
                    className={styles.continue}
                    disabled={continuing}
                    onClick={() => {
                      setContinuing(true);
                      setRemoveError(null);
                      void startChat(workspaceId, held.key, undefined, held.id)
                        .then((chat) => navigate(`/chat/${chat.id}`))
                        .catch((cause: unknown) => {
                          setContinuing(false);
                          setRemoveError(
                            cause instanceof Error ? cause.message : t('That conversation could not be continued.'),
                          );
                        });
                    }}
                  >
                    {continuing ? t('Opening…') : t('Continue in chat')}
                  </button>
                  {/*
                    Left out where the installation has closed the door, rather
                    than drawn and refused: a control that is there and argues
                    back is one somebody presses twice before reading why. The
                    server refuses it as well, because a screen is not a
                    boundary.
                  */}
                  {removable && (
                  <button
                    type="button"
                    className={styles.remove}
                    onClick={() => setRemoving(true)}
                  >
                    {t('Remove session')}
                  </button>
                  )}
                </div>
              )}
            </div>
            {removeError !== null && (
              <p className={styles.gone} role="alert">
                {removeError}
              </p>
            )}
            {/*
              Which subview the body is showing, so switching to a scratchpad
              reads as going somewhere rather than the transcript quietly
              becoming something else. The transcript is the way back, and it is
              a link once there is anywhere to come back from. Issue #429.
            */}
            <div
              className={styles.subview}
              role="tablist"
              aria-label={t('Session view')}
              data-subview={creating ? 'new' : openPad !== null ? 'scratchpad' : openBox !== null ? 'box' : 'transcript'}
            >
              <button
                type="button"
                role="tab"
                aria-selected={showTranscript}
                className={showTranscript ? `${styles.subviewTab} ${styles.subviewTabHere}` : styles.subviewTab}
                onClick={backToTranscript}
              >
                {t('Transcript')}
              </button>
              {/*
                The second tab is the pad being read, or the word itself where
                none is open - pressing it then opens the newest, which is what
                somebody reaching for the tab is after. Disabled where the
                session has no pads at all, since there is nowhere to go.
              */}
              <button
                type="button"
                role="tab"
                aria-selected={showScratchpad}
                className={showScratchpad ? `${styles.subviewTab} ${styles.subviewTabHere}` : styles.subviewTab}
                disabled={!showScratchpad && (scratchpads === null || scratchpads.length === 0)}
                data-subview-tab="scratchpad"
                onClick={() => {
                  if (showScratchpad) return;
                  const newest = scratchpads?.[0];
                  if (newest !== undefined) openScratchpad(newest.name);
                }}
              >
                {/*
                  The tab is named for what it shows, not for what is in it: a
                  label that changes when you press it reads as the page having
                  moved somewhere else. Which pad is open is said above, where
                  the pad is.
                */}
                {t('Scratchpad')}
              </button>
              {/*
                The box log, right of the scratchpad and the same kind of tab:
                named for what it shows, opening the newest box session where
                none is open, and disabled where the session opened none.
              */}
              <button
                type="button"
                role="tab"
                aria-selected={showBox}
                className={showBox ? `${styles.subviewTab} ${styles.subviewTabHere}` : styles.subviewTab}
                disabled={!showBox && newestBox === null}
                data-subview-tab="box"
                onClick={() => {
                  if (showBox || newestBox === null) return;
                  openSessionBox(newestBox.id);
                }}
              >
                {t('Box')}
              </button>
            </div>
            <p className={styles.meta}>
              {held === null ? (
                'Loading…'
              ) : (
                <>
                  {held.keyPrefix === null ? t('No prefix') : <>Prefix {held.keyPrefix}</>}
                  {' · '}
                  {held.eventCount} {held.eventCount === 1 ? 'line' : 'lines'}
                  {' · '}opened {timeAgo(held.createdAt)}
                  {' · '}
                  {held.lastEventAt === null
                    ? 'nothing said yet'
                    : `last spoken in ${timeAgo(held.lastEventAt)}`}
                </>
              )}
            </p>
            {/*
              The workflow run or runs that wrote into this session. A single run
              is a link straight to it; several expand into a list. A session
              nothing wrote into draws nothing. Issue #420.
            */}
            {held !== null && <SessionRuns workspaceId={workspaceId} sessionId={sessionId} />}
          </>
        )}
      </header>

      {/*
        The notes an agent wrote down for itself are lines in the log now, in
        time order with the rest, drawn as a NOTE event. They used to sit in a
        block above the transcript; a reader following a conversation wants a
        note where it was written, not lifted out of it. Issues #371, #409.
      */}

      {/*
        The agent's setup is a line of the log as well, drawn as a block where
        an agent started answering with it - see AgentDetailsBlock. It used to
        be drawn once here, above the transcript, for the agent that opened the
        session. Issues #391, #441.
      */}

      <div className={showAside ? styles.split : undefined}>
      <div className={styles.main}>
      {!missing && showTranscript && (
        <>
          <div className={styles.filterBar}>
            <div className={styles.searchInput}>
              <img src={searchIcon} alt="" width={14} height={14} />
              <input
                className={styles.searchField}
                type="search"
                placeholder={t('Search what was said, and who said it…')}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label={t('Search this transcript')}
              />
            </div>

            <div className={styles.kindFilter} role="group" aria-label={t('Which kinds to show')}>
              {EVENT_KINDS.map((kind) => {
                const on = kinds.includes(kind);
                return (
                  <button
                    key={kind}
                    type="button"
                    className={`${styles.kindChip} ${styles[KIND_CLASS[kind]]} ${on ? styles.kindChipOn : ''}`}
                    aria-pressed={on}
                    onClick={() =>
                      setKinds((wanted) =>
                        wanted.includes(kind) ? wanted.filter((one) => one !== kind) : [...wanted, kind],
                      )
                    }
                  >
                    {EVENT_KIND_LABEL[kind]}
                  </button>
                );
              })}
            </div>

            <div className={styles.sortRow}>
              <label className={styles.sortLabel} htmlFor="event-order">{t('Sort')}</label>
              <span className={styles.selectWrapper}>
                <select
                  id="event-order"
                  className={styles.sortSelect}
                  value={order}
                  onChange={(event) => setOrder(event.target.value as LlmSessionEventOrder)}
                >
                  {ORDERS.map((one) => (
                    <option key={one.order} value={one.order}>
                      {one.label}
                    </option>
                  ))}
                </select>
                <img src={chevronDown12Icon} alt="" width={12} height={12} />
              </span>
              <button
                type="button"
                className={styles.sortDirection}
                onClick={() => setAscending((was) => !was)}
                title={ascending ? t('Oldest first - press for newest first') : t('Newest first - press for oldest first')}
                aria-label={ascending ? t('Oldest first') : t('Newest first')}
              >
                {ascending ? '↑' : '↓'}
              </button>
            </div>
          </div>

          <section className={styles.transcript}>
            {writing !== null && (
              <div className={`${styles.writingNow} ${styles.kindAgent}`} data-session-writing="">
                <span className={styles.kindBadge}>{writing.promptTotal != null ? t('Reading') : t('Writing')}</span>
                <span className={styles.writingAgent}>{writing.agent}</span>
                {readingShare(writing) !== null ? (
                  <>
                    <span className={styles.readingLead} data-reading-lead="">{writingParts(writing).lead}</span>
                    <span className={styles.readingShare} data-reading-share="">{readingShare(writing)}%</span>
                    {/* The counts on a line of their own, under what is happening. */}
                    <span className={styles.readingDetails} data-reading-details="">{writingParts(writing).rest.trim()}</span>
                  </>
                ) : (
                  <span className={styles.stillThinking}>{writingParts(writing).rest}</span>
                )}
              </div>
            )}
            {loading && events === null && (
              <p className={styles.notice}>
                <Loader />
              </p>
            )}
            {error !== null && (
              <p className={`${styles.notice} ${styles.noticeError}`} role="alert">
                {error}
              </p>
            )}
            {!loading && error === null && events?.content.length === 0 && (
              <p className={styles.notice}>
                {filtered
                  ? t('Nothing in this session matches that.')
                  : t('This session was opened but nothing has been recorded in it.')}
              </p>
            )}

            {/*
              Questions an agent is waiting on, in place among the lines where
              they were asked when the transcript is in time order; an open one
              that falls outside the lines on this page is pinned here instead,
              so a question is never only on another page.
            */}
            {(() => {
              const content = events?.content ?? [];
              const inTime = order === 'AT' && content.length > 0;
              const times = content.map((event) => Date.parse(event.at));
              const first = inTime ? Math.min(...times) : NaN;
              const last = inTime ? Math.max(...times) : NaN;
              const pinned = requests.filter((request) => {
                if (!inTime) return request.chosen === null;
                const asked = Date.parse(request.createdAt);
                return request.chosen === null && (asked < first || asked > last);
              });
              return pinned.map((request) => (
                <InteractionCard key={`pinned-${request.id}`} request={request} onAnswered={() => loadPorts()} />
              ));
            })()}
            {events?.content.map((event, index) => {
              /*
               * The day is a heading rather than part of every line: a session
               * runs for as long as its key is computed again, so the same
               * transcript can span weeks - and only sorted by time does saying
               * so mean anything.
               */
              const day = dayOf(event.at);
              const newDay = order === 'AT' && day !== '' && day !== dayOf(events.content[index - 1]?.at ?? '');
              const asked = placedRequests.get(index) ?? [];
              return (
                <div key={event.id}>
                  {asked.map((request) => (
                    <InteractionCard key={request.id} request={request} onAnswered={() => loadPorts()} />
                  ))}
                  {newDay && <p className={styles.day}>{day}</p>}
                  {/*
                    The agent's setup where it started answering, as the block
                    the log used to open with - and a plain line where the
                    record could not be read, so nothing is hidden. Issue #441.
                  */}
                  {event.kind === 'AGENT_DETAILS' && event.agentDetails !== null ? (
                    <AgentDetailsBlock details={event.agentDetails} at={event.at} workspaceId={workspaceId} />
                  ) : (
                    <EventLine event={event} workspaceId={workspaceId} />
                  )}
                </div>
              );
            })}

            {events !== null && events.totalElements > 0 && (
              <CompactPagination
                page={page}
                pageSize={pageSize}
                totalItems={events.totalElements}
                unit="lines"
                onPageChange={setPage}
                pageSizes={PAGE_SIZES}
                onPageSizeChange={setPageSize}
              />
            )}
          </section>
        </>
      )}

      {/*
        One scratchpad, opened in place of the transcript. Issue #429.

        The document itself, in a textarea that is saved back through the same
        service the agent writes with - so a refusal it would give the agent, a
        paste over the byte budget, is the message shown here too. Deleting is
        the owner's only; an inherited pad shows no Delete, the way the service
        would refuse one.
      */}
      {!missing && openPad !== null && (
        <section className={styles.padView} aria-label={t('Scratchpad')}>
          {padLoading && (
            <p className={styles.notice}>
              <Loader />
            </p>
          )}
          {padError !== null && (
            <p className={`${styles.notice} ${styles.noticeError}`} role="alert">
              {padError}
            </p>
          )}
          {padContent !== null && (
            <>
              {/*
                The file's name, and the two acts on it, on one line above the
                document - which is where every editor's Save has been since
                #386. They sat in a bar under the box, and a document given the
                height of the page is a bar somebody has to come back up from.
                Issue #457.
              */}
              <div className={styles.padHeader}>
                <h2 className={styles.padName} data-scratchpad-open={padContent.name}>
                  {padContent.name}
                </h2>
                <div className={styles.padButtons}>
                  <span className={styles.padSize}>{formatBytes(byteLength(padDraft))}</span>
                  {/* Only the owner may delete; an inherited pad refuses, so it is not offered. */}
                  {padContent.ownedHere && (
                    <button
                      type="button"
                      className={styles.remove}
                      onClick={() => setRemovingPad(padContent.name)}
                    >
                      {t('Delete')}
                    </button>
                  )}
                  <button
                    type="button"
                    className={styles.padSave}
                    disabled={savingPad || padDraft === padContent.content}
                    onClick={savePad}
                  >
                    {savingPad ? t('Saving…') : t('Save')}
                  </button>
                </div>
              </div>
              {padContent.description !== null && padContent.description !== '' && (
                <p className={styles.padDescription}>{padContent.description}</p>
              )}
              <textarea
                ref={editorBox}
                className={styles.padTextarea}
                value={padDraft}
                spellCheck={false}
                onChange={(event) => setPadDraft(event.target.value)}
                aria-label={t('Scratchpad content')}
                data-scratchpad-content={padContent.name}
              />
            </>
          )}
        </section>
      )}

      {/* The form for a new scratchpad, in place of the transcript. Issue #429. */}
      {!missing && creating && (
        <section className={styles.padView} aria-label={t('New scratchpad')}>
          {/* The same header the open pad has, so both halves of this view keep
              their controls in the one place. Issue #457. */}
          <div className={styles.padHeader}>
            <h2 className={styles.padFormTitle}>{t('New scratchpad')}</h2>
            <div className={styles.padButtons}>
              <span className={styles.padSize}>{formatBytes(byteLength(newContent))}</span>
              <button type="button" className={styles.continue} onClick={backToTranscript}>
                {t('Cancel')}
              </button>
              <button
                type="button"
                className={styles.padSave}
                disabled={creatingBusy || newName.trim() === ''}
                onClick={submitNew}
              >
                {creatingBusy ? t('Creating…') : t('Create')}
              </button>
            </div>
          </div>
          {/* Under the header rather than at the foot of the form: it is where the press was. */}
          {createError !== null && (
            <p className={`${styles.notice} ${styles.noticeError}`} role="alert">
              {createError}
            </p>
          )}
          <div className={styles.createForm}>
            <label className={styles.createLabel} htmlFor="new-pad-name">{t('Name')}</label>
            <input
              id="new-pad-name"
              className={styles.createInput}
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              autoFocus
            />
            <label className={styles.createLabel} htmlFor="new-pad-description">{t('Description')}</label>
            <input
              id="new-pad-description"
              className={styles.createInput}
              value={newDescription}
              placeholder={t('Optional')}
              onChange={(event) => setNewDescription(event.target.value)}
            />
            <label className={styles.createLabel} htmlFor="new-pad-content">{t('Content')}</label>
            <textarea
              ref={editorBox}
              id="new-pad-content"
              className={styles.padTextarea}
              value={newContent}
              spellCheck={false}
              onChange={(event) => setNewContent(event.target.value)}
            />
          </div>
        </section>
      )}
      </div>
      {/*
        One box session's log, in place of the transcript: what the agent ran
        and what came back, a line each, with the event's whole JSON a press
        away. Followed while the box session is active.
      */}
      {!missing && openBox !== null && (
        <section className={styles.padView} aria-label={t('Box')} data-box-log={openBox}>
          <div className={styles.padHeader}>
            <h2 className={styles.padName}>
              {openBoxRow === null ? openBox : `${openBoxRow.boxName} · ${openBoxRow.remoteSessionId}`}
            </h2>
            <div className={styles.padButtons}>
              {openBoxRow !== null && (
                <span className={styles.padSize}>
                  <span
                    className={openBoxRow.active ? `${styles.dot} ${styles.dotActive}` : `${styles.dot} ${styles.dotIdle}`}
                    aria-hidden="true"
                  />{' '}
                  {openBoxRow.status}
                </span>
              )}
              <button
                type="button"
                className={styles.continue}
                onClick={turnBoxLog}
                data-box-log-order={boxNewestFirst ? 'newest' : 'oldest'}
                title={boxNewestFirst ? t('Newest first. Press to show oldest first.') : t('Oldest first. Press to show newest first.')}
              >
                {boxNewestFirst ? t('Newest first ↓') : t('Oldest first ↑')}
              </button>
              <button type="button" className={styles.continue} onClick={followBox} disabled={boxNextSeq === null}>
                {t('Refresh')}
              </button>
            </div>
          </div>
          {boxError !== null && (
            <p className={`${styles.notice} ${styles.noticeError}`} role="alert">
              {boxError}
            </p>
          )}
          {boxAvailable === null && boxError === null && (
            <p className={styles.notice}>
              <Loader />
            </p>
          )}
          {/* A log kept from before the box restarted comes with a word saying so, above the events. */}
          {boxAvailable !== null && boxAvailable.available && boxAvailable.message !== null && (
            <p className={styles.notice} data-box-log-note="">
              {boxAvailable.message}
            </p>
          )}
          {boxAvailable !== null && !boxAvailable.available && (
            <p className={styles.notice} data-box-log-unavailable="">
              {boxAvailable.message ?? t('The box could not hand its log over.')}
            </p>
          )}
          {boxAvailable !== null && boxAvailable.available && boxEvents.length === 0 && (
            <p className={styles.notice}>{t('Nothing logged yet.')}</p>
          )}
          {boxEvents.length > 0 && (
            <ol className={styles.boxLog}>
              {(boxNewestFirst ? [...boxEvents].reverse() : boxEvents).map((event) => {
                const execution = executionOf(event.data);
                const open =
                  execution !== null ? execution in boxOpenExecutions : boxExpanded.includes(event.seq);
                /* An execution's output is drawn once, under the line it was opened from. */
                const drawsOutput = execution !== null && boxOpenExecutions[execution] === event.seq;
                const jsonShown = boxJsonShown.includes(event.seq);
                return (
                  <li
                    key={event.seq}
                    className={styles.boxEvent}
                    data-box-event={event.seq}
                    data-box-execution={execution ?? undefined}
                  >
                    <button
                      type="button"
                      className={styles.boxEventLine}
                      aria-expanded={open}
                      onClick={() => {
                        if (execution === null) {
                          setBoxExpanded((held) =>
                            held.includes(event.seq) ? held.filter((one) => one !== event.seq) : [...held, event.seq],
                          );
                          return;
                        }
                        setBoxOpenExecutions((held) => {
                          const next = { ...held };
                          if (execution in next) delete next[execution];
                          else next[execution] = event.seq;
                          return next;
                        });
                      }}
                    >
                      <span className={styles.boxEventTime} title={moment(event.at)}>
                        {clockOf(event.at)}
                      </span>
                      <span className={styles.boxEventType}>{event.type}</span>
                      <span className={styles.boxEventSummary} data-box-event-summary="">
                        {boxSummary(event.data)}
                      </span>
                    </button>
                    {open && execution === null && <pre className={styles.boxEventJson}>{prettyJson(event.data)}</pre>}
                    {drawsOutput && openBox !== null && (
                      <>
                        <BoxOutput
                          sessionId={sessionId}
                          sessionBoxId={openBox}
                          executionId={execution}
                          finished={boxEvents.some(
                            (one) => one.type === 'execution.finished' && executionOf(one.data) === execution,
                          )}
                        />
                        <div className={styles.boxJsonBar}>
                          <button
                            type="button"
                            className={styles.boxJsonToggle}
                            aria-expanded={jsonShown}
                            onClick={() =>
                              setBoxJsonShown((held) =>
                                held.includes(event.seq) ? held.filter((one) => one !== event.seq) : [...held, event.seq],
                              )
                            }
                            data-box-event-json-toggle=""
                          >
                            JSON
                          </button>
                        </div>
                        {jsonShown && <pre className={styles.boxEventJson}>{prettyJson(event.data)}</pre>}
                      </>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      )}
      {showAside && (
      <div className={styles.rail}>
      {hasFamily && (
        <aside id="session-family" className={styles.family} aria-label={t('Sessions in this conversation')}>
          <p className={styles.familyTitle}>{t('Sessions')}</p>
          {(
            <ul className={styles.familyList}>
              {family.map((member) => {
                const current = member.id === sessionId;
                return (
                  <li key={member.id}>
                    <button
                      type="button"
                      className={current ? `${styles.familyRow} ${styles.familyRowCurrent}` : styles.familyRow}
                      aria-current={current ? 'page' : undefined}
                      data-session-member={member.id}
                      data-session-depth={member.depth}
                      data-session-active={member.active ? 'true' : 'false'}
                      /* Nested under the one that asked, a step per level. Issue #379. */
                      style={{ paddingLeft: `calc(var(--space-8) + ${member.depth} * var(--space-16))` }}
                      onClick={() =>
                        navigate(`/workspace/${workspaceId}/sessions/${member.id}`)
                      }
                    >
                      {/*
                        Green while an agent is at work in it, orange once it
                        has gone quiet. A colour rather than a word, because the
                        list is scanned rather than read, and the word would be
                        the same on every row but one.
                      */}
                      <span
                        className={member.active ? `${styles.dot} ${styles.dotActive}` : `${styles.dot} ${styles.dotIdle}`}
                        title={member.active ? t('Active') : t('Inactive')}
                      />
                      <span className={member.main ? `${styles.familyName} ${styles.familyMain}` : styles.familyName}>
                        {member.title}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>
      )}
      {/*
        The session's scratchpads, below the sessions panel. A working file an
        agent kept within the conversation; clicking one opens it in place of the
        transcript, and the + starts a new one. Issue #429.
      */}
      <aside className={styles.scratchpads} aria-label={t('Scratchpads in this session')}>
        <div className={styles.scratchpadHead}>
          <p className={styles.familyTitle}>{t('Scratchpads')}</p>
          <button
            type="button"
            className={styles.scratchpadAdd}
            onClick={startCreate}
            title={t('New scratchpad')}
            aria-label={t('New scratchpad')}
            data-scratchpad-add=""
          >
            +
          </button>
        </div>
        {scratchpads === null ? (
          <p className={styles.familyNote}>{t('Could not load the scratchpads.')}</p>
        ) : scratchpads.length === 0 ? (
          <p className={styles.familyNote}>{t('None in this session yet.')}</p>
        ) : (
          <ul className={styles.familyList}>
            {scratchpads.map((pad) => {
              const current = !creating && pad.name === openPad;
              return (
                <li key={pad.name}>
                  <button
                    type="button"
                    className={current ? `${styles.padRow} ${styles.padRowCurrent}` : styles.padRow}
                    aria-current={current ? 'page' : undefined}
                    data-scratchpad={pad.name}
                    onClick={() => openScratchpad(pad.name)}
                  >
                    <span className={styles.padRowTop}>
                      <span className={styles.padRowName}>{pad.name}</span>
                      <span className={styles.padRowBytes}>{formatBytes(pad.bytes)}</span>
                    </span>
                    {pad.description !== null && pad.description !== '' && (
                      <span className={styles.padRowDesc}>{pad.description}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>
      {/*
        The boxes this session opened, below its scratchpads. Each carries the
        family's dot - green while the box session is active, orange once it is
        not - and clicking one reads its log in place of the transcript.
      */}
      <aside className={styles.scratchpads} aria-label={t('Boxes in this session')} data-session-boxes="">
        <p className={styles.familyTitle}>{t('Boxes')}</p>
        {sessionBoxes === null ? (
          <p className={styles.familyNote}>{t('Could not load the boxes.')}</p>
        ) : sessionBoxes.length === 0 ? (
          <p className={styles.familyNote}>{t('None in this session yet.')}</p>
        ) : (
          <ul className={styles.familyList}>
            {sessionBoxes.map((one) => {
              const current = one.id === openBox;
              return (
                <li key={one.id}>
                  <button
                    type="button"
                    className={current ? `${styles.familyRow} ${styles.familyRowCurrent}` : styles.familyRow}
                    aria-current={current ? 'page' : undefined}
                    data-session-box={one.id}
                    data-session-box-active={one.active ? 'true' : 'false'}
                    title={[one.boxName, one.boxLabel, one.remoteSessionId, one.status].filter((part) => part !== null && part !== '').join(' · ')}
                    onClick={() => openSessionBox(one.id)}
                  >
                    <span
                      className={one.active ? `${styles.dot} ${styles.dotActive}` : `${styles.dot} ${styles.dotIdle}`}
                      data-session-box-dot=""
                    />
                    {/*
                      The dot says the state; the word for it, and the box's
                      name, are on hover in the row's title. The row itself is
                      the box session's id, then its label - the name repeated
                      the label for the local box on every row.
                    */}
                    <span className={styles.boxRowId} title={one.remoteSessionId} data-session-box-id="">
                      {one.remoteSessionId}
                    </span>
                    {one.boxLabel !== null && one.boxLabel !== '' && (
                      <span className={styles.boxRowLabel} data-session-box-label="">
                        {one.boxLabel}
                      </span>
                    )}
                    {/*
                      Opened elsewhere in the conversation - by the agent that
                      asked this one, or a subagent it asked - and worked in here.
                    */}
                    {one.openedIn !== sessionId && (
                      <span
                        className={styles.boxRowLabel}
                        data-session-box-shared=""
                        title={one.openedBy === null ? t('Opened in another session of this conversation') : tf('Opened by {agent} in another session of this conversation', { agent: one.openedBy })}
                      >
                        {t('shared')}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>
      {/*
        The ports agents asked to expose, and the one place to manage them: a
        request waits for Allow, here or in the conversation; an open one can be
        closed and opened again, and any of them removed. The dot is whether
        something answers on it now, looked at on the page's refresh.
      */}
      <aside className={styles.scratchpads} aria-label={t('Ports exposed from this session')} data-session-ports="">
        <p className={styles.familyTitle}>{t('Ports')}</p>
        {ports === null ? (
          <p className={styles.familyNote}>{t('Could not load the ports.')}</p>
        ) : ports.length === 0 ? (
          <p className={styles.familyNote}>{t('None in this session yet.')}</p>
        ) : (
          <ul className={styles.familyList}>
            {ports.map((one) => (
              <li
                key={one.id}
                className={styles.portRow}
                data-session-port={one.id}
                data-session-port-state={one.state}
                data-session-port-alive={one.alive ? 'true' : 'false'}
              >
                <span className={styles.portHead}>
                  <span
                    className={one.alive ? `${styles.dot} ${styles.dotActive}` : `${styles.dot} ${styles.dotIdle}`}
                    data-session-port-dot=""
                    title={one.alive ? t('Answering') : t('Not answering')}
                  />
                  <span className={styles.portNumber}>{one.port}</span>
                  {one.state === 'ENABLED' && one.url !== null ? (
                    <a className={styles.portUrl} href={one.url} target="_blank" rel="noreferrer" data-session-port-url="">
                      {one.url}
                    </a>
                  ) : (
                    <span className={styles.portState} data-session-port-state-label="">
                      {one.state === 'PENDING'
                        ? t('Waiting for approval')
                        : one.state === 'REFUSED'
                          ? t('Refused')
                          : one.state === 'DISABLED'
                            ? t('Disabled')
                            : t('Enabled')}
                    </span>
                  )}
                  {one.boxLabel !== null && one.boxLabel !== '' && (
                    <span className={styles.boxRowLabel} data-session-port-label="">
                      {one.boxLabel}
                    </span>
                  )}
                </span>
                {one.reason !== null && one.reason !== '' && <span className={styles.todoNote}>{one.reason}</span>}
                {one.note !== null && one.state === 'ENABLED' && <span className={styles.todoNote}>{one.note}</span>}
                <span className={styles.portActions}>
                  {one.state !== 'ENABLED' && (
                    <button
                      type="button"
                      className={styles.portAction}
                      disabled={portBusy === one.id}
                      onClick={() => void actOnPort(one, enableBoxPort)}
                      data-session-port-enable=""
                    >
                      <img src={playIcon} alt="" />
                      {one.state === 'PENDING' ? t('Allow') : t('Enable')}
                    </button>
                  )}
                  {one.state === 'ENABLED' && (
                    <button
                      type="button"
                      className={styles.portAction}
                      disabled={portBusy === one.id}
                      onClick={() => void actOnPort(one, disableBoxPort)}
                      data-session-port-disable=""
                    >
                      <img src={pauseIcon} alt="" />
                      {t('Disable')}
                    </button>
                  )}
                  <button
                    type="button"
                    className={`${styles.portAction} ${styles.portActionDanger}`}
                    disabled={portBusy === one.id}
                    onClick={() => void actOnPort(one, deleteBoxPort)}
                    data-session-port-delete=""
                  >
                    <img src={trashIcon} alt="" />
                    {t('Delete')}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        {portError !== null && (
          <p className={styles.familyNote} role="alert">
            {portError}
          </p>
        )}
      </aside>
      {/*
        The agent's to-do list, below the boxes. Open items first, in the
        agent's order, and then the done ones, muted and struck through, rather
        than folded into a count: the prompt folds them because the model has no
        use for what it finished, but a person reading the session is asking
        exactly that - how far it got - and the open ones are still what the eye
        lands on first.
      */}
      <aside className={styles.scratchpads} aria-label={t('To-do list in this session')} data-session-todos="">
        <p className={styles.familyTitle}>{t('To-do')}</p>
        {todos === null ? (
          <p className={styles.familyNote}>{t('Could not load the to-do list.')}</p>
        ) : todos.length === 0 ? (
          <p className={styles.familyNote}>{t('None in this session yet.')}</p>
        ) : (
          <ul className={styles.familyList}>
            {[...todos.filter((one) => !one.done), ...todos.filter((one) => one.done)].map((one) => (
              <li
                key={one.id}
                className={one.done ? `${styles.todoRow} ${styles.todoRowDone}` : styles.todoRow}
                data-session-todo={one.id}
                data-session-todo-done={one.done ? 'true' : 'false'}
              >
                <span
                  className={one.done ? `${styles.todoMark} ${styles.todoMarkDone}` : styles.todoMark}
                  role="img"
                  aria-label={one.done ? t('Done') : t('Not done yet')}
                  data-session-todo-mark=""
                >
                  {one.done && <img src={checkIcon} alt="" />}
                </span>
                <span className={styles.todoBody}>
                  <span className={styles.todoText} data-session-todo-text="">
                    {one.text}
                  </span>
                  {one.note !== null && one.note !== '' && (
                    <span className={styles.todoNote} data-session-todo-note="">
                      {one.note}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </aside>
      {/*
        What the agents here wrote down for themselves with note_to_self, below
        the to-dos. Read off the session the page already loads - the same rows
        the agent is handed back at every turn, in the order it is handed them,
        oldest first - rather than off the transcript's NOTE lines, which are
        one filtered page of the log and miss whatever is on another page. In
        written order because that is how the agent reads them: the panel shows
        what the agent is carrying, not a feed. The NOTE lines in the transcript
        stay where they were written, for a reader following the conversation.
      */}
      <aside className={styles.scratchpads} aria-label={t('Notes in this session')} data-session-notes="">
        <p className={styles.familyTitle}>{t('Notes')}</p>
        {held === null ? (
          <p className={styles.familyNote}>{t('Loading…')}</p>
        ) : (held.notes ?? []).length === 0 ? (
          <p className={styles.familyNote}>{t('None in this session yet.')}</p>
        ) : (
          <ul className={styles.familyList}>
            {(held.notes ?? []).map((one) => (
              <li key={one.id} className={styles.noteRow} data-session-note={one.id}>
                <span className={styles.todoText} data-session-note-text="">
                  {one.note}
                </span>
                <span className={styles.todoNote}>
                  {one.writtenBy} · {timeAgo(one.writtenAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </aside>
      {/*
        The watchers this session set: running ones first, each with what it
        is for (or the tool it calls) and where it stands. A row opens the
        workspace's Watchers page, where one can be stopped.
      */}
      <aside className={styles.scratchpads} aria-label={t('Watchers in this session')} data-session-watchers="">
        <p className={styles.familyTitle}>{t('Watchers')}</p>
        {watchers === null ? (
          <p className={styles.familyNote}>{t('Could not load the watchers.')}</p>
        ) : watchers.length === 0 ? (
          <p className={styles.familyNote}>{t('None in this session yet.')}</p>
        ) : (
          <ul className={styles.familyList}>
            {[...watchers.filter((one) => one.status === 'ACTIVE'), ...watchers.filter((one) => one.status !== 'ACTIVE')].map((one) => (
              <li key={one.id}>
                <Link
                  className={styles.watcherRow}
                  to={`/workspace/${workspaceId}/watchers`}
                  title={`${one.tool}(${one.arguments}) · ${one.conditionKind} ${one.condition}`}
                  data-session-watcher={one.id}
                  data-session-watcher-status={one.status}
                >
                  <span className={one.status === 'ACTIVE' ? `${styles.dot} ${styles.dotActive}` : `${styles.dot} ${styles.dotIdle}`} />
                  <span className={styles.todoBody}>
                    <span className={styles.todoText} data-session-watcher-text="">
                      {one.description ?? one.tool}
                    </span>
                    <span className={styles.todoNote} data-session-watcher-state="">
                      {one.status === 'ACTIVE'
                        ? tf('{status} · check {checks} · set {when}', { status: watcherStatus(one.status), checks: one.checks, when: timeAgo(one.createdAt) })
                        : tf('{status} · {when}', { status: watcherStatus(one.status), when: timeAgo(one.finishedAt ?? one.createdAt) })}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </aside>
      {/*
        The reminders this session's agent set: waiting ones first, soonest
        first, each with its note and when it comes up; then the ones that rang.
      */}
      <aside className={styles.scratchpads} aria-label={t('Timers in this session')} data-session-timers="">
        <p className={styles.familyTitle}>{t('Timers')}</p>
        {timers === null ? (
          <p className={styles.familyNote}>{t('Could not load the timers.')}</p>
        ) : timers.length === 0 ? (
          <p className={styles.familyNote}>{t('None in this session yet.')}</p>
        ) : (
          <ul className={styles.familyList}>
            {timerRows(timers).map((one) => (
              <li
                key={one.note}
                className={styles.todoRow}
                title={moment(one.dueAt ?? one.rangAt ?? '')}
                data-session-timer={one.note}
                data-session-timer-waiting={one.dueAt !== null ? 'true' : 'false'}
                data-session-timer-count={one.rang}
              >
                <span className={one.dueAt !== null ? `${styles.dot} ${styles.dotActive}` : `${styles.dot} ${styles.dotDone}`} />
                <span className={styles.todoBody}>
                  <span className={styles.todoText} data-session-timer-text="">
                    {one.note}
                  </span>
                  <span className={styles.todoNote} data-session-timer-state="">
                    {one.dueAt !== null
                      ? timerDue({ ...one, dueAt: one.dueAt })
                      : one.rang > 1
                        ? tf('Rang {count} times · last {when}', { count: one.rang, when: timeAgo(one.rangAt ?? '') })
                        : tf('Rang {when}', { when: timeAgo(one.rangAt ?? '') })}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </aside>
      </div>
      )}
      </div>
      <ConfirmDialog
        subject={removingPad}
        kind="removeScratchpad"
        onClose={() => setRemovingPad(null)}
        onConfirm={async () => {
          const name = removingPad;
          if (name === null || sessionId === '') return;
          /* A refusal here (an inherited pad, say) is thrown, and the dialog shows it. */
          await deleteSessionScratchpad(sessionId, name);
          setRemovingPad(null);
          /* If the one just removed was open, fall back to the transcript. */
          if (openPad === name) backToTranscript();
          loadScratchpads();
        }}
      />
      <ConfirmDialog
        subject={removing && held !== null ? held.key : null}
        kind="removeSession"
        onClose={() => setRemoving(false)}
        onConfirm={async () => {
          if (held === null) return;
          try {
            await removeLlmSession(held.id);
            setRemoving(false);
            navigate(`/workspace/${workspaceId}/sessions`);
          } catch (cause) {
            setRemoveError(cause instanceof Error ? cause.message : t('That could not be removed.'));
            throw cause;
          }
        }}
      />
    </AppShell>
  );
}
