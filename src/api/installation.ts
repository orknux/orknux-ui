import { graphql } from './client';

/**
 * What this installation allows, as the configuration file and the screen agree
 * it.
 *
 * The file is the floor: what it forbids cannot be switched back on here, which
 * is why `attachmentsConfigurable` exists — an operator who turned attachments
 * off owns the disk, and a browser does not get to overrule that.
 */
export interface InstallationSettings {
  attachmentsEnabled: boolean;
  attachmentsConfigurable: boolean;
  /** Where the bytes go; FILESYSTEM is the only one today. */
  attachmentStorage: string;
  /** The directory they are written under, shown so it can be checked. */
  attachmentLocation: string;
  attachmentMaxFileSizeMb: number;
  /** Whether this installation has a chat at all. */
  chatEnabled: boolean;
  chatConfigurable: boolean;
  /** Whether `/actuator/prometheus` answers a caller who has not signed in. */
  metricsAnonymous: boolean;
  /**
   * What a fresh installation would have answered: ORKNUX_METRICS_ANONYMOUS.
   *
   * Not a `configurable` flag like the two above it — nothing here is forbidden
   * by the file. It is the environment's answer, kept beside the stored one so
   * the page can say which of the two is actually in force when they differ.
   */
  metricsAnonymousConfigured: boolean;
  /**
   * How many days of component history are kept.
   *
   * A version of a function, tool, skill or agent is a whole copy of what it
   * was before a save — the code, the parameters, the prompt — so this is the
   * number that decides how much disk the history takes. Fourteen days unless
   * an administrator has said otherwise.
   */
  revisionRetentionDays: number;
  /** What a fresh installation would keep: ORKNUX_REVISION_RETENTION_DAYS. */
  revisionRetentionDaysConfigured: number;
  /**
   * How long a finished run is kept before a sweep takes it.
   *
   * The same bargain as the setting above - the file is where a fresh
   * installation starts, this screen is the answer from then on - with a longer
   * default, because a run is the record of something that happened and gets
   * asked about weeks later. A run still going is never swept.
   */
  executionRetentionDays: number;
  executionRetentionDaysConfigured: number;
  /**
   * How many minutes a task may sit queued before something hands it over
   * again.
   *
   * The net under the hand-over. A task whose start was lost — to a process
   * killed at the wrong moment, or a workflow that could not run — would
   * otherwise say Queued for ever. Five minutes unless somebody has said
   * otherwise.
   */
  taskSweepMinutes: number;
  /** What a fresh installation would wait: ORKNUX_TASK_SWEEP_MINUTES. */
  taskSweepMinutesConfigured: number;
  /**
   * How large one of a plugin's source files may be, in KB - the plugin
   * itself, each library it ships, and each file a load-from-URL fetches.
   */
  pluginMaxSourceKb: number;
  /** What a fresh installation allows: the built-in default. */
  pluginMaxSourceKbConfigured: number;
  /** How long a plugin may take to load, in seconds. */
  pluginTimeoutSeconds: number;
  /** What a fresh installation waits, before anybody changed it. */
  pluginTimeoutSecondsConfigured: number;
  /**
   * How many rounds of tool calls an agent gets before it must answer.
   *
   * One call to the model is a round: it answers, or it asks for tools and what
   * it asks for is run and handed back. An agent may carry its own number; this
   * is what the rest of them follow.
   */
  chatMaxRounds: number;
  /** What a fresh installation allows, before anybody changed it. */
  chatMaxRoundsConfigured: number;
  /**
   * The longest one of an agent's own waits may be, in seconds.
   *
   * An agent may end its turn with a wake-up instead of an answer: the step
   * parks and the run comes back to that node when the time is up. A model
   * asking for longer than this is given this instead.
   */
  agentSleepSeconds: number;
  /** What a fresh installation allows, before anybody changed it. */
  agentSleepSecondsConfigured: number;
  /** How many times in a row one step's agent may wait; zero is never. */
  agentSleepTimes: number;
  /** What a fresh installation allows, before anybody changed it. */
  agentSleepTimesConfigured: number;
  /**
   * How many other agents one agent may ask in one conversation; zero is none.
   *
   * Each ask is a conversation of its own with its own model calls, so this
   * bounds what one question can fan out into. A workspace may carry its own
   * number, which wins. Issue #380.
   */
  agentMaxSubagents: number;
  /** What a fresh installation allows, before anybody changed it. */
  agentMaxSubagentsConfigured: number;
  /**
   * How many of those asks may be working at once. Issue #461.
   *
   * A different number from the one above, and one that only started meaning
   * anything when asking stopped blocking (#462): before that the asks ran one
   * after another whatever this said.
   */
  agentMaxSubagentsAtOnce: number;
  agentMaxSubagentsAtOnceConfigured: number;
  /**
   * How many steps of one workflow run may be running at once. Issue #285.
   *
   * A node with lines to several others sends the run down all of them side
   * by side; a step past this waits for another to finish.
   */
  workflowStepsAtOnce: number;
  workflowStepsAtOnceConfigured: number;
  /**
   * The loop guard. Issue #516.
   *
   * Repetition on its own is not the fault - an agent watching something calls
   * the same tool with the same arguments and is working. What makes it a loop
   * is how close together the calls are.
   */
  maxRepeatedToolCalls: number;
  maxRepeatedToolCallsConfigured: number;
  maxToolCallsAtOnce: number;
  maxToolCallsAtOnceConfigured: number;
  longestStoredValue: number;
  longestStoredValueConfigured: number;
  drawingScale: number;
  drawingScaleConfigured: number;
  sessionCompactAfterTokens: number;
  sessionCompactAfterTokensConfigured: number;
  sessionCompactionKeepTurns: number;
  sessionCompactionKeepTurnsConfigured: number;
  sessionCompactionSummaryTokens: number;
  sessionCompactionSummaryTokensConfigured: number;
  sessionCompactionAttempts: number;
  sessionCompactionAttemptsConfigured: number;
  repeatedToolCallsWindowSeconds: number;
  repeatedToolCallsWindowSecondsConfigured: number;
  repeatedToolCallWarnings: number;
  repeatedToolCallWarningsConfigured: number;
  /**
   * How many bytes one session's scratchpads may hold in all. Issue #411.
   *
   * A scratchpad is a working file a model writes at will; this bounds how much
   * one conversation's pads can occupy, counted across all of them.
   */
  scratchpadBudgetBytes: number;
  /** What a fresh installation allows before anybody sets it. */
  scratchpadBudgetBytesConfigured: number;
  /** What marks a command in a message here; a workspace may carry its own. Issue #402. */
  commandMarker: string;
  /** What a fresh installation starts on. */
  commandMarkerConfigured: string;
  /**
   * Up to how many findable tools find_tools names outright in its own
   * description, so a model asks for one by name; zero never names them.
   * Issue #442.
   */
  toolsNamedInSearch: number;
  /**
   * How many tools an agent may hold before the lines in its briefing are cut,
   * and by how much each further block of that many cuts them. Issue #481.
   */
  /** What the files in one session's scratchpads may come to, in bytes. Issue #491. */
  scratchpadFileBudgetBytes: number;
  scratchpadFileBudgetBytesConfigured: number;
  /** How long a scratchpad nobody touches is kept, in days; zero is for ever. Issue #492. */
  scratchpadKeepDays: number;
  scratchpadKeepDaysConfigured: number;
  toolSummariesFullUpTo: number;
  toolSummariesFullUpToConfigured: number;
  toolSummaryTrimPercent: number;
  toolSummaryTrimPercentConfigured: number;
  /** What a fresh installation names before anybody changed it. */
  toolsNamedInSearchConfigured: number;
  /**
   * Whether a conversation may be thrown away.
   *
   * A session is the record of what an agent was asked and what it answered,
   * and on some installations that is the only account of a decision anybody
   * has. True until an operator turns it off, which is how this has always
   * worked.
   */
  sessionsRemovable: boolean;
  /**
   * False where the installation runs Temporal, and the field is not offered.
   *
   * A `configurable` flag like `chatConfigurable`, and the fact behind it is
   * which engine carries tasks. The sweep runs either way; what is not an
   * administrator's decision on Temporal is how long it waits.
   */
  taskSweepConfigurable: boolean;
}

