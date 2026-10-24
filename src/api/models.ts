import { graphql } from './client';
import { t } from '../i18n';

/** What the endpoint speaks, not who answers there: anything OpenAI-shaped is OPENAI. */
export type ProviderType = 'OPENAI' | 'ANTHROPIC' | 'AZURE_OPENAI' | 'OLLAMA' | 'SYSTEM_ONE' | 'LLAMA_CPP' | 'STABLE_DIFFUSION_CPP' | 'STABLE_DIFFUSION_WEBUI';

/** Where a picture edit's mask says the change goes: transparent (the standard), or white (stable-diffusion.cpp). */
export type EditMask = 'TRANSPARENT' | 'WHITE';
export type ProviderAuthMethod = 'API_KEY' | 'ENTRA_ID';
/**
 * Which OpenAI API an Azure OpenAI provider's chats go through. Responses is
 * the default, because chat completions refuse a reasoning model its tools;
 * chat completions is the old road, kept so an installation can go back.
 */
export type ChatApi = 'RESPONSES' | 'CHAT_COMPLETIONS';
/** CONNECTED only once a check reached the provider: a stored key is not a working one. */
export type ProviderStatus = 'NOT_CONFIGURED' | 'NOT_CHECKED' | 'CONNECTED' | 'FAILED';
export type ModelKind = 'CHAT' | 'EMBEDDING' | 'COMPLETION' | 'TRANSCRIPTION' | 'SPEECH' | 'IMAGE' | 'DECISION' | 'UPSCALE' | 'VIDEO';

/**
 * The kinds that do not answer a prompt.
 *
 * Anywhere a model is picked to be *talked to* — a chat, an agent, the
 * workspace's own small jobs — these are the wrong answer, and offering one
 * makes a conversation that cannot reply. Listed once so a sixth kind does not
 * have to be remembered in five places.
 */
export const VOICE_KINDS: ModelKind[] = ['TRANSCRIPTION', 'SPEECH', 'IMAGE', 'DECISION', 'UPSCALE', 'VIDEO'];

/**
 * Whether a provider of this type can hold a model of this kind - the pairings
 * the server allows: a decision model only under a decision provider, an
 * upscale model only under a Stable Diffusion WebUI, and nothing else under
 * either of those.
 */
export function providerHolds(type: ProviderType, kind: ModelKind): boolean {
  return (type === 'SYSTEM_ONE') === (kind === 'DECISION') && (type === 'STABLE_DIFFUSION_WEBUI') === (kind === 'UPSCALE');
}

/**
 * Whether this model is one that answers, rather than one that hears, reads or
 * draws.
 *
 * An image model belongs here for the same reason the two audio ones do, and
 * the mistake it prevents is the loudest of the three: picked as a chat model it
 * would be sent the whole conversation as a prompt and would draw a picture of
 * it.
 */
export function answers(model: { kind: ModelKind }): boolean {
  return !VOICE_KINDS.includes(model.kind);
}
export type ResetInterval = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'NEVER';

