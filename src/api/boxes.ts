import { graphql } from './client';
import { t } from '../i18n';

/**
 * Boxes: Orkbox instances, the sandboxes an agent is given a session with a
 * filesystem and commands in.
 *
 * There is one LOCAL box, inside the server and switched in Admin Settings,
 * and any number of REMOTE ones registered by address and API token. An agent
 * is granted boxes by label rather than by name, so a box added later under a
 * label an agent already holds is one it can use without anybody editing it.
 *
 * The token is write-only, like every other credential here: `hasToken` is all
 * the server says about one.
 */
export type BoxKind = 'LOCAL' | 'REMOTE';

export type BoxHealthStatus = 'UP' | 'DOWN';

/** The id the local box always has. */
export const LOCAL_BOX_ID = 'local';

export interface BoxHealth {
  status: BoxHealthStatus;
  /** What the box said, or why it could not be asked. */
  detail: string | null;
}

export interface Box {
  id: string;
  name: string;
  kind: BoxKind;
  label: string | null;
  /** Where a remote box answers; null for the local one, which is in-process. */
  address: string | null;
  hasToken: boolean;
  /** A remote box's last answer; null for the local one, which has nothing to reach. */
  health: BoxHealth | null;
  /** Null when the box could not be asked. */
  activeSessions: number | null;
  createdAt: string | null;
}

export interface BoxRuntime {
  name: string;
  available: boolean;
  unavailableReason: string | null;
  os: string;
  workdir: string | null;
  shell: string[];
  defaultImage: string | null;
  images: string[] | null;
  networkModes: string[];
  caches: string[];
  defaultCpus: number | null;
  defaultMemoryMb: number | null;
  maxCpus: number | null;
  maxMemoryMb: number | null;
  diskLimitEnforced: boolean | null;
}

/** What a box says about itself when asked. */
export interface BoxInfo {
  name: string;
  version: string;
  defaultRuntime: string;
  defaultTtlSeconds: number;
  maxTtlSeconds: number;
  defaultIdleTimeoutSeconds: number;
  maxSessions: number;
  runtimes: BoxRuntime[];
}

/** A session as the box itself holds it - not tied to an Orknux session by anything here. */
export interface BoxRemoteSession {
  id: string;
  status: string;
  /** Null for a recorded session the box no longer holds. */
  runtime: string | null;
  image: string | null;
  labels: string;
  createdAt: string;
  lastActivityAt: string;
  expiresAt: string | null;
  runningExecutions: number;
  totalExecutions: number;
  /** The conversation that opened it, and its page with this session open; null when nobody here opened it. */
  orknuxSessionId: string | null;
  orknuxSessionUrl: string | null;
  agentName: string | null;
  active: boolean;
}

export interface BoxConnectionTest {
  ok: boolean;
  message: string;
  version: string | null;
}

/** A box session one agent session opened. */
export interface SessionBox {
  id: string;
  boxId: string;
  boxName: string;
  boxKind: BoxKind;
  /** The box's label, or null where it has none. */
  boxLabel: string | null;
  remoteSessionId: string;
  active: boolean;
  status: string;
  createdAt: string;
  lastUsedAt: string | null;
}

/** One line of what happened in a box session. `data` is JSON text. */
export interface BoxEvent {
  seq: number;
  at: string;
  type: string;
  data: string;
}

export interface BoxLog {
  events: BoxEvent[];
  /** What to ask for next, so a poll only brings what is new. */
  nextSeq: number;
  /** False when the box could not hand its log over; `message` says why. */
  available: boolean;
  message: string | null;
}

export interface BoxInput {
  name: string;
  label?: string | null;
  address?: string | null;
  /** On an update: null keeps the stored token and "" clears it. */
  token?: string | null;
}

/** How the type column names a kind. */
export function boxKindLabel(kind: BoxKind): string {
  return kind === 'LOCAL' ? t('Local') : t('Remote');
}

const BOX_FIELDS =
  'id name kind label address hasToken health { status detail } activeSessions createdAt';

const RUNTIME_FIELDS =
  'name available unavailableReason os workdir shell defaultImage images networkModes caches ' +
  'defaultCpus defaultMemoryMb maxCpus maxMemoryMb diskLimitEnforced';

const SESSION_BOX_FIELDS = 'id boxId boxName boxKind boxLabel remoteSessionId active status createdAt lastUsedAt';

