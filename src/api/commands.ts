import { graphql } from './client';
import type { UsageTracking } from './usage';

/**
 * The Run button on a chat answer's shell blocks: a command run on the machine
 * the server is on, by an administrator, while Admin -> Settings allows it.
 */

/** What the chat may draw for this person: the block languages that run here, none where they may not. */
export interface CommandRunOffer {
  languages: string[];
  /** Whether Run as administrator can be offered. */
  elevation: boolean;
}

export type CommandRunState = 'RUNNING' | 'EXITED' | 'STOPPED' | 'TIMED_OUT' | 'DECLINED' | 'FAILED';

export interface CommandRun {
  id: string;
  state: CommandRunState;
  /** What it printed from the character asked for on. */
  output: string;
  /** Where the next read starts. */
  next: number;
  exitCode: number | null;
  /** What the operating system reported, where it did not simply exit. */
  message: string | null;
  truncated: boolean;
  elevated: boolean;
  timeoutSeconds: number;
}

/** The Admin -> Settings switch, with what a fresh installation would answer. */
export interface CommandRunSwitch extends UsageTracking {
  configured: boolean;
}

const RUN_FIELDS = 'id state output next exitCode message truncated elevated timeoutSeconds';

export async function fetchCommandRunsOffered(): Promise<CommandRunOffer> {
  const data = await graphql<{ commandRunsOffered: CommandRunOffer }>('query { commandRunsOffered { languages elevation } }');
  return data.commandRunsOffered;
}

export async function fetchCommandRunsEnabled(): Promise<CommandRunSwitch> {
  const data = await graphql<{ commandRunsEnabled: CommandRunSwitch }>(
    'query { commandRunsEnabled { enabled configured changedAt changedBy } }',
  );
  return data.commandRunsEnabled;
}

export async function setCommandRuns(enabled: boolean): Promise<CommandRunSwitch> {
  const data = await graphql<{ setCommandRuns: CommandRunSwitch }>(
    'mutation($enabled: Boolean!) { setCommandRuns(enabled: $enabled) { enabled configured changedAt changedBy } }',
    { enabled },
  );
  return data.setCommandRuns;
}

export async function runCommand(command: string, language: string, elevated: boolean): Promise<CommandRun> {
  const data = await graphql<{ runCommand: CommandRun }>(
    `mutation($command: String!, $language: String!, $elevated: Boolean) {
       runCommand(command: $command, language: $language, elevated: $elevated) { ${RUN_FIELDS} }
     }`,
    { command, language, elevated },
  );
  return data.runCommand;
}

export async function readCommandRun(id: string, from: number): Promise<CommandRun> {
  const data = await graphql<{ commandRun: CommandRun }>(
    `query($id: ID!, $from: Int) { commandRun(id: $id, from: $from) { ${RUN_FIELDS} } }`,
    { id, from },
  );
  return data.commandRun;
}

export async function stopCommandRun(id: string): Promise<CommandRun> {
  const data = await graphql<{ stopCommandRun: CommandRun }>(
    `mutation($id: ID!) { stopCommandRun(id: $id) { ${RUN_FIELDS} } }`,
    { id },
  );
  return data.stopCommandRun;
}
