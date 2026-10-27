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
  /** The largest file any upload may be, in MB: Admin Settings' Largest file, or what the installation started with. */
  attachmentMaxFileSizeMb: number;
  /** What a fresh installation does - ORKNUX_ATTACHMENTS_MAX_FILE_SIZE_MB; 500 in the desktop app. */
  attachmentMaxFileSizeMbConfigured: number;
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
  /** After how many exchanges a chat a model named is named again; 0 never. */
  chatRetitleEvery: number;
  chatRetitleEveryConfigured: number;
  chatTitleSeconds: number;
  chatTitleSecondsConfigured: number;
  /** Sentence completion in the chat composer, issue #649: how many earlier messages it is shown. */
  chatCompletionContextTurns: number;
  chatCompletionContextTurnsConfigured: number;
  /** The most tokens a suggestion may be. */
  chatCompletionMaxTokens: number;
  chatCompletionMaxTokensConfigured: number;
  /** How long a suggestion may take before it is given up on, in milliseconds. */
  chatCompletionTimeoutMillis: number;
  chatCompletionTimeoutMillisConfigured: number;
  /** How long the composer waits after the last keystroke before asking, in milliseconds. */
  chatCompletionPauseMillis: number;
  chatCompletionPauseMillisConfigured: number;
  /** How many replies are suggested under a chat's latest answer; 0 suggests none. */
  chatReplySuggestions: number;
  chatReplySuggestionsConfigured: number;
  /** The most tokens an answer's suggested replies together may be. */
  chatReplySuggestionsMaxTokens: number;
  chatReplySuggestionsMaxTokensConfigured: number;
  /** How long suggested replies may take before they are given up on, in milliseconds. */
  chatReplySuggestionsTimeoutMillis: number;
  chatReplySuggestionsTimeoutMillisConfigured: number;
  /** The largest video a chat message may send to a model that takes video, in MB. */
  chatVideoMaxMb: number;
  chatVideoMaxMbConfigured: number;
  /** How deep an object's shape may go; Admin > Settings. */
  objectMaxDepth: number;
  objectMaxDepthConfigured: number;
  /** The longest description a picture is drawn from, in characters; Admin > Settings. */
  imageMaxPrompt: number;
  imageMaxPromptConfigured: number;
  /** How many of Design's queued pictures are drawn at the same time; Admin > Settings. */
  imageDrawsAtOnce: number;
  imageDrawsAtOnceConfigured: number;
  /** Where Harmonize's strength starts, for a redraw through a Stable Diffusion WebUI; Admin > Settings. */
  imageHarmonizeStrength: number;
  imageHarmonizeStrengthConfigured: number;
  /** The longest side, in pixels, Harmonize redraws a picture at; a larger one is scaled down and back. */
  imageHarmonizeSize: number;
  imageHarmonizeSizeConfigured: number;
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
  /** How long a Workflow node waits between looks at the run it called. */
  workflowCallCheckSeconds: number;
  workflowCallCheckSecondsConfigured: number;
  /**
   * Temporal: how long a step may go without its worker saying it is alive
   * before it is handed to another, in seconds; 0 is no heartbeat. Issue #601.
   */
  workflowStepHeartbeatSeconds: number;
  workflowStepHeartbeatSecondsConfigured: number;
  /** Inline engine: how many goes an agent step cut short by restarts gets. Issue #601. */
  workflowRestartAttempts: number;
  workflowRestartAttemptsConfigured: number;
  /** How long the lease lasts that decides which server runs the timers and the Slack sockets. Issue #597. */
  clusterLeaseSeconds: number;
  clusterLeaseSecondsConfigured: number;
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
   * Whether a chat keeps the concealed tools' calls - flagging the
   * conversation - from an administrator too. True until somebody turns it
   * off; nobody else is ever shown them, and the session page shows them to an
   * administrator either way.
   */
  concealedCallsHiddenInChats: boolean;
  /**
   * Whether agents are offered flag_session and unflag_session. True until
   * somebody turns it off; the flags already raised stay on the report.
   */
  sessionFlaggingEnabled: boolean;
  /**
   * Whether an agent's Tools list shows flag_session and unflag_session and
   * their mark may be changed. False until somebody turns it on: every agent
   * holds them at Always.
   */
  sessionFlagToolsAdjustable: boolean;
  /** How long a step of a workspace copy may wait for a lock, in seconds. Issue #581. */
  workspaceCopyLockWaitSeconds: number;
  workspaceCopyLockWaitSecondsConfigured: number;
  /** The first wait for a rate limit inside a stream that named none, in seconds. Issue #608. */
  rateLimitBackoffSeconds: number;
  rateLimitBackoffSecondsConfigured: number;
  /** How long one note_to_self may be, in characters. */
  noteMaxCharacters: number;
  noteMaxCharactersConfigured: number;
  /** How many notes to self one conversation keeps. */
  noteMaxCount: number;
  noteMaxCountConfigured: number;
  /** How many reviews rate_session sends from one conversation. */
  reviewsPerSession: number;
  reviewsPerSessionConfigured: number;
  /** How many times a round is asked again after an empty answer. */
  emptyAnswerRetries: number;
  emptyAnswerRetriesConfigured: number;
  /** How many times an unusable reply is put back to the model. */
  unusableReplyRetries: number;
  unusableReplyRetriesConfigured: number;
  /** How long one call to a model may take, in minutes. */
  modelAnswerLimitMinutes: number;
  modelAnswerLimitMinutesConfigured: number;
  /** How often a page watching a model write is told how far it has got, in milliseconds. */
  writingProgressMillis: number;
  writingProgressMillisConfigured: number;
  /** How long a report that a model is writing is believed without another, in seconds. */
  writingForgottenSeconds: number;
  writingForgottenSecondsConfigured: number;
  /** How long a prompt is read, in seconds, before the page is told it is being read; 0 tells at once. */
  readingShownAfterSeconds: number;
  readingShownAfterSecondsConfigured: number;
  /** How long the workflow editor waits after the last change before it saves, in milliseconds. Issue #645. */
  workflowAutosaveMillis: number;
  workflowAutosaveMillisConfigured: number;
  /** How many widgets one chat may hold at once. */
  widgetsPerChat: number;
  widgetsPerChatConfigured: number;
  /** The longest a chat's timer may run, in seconds. */
  widgetTimerMaxSeconds: number;
  widgetTimerMaxSecondsConfigured: number;
  /** How big one value in a session's store may be, in MB. */
  sessionValueMaxMb: number;
  sessionValueMaxMbConfigured: number;
  /** How many keys one session's store may hold. */
  sessionStoreMaxKeys: number;
  sessionStoreMaxKeysConfigured: number;
  /**
   * False where the installation runs Temporal, and the field is not offered.
   *
   * A `configurable` flag like `chatConfigurable`, and the fact behind it is
   * which engine carries tasks. The sweep runs either way; what is not an
   * administrator's decision on Temporal is how long it waits.
   */
  taskSweepConfigurable: boolean;
  /**
   * The local box: the sandbox inside this server that agents granted a box
   * label are given sessions in. Listed under Admin -> Boxes while it is on.
   */
  localBoxEnabled: boolean;
  /** Where local sessions' workspaces live; null is the built-in default, which `...Configured` holds. */
  localBoxLocation: string | null;
  localBoxLocationConfigured: string;
  /** What a local session runs in: "local" (processes on this machine) or "docker". */
  localBoxRuntime: string;
  localBoxMaxSessions: number;
  localBoxMaxSessionsConfigured: number;
  localBoxDefaultTtlSeconds: number;
  localBoxDefaultTtlSecondsConfigured: number;
  localBoxMaxTtlSeconds: number;
  localBoxMaxTtlSecondsConfigured: number;
  localBoxIdleTimeoutSeconds: number;
  localBoxIdleTimeoutSecondsConfigured: number;
  /** The box tools, for every box: how long a command is waited on before the agent is handed it running. */
  boxCommandWaitSeconds: number;
  boxCommandWaitSecondsConfigured: number;
  boxCommandTimeoutSeconds: number;
  boxCommandTimeoutSecondsConfigured: number;
  boxOutputBytes: number;
  boxOutputBytesConfigured: number;
  /** How much of one command's output the session page reads and holds, in bytes. */
  boxOutputShownBytes: number;
  boxOutputShownBytesConfigured: number;
  /** How much of each command's output is kept for reading on the session page, in bytes; 0 keeps none. */
  localBoxOutputKeptBytes: number;
  localBoxOutputKeptBytesConfigured: number;
  boxRequestTimeoutSeconds: number;
  boxRequestTimeoutSecondsConfigured: number;
  /** How many file edits and writes an agent can undo per box session; 0 keeps none. */
  boxEditUndoSteps: number;
  boxEditUndoStepsConfigured: number;
  /** How long a box session an agent opens may go with no command, in seconds. */
  boxSessionIdleSeconds: number;
  boxSessionIdleSecondsConfigured: number;
  /** Exposed box ports: how many a session may have, and how often and how long whether one answers is looked at. */
  boxMaxPorts: number;
  boxMaxPortsConfigured: number;
  boxPortCheckSeconds: number;
  boxPortCheckSecondsConfigured: number;
  boxPortCheckWaitMillis: number;
  boxPortCheckWaitMillisConfigured: number;
  /** Server updates, #584: how many jars are kept for rolling back to. */
  releasesKept: number;
  /** How many starts a newly activated release gets before it is given up on. */
  releaseBootAttempts: number;
  /** How often every server checks it runs the chosen release, in seconds. */
  releaseFollowSeconds: number;
  /** The largest server jar taken, in MB. */
  releaseMaxMb: number;
  /** How long a server waits after an update before restarting, in seconds. */
  releaseRestartDelaySeconds: number;
  /** How long one connection for a server jar may go without a byte, in seconds (#589, #602). */
  releaseDownloadSeconds: number;
  /** Broken attempts in a row that brought nothing, before a download is given up on (#602). */
  releaseDownloadAttempts: number;
  /** The first wait before a broken download resumes, in seconds; it doubles (#602). */
  releaseDownloadBackoffSeconds: number;
  /** The longest that wait grows to, in seconds (#602). */
  releaseDownloadBackoffMaxSeconds: number;
}