/** An LLM provider a workspace reaches models through. Credentials are never returned here. */
export interface ModelProvider {
  id: string;
  workspaceId: string;
  name: string;
  type: ProviderType;
  endpoint: string;
  authMethod: ProviderAuthMethod;
  apiVersion: string | null;
  deploymentName: string | null;
  region: string | null;
  tenantId: string | null;
  clientId: string | null;
  scope: string | null;
  /**
   * Whether the timed sweep calls this provider. False is a provider nobody
   * wants polled — a model server that is only sometimes running — and it is
   * why the status beside it may stay "Not checked". Test Connection ignores
   * it, and so does every chat and task the provider serves.
   */
  checkEnabled: boolean;
  /** The default tokens a second this provider's models hold under; null is no default. Issue #426. */
  throttleTokensPerSecond: number | null;
  /** The default requests a second, possibly below one; null is no default. Issue #426. */
  throttleRequestsPerSecond: number | null;
  /** Whether a 429's Retry-After is obeyed by default, ahead of a node's retry. Issue #426. */
  acceptRetryAfter: boolean;
  /** Which API an Azure OpenAI provider's chats go through; null on every other type. */
  chatApi: ChatApi | null;
  /**
   * Whether the model's own earlier thinking is sent back in later requests.
   * False by default; the thinking is captured and shown either way.
   */
  sendsReasoning: boolean;
  /** Every tool up front from an agent's first round, as set; null is the type's default. */
  offerAllTools: boolean | null;
  /** How a picture edit's mask is drawn for this server; null is its type's. */
  editMask: EditMask | null;
  /** Whether it does, the default resolved: on for Ollama unless set. */
  offersAllTools: boolean;
  /** Whether its models draw with a negative prompt; where they do not, none is offered. Issue #657. */
  takesNegativePrompt: boolean;
  /** The most tools one request carries, as set; null is what the type takes. */
  maxTools: number | null;
  /** How many that is, the default resolved. */
  toolCap: number;
  status: ProviderStatus;
  lastCheckMessage: string | null;
  lastCheckedAt: string | null;
  /** Whether it holds a credential of its own. False for one reading a variable. */
  secretSet: boolean;
  /**
   * The workspace variable secret it reads its credential from, or null when it
   * keeps its own copy. Those are the two, and they are exclusive.
   */
  secretVariableId: string | null;
  /**
   * What that variable is called and which catalog holds it, so a screen can
   * name the reference without asking again. Both null when there is no
   * reference — and also when there is one pointing at nothing, which is what
   * `secretVariableMissing` is for.
   */
  secretVariableName: string | null;
  secretVariableCatalog: string | null;
  /**
   * A reference pointing at nothing. Deleting a variable a provider reads is
   * refused, so this should not happen — but a restore or a database edited by
   * hand can produce one, and a provider that cannot say why it has no key is
   * the failure worth reporting rather than assuming away.
   */
  secretVariableMissing: boolean;
}

export interface Model {
  id: string;
  providerId: string;
  workspaceId: string;
  providerName: string;
  name: string;
  modelId: string;
  kind: ModelKind;
  contextWindow: number | null;
  maxOutput: number | null;
  /** Null lets the provider decide; false is one tool call per reply. Issue #530. */
  parallelToolCalls: boolean | null;
  /** How hard a reasoning model thinks; null sends nothing. Only where `fetchChatModelParameters` lists it. */
  reasoningEffort: string | null;
  /** How the model picks its words; null sends nothing. Issue #533. */
  temperature: number | null;
  topP: number | null;
  topK: number | null;
  minP: number | null;
  repeatPenalty: number | null;
  enabled: boolean;
  tokenLimit: number | null;
  resetInterval: ResetInterval;
  requestsPerMinute: number | null;
  /** How long one call may take, in minutes; null takes the installation's. Issue #644. */
  answerLimitMinutes: number | null;
  /** The installation's limit, which a null answerLimitMinutes takes. */
  answerLimitMinutesInherited: number;
  /** This model's own throttle; null on a rate inherits the provider, 0 turns it off. Issue #426. */
  throttleTokensPerSecond: number | null;
  throttleRequestsPerSecond: number | null;
  /** Whether it obeys a 429's Retry-After; null inherits the provider. Issue #426. */
  acceptRetryAfter: boolean | null;
  inputCostPerMillion: number | null;
  outputCostPerMillion: number | null;
  /** What cached input costs, per million; null charges it at the input price. */
  cachedInputCostPerMillion: number | null;
  /** What writing input into the provider's cache costs, per million; null charges it at the input price. */
  cacheWriteCostPerMillion: number | null;
  /** Which voice a SPEECH model reads in; null sends none and takes the provider's. */
  voice: string | null;
  /**
   * Whether a SPEECH model is handed text with its empty lines taken out.
   *
   * A blank line is a thing the eye reads and the ear cannot, and readers
   * differ on what to do with one. It governs the text handed over, never
   * where an answer is cut.
   */
  skipEmptyLines: boolean;
  /**
   * What one picture costs on an IMAGE model; null means nobody recorded it.
   *
   * Not the same as free, and its own field for the reason the server's column
   * is: these models are billed per picture and report no tokens, so the two
   * per-million prices beside it would cost every one of them at nothing.
   */
  imageCostPerImage: number | null;
  /**
   * Whether a video attached to a chat message is sent to this model. Off, a
   * message carrying one is refused before the model is asked; only a provider
   * whose chat parameters list `takesVideo` lets it be switched on.
   */
  takesVideo: boolean;
  /**
   * Whether a sound attached to a chat message - mp3, wav, flac - is sent to
   * this model. Off, a message carrying one is refused before the model is
   * asked; only a provider whose chat parameters list `takesAudio` offers it.
   */
  takesAudio: boolean;
  /** What its pictures must not contain, sent when a drawing names none; null is none. Issue #657. */
  negativePrompt: string | null;
  /** Whether its provider draws with a negative prompt; where it does not, none is offered. */
  takesNegativePrompt: boolean;
}

