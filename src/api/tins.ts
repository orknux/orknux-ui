import { graphql } from './client';
import { t } from '../i18n';

/**
 * Tins: orktin instances, the sandboxes an agent is given a session with a
 * filesystem and commands in.
 *
 * There is one LOCAL tin, inside the server and switched in Admin Settings,
 * and any number of REMOTE ones registered by address and API token. An agent
 * is granted tins by label rather than by name, so a tin added later under a
 * label an agent already holds is one it can use without anybody editing it.
 *
 * The token is write-only, like every other credential here: `hasToken` is all
 * the server says about one.
 */
export type TinKind = 'LOCAL' | 'REMOTE';

export type TinHealthStatus = 'UP' | 'DOWN';

/** The id the local tin always has. */
export const LOCAL_TIN_ID = 'local';

export interface TinHealth {
  status: TinHealthStatus;
  /** What the tin said, or why it could not be asked. */
  detail: string | null;
}

export interface Tin {
  id: string;
  name: string;
  kind: TinKind;
  label: string | null;
  /** Where a remote tin answers; null for the local one, which is in-process. */
  address: string | null;
  hasToken: boolean;
  /** A remote tin's last answer; null for the local one, which has nothing to reach. */
  health: TinHealth | null;
  /** Null when the tin could not be asked. */
  activeSessions: number | null;
  createdAt: string | null;
}