const FIELDS =
  'attachmentsEnabled attachmentsConfigurable attachmentStorage attachmentLocation attachmentMaxFileSizeMb ' +
  'chatEnabled chatConfigurable metricsAnonymous metricsAnonymousConfigured ' +
  'revisionRetentionDays revisionRetentionDaysConfigured ' +
  'executionRetentionDays executionRetentionDaysConfigured ' +
  'taskSweepMinutes taskSweepMinutesConfigured taskSweepConfigurable ' +
  'pluginMaxSourceKb pluginMaxSourceKbConfigured pluginTimeoutSeconds pluginTimeoutSecondsConfigured ' +
  'chatMaxRounds chatMaxRoundsConfigured ' +
  'agentSleepSeconds agentSleepSecondsConfigured agentSleepTimes agentSleepTimesConfigured ' +
  'agentMaxSubagents agentMaxSubagentsConfigured agentMaxSubagentsAtOnce agentMaxSubagentsAtOnceConfigured workflowStepsAtOnce workflowStepsAtOnceConfigured maxRepeatedToolCalls maxRepeatedToolCallsConfigured repeatedToolCallsWindowSeconds repeatedToolCallsWindowSecondsConfigured repeatedToolCallWarnings repeatedToolCallWarningsConfigured maxToolCallsAtOnce maxToolCallsAtOnceConfigured longestStoredValue longestStoredValueConfigured drawingScale drawingScaleConfigured sessionCompactAfterTokens sessionCompactAfterTokensConfigured sessionCompactionKeepTurns sessionCompactionKeepTurnsConfigured sessionCompactionSummaryTokens sessionCompactionSummaryTokensConfigured sessionCompactionAttempts sessionCompactionAttemptsConfigured scratchpadBudgetBytes scratchpadBudgetBytesConfigured commandMarker commandMarkerConfigured ' +
  'toolsNamedInSearch toolsNamedInSearchConfigured scratchpadFileBudgetBytes scratchpadFileBudgetBytesConfigured ' +
  'scratchpadKeepDays scratchpadKeepDaysConfigured toolSummariesFullUpTo toolSummariesFullUpToConfigured ' +
  'toolSummaryTrimPercent toolSummaryTrimPercentConfigured sessionsRemovable';