/** A model the provider says it can run; `added` when the catalogue has it already. */
export interface DiscoveredModel {
  modelId: string;
  added: boolean;
  /** The context the provider runs it with, where its listing says (llama.cpp does); null otherwise. */
  contextWindow: number | null;
  /** A llama.cpp server's own model, which costs nothing per token. */
  selfHosted: boolean;
}

export interface ModelUsageDay {
  day: string;
  requests: number;
  tokens: number;
}

/** Summed over recorded calls; `empty` when there have been none. */
export interface ModelUsage {
  modelId: string;
  days: number;
  from: string;
  to: string;
  empty: boolean;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  /** Of inputTokens, how many the provider served from its prompt cache. */
  cachedInputTokens: number;
  totalTokens: number;
  averageLatencyMillis: number;
  costEstimate: number | null;
  requestsChange: number | null;
  tokensChange: number | null;
  latencyChange: number | null;
  series: ModelUsageDay[];
  periodStart: string;
  periodTokens: number;
}

const PROVIDER_FIELDS =
  'id workspaceId name type endpoint authMethod apiVersion deploymentName region tenantId clientId scope ' +
  'checkEnabled throttleTokensPerSecond throttleRequestsPerSecond acceptRetryAfter chatApi sendsReasoning ' +
  'offerAllTools offersAllTools takesNegativePrompt maxTools toolCap editMask ' +
  'status lastCheckMessage lastCheckedAt secretSet ' +
  'secretVariableId secretVariableName secretVariableCatalog secretVariableMissing';
export const MODEL_FIELDS =
  'id providerId workspaceId providerName name modelId kind contextWindow maxOutput parallelToolCalls reasoningEffort temperature topP topK minP repeatPenalty enabled ' +
  'tokenLimit resetInterval requestsPerMinute answerLimitMinutes answerLimitMinutesInherited throttleTokensPerSecond throttleRequestsPerSecond acceptRetryAfter ' +
  'inputCostPerMillion outputCostPerMillion cachedInputCostPerMillion cacheWriteCostPerMillion voice skipEmptyLines ' +
  'imageCostPerImage takesVideo takesAudio negativePrompt takesNegativePrompt';
const USAGE_FIELDS =
  'modelId days from to empty requests inputTokens outputTokens cachedInputTokens totalTokens averageLatencyMillis ' +
  'costEstimate requestsChange tokensChange latencyChange periodStart periodTokens ' +
  'series { day requests tokens }';

/**
 * A sampling or reasoning setting a chat model's provider reads, by the model
 * field it is saved under. The model page draws one control per entry and
 * nothing else; a provider that reads none answers [].
 */
export interface ChatParameterSpec {
  name: 'temperature' | 'topP' | 'topK' | 'minP' | 'repeatPenalty' | 'reasoningEffort' | 'takesVideo' | 'takesAudio' | string;
  kind: 'NUMBER' | 'CHOICE' | 'SWITCH';
  /** What a CHOICE may be; empty for a NUMBER. */
  choices: string[];
}