const FIELDS =
  'attachmentsEnabled attachmentsConfigurable attachmentStorage attachmentLocation attachmentMaxFileSizeMb attachmentMaxFileSizeMbConfigured ' +
  'chatEnabled chatConfigurable metricsAnonymous metricsAnonymousConfigured ' +
  'revisionRetentionDays revisionRetentionDaysConfigured ' +
  'executionRetentionDays executionRetentionDaysConfigured ' +
  'taskSweepMinutes taskSweepMinutesConfigured taskSweepConfigurable ' +
  'pluginMaxSourceKb pluginMaxSourceKbConfigured pluginTimeoutSeconds pluginTimeoutSecondsConfigured ' +
  'chatMaxRounds chatMaxRoundsConfigured chatRetitleEvery chatRetitleEveryConfigured chatTitleSeconds chatTitleSecondsConfigured chatCompletionContextTurns chatCompletionContextTurnsConfigured chatCompletionMaxTokens chatCompletionMaxTokensConfigured chatCompletionTimeoutMillis chatCompletionTimeoutMillisConfigured chatCompletionPauseMillis chatCompletionPauseMillisConfigured chatReplySuggestions chatReplySuggestionsConfigured chatReplySuggestionsMaxTokens chatReplySuggestionsMaxTokensConfigured chatReplySuggestionsTimeoutMillis chatReplySuggestionsTimeoutMillisConfigured chatVideoMaxMb chatVideoMaxMbConfigured objectMaxDepth objectMaxDepthConfigured imageMaxPrompt imageMaxPromptConfigured imageDrawsAtOnce imageDrawsAtOnceConfigured imageHarmonizeStrength imageHarmonizeStrengthConfigured imageHarmonizeSize imageHarmonizeSizeConfigured ' +
  'agentSleepSeconds agentSleepSecondsConfigured agentSleepTimes agentSleepTimesConfigured ' +
  'agentMaxSubagents agentMaxSubagentsConfigured agentMaxSubagentsAtOnce agentMaxSubagentsAtOnceConfigured workflowStepsAtOnce workflowStepsAtOnceConfigured workflowCallCheckSeconds workflowCallCheckSecondsConfigured workflowStepHeartbeatSeconds workflowStepHeartbeatSecondsConfigured workflowRestartAttempts workflowRestartAttemptsConfigured clusterLeaseSeconds clusterLeaseSecondsConfigured maxRepeatedToolCalls maxRepeatedToolCallsConfigured repeatedToolCallsWindowSeconds repeatedToolCallsWindowSecondsConfigured repeatedToolCallWarnings repeatedToolCallWarningsConfigured maxToolCallsAtOnce maxToolCallsAtOnceConfigured longestStoredValue longestStoredValueConfigured drawingScale drawingScaleConfigured sessionCompactAfterTokens sessionCompactAfterTokensConfigured sessionCompactionKeepTurns sessionCompactionKeepTurnsConfigured sessionCompactionSummaryTokens sessionCompactionSummaryTokensConfigured sessionCompactionAttempts sessionCompactionAttemptsConfigured scratchpadBudgetBytes scratchpadBudgetBytesConfigured commandMarker commandMarkerConfigured ' +
  'toolsNamedInSearch toolsNamedInSearchConfigured scratchpadFileBudgetBytes scratchpadFileBudgetBytesConfigured ' +
  'scratchpadKeepDays scratchpadKeepDaysConfigured toolSummariesFullUpTo toolSummariesFullUpToConfigured ' +
  'toolSummaryTrimPercent toolSummaryTrimPercentConfigured sessionsRemovable concealedCallsHiddenInChats sessionFlaggingEnabled sessionFlagToolsAdjustable ' +
  'workspaceCopyLockWaitSeconds workspaceCopyLockWaitSecondsConfigured rateLimitBackoffSeconds rateLimitBackoffSecondsConfigured noteMaxCharacters noteMaxCharactersConfigured noteMaxCount noteMaxCountConfigured reviewsPerSession reviewsPerSessionConfigured emptyAnswerRetries emptyAnswerRetriesConfigured unusableReplyRetries unusableReplyRetriesConfigured modelAnswerLimitMinutes modelAnswerLimitMinutesConfigured writingProgressMillis writingProgressMillisConfigured writingForgottenSeconds writingForgottenSecondsConfigured readingShownAfterSeconds readingShownAfterSecondsConfigured workflowAutosaveMillis workflowAutosaveMillisConfigured widgetsPerChat widgetsPerChatConfigured widgetTimerMaxSeconds widgetTimerMaxSecondsConfigured sessionValueMaxMb sessionValueMaxMbConfigured sessionStoreMaxKeys sessionStoreMaxKeysConfigured ' +
  'localBoxEnabled localBoxLocation localBoxLocationConfigured localBoxRuntime ' +
  'localBoxMaxSessions localBoxMaxSessionsConfigured localBoxDefaultTtlSeconds localBoxDefaultTtlSecondsConfigured ' +
  'localBoxMaxTtlSeconds localBoxMaxTtlSecondsConfigured localBoxIdleTimeoutSeconds localBoxIdleTimeoutSecondsConfigured ' +
  'localBoxOutputKeptBytes localBoxOutputKeptBytesConfigured ' +
  'boxCommandWaitSeconds boxCommandWaitSecondsConfigured boxCommandTimeoutSeconds boxCommandTimeoutSecondsConfigured ' +
  'boxOutputBytes boxOutputBytesConfigured boxOutputShownBytes boxOutputShownBytesConfigured boxRequestTimeoutSeconds boxRequestTimeoutSecondsConfigured boxEditUndoSteps boxEditUndoStepsConfigured boxSessionIdleSeconds boxSessionIdleSecondsConfigured boxMaxPorts boxMaxPortsConfigured boxPortCheckSeconds boxPortCheckSecondsConfigured boxPortCheckWaitMillis boxPortCheckWaitMillisConfigured ' +
  'releasesKept releaseBootAttempts releaseFollowSeconds releaseMaxMb releaseRestartDelaySeconds releaseDownloadSeconds ' +
  'releaseDownloadAttempts releaseDownloadBackoffSeconds releaseDownloadBackoffMaxSeconds';

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
/** How many of Design's queued pictures are drawn at the same time. */
export async function setImageDrawsAtOnce(draws: number): Promise<InstallationSettings> {
  const data = await graphql<{ setImageDrawsAtOnce: InstallationSettings }>(
    `mutation SetImageDrawsAtOnce($draws: Int!) {
       setImageDrawsAtOnce(draws: $draws) { ${FIELDS} }
     }`,
    { draws },
  );
  return data.setImageDrawsAtOnce;
}

