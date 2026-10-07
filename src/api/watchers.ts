import { graphql } from './client';

/**
 * Watchers. Issue #606.
 *
 * A tool an agent asked the server to call on an interval until its result
 * matches a condition, which then wakes the agent in the conversation it was
 * set in. The workspace's Watchers page reads and stops them; Admin ->
 * Settings -> Watchers bounds them.
 */
export type WatcherConditionKind = 'JSONPATH' | 'REGEX';

export type WatcherStatus = 'ACTIVE' | 'FIRED' | 'TIMED_OUT' | 'FINISHED' | 'STOPPED' | 'FAILED';

export interface Watcher {
  id: string;
  sessionId: string;
  sessionTitle: string | null;
  agentName: string;
  tool: string;
  /** The JSON object the tool is called with. */
  arguments: string;
  conditionKind: WatcherConditionKind;
  condition: string;
  /** The part of the tool's result the condition is held against; `$` is all of it. */
  toolResultPath: string;
  intervalSeconds: number;
  /** How often its agent is woken to look at the result itself; null for never. */
  agentCheckIntervalSeconds: number | null;
  timeoutSeconds: number;
  note: string | null;
  /** What it is for, in one line for a person; null where the agent gave none. */
  description: string | null;
  status: WatcherStatus;
  checks: number;
  matched: string | null;
  /** How it ended, in a sentence; null while it runs. */
  outcome: string | null;
  createdAt: string;
  expiresAt: string;
  nextCheckAt: string;
  lastCheckedAt: string | null;
  /** What the tool returned on the last check. */
  lastResult: string | null;
  finishedAt: string | null;
}

export interface WatcherPage {
  content: Watcher[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface WatcherSettings {
  maxSeconds: number;
  maxSecondsConfigured: number;
  minIntervalSeconds: number;
  minIntervalSecondsConfigured: number;
  maxPerAgent: number;
  maxPerAgentConfigured: number;
  minAgentCheckSeconds: number;
  minAgentCheckSecondsConfigured: number;
}

const FIELDS = `id sessionId sessionTitle agentName tool arguments conditionKind condition toolResultPath intervalSeconds
  agentCheckIntervalSeconds timeoutSeconds note description status checks matched outcome createdAt expiresAt nextCheckAt lastCheckedAt lastResult finishedAt`;

const SETTINGS = `maxSeconds maxSecondsConfigured minIntervalSeconds minIntervalSecondsConfigured
  maxPerAgent maxPerAgentConfigured minAgentCheckSeconds minAgentCheckSecondsConfigured`;

/** The running ones, newest first; or, `finished`, every one that has ended, most recently ended first. */
export async function fetchWatchers(
  workspaceId: string,
  finished: boolean,
  page = 0,
  size = 50,
): Promise<WatcherPage> {
  const data = await graphql<{ watchers: WatcherPage }>(
    `query ($workspaceId: ID!, $finished: Boolean, $page: Int, $size: Int) {
       watchers(workspaceId: $workspaceId, finished: $finished, page: $page, size: $size) {
         page size totalElements totalPages content { ${FIELDS} }
       }
     }`,
    { workspaceId, finished, page, size },
  );
  return data.watchers;
}

/** Ends a running one; its agent is told, in its conversation. */
export async function stopWatcher(id: string): Promise<Watcher> {
  const data = await graphql<{ stopWatcher: Watcher }>(
    `mutation ($id: ID!) { stopWatcher(id: $id) { ${FIELDS} } }`,
    { id },
  );
  return data.stopWatcher;
}

export async function fetchWatcherSettings(): Promise<WatcherSettings> {
  const data = await graphql<{ watcherSettings: WatcherSettings }>(`query { watcherSettings { ${SETTINGS} } }`);
  return data.watcherSettings;
}

export async function setWatcherMaxSeconds(seconds: number): Promise<WatcherSettings> {
  const data = await graphql<{ setWatcherMaxSeconds: WatcherSettings }>(
    `mutation ($seconds: Int!) { setWatcherMaxSeconds(seconds: $seconds) { ${SETTINGS} } }`,
    { seconds },
  );
  return data.setWatcherMaxSeconds;
}

export async function setWatcherMinIntervalSeconds(seconds: number): Promise<WatcherSettings> {
  const data = await graphql<{ setWatcherMinIntervalSeconds: WatcherSettings }>(
    `mutation ($seconds: Int!) { setWatcherMinIntervalSeconds(seconds: $seconds) { ${SETTINGS} } }`,
    { seconds },
  );
  return data.setWatcherMinIntervalSeconds;
}

export async function setWatcherMinAgentCheckSeconds(seconds: number): Promise<WatcherSettings> {
  const data = await graphql<{ setWatcherMinAgentCheckSeconds: WatcherSettings }>(
    `mutation ($seconds: Int!) { setWatcherMinAgentCheckSeconds(seconds: $seconds) { ${SETTINGS} } }`,
    { seconds },
  );
  return data.setWatcherMinAgentCheckSeconds;
}

export async function setWatcherMaxPerAgent(count: number): Promise<WatcherSettings> {
  const data = await graphql<{ setWatcherMaxPerAgent: WatcherSettings }>(
    `mutation ($count: Int!) { setWatcherMaxPerAgent(count: $count) { ${SETTINGS} } }`,
    { count },
  );
  return data.setWatcherMaxPerAgent;
}