export async function fetchChatModelParameters(providerId: string): Promise<ChatParameterSpec[]> {
  const data = await graphql<{ chatModelParameters: ChatParameterSpec[] }>(
    'query ChatModelParameters($providerId: ID!) { chatModelParameters(providerId: $providerId) { name kind choices } }',
    { providerId },
  );
  return data.chatModelParameters;
}

export async function fetchProviders(workspaceId: string): Promise<ModelProvider[]> {
  const data = await graphql<{ modelProviders: ModelProvider[] }>(
    `query ModelProviders($workspaceId: ID!) { modelProviders(workspaceId: $workspaceId) { ${PROVIDER_FIELDS} } }`,
    { workspaceId },
  );
  return data.modelProviders;
}

export async function fetchProvider(id: string): Promise<ModelProvider | null> {
  const data = await graphql<{ modelProvider: ModelProvider | null }>(
    `query ModelProvider($id: ID!) { modelProvider(id: $id) { ${PROVIDER_FIELDS} } }`,
    { id },
  );
  return data.modelProvider;
}

export async function fetchModels(workspaceId: string): Promise<Model[]> {
  const data = await graphql<{ models: Model[] }>(
    `query Models($workspaceId: ID!) { models(workspaceId: $workspaceId) { ${MODEL_FIELDS} } }`,
    { workspaceId },
  );
  return data.models;
}

export async function fetchModel(id: string): Promise<Model | null> {
  const data = await graphql<{ model: Model | null }>(
    `query Model($id: ID!) { model(id: $id) { ${MODEL_FIELDS} } }`,
    { id },
  );
  return data.model;
}

/**
 * What the provider itself offers. Asks the provider, so it can fail the way a
 * connection check fails — the caller shows why rather than an empty list.
 */
export async function fetchDiscoveredModels(providerId: string): Promise<DiscoveredModel[]> {
  const data = await graphql<{ discoveredModels: DiscoveredModel[] }>(
    `query DiscoveredModels($providerId: ID!) { discoveredModels(providerId: $providerId) { modelId added contextWindow selfHosted } }`,
    { providerId },
  );
  return data.discoveredModels;
}

/**
 * What a model was used for, over a window and against the one before it.
 *
 * `days` counts back from today and is what the page opens on. `from` and `to`
 * are a range and win where either is given: `from` alone runs to now, `to`
 * alone is the window of `days` ending there, and the two together are the days
 * between them. Both are `YYYY-MM-DD`; an empty one is nothing asked for, which
 * is what an emptied box sends.
 */
export async function fetchModelUsage(
  id: string,
  days = 30,
  from?: string,
  to?: string,
): Promise<ModelUsage> {
  const data = await graphql<{ modelUsage: ModelUsage }>(
    `query ModelUsage($id: ID!, $days: Int!, $from: String, $to: String) {
       modelUsage(id: $id, days: $days, from: $from, to: $to) { ${USAGE_FIELDS} }
     }`,
    { id, days, from: from ?? null, to: to ?? null },
  );
  return data.modelUsage;
}

export interface ProviderInput {
  name: string;
  type: ProviderType;
  endpoint: string;
  authMethod: ProviderAuthMethod;
  /** Undefined leaves a stored credential alone; empty clears it, reference and all. */
  secret?: string;
  /**
   * Points the provider at a workspace variable secret, dropping any copy it
   * held. Undefined leaves the credential as it is.
   *
   * Never sent together with `secret`: the server refuses the pair rather than
   * resolving it by precedence, because sending both is a caller who has not
   * chosen between the two.
   */
  secretVariableId?: string;
  apiVersion?: string | null;
  deploymentName?: string | null;
  region?: string | null;
  tenantId?: string | null;
  clientId?: string | null;
  scope?: string | null;
  /** Whether the timed sweep may call it. The button is not governed by this. */
  checkEnabled?: boolean;
  /** Default throttle for this provider's models; null clears a rate to no default. Issue #426. */
  throttleTokensPerSecond?: number | null;
  throttleRequestsPerSecond?: number | null;
  /** Whether a 429's Retry-After is obeyed by default. Issue #426. */
  acceptRetryAfter?: boolean;
  /** Azure OpenAI only - the server refuses it on any other type. Undefined leaves it as it is. */
  chatApi?: ChatApi;
  /** Whether the model's earlier thinking is sent back. Undefined is off on create and unchanged on update. */
  sendsReasoning?: boolean;
  /** Every tool up front; null is the type's default. Sent as given on every save. */
  offerAllTools?: boolean | null;
  /** Set as given: null is its type's. */
  editMask?: EditMask | null;
  /** The most tools one request carries, 8 to 1024; null is what the type takes. */
  maxTools?: number | null;
}