/** Where Harmonize's strength starts, for a redraw through a Stable Diffusion WebUI. */
export async function setImageHarmonizeStrength(strength: number): Promise<InstallationSettings> {
  const data = await graphql<{ setImageHarmonizeStrength: InstallationSettings }>(
    `mutation SetImageHarmonizeStrength($strength: Float!) {
       setImageHarmonizeStrength(strength: $strength) { ${FIELDS} }
     }`,
    { strength },
  );
  return data.setImageHarmonizeStrength;
}

/** The longest side, in pixels, Harmonize redraws a picture at; a larger one is scaled down and back up. */
export async function setImageHarmonizeSize(pixels: number): Promise<InstallationSettings> {
  const data = await graphql<{ setImageHarmonizeSize: InstallationSettings }>(
    `mutation SetImageHarmonizeSize($pixels: Int!) {
       setImageHarmonizeSize(pixels: $pixels) { ${FIELDS} }
     }`,
    { pixels },
  );
  return data.setImageHarmonizeSize;
}

/** The longest description a picture is drawn from - in Design, a chat and a task. */
export async function setImageMaxPrompt(characters: number): Promise<InstallationSettings> {
  const data = await graphql<{ setImageMaxPrompt: InstallationSettings }>(
    `mutation SetImageMaxPrompt($characters: Int!) {
       setImageMaxPrompt(characters: $characters) { ${FIELDS} }
     }`,
    { characters },
  );
  return data.setImageMaxPrompt;
}