export async function fetchBoxes(): Promise<Box[]> {
  const data = await graphql<{ boxes: Box[] }>(`query Boxes { boxes { ${BOX_FIELDS} } }`);
  return data.boxes;
}

/** One box, or null when there is no such box - so a page opened on a stale id can say so. */
export async function fetchBox(id: string): Promise<Box | null> {
  const data = await graphql<{ box: Box | null }>(`query Box($id: ID!) { box(id: $id) { ${BOX_FIELDS} } }`, { id });
  return data.box;
}

/** What the box says about itself. Refused as BoxUnreachable when it cannot be asked. */
export async function fetchBoxInfo(id: string): Promise<BoxInfo> {
  const data = await graphql<{ boxInfo: BoxInfo }>(
    `query BoxInfo($id: ID!) {
       boxInfo(id: $id) {
         name version defaultRuntime defaultTtlSeconds maxTtlSeconds defaultIdleTimeoutSeconds maxSessions
         runtimes { ${RUNTIME_FIELDS} }
       }
     }`,
    { id },
  );
  return data.boxInfo;
}

export async function fetchBoxSessions(id: string): Promise<BoxRemoteSession[]> {
  const data = await graphql<{ boxSessions: BoxRemoteSession[] }>(
    `query BoxSessions($id: ID!) {
       boxSessions(id: $id) {
         id status runtime image labels createdAt lastActivityAt expiresAt runningExecutions totalExecutions
         orknuxSessionId orknuxSessionUrl agentName active
       }
     }`,
    { id },
  );
  return data.boxSessions;
}

/** The labels boxes carry now, offered as somebody types one. */
export async function fetchBoxLabels(): Promise<string[]> {
  const data = await graphql<{ boxLabels: string[] }>(`query BoxLabels { boxLabels }`);
  return data.boxLabels;
}

export async function createBox(input: BoxInput): Promise<Box> {
  const data = await graphql<{ createBox: Box }>(
    `mutation CreateBox($input: BoxInput!) { createBox(input: $input) { ${BOX_FIELDS} } }`,
    { input },
  );
  return data.createBox;
}

export async function updateBox(id: string, input: BoxInput): Promise<Box> {
  const data = await graphql<{ updateBox: Box }>(
    `mutation UpdateBox($id: ID!, $input: BoxInput!) { updateBox(id: $id, input: $input) { ${BOX_FIELDS} } }`,
    { id, input },
  );
  return data.updateBox;
}

/** The stored token, for the eye on the token box. Administrators only, and audited. */
export async function revealBoxToken(id: string): Promise<string | null> {
  const data = await graphql<{ revealBoxToken: string | null }>(`mutation RevealBoxToken($id: ID!) { revealBoxToken(id: $id) }`, { id });
  return data.revealBoxToken;
}

export async function deleteBox(id: string): Promise<boolean> {
  const data = await graphql<{ deleteBox: boolean }>(`mutation DeleteBox($id: ID!) { deleteBox(id: $id) }`, { id });
  return data.deleteBox;
}

/**
 * Asks a box at an address whether it answers, before anything is saved.
 *
 * A null token with an id uses the token stored on that box, so an edit that
 * changes only the address can be tested without pasting the token again.
 */
export async function testBoxConnection(
  address: string,
  token: string | null,
  id: string | null,
): Promise<BoxConnectionTest> {
  const data = await graphql<{ testBoxConnection: BoxConnectionTest }>(
    `mutation TestBoxConnection($address: String!, $token: String, $id: ID) {
       testBoxConnection(address: $address, token: $token, id: $id) { ok message version }
     }`,
    { address, token, id },
  );
  return data.testBoxConnection;
}

/** The box sessions one agent session opened, active and closed alike. */
export async function fetchSessionBoxes(sessionId: string): Promise<SessionBox[]> {
  const data = await graphql<{ sessionBoxes: SessionBox[] }>(
    `query SessionBoxes($sessionId: ID!) { sessionBoxes(sessionId: $sessionId) { ${SESSION_BOX_FIELDS} } }`,
    { sessionId },
  );
  return data.sessionBoxes;
}

