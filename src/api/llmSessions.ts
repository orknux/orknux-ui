import { graphql } from './client';
import type { ExecutionStatus } from './executions';

/**
 * A conversation an agent kept, found by the key whoever ran it computed.
 *
 * There are no mutations here, and that is the shape of the feature rather than
 * an omission: a session appears the first time an agent node with a `sessionKey`
 * records into it. Everything this module does is look.
 */
export interface LlmSession {
  id: string;
  workspaceId: string;
  /** `prefix:key`, or the key alone where the node gave no prefix. */
  key: string;
  keyPrefix: string | null;
  eventCount: number;
  createdAt: string;
  /** Null on a session nothing has been recorded in yet. */
  lastEventAt: string | null;
  /** Whether an agent is at work in it right now: something unfinished, or a line within the last minute. Issue #404. */
  active: boolean;
  /** How many sessions were started under this one, so the list says which conversations fanned out. Issue #403. */
  subagentCount: number;
  /**
   * What the agents in this conversation wrote down for themselves. Issue #371.
   *
   * The one part of a conversation an agent chose to keep rather than merely
   * said: a transcript is what happened, and these are the few lines it decided
   * it must not lose.
   *
   * Absent on a row of the list, which asks for none: twenty rows would carry
   * every note in the workspace to draw a page that shows none of them.
   */
  notes?: LlmSessionNote[];
  /**
   * The agent's setup as it stood when the session opened. Issue #391.
   *
   * Snapshotted once - the model, system prompt, and grants - so the log reads
   * with the context its words were said in. Absent on a row of the list and
   * on a session no agent has written into.
   */
  agentDetails?: SessionAgentDetails | null;
}

/** The agent's setup at the start of a session. Issue #391. */
export interface SessionAgentDetails {
  agent: string;
  model: string | null;
  systemPrompt: string | null;
  tools: string[];
  skills: string[];
  memory: string[];
  connections: string[];
}

/** What a list of sessions is ordered by, in the words the server uses. */
export type LlmSessionOrder = 'KEY' | 'CREATED' | 'LAST_EVENT';

/**
 * What one line of a transcript is.
 *
 * TOOL is the call and not what came back: the arguments the model sent, which
 * is why that one line is often JSON and often long.
 */
export type LlmSessionEventKind = 'AGENT' | 'TOOL' | 'USER' | 'SYSTEM' | 'THINKING' | 'NOTE';

/** What a transcript is ordered by. */
export type LlmSessionEventOrder = 'AT' | 'KIND';

export interface LlmSessionEvent {
  id: string;
  kind: LlmSessionEventKind;
  /** The agent, the tool, whoever asked. Every line names somebody. */
  actor: string;
  content: string | null;
  /**
   * What a call gave back, and null on every line that is not one.
   *
   * Null on a call too, while its tool has not answered — the call is recorded
   * before the tool runs, so arguments with no result is a lookup that was asked
   * for and has not come back. On a task being watched live that is a state
   * somebody sees change; everywhere else it is how a hung tool is visible at
   * all.
   */
  result: string | null;
  /**
   * How long a THINKING line's reasoning went on for, in milliseconds.
   *
   * Null on every other kind, and null on a thinking line the model has not
   * finished — the duration is what settles it, so "no duration yet" is how a
   * page reads "still thinking".
   */
  millis: number | null;
  at: string;
}

export interface LlmSessionPage {
  totalElements: number;
  content: LlmSession[];
}

export interface LlmSessionEventPage {
  totalElements: number;
  content: LlmSessionEvent[];
}

/** What each kind is called where somebody reads it. */
export const EVENT_KIND_LABEL: Record<LlmSessionEventKind, string> = {
  AGENT: 'Agent',
  TOOL: 'Tool',
  USER: 'User',
  SYSTEM: 'System',
  THINKING: 'Thinking',
  NOTE: 'Note',
};

/** In the order a turn takes: something is put to the agent, it calls, it answers. */
export const EVENT_KINDS: LlmSessionEventKind[] = ['USER', 'AGENT', 'TOOL', 'THINKING', 'NOTE', 'SYSTEM'];

const SESSION_FIELDS = 'id workspaceId key keyPrefix eventCount createdAt lastEventAt active subagentCount';

/** What one opened session adds, and a row of the list does not. Issue #371. */
const ONE_SESSION_FIELDS =
  `${SESSION_FIELDS} notes { id note writtenBy writtenAt } ` +
  'agentDetails { agent model systemPrompt tools skills memory connections }';

/**
 * One session of a family: the main session and every one an agent in it
 * started by asking another agent. Issue #379.
 */
