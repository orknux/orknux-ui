import { graphql } from './client';

/**
 * The server's log levels, set from Admin -> Settings without a restart. Issue #591.
 *
 * What is set here is stored and applied on every server, survives a restart,
 * and is audited. Clearing a logger hands it back to the configuration file.
 */
export interface LoggerLevel {
  name: string;
  /** What was set here, or null where the configuration decides. */
  level: string | null;
  /** What the logger itself carries on this server now; null inherits. */
  configuredLevel: string | null;
  /** What it actually logs at. */
  effectiveLevel: string;
  /** What the configuration gives it; null inherits. */
  defaultLevel: string | null;
  /** When a root set below INFO goes back on its own, ISO-8601. */
  revertsAt: string | null;
}

export interface LogLevels {
  /** The root first, then the rest by name. */
  loggers: LoggerLevel[];
  /** Loggers worth offering that are not on the list yet. */
  suggestions: string[];
  /** What a level may be set to; INHERIT takes the parent's. */
  levels: string[];
  rootRevertMinutes: number;
  rootRevertMinutesConfigured: number;
  followSeconds: number;
  followSecondsConfigured: number;
}

/** The logger the server calls the root, whatever it was typed as. */
export const ROOT_LOGGER = 'ROOT';

const FIELDS = `
  loggers { name level configuredLevel effectiveLevel defaultLevel revertsAt }
  suggestions levels rootRevertMinutes rootRevertMinutesConfigured followSeconds followSecondsConfigured
`;

export async function fetchLogLevels(): Promise<LogLevels> {
  const data = await graphql<{ logLevels: LogLevels }>(`query { logLevels { ${FIELDS} } }`);
  return data.logLevels;
}

export async function setLogLevel(name: string, level: string): Promise<LogLevels> {
  const data = await graphql<{ setLogLevel: LogLevels }>(
    `mutation ($name: String!, $level: String!) { setLogLevel(name: $name, level: $level) { ${FIELDS} } }`,
    { name, level },
  );
  return data.setLogLevel;
}

export async function clearLogLevel(name: string): Promise<LogLevels> {
  const data = await graphql<{ clearLogLevel: LogLevels }>(
    `mutation ($name: String!) { clearLogLevel(name: $name) { ${FIELDS} } }`,
    { name },
  );
  return data.clearLogLevel;
}

export async function resetLogLevels(): Promise<LogLevels> {
  const data = await graphql<{ resetLogLevels: LogLevels }>(`mutation { resetLogLevels { ${FIELDS} } }`);
  return data.resetLogLevels;
}

export async function setLogRootRevertMinutes(minutes: number): Promise<LogLevels> {
  const data = await graphql<{ setLogRootRevertMinutes: LogLevels }>(
    `mutation ($minutes: Int!) { setLogRootRevertMinutes(minutes: $minutes) { ${FIELDS} } }`,
    { minutes },
  );
  return data.setLogRootRevertMinutes;
}

export async function setLogFollowSeconds(seconds: number): Promise<LogLevels> {
  const data = await graphql<{ setLogFollowSeconds: LogLevels }>(
    `mutation ($seconds: Int!) { setLogFollowSeconds(seconds: $seconds) { ${FIELDS} } }`,
    { seconds },
  );
  return data.setLogFollowSeconds;
}