/** One box session's log, from `after` on; leave it out for the whole of it. */
export async function fetchSessionBoxLog(sessionId: string, sessionBoxId: string, after?: number): Promise<BoxLog> {
  const data = await graphql<{ sessionBoxLog: BoxLog }>(
    `query SessionBoxLog($sessionId: ID!, $sessionBoxId: ID!, $after: Int) {
       sessionBoxLog(sessionId: $sessionId, sessionBoxId: $sessionBoxId, after: $after) {
         events { seq at type data } nextSeq available message
       }
     }`,
    { sessionId, sessionBoxId, after: after ?? null },
  );
  return data.sessionBoxLog;
}

/** A stretch of what one command printed, stdout and stderr together as the box interleaved them. */
export interface BoxOutput {
  text: string;
  /** Where this stretch starts, in bytes. */
  offset: number;
  /** Where the next read starts: `offset` plus the bytes returned. */
  nextOffset: number;
  /** The command has finished and everything it printed has been read. */
  done: boolean;
  /** False when the output cannot be had; `message` says why. */
  available: boolean;
  /** Why it cannot be had, or a word about text that is handed over anyway. */
  message: string | null;
  /** The most of one output the interface reads and holds, in bytes - an Admin Settings knob. */
  shownLimit: number;
}

/**
 * One execution's output from `offset` (default 0), at most `limit` bytes
 * (the server's default is 16 KB). A reader follows `nextOffset` until `done`.
 */
export async function fetchSessionBoxOutput(
  sessionId: string,
  sessionBoxId: string,
  executionId: string,
  offset?: number,
  limit?: number,
): Promise<BoxOutput> {
  const data = await graphql<{ sessionBoxOutput: BoxOutput }>(
    `query SessionBoxOutput($sessionId: ID!, $sessionBoxId: ID!, $executionId: String!, $offset: Int, $limit: Int) {
       sessionBoxOutput(sessionId: $sessionId, sessionBoxId: $sessionBoxId, executionId: $executionId, offset: $offset, limit: $limit) {
         text offset nextOffset done available message shownLimit
       }
     }`,
    { sessionId, sessionBoxId, executionId, offset: offset ?? null, limit: limit ?? null },
  );
  return data.sessionBoxOutput;
}

/** Where a port an agent asked to expose stands. */
export type BoxPortState = 'PENDING' | 'ENABLED' | 'DISABLED' | 'REFUSED';

/** A port an agent asked to expose out of a box session, and what a person made of it. */
export interface BoxPort {
  id: string;
  sessionBoxId: string;
  boxName: string;
  /** The label of the box the session runs on, as it is now. */
  boxLabel: string | null;
  port: number;
  reason: string | null;
  state: BoxPortState;
  url: string | null;
  /** Set when the address opens only on the box's own machine. */
  note: string | null;
  requestedBy: string | null;
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  /** Whether something answers on it now; false without looking unless it is open. */
  alive: boolean;
  checkedAt: string | null;
}

const BOX_PORT_FIELDS =
  'id sessionBoxId boxName boxLabel port reason state url note requestedBy createdAt decidedAt decidedBy alive checkedAt';

export async function fetchSessionBoxPorts(sessionId: string): Promise<BoxPort[]> {
  const data = await graphql<{ sessionBoxPorts: BoxPort[] }>(
    `query SessionBoxPorts($sessionId: ID!) { sessionBoxPorts(sessionId: $sessionId) { ${BOX_PORT_FIELDS} } }`,
    { sessionId },
  );
  return data.sessionBoxPorts;
}

export async function enableBoxPort(id: string): Promise<BoxPort> {
  const data = await graphql<{ enableBoxPort: BoxPort }>(
    `mutation EnableBoxPort($id: ID!) { enableBoxPort(id: $id) { ${BOX_PORT_FIELDS} } }`,
    { id },
  );
  return data.enableBoxPort;
}

export async function disableBoxPort(id: string): Promise<BoxPort> {
  const data = await graphql<{ disableBoxPort: BoxPort }>(
    `mutation DisableBoxPort($id: ID!) { disableBoxPort(id: $id) { ${BOX_PORT_FIELDS} } }`,
    { id },
  );
  return data.disableBoxPort;
}

export async function deleteBoxPort(id: string): Promise<void> {
  await graphql<{ deleteBoxPort: string }>(`mutation DeleteBoxPort($id: ID!) { deleteBoxPort(id: $id) }`, { id });
}