export async function fetchInstallationSettings(): Promise<InstallationSettings> {
  const data = await graphql<{ installationSettings: InstallationSettings }>(
    `query InstallationSettings { installationSettings { ${FIELDS} } }`,
  );
  return data.installationSettings;
}

export async function setChatEnabled(enabled: boolean): Promise<InstallationSettings> {
  const data = await graphql<{ setChatEnabled: InstallationSettings }>(
    `mutation SetChatEnabled($enabled: Boolean!) {
       setChatEnabled(enabled: $enabled) { ${FIELDS} }
     }`,
    { enabled },
  );
  return data.setChatEnabled;
}

export async function setAttachmentsEnabled(enabled: boolean): Promise<InstallationSettings> {
  const data = await graphql<{ setAttachmentsEnabled: InstallationSettings }>(
    `mutation SetAttachmentsEnabled($enabled: Boolean!) {
       setAttachmentsEnabled(enabled: $enabled) { ${FIELDS} }
     }`,
    { enabled },
  );
  return data.setAttachmentsEnabled;
}

/**
 * Opens the metrics endpoint to callers who have not signed in, or closes it
 * again. Administrators only, and recorded in the audit log; it takes effect on
 * the next scrape rather than the next restart.
 */
export async function setMetricsAnonymous(enabled: boolean): Promise<InstallationSettings> {
  const data = await graphql<{ setMetricsAnonymous: InstallationSettings }>(
    `mutation SetMetricsAnonymous($enabled: Boolean!) {
       setMetricsAnonymous(enabled: $enabled) { ${FIELDS} }
     }`,
    { enabled },
  );
  return data.setMetricsAnonymous;
}

/**
 * How long a component's history is kept before the sweep takes it.
 *
 * Between 1 and 3650 days; anything else is refused with a message saying so.
 * Administrators only, and recorded in the audit log. The sweep reads it on
 * every pass, so it takes effect without a restart.
 */
export async function setRevisionRetentionDays(days: number): Promise<InstallationSettings> {
  const data = await graphql<{ setRevisionRetentionDays: InstallationSettings }>(
    `mutation SetRevisionRetentionDays($days: Int!) {
       setRevisionRetentionDays(days: $days) { ${FIELDS} }
     }`,
    { days },
  );
  return data.setRevisionRetentionDays;
}

/**
 * How long a finished run is kept before a sweep takes it.
 *
 * Administrators only, recorded in the audit log, and read by the sweep on
 * every pass so it takes effect without a restart. A run still going is never
 * swept, whatever this says.
 */