export interface LlmSessionMember {
  id: string;
  key: string;
  /** "Main session" at the top; what the asking agent called the task for the rest. */
  title: string;
  main: boolean;
  /** How deep under the main session it sits: 0 for the main, 1 for what it asked, and so on. Issue #379. */
  depth: number;
  /** Green or orange: whether an agent is at work in it right now. */
  active: boolean;
  lastEventAt: string | null;
}

/** A session's family from the top, asked of any member. */
export async function fetchLlmSessionFamily(id: string): Promise<LlmSessionMember[]> {
  const data = await graphql<{ llmSessionFamily: LlmSessionMember[] }>(
    `query ($id: ID!) { llmSessionFamily(id: $id) { id key title main depth active lastEventAt } }`,
    { id },
  );
  return data.llmSessionFamily;
}

/** One thing an agent wrote down for itself, part-way through. */
export interface LlmSessionNote {
  id: string;
  note: string;
  /** Which agent wrote it, since a conversation can be shared. */
  writtenBy: string;
  writtenAt: string;
}

const EVENT_FIELDS = 'id kind actor content result millis at';

export async function fetchLlmSessions(
  workspaceId: string,
  options: {
    search?: string;
    page?: number;
    size?: number;
    order?: LlmSessionOrder;
    ascending?: boolean;
    /** Whether the sessions started by asking another agent are listed too; off, main sessions only. Issue #389. */
    includeSubagents?: boolean;
  } = {},
): Promise<LlmSessionPage> {
  const data = await graphql<{ llmSessions: LlmSessionPage }>(
    `query ($workspaceId: ID!, $search: String, $page: Int, $size: Int,
            $order: LlmSessionOrder, $ascending: Boolean, $includeSubagents: Boolean) {
       llmSessions(workspaceId: $workspaceId, search: $search, page: $page, size: $size,
                   order: $order, ascending: $ascending, includeSubagents: $includeSubagents) {
         totalElements
         content { ${SESSION_FIELDS} }
       }
     }`,
    {
      workspaceId,
      search: options.search || null,
      page: options.page ?? 0,
      size: options.size ?? 20,
      order: options.order ?? null,
      ascending: options.ascending ?? null,
      includeSubagents: options.includeSubagents ?? false,
    },
  );
  return data.llmSessions;
}

/** Null where there is no such session, or it is not one this person may see. */
export async function fetchLlmSession(id: string): Promise<LlmSession | null> {
  const data = await graphql<{ llmSession: LlmSession | null }>(
    `query ($id: ID!) { llmSession(id: $id) { ${ONE_SESSION_FIELDS} } }`,
    { id },
  );
  return data.llmSession;
}

/**
 * Throws a session away, with everything said in it.
 *
 * False where there was nothing to remove — a second press of the button is
 * somebody making sure rather than an error.
 */
export async function removeLlmSession(id: string): Promise<boolean> {
  const data = await graphql<{ removeLlmSession: boolean }>(
    `mutation ($id: ID!) { removeLlmSession(id: $id) }`,
    { id },
  );
  return data.removeLlmSession;
}

/**
 * One of a session's scratchpads, listed beside the transcript. Issue #429.
 *
 * A working file an agent kept within the conversation. Named and sized without
 * the content: a list is scanned rather than read, and a pad can be a whole
 * page. The content is fetched one at a time with `fetchSessionScratchpad`.
 */
export interface SessionScratchpad {
  /** Its name within the session — how the agent addresses it, like a filename. */
  name: string;
  /** What it is for, in a line, or null where none was set. */
  description: string | null;
  /** Its size in bytes, which is what the session's scratchpad budget is spent in. */
  bytes: number;
  /** Whether the sessions started under the owner may read and add to it. */
  shared: boolean;
  /** Whether this session owns it, or only inherited it shared from an ancestor — only the owner may delete it. */
  ownedHere: boolean;
}

/** One scratchpad opened: the listed row, with the document itself. Issue #429. */
export interface SessionScratchpadContent extends SessionScratchpad {
  /** The document itself. */
  content: string;
}

const SCRATCHPAD_FIELDS = 'name description bytes shared ownedHere';
const SCRATCHPAD_CONTENT_FIELDS = `${SCRATCHPAD_FIELDS} content`;

/** A session's scratchpads: its own, and the shared ones of the sessions it was started under. */
export async function fetchSessionScratchpads(sessionId: string): Promise<SessionScratchpad[]> {
  const data = await graphql<{ sessionScratchpads: SessionScratchpad[] }>(
    `query ($sessionId: ID!) { sessionScratchpads(sessionId: $sessionId) { ${SCRATCHPAD_FIELDS} } }`,
    { sessionId },
  );
  return data.sessionScratchpads;
}