export interface TinRuntime {
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

/** What a tin says about itself when asked. */
export interface TinInfo {
  name: string;
  version: string;
  defaultRuntime: string;
  defaultTtlSeconds: number;
  maxTtlSeconds: number;
  defaultIdleTimeoutSeconds: number;
  maxSessions: number;
  runtimes: TinRuntime[];
}

/** A session as the tin itself holds it - not tied to an Orknux session by anything here. */
export interface TinRemoteSession {
  id: string;
  status: string;
  runtime: string;
  image: string | null;
  labels: string;
  createdAt: string;
  lastActivityAt: string;
  expiresAt: string;
  runningExecutions: number;
  totalExecutions: number;
}

export interface TinConnectionTest {
  ok: boolean;
  message: string;
  version: string | null;
}

/** A tin session one agent session opened. */
export interface SessionTin {
  id: string;
  tinId: string;
  tinName: string;
  tinKind: TinKind;
  remoteSessionId: string;
  active: boolean;
  status: string;
  createdAt: string;
  lastUsedAt: string | null;
}

/** One line of what happened in a tin session. `data` is JSON text. */
export interface TinEvent {
  seq: number;
  at: string;
  type: string;
  data: string;
}

export interface TinLog {
  events: TinEvent[];
  /** What to ask for next, so a poll only brings what is new. */
  nextSeq: number;
  /** False when the tin could not hand its log over; `message` says why. */
  available: boolean;
  message: string | null;
}

export interface TinInput {
  name: string;
  label?: string | null;
  address?: string | null;
  /** On an update: null keeps the stored token and "" clears it. */
  token?: string | null;
}

/** How the type column names a kind. */
export function tinKindLabel(kind: TinKind): string {
  return kind === 'LOCAL' ? t('Local') : t('Remote');
}

const TIN_FIELDS =
  'id name kind label address hasToken health { status detail } activeSessions createdAt';

const RUNTIME_FIELDS =
  'name available unavailableReason os workdir shell defaultImage images networkModes caches ' +
  'defaultCpus defaultMemoryMb maxCpus maxMemoryMb diskLimitEnforced';

const SESSION_TIN_FIELDS = 'id tinId tinName tinKind remoteSessionId active status createdAt lastUsedAt';

export async function fetchTins(): Promise<Tin[]> {
  const data = await graphql<{ tins: Tin[] }>(`query Tins { tins { ${TIN_FIELDS} } }`);
  return data.tins;
}

/** One tin, or null when there is no such tin - so a page opened on a stale id can say so. */
export async function fetchTin(id: string): Promise<Tin | null> {
  const data = await graphql<{ tin: Tin | null }>(`query Tin($id: ID!) { tin(id: $id) { ${TIN_FIELDS} } }`, { id });
  return data.tin;
}

/** What the tin says about itself. Refused as TinUnreachable when it cannot be asked. */
export async function fetchTinInfo(id: string): Promise<TinInfo> {
  const data = await graphql<{ tinInfo: TinInfo }>(
    `query TinInfo($id: ID!) {
       tinInfo(id: $id) {
         name version defaultRuntime defaultTtlSeconds maxTtlSeconds defaultIdleTimeoutSeconds maxSessions
         runtimes { ${RUNTIME_FIELDS} }
       }
     }`,
    { id },
  );
  return data.tinInfo;
}

export async function fetchTinSessions(id: string): Promise<TinRemoteSession[]> {
  const data = await graphql<{ tinSessions: TinRemoteSession[] }>(
    `query TinSessions($id: ID!) {
       tinSessions(id: $id) {
         id status runtime image labels createdAt lastActivityAt expiresAt runningExecutions totalExecutions
       }
     }`,
    { id },
  );
  return data.tinSessions;
}

/** The labels tins carry now, offered as somebody types one. */
export async function fetchTinLabels(): Promise<string[]> {
  const data = await graphql<{ tinLabels: string[] }>(`query TinLabels { tinLabels }`);
  return data.tinLabels;
}

export async function createTin(input: TinInput): Promise<Tin> {
  const data = await graphql<{ createTin: Tin }>(
    `mutation CreateTin($input: TinInput!) { createTin(input: $input) { ${TIN_FIELDS} } }`,
    { input },
  );
  return data.createTin;
}

export async function updateTin(id: string, input: TinInput): Promise<Tin> {
  const data = await graphql<{ updateTin: Tin }>(
    `mutation UpdateTin($id: ID!, $input: TinInput!) { updateTin(id: $id, input: $input) { ${TIN_FIELDS} } }`,
    { id, input },
  );
  return data.updateTin;
}

export async function deleteTin(id: string): Promise<boolean> {
  const data = await graphql<{ deleteTin: boolean }>(`mutation DeleteTin($id: ID!) { deleteTin(id: $id) }`, { id });
  return data.deleteTin;
}

/**
 * Asks a tin at an address whether it answers, before anything is saved.
 *
 * A null token with an id uses the token stored on that tin, so an edit that
 * changes only the address can be tested without pasting the token again.
 */
export async function testTinConnection(
  address: string,
  token: string | null,
  id: string | null,
): Promise<TinConnectionTest> {
  const data = await graphql<{ testTinConnection: TinConnectionTest }>(
    `mutation TestTinConnection($address: String!, $token: String, $id: ID) {
       testTinConnection(address: $address, token: $token, id: $id) { ok message version }
     }`,
    { address, token, id },
  );
  return data.testTinConnection;
}

/** The tin sessions one agent session opened, active and closed alike. */
export async function fetchSessionTins(sessionId: string): Promise<SessionTin[]> {
  const data = await graphql<{ sessionTins: SessionTin[] }>(
    `query SessionTins($sessionId: ID!) { sessionTins(sessionId: $sessionId) { ${SESSION_TIN_FIELDS} } }`,
    { sessionId },
  );
  return data.sessionTins;
}

/** One tin session's log, from `after` on; leave it out for the whole of it. */
export async function fetchSessionTinLog(sessionId: string, sessionTinId: string, after?: number): Promise<TinLog> {
  const data = await graphql<{ sessionTinLog: TinLog }>(
    `query SessionTinLog($sessionId: ID!, $sessionTinId: ID!, $after: Int) {
       sessionTinLog(sessionId: $sessionId, sessionTinId: $sessionTinId, after: $after) {
         events { seq at type data } nextSeq available message
       }
     }`,
    { sessionId, sessionTinId, after: after ?? null },
  );
  return data.sessionTinLog;
}