export async function setExecutionRetentionDays(days: number): Promise<InstallationSettings> {
  const data = await graphql<{ setExecutionRetentionDays: InstallationSettings }>(
    `mutation SetExecutionRetentionDays($days: Int!) {
       setExecutionRetentionDays(days: $days) { ${FIELDS} }
     }`,
    { days },
  );
  return data.setExecutionRetentionDays;
}

/**
 * How long a task may sit queued before something hands it over again.
 *
 * Between 1 and 1440 minutes; anything else is refused with a message saying
 * so. Administrators only, and recorded in the audit log. The sweep reads it
 * on every pass, so it takes effect without a restart — and it is refused
 * outright on an installation running Temporal, which is why the field is
 * drawn only when `taskSweepConfigurable` is true.
 */
export async function setTaskSweepMinutes(minutes: number): Promise<InstallationSettings> {
  const data = await graphql<{ setTaskSweepMinutes: InstallationSettings }>(
    `mutation SetTaskSweepMinutes($minutes: Int!) {
       setTaskSweepMinutes(minutes: $minutes) { ${FIELDS} }
     }`,
    { minutes },
  );
  return data.setTaskSweepMinutes;
}

/**
 * How large one of a plugin's source files may be, in KB.
 *
 * Between 64 KB and 20 MB; anything else is refused with a message saying so.
 * Administrators only, and recorded in the audit log. Every load reads it
 * fresh, so it takes effect without a restart.
 */
/**
 * How long a plugin may take to load.
 *
 * The loading bound and nothing else: what one of its functions or tools may
 * then take is the workspace's setting, because a plugin slow to parse and a
 * tool slow to answer are different problems with different people to talk to.
 */
export async function setPluginTimeoutSeconds(seconds: number): Promise<InstallationSettings> {
  const data = await graphql<{ setPluginTimeoutSeconds: InstallationSettings }>(
    `mutation SetPluginTimeoutSeconds($seconds: Int!) {
       setPluginTimeoutSeconds(seconds: $seconds) { ${FIELDS} }
     }`,
    { seconds },
  );
  return data.setPluginTimeoutSeconds;
}

/**
 * How many rounds of tool calls an agent gets before it has to answer.
 *
 * The installation's number, which every agent follows unless it carries one of
 * its own. Eight was written into the code, and an agent holding twenty tools
 * spent them listing and loading before the work began.
 */
export async function setChatMaxRounds(rounds: number): Promise<InstallationSettings> {
  const data = await graphql<{ setChatMaxRounds: InstallationSettings }>(
    `mutation SetChatMaxRounds($rounds: Int!) {
       setChatMaxRounds(rounds: $rounds) { ${FIELDS} }
     }`,
    { rounds },
  );
  return data.setChatMaxRounds;
}

/**
 * The longest an agent may put itself to sleep for.
 *
 * An agent ending its turn with a wake-up parks the step, and the run comes back
 * to it when the time is up. This is how long this installation will hold a run
 * open for one of those waits.
 */
export async function setAgentSleepSeconds(seconds: number): Promise<InstallationSettings> {
  const data = await graphql<{ setAgentSleepSeconds: InstallationSettings }>(
    `mutation SetAgentSleepSeconds($seconds: Int!) {
       setAgentSleepSeconds(seconds: $seconds) { ${FIELDS} }
     }`,
    { seconds },
  );
  return data.setAgentSleepSeconds;
}

/** How many times in a row an agent may do that on one step; zero is never. */
export async function setAgentSleepTimes(times: number): Promise<InstallationSettings> {
  const data = await graphql<{ setAgentSleepTimes: InstallationSettings }>(
    `mutation SetAgentSleepTimes($times: Int!) {
       setAgentSleepTimes(times: $times) { ${FIELDS} }
     }`,
    { times },
  );
  return data.setAgentSleepTimes;
}

/** How many other agents one agent may ask in one conversation; zero is none. Issue #380. */
export async function setAgentMaxSubagents(count: number): Promise<InstallationSettings> {
  const data = await graphql<{ setAgentMaxSubagents: InstallationSettings }>(
    `mutation SetAgentMaxSubagents($count: Int!) {
       setAgentMaxSubagents(count: $count) { ${FIELDS} }
     }`,
    { count },
  );
  return data.setAgentMaxSubagents;
}

/**
 * How many asks may be working at once. Issue #461.
 *
 * One past the ceiling waits its turn rather than being refused: a refusal
 * sends a model round again with the same ask in other words.
 */