export async function setObjectMaxDepth(depth: number): Promise<InstallationSettings> {
  const data = await graphql<{ setObjectMaxDepth: InstallationSettings }>(
    `mutation SetObjectMaxDepth($depth: Int!) {
       setObjectMaxDepth(depth: $depth) { ${FIELDS} }
     }`,
    { depth },
  );
  return data.setObjectMaxDepth;
}

export async function setChatTitleSeconds(seconds: number): Promise<InstallationSettings> {
  const data = await graphql<{ setChatTitleSeconds: InstallationSettings }>(
    `mutation SetChatTitleSeconds($seconds: Int!) { setChatTitleSeconds(seconds: $seconds) { ${FIELDS} } }`,
    { seconds },
  );
  return data.setChatTitleSeconds;
}

export async function setChatRetitleEvery(exchanges: number): Promise<InstallationSettings> {
  const data = await graphql<{ setChatRetitleEvery: InstallationSettings }>(
    `mutation SetChatRetitleEvery($exchanges: Int!) { setChatRetitleEvery(exchanges: $exchanges) { ${FIELDS} } }`,
    { exchanges },
  );
  return data.setChatRetitleEvery;
}

export async function setChatCompletionContextTurns(turns: number): Promise<InstallationSettings> {
  const data = await graphql<{ setChatCompletionContextTurns: InstallationSettings }>(
    `mutation SetChatCompletionContextTurns($turns: Int!) { setChatCompletionContextTurns(turns: $turns) { ${FIELDS} } }`,
    { turns },
  );
  return data.setChatCompletionContextTurns;
}

export async function setChatCompletionMaxTokens(tokens: number): Promise<InstallationSettings> {
  const data = await graphql<{ setChatCompletionMaxTokens: InstallationSettings }>(
    `mutation SetChatCompletionMaxTokens($tokens: Int!) { setChatCompletionMaxTokens(tokens: $tokens) { ${FIELDS} } }`,
    { tokens },
  );
  return data.setChatCompletionMaxTokens;
}

export async function setChatCompletionTimeoutMillis(millis: number): Promise<InstallationSettings> {
  const data = await graphql<{ setChatCompletionTimeoutMillis: InstallationSettings }>(
    `mutation SetChatCompletionTimeoutMillis($millis: Int!) { setChatCompletionTimeoutMillis(millis: $millis) { ${FIELDS} } }`,
    { millis },
  );
  return data.setChatCompletionTimeoutMillis;
}

export async function setChatCompletionPauseMillis(millis: number): Promise<InstallationSettings> {
  const data = await graphql<{ setChatCompletionPauseMillis: InstallationSettings }>(
    `mutation SetChatCompletionPauseMillis($millis: Int!) { setChatCompletionPauseMillis(millis: $millis) { ${FIELDS} } }`,
    { millis },
  );
  return data.setChatCompletionPauseMillis;
}

export async function setChatReplySuggestions(count: number): Promise<InstallationSettings> {
  const data = await graphql<{ setChatReplySuggestions: InstallationSettings }>(
    `mutation SetChatReplySuggestions($count: Int!) { setChatReplySuggestions(count: $count) { ${FIELDS} } }`,
    { count },
  );
  return data.setChatReplySuggestions;
}

export async function setChatReplySuggestionsMaxTokens(tokens: number): Promise<InstallationSettings> {
  const data = await graphql<{ setChatReplySuggestionsMaxTokens: InstallationSettings }>(
    `mutation SetChatReplySuggestionsMaxTokens($tokens: Int!) { setChatReplySuggestionsMaxTokens(tokens: $tokens) { ${FIELDS} } }`,
    { tokens },
  );
  return data.setChatReplySuggestionsMaxTokens;
}

