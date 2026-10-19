import { graphql } from './client';

/**
 * Schedules: a reminder an agent sets for itself that comes back on a
 * schedule - every so many seconds, or by a cron - rather than once, as a
 * timer does. Each run wakes the agent in the conversation it was set in. The
 * workspace's Schedules page reads and stops them; Admin -> Settings ->
 * Schedules bounds them.
 */
export type ScheduleStatus = 'ACTIVE' | 'STOPPED' | 'ENDED';

export interface Schedule {
  id: string;
  sessionId: string;
  sessionTitle: string | null;
  agentName: string;
  note: string;
  /** Every this many seconds; null for a cron schedule. */
  everySeconds: number | null;
  /** A five-field cron; null for an interval schedule. */
  cron: string | null;
  timezone: string | null;
  status: ScheduleStatus;
  runs: number;
  /** The most runs it makes before it ends; null for no limit. */
  times: number | null;
  /** When it ends by itself; null for never. */
  until: string | null;
  createdAt: string;
  /** When it next runs; null once it has ended. */
  nextRunAt: string | null;
  lastRunAt: string | null;
  finishedAt: string | null;
  /** How it ended, in a sentence; null while active. */
  outcome: string | null;
}

export interface SchedulePage {
  content: Schedule[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface ScheduleSettings {
  minIntervalSeconds: number;
  minIntervalSecondsConfigured: number;
  maxPerAgent: number;
  maxPerAgentConfigured: number;
}

const FIELDS = `id sessionId sessionTitle agentName note everySeconds cron timezone status runs times until
  createdAt nextRunAt lastRunAt finishedAt outcome`;
const SETTINGS = 'minIntervalSeconds minIntervalSecondsConfigured maxPerAgent maxPerAgentConfigured';

export async function fetchSchedules(workspaceId: string, ended: boolean, page: number, size: number): Promise<SchedulePage> {
  const data = await graphql<{ schedules: SchedulePage }>(
    `query Schedules($workspaceId: ID!, $ended: Boolean, $page: Int, $size: Int) {
       schedules(workspaceId: $workspaceId, ended: $ended, page: $page, size: $size) {
         content { ${FIELDS} } page size totalElements totalPages
       }
     }`,
    { workspaceId, ended, page, size },
  );
  return data.schedules;
}

export async function fetchSessionSchedules(sessionId: string): Promise<Schedule[]> {
  const data = await graphql<{ sessionSchedules: Schedule[] }>(
    `query SessionSchedules($sessionId: ID!) { sessionSchedules(sessionId: $sessionId) { ${FIELDS} } }`,
    { sessionId },
  );
  return data.sessionSchedules;
}

export async function stopSchedule(id: string): Promise<Schedule> {
  const data = await graphql<{ stopSchedule: Schedule }>(
    `mutation StopSchedule($id: ID!) { stopSchedule(id: $id) { ${FIELDS} } }`,
    { id },
  );
  return data.stopSchedule;
}

export async function fetchScheduleSettings(): Promise<ScheduleSettings> {
  const data = await graphql<{ scheduleSettings: ScheduleSettings }>(`query ScheduleSettings { scheduleSettings { ${SETTINGS} } }`);
  return data.scheduleSettings;
}

export async function setScheduleMinIntervalSeconds(seconds: number): Promise<ScheduleSettings> {
  const data = await graphql<{ setScheduleMinIntervalSeconds: ScheduleSettings }>(
    `mutation SetScheduleMinIntervalSeconds($seconds: Int!) { setScheduleMinIntervalSeconds(seconds: $seconds) { ${SETTINGS} } }`,
    { seconds },
  );
  return data.setScheduleMinIntervalSeconds;
}

export async function setScheduleMaxPerAgent(count: number): Promise<ScheduleSettings> {
  const data = await graphql<{ setScheduleMaxPerAgent: ScheduleSettings }>(
    `mutation SetScheduleMaxPerAgent($count: Int!) { setScheduleMaxPerAgent(count: $count) { ${SETTINGS} } }`,
    { count },
  );
  return data.setScheduleMaxPerAgent;
}