/**
 * Whether a provider of this type hands every tool up front when nobody said:
 * Ollama, and OpenAI - whose type is also every OpenAI-compatible local server,
 * llama.cpp among them. The server's `ModelProvider.offersAllTools`, mirrored.
 */
export function offersAllByDefault(type: ProviderType): boolean {
  return type === 'OLLAMA' || type === 'OPENAI' || type === 'LLAMA_CPP';
}

/**
 * How many tools one request to a provider of this type takes, when nobody set
 * a number - the server's `ProviderType.toolLimit`, mirrored for a placeholder.
 */
export const TYPE_TOOL_CAPS: Record<ProviderType, number> = {
  // OpenAI's own API takes 128; the server says so for a provider pointed at it.
  OPENAI: 200,
  AZURE_OPENAI: 128,
  OLLAMA: 200,
  LLAMA_CPP: 200,
  ANTHROPIC: 256,
  SYSTEM_ONE: 0,
  STABLE_DIFFUSION_CPP: 0,
  STABLE_DIFFUSION_WEBUI: 0,
};

export async function createProvider(
  workspaceId: string,
  input: ProviderInput,
): Promise<ModelProvider> {
  const data = await graphql<{ createModelProvider: ModelProvider }>(
    `mutation CreateModelProvider($input: CreateModelProviderInput!) {
       createModelProvider(input: $input) { ${PROVIDER_FIELDS} }
     }`,
    { input: { workspaceId, ...input } },
  );
  return data.createModelProvider;
}

export async function updateProvider(id: string, input: ProviderInput): Promise<ModelProvider> {
  const data = await graphql<{ updateModelProvider: ModelProvider }>(
    `mutation UpdateModelProvider($id: ID!, $input: UpdateModelProviderInput!) {
       updateModelProvider(id: $id, input: $input) { ${PROVIDER_FIELDS} }
     }`,
    { id, input },
  );
  return data.updateModelProvider;
}

export async function removeProvider(id: string): Promise<boolean> {
  const data = await graphql<{ removeModelProvider: boolean }>(
    'mutation RemoveModelProvider($id: ID!) { removeModelProvider(id: $id) }',
    { id },
  );
  return data.removeModelProvider;
}

/** Asks the provider whether it answers; what comes back is what it said. */
export async function testProvider(id: string): Promise<ModelProvider> {
  const data = await graphql<{ testModelProvider: ModelProvider }>(
    `mutation TestModelProvider($id: ID!) { testModelProvider(id: $id) { ${PROVIDER_FIELDS} } }`,
    { id },
  );
  return data.testModelProvider;
}

export async function revealProviderSecret(id: string): Promise<string | null> {
  const data = await graphql<{ revealModelProviderSecret: string | null }>(
    'mutation RevealModelProviderSecret($id: ID!) { revealModelProviderSecret(id: $id) }',
    { id },
  );
  return data.revealModelProviderSecret;
}