export async function setChatReplySuggestionsTimeoutMillis(millis: number): Promise<InstallationSettings> {
  const data = await graphql<{ setChatReplySuggestionsTimeoutMillis: InstallationSettings }>(
    `mutation SetChatReplySuggestionsTimeoutMillis($millis: Int!) { setChatReplySuggestionsTimeoutMillis(millis: $millis) { ${FIELDS} } }`,
    { millis },
  );
  return data.setChatReplySuggestionsTimeoutMillis;
}

export async function setChatVideoMaxMb(megabytes: number): Promise<InstallationSettings> {
  const data = await graphql<{ setChatVideoMaxMb: InstallationSettings }>(
    `mutation SetChatVideoMaxMb($megabytes: Int!) { setChatVideoMaxMb(megabytes: $megabytes) { ${FIELDS} } }`,
    { megabytes },
  );
  return data.setChatVideoMaxMb;
}

/** The largest file any upload may be, whichever page it is sent from. */
export async function setAttachmentMaxFileSizeMb(megabytes: number): Promise<InstallationSettings> {
  const data = await graphql<{ setAttachmentMaxFileSizeMb: InstallationSettings }>(
    `mutation SetAttachmentMaxFileSizeMb($megabytes: Int!) { setAttachmentMaxFileSizeMb(megabytes: $megabytes) { ${FIELDS} } }`,
    { megabytes },
  );
  return data.setAttachmentMaxFileSizeMb;
}

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