export async function setAgentMaxSubagentsAtOnce(count: number): Promise<InstallationSettings> {
  const data = await graphql<{ setAgentMaxSubagentsAtOnce: InstallationSettings }>(
    `mutation SetAgentMaxSubagentsAtOnce($count: Int!) {
       setAgentMaxSubagentsAtOnce(count: $count) { ${FIELDS} }
     }`,
    { count },
  );
  return data.setAgentMaxSubagentsAtOnce;
}

/** How many steps of one workflow run may be running at once. Issue #285. */
export async function setWorkflowStepsAtOnce(count: number): Promise<InstallationSettings> {
  const data = await graphql<{ setWorkflowStepsAtOnce: InstallationSettings }>(
    `mutation SetWorkflowStepsAtOnce($count: Int!) {
       setWorkflowStepsAtOnce(count: $count) { ${FIELDS} }
     }`,
    { count },
  );
  return data.setWorkflowStepsAtOnce;
}

/**
 * The loop guard. Issue #516.
 *
 * Three numbers rather than one: how many identical calls, how close together
 * they have to be to count, and how often a turn is told before it ends.
 */
export async function setSessionCompactAfterTokens(tokens: number): Promise<InstallationSettings> {
  const data = await graphql<{ setSessionCompactAfterTokens: InstallationSettings }>(
    `mutation SetCompactAfter($tokens: Int!) { setSessionCompactAfterTokens(tokens: $tokens) { ${FIELDS} } }`,
    { tokens },
  );
  return data.setSessionCompactAfterTokens;
}

export async function setSessionCompactionKeepTurns(turns: number): Promise<InstallationSettings> {
  const data = await graphql<{ setSessionCompactionKeepTurns: InstallationSettings }>(
    `mutation SetKeep($turns: Int!) { setSessionCompactionKeepTurns(turns: $turns) { ${FIELDS} } }`,
    { turns },
  );
  return data.setSessionCompactionKeepTurns;
}

export async function setSessionCompactionSummaryTokens(tokens: number): Promise<InstallationSettings> {
  const data = await graphql<{ setSessionCompactionSummaryTokens: InstallationSettings }>(
    `mutation SetSummary($tokens: Int!) { setSessionCompactionSummaryTokens(tokens: $tokens) { ${FIELDS} } }`,
    { tokens },
  );
  return data.setSessionCompactionSummaryTokens;
}

export async function setSessionCompactionAttempts(times: number): Promise<InstallationSettings> {
  const data = await graphql<{ setSessionCompactionAttempts: InstallationSettings }>(
    `mutation SetAttempts($times: Int!) { setSessionCompactionAttempts(times: $times) { ${FIELDS} } }`,
    { times },
  );
  return data.setSessionCompactionAttempts;
}

export async function setDrawingScale(times: number): Promise<InstallationSettings> {
  const data = await graphql<{ setDrawingScale: InstallationSettings }>(
    `mutation SetDrawingScale($times: Int!) { setDrawingScale(times: $times) { ${FIELDS} } }`,
    { times },
  );
  return data.setDrawingScale;
}

export async function setLongestStoredValue(characters: number): Promise<InstallationSettings> {
  const data = await graphql<{ setLongestStoredValue: InstallationSettings }>(
    `mutation SetLongestStoredValue($characters: Int!) { setLongestStoredValue(characters: $characters) { ${FIELDS} } }`,
    { characters },
  );
  return data.setLongestStoredValue;
}

export async function setMaxToolCallsAtOnce(count: number): Promise<InstallationSettings> {
  const data = await graphql<{ setMaxToolCallsAtOnce: InstallationSettings }>(
    `mutation SetMaxToolCallsAtOnce($count: Int!) { setMaxToolCallsAtOnce(count: $count) { ${FIELDS} } }`,
    { count },
  );
  return data.setMaxToolCallsAtOnce;
}

export async function setMaxRepeatedToolCalls(count: number): Promise<InstallationSettings> {
  const data = await graphql<{ setMaxRepeatedToolCalls: InstallationSettings }>(
    `mutation SetMaxRepeatedToolCalls($count: Int!) { setMaxRepeatedToolCalls(count: $count) { ${FIELDS} } }`,
    { count },
  );
  return data.setMaxRepeatedToolCalls;
}

export async function setRepeatedToolCallsWindowSeconds(seconds: number): Promise<InstallationSettings> {
  const data = await graphql<{ setRepeatedToolCallsWindowSeconds: InstallationSettings }>(
    `mutation SetWindow($seconds: Int!) { setRepeatedToolCallsWindowSeconds(seconds: $seconds) { ${FIELDS} } }`,
    { seconds },
  );
  return data.setRepeatedToolCallsWindowSeconds;
}