export interface ModelDetailsInput {
  name: string;
  modelId: string;
  kind?: ModelKind;
  contextWindow?: number | null;
  maxOutput?: number | null;
  parallelToolCalls?: boolean | null;
  /** Refused by the server where the provider's type does not declare it. */
  reasoningEffort?: string | null;
  temperature?: number | null;
  topP?: number | null;
  topK?: number | null;
  minP?: number | null;
  repeatPenalty?: number | null;
  inputCostPerMillion?: number | null;
  outputCostPerMillion?: number | null;
  cachedInputCostPerMillion?: number | null;
  cacheWriteCostPerMillion?: number | null;
  /** Only asked for on a SPEECH model; null sends none and takes the provider's. */
  voice?: string | null;
  /** Whether a SPEECH model is handed text with its empty lines taken out. */
  skipEmptyLines?: boolean;
  /** Only asked for on an IMAGE model, which is billed per picture rather than per token. */
  imageCostPerImage?: number | null;
  /** Whether a video attached to a chat is sent to it; left out, it stays as it is. */
  takesVideo?: boolean;
  /** Whether a sound attached to a chat is sent to it; left out, it stays as it is. */
  takesAudio?: boolean;
  /** What its pictures must not contain, by default; refused where the provider takes no negative prompt. */
  negativePrompt?: string | null;
  /** The provider to move it to, in the same workspace; left out, it stays where it is. */
  providerId?: string;
}

export async function createModel(
  providerId: string,
  input: Omit<ModelDetailsInput, 'modelId' | 'providerId'> & { modelId: string },
): Promise<Model> {
  const data = await graphql<{ createModel: Model }>(
    `mutation CreateModel($input: CreateModelInput!) { createModel(input: $input) { ${MODEL_FIELDS} } }`,
    { input: { providerId, ...input } },
  );
  return data.createModel;
}

export async function updateModel(id: string, input: ModelDetailsInput): Promise<Model> {
  const data = await graphql<{ updateModel: Model }>(
    `mutation UpdateModel($id: ID!, $input: UpdateModelInput!) { updateModel(id: $id, input: $input) { ${MODEL_FIELDS} } }`,
    { id, input },
  );
  return data.updateModel;
}

export interface QuotasInput {
  tokenLimit: number | null;
  resetInterval: ResetInterval;
  requestsPerMinute: number | null;
  answerLimitMinutes: number | null;
}

export async function updateModelQuotas(id: string, input: QuotasInput): Promise<Model> {
  const data = await graphql<{ updateModelQuotas: Model }>(
    `mutation UpdateModelQuotas($id: ID!, $input: ModelQuotasInput!) {
       updateModelQuotas(id: $id, input: $input) { ${MODEL_FIELDS} }
     }`,
    { id, input },
  );
  return data.updateModelQuotas;
}

/**
 * A model's rate throttle, saved together. Null on a rate inherits the
 * provider's default, 0 turns that dimension off, null acceptRetryAfter
 * inherits the provider's choice. Issue #426.
 */
export interface ThrottleInput {
  throttleTokensPerSecond: number | null;
  throttleRequestsPerSecond: number | null;
  acceptRetryAfter: boolean | null;
}

export async function updateModelThrottle(id: string, input: ThrottleInput): Promise<Model> {
  const data = await graphql<{ updateModelThrottle: Model }>(
    `mutation UpdateModelThrottle($id: ID!, $input: ModelThrottleInput!) {
       updateModelThrottle(id: $id, input: $input) { ${MODEL_FIELDS} }
     }`,
    { id, input },
  );
  return data.updateModelThrottle;
}

export async function setModelEnabled(id: string, enabled: boolean): Promise<Model> {
  const data = await graphql<{ setModelEnabled: Model }>(
    `mutation SetModelEnabled($id: ID!, $enabled: Boolean!) {
       setModelEnabled(id: $id, enabled: $enabled) { ${MODEL_FIELDS} }
     }`,
    { id, enabled },
  );
  return data.setModelEnabled;
}

export async function removeModel(id: string): Promise<boolean> {
  const data = await graphql<{ removeModel: boolean }>(
    'mutation RemoveModel($id: ID!) { removeModel(id: $id) }',
    { id },
  );
  return data.removeModel;
}