/** How long a Workflow node waits between looks at the run it called; the called run ending wakes it sooner. */
export async function setWorkflowCallCheckSeconds(seconds: number): Promise<InstallationSettings> {
  const data = await graphql<{ setWorkflowCallCheckSeconds: InstallationSettings }>(
    `mutation SetWorkflowCallCheckSeconds($seconds: Int!) {
       setWorkflowCallCheckSeconds(seconds: $seconds) { ${FIELDS} }
     }`,
    { seconds },
  );
  return data.setWorkflowCallCheckSeconds;
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

/** How long a step may go without a heartbeat before Temporal hands it on. Issue #601. */
export async function setWorkflowStepHeartbeatSeconds(seconds: number): Promise<InstallationSettings> {
  const data = await graphql<{ setWorkflowStepHeartbeatSeconds: InstallationSettings }>(
    `mutation SetWorkflowStepHeartbeatSeconds($seconds: Int!) {
       setWorkflowStepHeartbeatSeconds(seconds: $seconds) { ${FIELDS} }
     }`,
    { seconds },
  );
  return data.setWorkflowStepHeartbeatSeconds;
}

/** How many goes an agent step cut short by restarts gets. Issue #601. */
export async function setWorkflowRestartAttempts(count: number): Promise<InstallationSettings> {
  const data = await graphql<{ setWorkflowRestartAttempts: InstallationSettings }>(
    `mutation SetWorkflowRestartAttempts($count: Int!) {
       setWorkflowRestartAttempts(count: $count) { ${FIELDS} }
     }`,
    { count },
  );
  return data.setWorkflowRestartAttempts;
}

/** How long the cluster lease lasts. Issue #597. */
export async function setClusterLeaseSeconds(seconds: number): Promise<InstallationSettings> {
  const data = await graphql<{ setClusterLeaseSeconds: InstallationSettings }>(
    `mutation SetClusterLeaseSeconds($seconds: Int!) {
       setClusterLeaseSeconds(seconds: $seconds) { ${FIELDS} }
     }`,
    { seconds },
  );
  return data.setClusterLeaseSeconds;
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

/** Server updates, #584. */
export async function setReleasesKept(count: number): Promise<InstallationSettings> {
  const data = await graphql<{ setReleasesKept: InstallationSettings }>(
    `mutation ($count: Int!) { setReleasesKept(count: $count) { ${FIELDS} } }`,
    { count },
  );
  return data.setReleasesKept;
}

export async function setReleaseBootAttempts(count: number): Promise<InstallationSettings> {
  const data = await graphql<{ setReleaseBootAttempts: InstallationSettings }>(
    `mutation ($count: Int!) { setReleaseBootAttempts(count: $count) { ${FIELDS} } }`,
    { count },
  );
  return data.setReleaseBootAttempts;
}

export async function setReleaseFollowSeconds(seconds: number): Promise<InstallationSettings> {
  const data = await graphql<{ setReleaseFollowSeconds: InstallationSettings }>(
    `mutation ($seconds: Int!) { setReleaseFollowSeconds(seconds: $seconds) { ${FIELDS} } }`,
    { seconds },
  );
  return data.setReleaseFollowSeconds;
}

export async function setReleaseMaxMb(mb: number): Promise<InstallationSettings> {
  const data = await graphql<{ setReleaseMaxMb: InstallationSettings }>(
    `mutation ($mb: Int!) { setReleaseMaxMb(mb: $mb) { ${FIELDS} } }`,
    { mb },
  );
  return data.setReleaseMaxMb;
}

export async function setReleaseRestartDelaySeconds(seconds: number): Promise<InstallationSettings> {
  const data = await graphql<{ setReleaseRestartDelaySeconds: InstallationSettings }>(
    `mutation ($seconds: Int!) { setReleaseRestartDelaySeconds(seconds: $seconds) { ${FIELDS} } }`,
    { seconds },
  );
  return data.setReleaseRestartDelaySeconds;
}

export async function setReleaseDownloadSeconds(seconds: number): Promise<InstallationSettings> {
  const data = await graphql<{ setReleaseDownloadSeconds: InstallationSettings }>(
    `mutation ($seconds: Int!) { setReleaseDownloadSeconds(seconds: $seconds) { ${FIELDS} } }`,
    { seconds },
  );
  return data.setReleaseDownloadSeconds;
}

export async function setReleaseDownloadAttempts(count: number): Promise<InstallationSettings> {
  const data = await graphql<{ setReleaseDownloadAttempts: InstallationSettings }>(
    `mutation ($count: Int!) { setReleaseDownloadAttempts(count: $count) { ${FIELDS} } }`,
    { count },
  );
  return data.setReleaseDownloadAttempts;
}

export async function setReleaseDownloadBackoffSeconds(seconds: number): Promise<InstallationSettings> {
  const data = await graphql<{ setReleaseDownloadBackoffSeconds: InstallationSettings }>(
    `mutation ($seconds: Int!) { setReleaseDownloadBackoffSeconds(seconds: $seconds) { ${FIELDS} } }`,
    { seconds },
  );
  return data.setReleaseDownloadBackoffSeconds;
}

export async function setReleaseDownloadBackoffMaxSeconds(seconds: number): Promise<InstallationSettings> {
  const data = await graphql<{ setReleaseDownloadBackoffMaxSeconds: InstallationSettings }>(
    `mutation ($seconds: Int!) { setReleaseDownloadBackoffMaxSeconds(seconds: $seconds) { ${FIELDS} } }`,
    { seconds },
  );
  return data.setReleaseDownloadBackoffMaxSeconds;
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

/** The first wait for a rate limit inside a streaming answer that named no time. Issue #608. */
export async function setEmptyAnswerRetries(retries: number): Promise<InstallationSettings> {
  const data = await graphql<{ setEmptyAnswerRetries: InstallationSettings }>(
    `mutation ($retries: Int!) { setEmptyAnswerRetries(retries: $retries) { ${FIELDS} } }`,
    { retries },
  );
  return data.setEmptyAnswerRetries;
}

export async function setUnusableReplyRetries(retries: number): Promise<InstallationSettings> {
  const data = await graphql<{ setUnusableReplyRetries: InstallationSettings }>(
    `mutation ($retries: Int!) { setUnusableReplyRetries(retries: $retries) { ${FIELDS} } }`,
    { retries },
  );
  return data.setUnusableReplyRetries;
}

export async function setWidgetsPerChat(widgets: number): Promise<InstallationSettings> {
  const data = await graphql<{ setWidgetsPerChat: InstallationSettings }>(
    `mutation ($widgets: Int!) { setWidgetsPerChat(widgets: $widgets) { ${FIELDS} } }`,
    { widgets },
  );
  return data.setWidgetsPerChat;
}

export async function setWidgetTimerMaxSeconds(seconds: number): Promise<InstallationSettings> {
  const data = await graphql<{ setWidgetTimerMaxSeconds: InstallationSettings }>(
    `mutation ($seconds: Int!) { setWidgetTimerMaxSeconds(seconds: $seconds) { ${FIELDS} } }`,
    { seconds },
  );
  return data.setWidgetTimerMaxSeconds;
}

export async function setWritingProgressMillis(millis: number): Promise<InstallationSettings> {
  const data = await graphql<{ setWritingProgressMillis: InstallationSettings }>(
    `mutation ($millis: Int!) { setWritingProgressMillis(millis: $millis) { ${FIELDS} } }`,
    { millis },
  );
  return data.setWritingProgressMillis;
}

export async function setWritingForgottenSeconds(seconds: number): Promise<InstallationSettings> {
  const data = await graphql<{ setWritingForgottenSeconds: InstallationSettings }>(
    `mutation ($seconds: Int!) { setWritingForgottenSeconds(seconds: $seconds) { ${FIELDS} } }`,
    { seconds },
  );
  return data.setWritingForgottenSeconds;
}

export async function setWorkflowAutosaveMillis(millis: number): Promise<InstallationSettings> {
  const data = await graphql<{ setWorkflowAutosaveMillis: InstallationSettings }>(
    `mutation ($millis: Int!) { setWorkflowAutosaveMillis(millis: $millis) { ${FIELDS} } }`,
    { millis },
  );
  return data.setWorkflowAutosaveMillis;
}

export async function setReadingShownAfterSeconds(seconds: number): Promise<InstallationSettings> {
  const data = await graphql<{ setReadingShownAfterSeconds: InstallationSettings }>(
    `mutation ($seconds: Int!) { setReadingShownAfterSeconds(seconds: $seconds) { ${FIELDS} } }`,
    { seconds },
  );
  return data.setReadingShownAfterSeconds;
}

export async function setModelAnswerLimitMinutes(minutes: number): Promise<InstallationSettings> {
  const data = await graphql<{ setModelAnswerLimitMinutes: InstallationSettings }>(
    `mutation ($minutes: Int!) { setModelAnswerLimitMinutes(minutes: $minutes) { ${FIELDS} } }`,
    { minutes },
  );
  return data.setModelAnswerLimitMinutes;
}

export async function setSessionValueMaxMb(megabytes: number): Promise<InstallationSettings> {
  const data = await graphql<{ setSessionValueMaxMb: InstallationSettings }>(
    `mutation ($megabytes: Int!) { setSessionValueMaxMb(megabytes: $megabytes) { ${FIELDS} } }`,
    { megabytes },
  );
  return data.setSessionValueMaxMb;
}

export async function setSessionStoreMaxKeys(keys: number): Promise<InstallationSettings> {
  const data = await graphql<{ setSessionStoreMaxKeys: InstallationSettings }>(
    `mutation ($keys: Int!) { setSessionStoreMaxKeys(keys: $keys) { ${FIELDS} } }`,
    { keys },
  );
  return data.setSessionStoreMaxKeys;
}

export async function setReviewsPerSession(count: number): Promise<InstallationSettings> {
  const data = await graphql<{ setReviewsPerSession: InstallationSettings }>(
    `mutation ($count: Int!) { setReviewsPerSession(count: $count) { ${FIELDS} } }`,
    { count },
  );
  return data.setReviewsPerSession;
}

export async function setNoteMaxCount(count: number): Promise<InstallationSettings> {
  const data = await graphql<{ setNoteMaxCount: InstallationSettings }>(
    `mutation ($count: Int!) { setNoteMaxCount(count: $count) { ${FIELDS} } }`,
    { count },
  );
  return data.setNoteMaxCount;
}

export async function setNoteMaxCharacters(characters: number): Promise<InstallationSettings> {
  const data = await graphql<{ setNoteMaxCharacters: InstallationSettings }>(
    `mutation ($characters: Int!) { setNoteMaxCharacters(characters: $characters) { ${FIELDS} } }`,
    { characters },
  );
  return data.setNoteMaxCharacters;
}

export async function setRateLimitBackoffSeconds(seconds: number): Promise<InstallationSettings> {
  const data = await graphql<{ setRateLimitBackoffSeconds: InstallationSettings }>(
    `mutation ($seconds: Int!) { setRateLimitBackoffSeconds(seconds: $seconds) { ${FIELDS} } }`,
    { seconds },
  );
  return data.setRateLimitBackoffSeconds;
}

/** How long a step of a workspace copy may wait for a lock before it stops. Issue #581. */
export async function setWorkspaceCopyLockWaitSeconds(seconds: number): Promise<InstallationSettings> {
  const data = await graphql<{ setWorkspaceCopyLockWaitSeconds: InstallationSettings }>(
    `mutation ($seconds: Int!) { setWorkspaceCopyLockWaitSeconds(seconds: $seconds) { ${FIELDS} } }`,
    { seconds },
  );
  return data.setWorkspaceCopyLockWaitSeconds;
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

/** Whether a chat keeps the flag calls from an administrator as well as from everybody else. */
export async function setConcealedCallsHiddenInChats(hidden: boolean): Promise<InstallationSettings> {
  const data = await graphql<{ setConcealedCallsHiddenInChats: InstallationSettings }>(
    `mutation SetConcealedCallsHiddenInChats($hidden: Boolean!) {
       setConcealedCallsHiddenInChats(hidden: $hidden) { ${FIELDS} }
     }`,
    { hidden },
  );
  return data.setConcealedCallsHiddenInChats;
}

/** Whether agents flag conversations for the administrators at all. */
export async function setSessionFlaggingEnabled(enabled: boolean): Promise<InstallationSettings> {
  const data = await graphql<{ setSessionFlaggingEnabled: InstallationSettings }>(
    `mutation SetSessionFlaggingEnabled($enabled: Boolean!) {
       setSessionFlaggingEnabled(enabled: $enabled) { ${FIELDS} }
     }`,
    { enabled },
  );
  return data.setSessionFlaggingEnabled;
}

/** Whether agents' Tools lists show the flag tools; switched off, every agent is put back to Always on both. */
export async function setSessionFlagToolsAdjustable(adjustable: boolean): Promise<InstallationSettings> {
  const data = await graphql<{ setSessionFlagToolsAdjustable: InstallationSettings }>(
    `mutation SetSessionFlagToolsAdjustable($adjustable: Boolean!) {
       setSessionFlagToolsAdjustable(adjustable: $adjustable) { ${FIELDS} }
     }`,
    { adjustable },
  );
  return data.setSessionFlagToolsAdjustable;
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

/* ---- Boxes ---- */

/** Whether the box inside this server is offered at all. Takes effect as it is switched. */
export async function setLocalBoxEnabled(enabled: boolean): Promise<InstallationSettings> {
  const data = await graphql<{ setLocalBoxEnabled: InstallationSettings }>(
    `mutation ($enabled: Boolean!) { setLocalBoxEnabled(enabled: $enabled) { ${FIELDS} } }`,
    { enabled },
  );
  return data.setLocalBoxEnabled;
}

/** Where local sessions' workspaces live; null or empty puts it back to the default. */
export async function setLocalBoxLocation(location: string | null): Promise<InstallationSettings> {
  const data = await graphql<{ setLocalBoxLocation: InstallationSettings }>(
    `mutation ($location: String) { setLocalBoxLocation(location: $location) { ${FIELDS} } }`,
    { location },
  );
  return data.setLocalBoxLocation;
}

/** "local" or "docker". */
export async function setLocalBoxRuntime(runtime: string): Promise<InstallationSettings> {
  const data = await graphql<{ setLocalBoxRuntime: InstallationSettings }>(
    `mutation ($runtime: String!) { setLocalBoxRuntime(runtime: $runtime) { ${FIELDS} } }`,
    { runtime },
  );
  return data.setLocalBoxRuntime;
}

export async function setLocalBoxMaxSessions(count: number): Promise<InstallationSettings> {
  const data = await graphql<{ setLocalBoxMaxSessions: InstallationSettings }>(
    `mutation ($count: Int!) { setLocalBoxMaxSessions(count: $count) { ${FIELDS} } }`,
    { count },
  );
  return data.setLocalBoxMaxSessions;
}

export async function setLocalBoxDefaultTtlSeconds(seconds: number): Promise<InstallationSettings> {
  const data = await graphql<{ setLocalBoxDefaultTtlSeconds: InstallationSettings }>(
    `mutation ($seconds: Int!) { setLocalBoxDefaultTtlSeconds(seconds: $seconds) { ${FIELDS} } }`,
    { seconds },
  );
  return data.setLocalBoxDefaultTtlSeconds;
}

export async function setLocalBoxMaxTtlSeconds(seconds: number): Promise<InstallationSettings> {
  const data = await graphql<{ setLocalBoxMaxTtlSeconds: InstallationSettings }>(
    `mutation ($seconds: Int!) { setLocalBoxMaxTtlSeconds(seconds: $seconds) { ${FIELDS} } }`,
    { seconds },
  );
  return data.setLocalBoxMaxTtlSeconds;
}

export async function setLocalBoxIdleTimeoutSeconds(seconds: number): Promise<InstallationSettings> {
  const data = await graphql<{ setLocalBoxIdleTimeoutSeconds: InstallationSettings }>(
    `mutation ($seconds: Int!) { setLocalBoxIdleTimeoutSeconds(seconds: $seconds) { ${FIELDS} } }`,
    { seconds },
  );
  return data.setLocalBoxIdleTimeoutSeconds;
}

export async function setBoxCommandWaitSeconds(seconds: number): Promise<InstallationSettings> {
  const data = await graphql<{ setBoxCommandWaitSeconds: InstallationSettings }>(
    `mutation ($seconds: Int!) { setBoxCommandWaitSeconds(seconds: $seconds) { ${FIELDS} } }`,
    { seconds },
  );
  return data.setBoxCommandWaitSeconds;
}

export async function setBoxCommandTimeoutSeconds(seconds: number): Promise<InstallationSettings> {
  const data = await graphql<{ setBoxCommandTimeoutSeconds: InstallationSettings }>(
    `mutation ($seconds: Int!) { setBoxCommandTimeoutSeconds(seconds: $seconds) { ${FIELDS} } }`,
    { seconds },
  );
  return data.setBoxCommandTimeoutSeconds;
}

export async function setBoxOutputBytes(bytes: number): Promise<InstallationSettings> {
  const data = await graphql<{ setBoxOutputBytes: InstallationSettings }>(
    `mutation ($bytes: Int!) { setBoxOutputBytes(bytes: $bytes) { ${FIELDS} } }`,
    { bytes },
  );
  return data.setBoxOutputBytes;
}

export async function setBoxOutputShownBytes(bytes: number): Promise<InstallationSettings> {
  const data = await graphql<{ setBoxOutputShownBytes: InstallationSettings }>(
    `mutation ($bytes: Int!) { setBoxOutputShownBytes(bytes: $bytes) { ${FIELDS} } }`,
    { bytes },
  );
  return data.setBoxOutputShownBytes;
}

export async function setLocalBoxOutputKeptBytes(bytes: number): Promise<InstallationSettings> {
  const data = await graphql<{ setLocalBoxOutputKeptBytes: InstallationSettings }>(
    `mutation ($bytes: Int!) { setLocalBoxOutputKeptBytes(bytes: $bytes) { ${FIELDS} } }`,
    { bytes },
  );
  return data.setLocalBoxOutputKeptBytes;
}

export async function setBoxRequestTimeoutSeconds(seconds: number): Promise<InstallationSettings> {
  const data = await graphql<{ setBoxRequestTimeoutSeconds: InstallationSettings }>(
    `mutation ($seconds: Int!) { setBoxRequestTimeoutSeconds(seconds: $seconds) { ${FIELDS} } }`,
    { seconds },
  );
  return data.setBoxRequestTimeoutSeconds;
}

export async function setBoxMaxPorts(count: number): Promise<InstallationSettings> {
  const data = await graphql<{ setBoxMaxPorts: InstallationSettings }>(
    `mutation ($count: Int!) { setBoxMaxPorts(count: $count) { ${FIELDS} } }`,
    { count },
  );
  return data.setBoxMaxPorts;
}

export async function setBoxPortCheckSeconds(seconds: number): Promise<InstallationSettings> {
  const data = await graphql<{ setBoxPortCheckSeconds: InstallationSettings }>(
    `mutation ($seconds: Int!) { setBoxPortCheckSeconds(seconds: $seconds) { ${FIELDS} } }`,
    { seconds },
  );
  return data.setBoxPortCheckSeconds;
}

export async function setBoxPortCheckWaitMillis(millis: number): Promise<InstallationSettings> {
  const data = await graphql<{ setBoxPortCheckWaitMillis: InstallationSettings }>(
    `mutation ($millis: Int!) { setBoxPortCheckWaitMillis(millis: $millis) { ${FIELDS} } }`,
    { millis },
  );
  return data.setBoxPortCheckWaitMillis;
}

export async function setBoxSessionIdleSeconds(seconds: number): Promise<InstallationSettings> {
  const data = await graphql<{ setBoxSessionIdleSeconds: InstallationSettings }>(
    `mutation ($seconds: Int!) { setBoxSessionIdleSeconds(seconds: $seconds) { ${FIELDS} } }`,
    { seconds },
  );
  return data.setBoxSessionIdleSeconds;
}

export async function setBoxEditUndoSteps(steps: number): Promise<InstallationSettings> {
  const data = await graphql<{ setBoxEditUndoSteps: InstallationSettings }>(
    `mutation ($steps: Int!) { setBoxEditUndoSteps(steps: $steps) { ${FIELDS} } }`,
    { steps },
  );
  return data.setBoxEditUndoSteps;
}