export async function setRepeatedToolCallWarnings(count: number): Promise<InstallationSettings> {
  const data = await graphql<{ setRepeatedToolCallWarnings: InstallationSettings }>(
    `mutation SetWarnings($count: Int!) { setRepeatedToolCallWarnings(count: $count) { ${FIELDS} } }`,
    { count },
  );
  return data.setRepeatedToolCallWarnings;
}

/** How many bytes one session's scratchpads may hold in all. Issue #411. */
export async function setScratchpadBudgetBytes(bytes: number): Promise<InstallationSettings> {
  const data = await graphql<{ setScratchpadBudgetBytes: InstallationSettings }>(
    `mutation SetScratchpadBudgetBytes($bytes: Int!) {
       setScratchpadBudgetBytes(bytes: $bytes) { ${FIELDS} }
     }`,
    { bytes },
  );
  return data.setScratchpadBudgetBytes;
}

/** What marks a command in a message that starts a run, installation-wide. Issue #402. */
/** Up to how many findable tools find_tools names outright. Issue #442. */
export async function setScratchpadFileBudgetBytes(bytes: number): Promise<InstallationSettings> {
  const data = await graphql<{ setScratchpadFileBudgetBytes: InstallationSettings }>(
    `mutation ($bytes: Float!) { setScratchpadFileBudgetBytes(bytes: $bytes) { ${FIELDS} } }`,
    { bytes },
  );
  return data.setScratchpadFileBudgetBytes;
}

export async function setScratchpadKeepDays(days: number): Promise<InstallationSettings> {
  const data = await graphql<{ setScratchpadKeepDays: InstallationSettings }>(
    `mutation ($days: Int!) { setScratchpadKeepDays(days: $days) { ${FIELDS} } }`,
    { days },
  );
  return data.setScratchpadKeepDays;
}

export async function setToolSummariesFullUpTo(count: number): Promise<InstallationSettings> {
  const data = await graphql<{ setToolSummariesFullUpTo: InstallationSettings }>(
    `mutation ($count: Int!) { setToolSummariesFullUpTo(count: $count) { ${FIELDS} } }`,
    { count },
  );
  return data.setToolSummariesFullUpTo;
}

export async function setToolSummaryTrimPercent(percent: number): Promise<InstallationSettings> {
  const data = await graphql<{ setToolSummaryTrimPercent: InstallationSettings }>(
    `mutation ($percent: Int!) { setToolSummaryTrimPercent(percent: $percent) { ${FIELDS} } }`,
    { percent },
  );
  return data.setToolSummaryTrimPercent;
}

export async function setToolsNamedInSearch(count: number): Promise<InstallationSettings> {
  const data = await graphql<{ setToolsNamedInSearch: InstallationSettings }>(
    `mutation SetToolsNamedInSearch($count: Int!) {
       setToolsNamedInSearch(count: $count) { ${FIELDS} }
     }`,
    { count },
  );
  return data.setToolsNamedInSearch;
}

export async function setCommandMarker(marker: string): Promise<InstallationSettings> {
  const data = await graphql<{ setCommandMarker: InstallationSettings }>(
    `mutation SetCommandMarker($marker: String!) {
       setCommandMarker(marker: $marker) { ${FIELDS} }
     }`,
    { marker },
  );
  return data.setCommandMarker;
}

/**
 * Whether a conversation may be thrown away.
 *
 * Off closes the door: removing a session then refuses in words, because a
 * session is the record of what an agent was asked and what it answered.
 */
export async function setSessionsRemovable(removable: boolean): Promise<InstallationSettings> {
  const data = await graphql<{ setSessionsRemovable: InstallationSettings }>(
    `mutation SetSessionsRemovable($removable: Boolean!) {
       setSessionsRemovable(removable: $removable) { ${FIELDS} }
     }`,
    { removable },
  );
  return data.setSessionsRemovable;
}

export async function setPluginMaxSourceKb(kb: number): Promise<InstallationSettings> {
  const data = await graphql<{ setPluginMaxSourceKb: InstallationSettings }>(
    `mutation SetPluginMaxSourceKb($kb: Int!) {
       setPluginMaxSourceKb(kb: $kb) { ${FIELDS} }
     }`,
    { kb },
  );
  return data.setPluginMaxSourceKb;
}