export function providerTypeLabel(type: ProviderType): string {
  switch (type) {
    case 'OPENAI':
      return 'OpenAI';
    case 'ANTHROPIC':
      return 'Anthropic';
    case 'AZURE_OPENAI':
      return t('Azure OpenAI');
    case 'OLLAMA':
      return 'Ollama';
    case 'LLAMA_CPP':
      return 'llama.cpp';
    case 'STABLE_DIFFUSION_CPP':
      return 'stable-diffusion.cpp';
    // AUTOMATIC1111, Forge and SD.Next serve one API, so one type covers the three.
    case 'STABLE_DIFFUSION_WEBUI':
      return t('Stable Diffusion WebUI (AUTOMATIC1111, Forge, SD.Next)');
    // One type for any server speaking the Jev format, whoever built it. Issue #577.
    case 'SYSTEM_ONE':
      return t('Decision model (Jev format)');
  }
}

/**
 * "Connected" is reserved for a provider that answered a check. Everything else
 * says what it actually is, rather than borrowing the word.
 */
export function providerStatusLabel(status: ProviderStatus): string {
  switch (status) {
    case 'CONNECTED':
      return 'Connected';
    case 'FAILED':
      return t('Check failed');
    case 'NOT_CHECKED':
      return t('Not checked');
    case 'NOT_CONFIGURED':
      return t('Not connected');
  }
}

export function modelKindLabel(kind: ModelKind): string {
  switch (kind) {
    case 'CHAT':
      return 'Chat';
    case 'EMBEDDING':
      return 'Embedding';
    case 'COMPLETION':
      return 'Completion';
    case 'TRANSCRIPTION':
      return 'Transcription';
    case 'SPEECH':
      return 'Speech';
    case 'IMAGE':
      return 'Image';
    case 'DECISION':
      return t('Decision');
    case 'UPSCALE':
      return t('Upscale');
    case 'VIDEO':
      return t('Video');
  }
}

export function resetIntervalLabel(interval: ResetInterval): string {
  switch (interval) {
    case 'DAILY':
      return 'Daily';
    case 'WEEKLY':
      return 'Weekly';
    case 'MONTHLY':
      return 'Monthly';
    case 'NEVER':
      return 'Never';
  }
}

/** 4200000 -> "4.2M", 12847 -> "12,847": big numbers shorten, countable ones do not. */
export function formatCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toLocaleString('en-US');
}

export function formatTokens(value: number): string {
  return value.toLocaleString('en-US');
}

/** 1234 -> "1.2s", 850 -> "850ms". */
export function formatLatency(millis: number): string {
  if (millis >= 1000) return `${(millis / 1000).toFixed(1)}s`;
  return `${Math.round(millis)}ms`;
}

/**
 * How fast a provider read prompts and wrote answers, as it reported, over
 * some calls: every token over every millisecond, not a mean of rates.
 *
 * Only a provider that reports timings has one - llama.cpp does, OpenAI, vLLM
 * and the rest do not - and where none did the server answers null rather than
 * a speed worked out from how long a call took.
 */
export interface ModelSpeed {
  /** How many calls that reported timings these are over. */
  calls: number;
  /** Null where the milliseconds add up to nothing, as a prompt served whole from cache does. */
  promptTokensPerSecond: number | null;
  generatedTokensPerSecond: number | null;
}

export const MODEL_SPEED_FIELDS = 'calls promptTokensPerSecond generatedTokensPerSecond';

/** A model's speed over its newest calls that reported one, as many as Admin Settings says; null where none did. */
export async function fetchModelSpeed(id: string): Promise<ModelSpeed | null> {
  const data = await graphql<{ model: { speed: ModelSpeed | null } | null }>(
    `query ModelSpeed($id: ID!) { model(id: $id) { speed { ${MODEL_SPEED_FIELDS} } } }`,
    { id },
  );
  return data.model?.speed ?? null;
}

/** 2666.67 -> "2,667 tok/s", 66.67 -> "66.7 tok/s"; a dash where there is no figure. */
export function formatSpeed(perSecond: number | null): string {
  if (perSecond === null) return '—';
  const shown = perSecond >= 100 ? Math.round(perSecond).toLocaleString('en-US') : perSecond.toFixed(1);
  return `${shown} tok/s`;
}

/** 0.082 -> "+8.2%"; null when there was no earlier window to compare with. */
export function formatChange(fraction: number | null): string | null {
  if (fraction === null) return null;
  const percent = (fraction * 100).toFixed(1);
  return `${fraction >= 0 ? '+' : ''}${percent}%`;
}