/** One scratchpad, with its content. Null where the session has none by that name. */
export async function fetchSessionScratchpad(
  sessionId: string,
  name: string,
): Promise<SessionScratchpadContent | null> {
  const data = await graphql<{ sessionScratchpad: SessionScratchpadContent | null }>(
    `query ($sessionId: ID!, $name: String!) {
       sessionScratchpad(sessionId: $sessionId, name: $name) { ${SCRATCHPAD_CONTENT_FIELDS} }
     }`,
    { sessionId, name },
  );
  return data.sessionScratchpad;
}

/**
 * Makes a new scratchpad in the session. Issue #429.
 *
 * Rejected in words — a name taken here, one over the byte budget — so the form
 * shows why. `content` and `description` are optional; a pad may start empty.
 */
export async function createSessionScratchpad(
  sessionId: string,
  name: string,
  description: string | null,
  content: string,
): Promise<SessionScratchpadContent> {
  const data = await graphql<{ createSessionScratchpad: SessionScratchpadContent }>(
    `mutation ($sessionId: ID!, $name: String!, $description: String, $content: String) {
       createSessionScratchpad(sessionId: $sessionId, name: $name, description: $description, content: $content) {
         ${SCRATCHPAD_CONTENT_FIELDS}
       }
     }`,
    { sessionId, name, description: description || null, content },
  );
  return data.createSessionScratchpad;
}

/** Replaces a scratchpad's whole content. Rejected in words when it would go over the byte budget. */
export async function writeSessionScratchpad(
  sessionId: string,
  name: string,
  content: string,
): Promise<SessionScratchpadContent> {
  const data = await graphql<{ writeSessionScratchpad: SessionScratchpadContent }>(
    `mutation ($sessionId: ID!, $name: String!, $content: String!) {
       writeSessionScratchpad(sessionId: $sessionId, name: $name, content: $content) { ${SCRATCHPAD_CONTENT_FIELDS} }
     }`,
    { sessionId, name, content },
  );
  return data.writeSessionScratchpad;
}

/** Removes one of a session's scratchpads. Only the owner may; an inherited one is refused in words. */
export async function deleteSessionScratchpad(sessionId: string, name: string): Promise<boolean> {
  const data = await graphql<{ deleteSessionScratchpad: boolean }>(
    `mutation ($sessionId: ID!, $name: String!) { deleteSessionScratchpad(sessionId: $sessionId, name: $name) }`,
    { sessionId, name },
  );
  return data.deleteSessionScratchpad;
}

/**
 * A workflow run that wrote into a session, as the session page links to it.
 * Issue #420.
 *
 * The reverse of what a run records: an agent step files which session it talked
 * into, and this reads a session back to the runs that produced it. Small on
 * purpose — enough to tell one run from another where several wrote into one
 * session, and the id to open it.
 */
export interface SessionExecutionLink {
  id: string;
  /** The name the workflow had when the run started. */
  workflowName: string;
  /** ISO-8601 offset date-time. */
  startedAt: string;
  status: ExecutionStatus;
}

/**
 * The workflow run or runs that wrote into a session, newest first.
 *
 * Usually one; several where more than one run computed the same session key.
 * Empty for a session nothing wrote into, such as a chat — so the page draws no
 * control rather than an empty one.
 */
export async function fetchSessionExecutions(sessionId: string): Promise<SessionExecutionLink[]> {
  const data = await graphql<{ sessionExecutions: SessionExecutionLink[] }>(
    `query ($sessionId: ID!) {
       sessionExecutions(sessionId: $sessionId) { id workflowName startedAt status }
     }`,
    { sessionId },
  );
  return data.sessionExecutions;
}

/**
 * One session's transcript.
 *
 * `kinds` left out asks for every kind — as does an empty list, which is the
 * trap: a page where nothing is ticked means the whole transcript, not none of
 * it, so the filter sends nothing rather than an empty array only by accident.
 */
export async function fetchLlmSessionEvents(
  sessionId: string,
  options: {
    search?: string;
    kinds?: LlmSessionEventKind[];
    page?: number;
    size?: number;
    order?: LlmSessionEventOrder;
    ascending?: boolean;
  } = {},
): Promise<LlmSessionEventPage> {
  const data = await graphql<{ llmSessionEvents: LlmSessionEventPage }>(
    `query ($sessionId: ID!, $search: String, $kinds: [LlmSessionEventKind!], $page: Int, $size: Int,
            $order: LlmSessionEventOrder, $ascending: Boolean) {
       llmSessionEvents(sessionId: $sessionId, search: $search, kinds: $kinds, page: $page, size: $size,
                        order: $order, ascending: $ascending) {
         totalElements
         content { ${EVENT_FIELDS} }
       }
     }`,
    {
      sessionId,
      search: options.search || null,
      kinds: options.kinds === undefined || options.kinds.length === 0 ? null : options.kinds,
      page: options.page ?? 0,
      size: options.size ?? 20,
      order: options.order ?? null,
      ascending: options.ascending ?? null,
    },
  );
  return data.llmSessionEvents;
}
