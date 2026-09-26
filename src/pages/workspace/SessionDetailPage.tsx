import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { startChat } from '../../api/chat';
import { fetchInstallationSettings } from '../../api/installation';
import {
  EVENT_KINDS,
  EVENT_KIND_LABEL,
  fetchLlmSession,
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
} from '../../api/llmSessions';
import { STATUS_LABEL } from '../../api/executions';
import type { SessionUser } from '../../api/session';
import { timeAgo } from '../../api/tools';
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
import { t } from '../../i18n';

export interface SessionDetailPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

const PAGE_SIZE = 20;
const PAGE_SIZES = [20, 50, 100];
const SEARCH_PAUSE_MS = 300;

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
  // Thinking reads as the agent's, because it is the agent's — what separates
  // it is the badge, not a colour of its own. A fifth rule down the left of a
  // transcript is a fifth thing to learn for a line that is already labelled.
  THINKING: 'kindAgent',
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
  return at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

/** Which day a line falls on, so a fortnight of conversation is not one wall. */
function dayOf(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  return at.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * One block of a line: the text, folded while it is longer than a line should be.
 *
 * Its own component because a tool line has two of them now - what was asked and
 * what came back - and each folds on its own. Sharing one `open` between them
 * would mean opening a long answer to read a short call.
 */
function Block({ text, code, label }: { text: string; code: boolean; label?: string }) {
  const long = text.length > FOLD_OVER_CHARS;
  const [open, setOpen] = useState(false);

  return (
    <>
      {label !== undefined && <p className={styles.blockLabel}>{label}</p>}
      {/*
        A tool's arguments are code and are read as code; what was said is
        prose, and monospacing prose makes a conversation look like a log.
      */}
      <pre className={`${styles.content} ${code ? styles.code : ''} ${long && !open ? styles.folded : ''}`}>
        {text}
      </pre>
      {long && (
        <button type="button" className={styles.fold} onClick={() => setOpen((held) => !held)}>
          {open ? t('Show less') : `Show all ${text.length.toLocaleString()} characters`}
        </button>
      )}
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
function EventLine({ event }: { event: LlmSessionEvent }) {
  const text = readable(event.kind, event.content);

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
        <span className={styles.at} title={event.at}>
          {timeOfDay(event.at)}
        </span>
      </div>
      {text.trim() === '' && answered.trim() === '' ? (
        <p className={styles.nothing}>{t('Nothing was recorded on this line.')}</p>
      ) : (
        <>
          {text.trim() !== '' && (
            <Block text={text} code={event.kind === 'TOOL'} label={answered === '' ? undefined : t('Asked')} />
          )}

          {/*
            Labelled only when there are two blocks. A single block under a
            heading that says "Asked" with nothing answering it reads as a
            missing half rather than as all there was.
          */}
          {answered.trim() !== '' && <Block text={answered} code label={t('Answered')} />}

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
        <span className={styles.at} title={at}>
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
            <dt className={styles.agentKey}>{t('System prompt')}</dt>
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
  }, [loadSession, load, loadScratchpads]);

  const filtered = debouncedSearch.trim() !== '' || kinds.length > 0;

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
   * The panel is simply there where there is a family - a session with
   * subagent sessions draws it beside its transcript, level with the search
   * bar, and one with none draws nothing. It was a button that opened it;
   * a thing that exists should not have to be asked for. Issue #388.
   */
  const hasFamily = family !== null && family.length > 1;

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

  /* A different session is a different set of pads; drop back to its transcript. */
  useEffect(() => {
    setOpenPad(null);
    setPadContent(null);
    setCreating(false);
  }, [sessionId]);

  const backToTranscript = useCallback(() => {
    setOpenPad(null);
    setPadContent(null);
    setPadError(null);
    setCreating(false);
  }, []);

  const openScratchpad = useCallback(
    (name: string) => {
      if (sessionId === '') return;
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
  const showTranscript = openPad === null && !creating;
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
                  <AutoRefresh onRefresh={refresh} busy={loading} />
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
            <p className={styles.subview} data-subview={creating ? 'new' : openPad === null ? 'transcript' : 'scratchpad'}>
              {showTranscript ? (
                <span className={styles.subviewHere}>{t('Transcript')}</span>
              ) : (
                <>
                  <button type="button" className={styles.subviewBack} onClick={backToTranscript}>
                    {t('Transcript')}
                  </button>
                  <span className={styles.subviewSep}>/</span>
                  <span className={styles.subviewHere}>{creating ? t('New scratchpad') : openPad}</span>
                </>
              )}
            </p>
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

            {events?.content.map((event, index) => {
              /*
               * The day is a heading rather than part of every line: a session
               * runs for as long as its key is computed again, so the same
               * transcript can span weeks - and only sorted by time does saying
               * so mean anything.
               */
              const day = dayOf(event.at);
              const newDay = order === 'AT' && day !== '' && day !== dayOf(events.content[index - 1]?.at ?? '');
              return (
                <div key={event.id}>
                  {newDay && <p className={styles.day}>{day}</p>}
                  {/*
                    The agent's setup where it started answering, as the block
                    the log used to open with - and a plain line where the
                    record could not be read, so nothing is hidden. Issue #441.
                  */}
                  {event.kind === 'AGENT_DETAILS' && event.agentDetails !== null ? (
                    <AgentDetailsBlock details={event.agentDetails} at={event.at} workspaceId={workspaceId} />
                  ) : (
                    <EventLine event={event} />
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