/** What reading a models file made, and what it left alone. */
export interface ModelImport {
  providers: string[];
  /** Of those, the ones that held a key where they came from and now need one. */
  needsKey: string[];
  models: string[];
  skipped: string[];
}

/** Saves the given models - with their providers, without any key - as a file. */
export async function exportModels(workspaceId: string, modelIds: string[]): Promise<void> {
  const answer = await fetch(`/api/workspaces/${workspaceId}/models/export?models=${modelIds.join(',')}`, { credentials: 'same-origin' });
  if (!answer.ok) throw new Error(t('Could not export the models.'));
  const url = URL.createObjectURL(await answer.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = 'models.orkx.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Saves one provider - with every model it has, without its key - as a models file named after it. */
export async function exportProvider(workspaceId: string, provider: { id: string; name: string }): Promise<void> {
  const answer = await fetch(`/api/workspaces/${workspaceId}/models/export?providers=${provider.id}`, { credentials: 'same-origin' });
  if (!answer.ok) throw new Error(t('Could not export the provider.'));
  const url = URL.createObjectURL(await answer.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = `${provider.name.replace(/[^\w.-]+/g, '-')}.orkx.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Reads a models file into the workspace. */
export async function importModels(workspaceId: string, content: string): Promise<ModelImport> {
  const data = await graphql<{ importModels: ModelImport }>(
    `mutation ImportModels($workspaceId: ID!, $content: String!) { importModels(workspaceId: $workspaceId, content: $content) { providers needsKey models skipped } }`,
    { workspaceId, content },
  );
  return data.importModels;
}

/** A template of models: the installation's, offered on every workspace's Models page. */
export interface ModelTemplate {
  id: string;
  name: string;
  description: string | null;
  /** Each model in it, as "name (provider)". */
  models: string[];
}

/** The templates of models, by name. */
export async function fetchModelTemplates(): Promise<ModelTemplate[]> {
  const data = await graphql<{ modelTemplates: ModelTemplate[] }>(`query ModelTemplates { modelTemplates { id name description models } }`);
  return data.modelTemplates;
}

/** Publishes the given models, under their providers and without any key, as a template. Administrators. */
export async function publishModelTemplate(workspaceId: string, modelIds: string[], name: string, description: string | null): Promise<ModelTemplate> {
  const data = await graphql<{ publishModelTemplate: ModelTemplate }>(
    `mutation PublishModelTemplate($workspaceId: ID!, $modelIds: [ID!]!, $name: String!, $description: String) {
       publishModelTemplate(workspaceId: $workspaceId, modelIds: $modelIds, name: $name, description: $description) { id name description models }
     }`,
    { workspaceId, modelIds, name, description },
  );
  return data.publishModelTemplate;
}

/** Reads a template of models into the workspace, as importing its file would. */
export async function applyModelTemplate(workspaceId: string, id: string): Promise<ModelImport> {
  const data = await graphql<{ useModelTemplate: ModelImport }>(
    `mutation UseModelTemplate($workspaceId: ID!, $id: ID!) { useModelTemplate(workspaceId: $workspaceId, id: $id) { providers needsKey models skipped } }`,
    { workspaceId, id },
  );
  return data.useModelTemplate;
}

/** What Test found on the provider form. */
export interface ProviderCheck {
  connected: boolean;
  message: string;
}

/** Test on the provider form: what it holds, checked without saving. With `id`, a blank key is the stored one. */
export async function checkProviderDraft(workspaceId: string, input: ProviderInput, id?: string | null): Promise<ProviderCheck> {
  const data = await graphql<{ checkModelProviderDraft: ProviderCheck }>(
    `mutation CheckModelProviderDraft($input: CreateModelProviderInput!, $id: ID) {
       checkModelProviderDraft(input: $input, id: $id) { connected message }
     }`,
    { input: { workspaceId, ...input }, id: id ?? null },
  );
  return data.checkModelProviderDraft;
}
