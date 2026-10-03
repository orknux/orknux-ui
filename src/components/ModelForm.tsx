import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

import {
  fetchChatModelParameters,
  fetchModel,
  fetchProviders,
  modelKindLabel,
  resetIntervalLabel,
  setModelEnabled,
  updateModel,
  updateModelQuotas,
  updateModelThrottle,
} from '../api/models';
import type { ChatParameterSpec, Model, ModelKind, ModelProvider, ResetInterval } from '../api/models';
import chevronDown12Icon from '../assets/chevron-down-12.svg';
import toggleOffIcon from '../assets/toggle-off.svg';
import toggleOnIcon from '../assets/toggle-on.svg';
import { FieldHint } from './FieldHint';
import styles from './ModelForm.module.css';
import { t } from '../i18n';

/**
 * A model's settings, as one form drawn in two frames.
 *
 * The model's own page holds it between its usage figures and its Danger Zone;
 * the workflow editor holds it in the drawer beside the graph, opened from an
 * image or decision node's model picker - the same way an agent node opens its
 * agent. Written once so the two cannot drift: a field added to the page and not
 * to the drawer would be a field the drawer silently saves back as it found it,
 * and a save rule kept twice is two rules.
 *
 * The state and the save are a hook, `useModelForm`; the fields are four
 * sections the frame places as it likes, because the page puts a card of usage
 * figures between two of them and the drawer has no room for one.
 */

/** What a model may be switched to here: the kinds a model is made as. A model already of another kind keeps it on the list. */
const MAKEABLE_KINDS: ModelKind[] = ['CHAT', 'TRANSCRIPTION', 'SPEECH', 'IMAGE'];

const RESET_INTERVALS: ResetInterval[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'NEVER'];

/** The reasoning effort's words as a person reads them; a word the server adds later shows as it is spelled. */
function effortLabel(effort: string): string {
  switch (effort) {
    case 'minimal':
      return t('Minimal');
    case 'low':
      return t('Low');
    case 'medium':
      return t('Medium');
    case 'high':
      return t('High');
    default:
      return effort;
  }
}

/** An empty box is no limit, which is a thing the form has to be able to say. */
function toNumber(value: string): number | null {
  const digits = value.replace(/[,\s]/g, '');
  if (digits === '') return null;
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Everything the form holds and does, for whichever frame draws it. */
export function useModelForm(workspaceId: string, modelId: string) {
  const [model, setModel] = useState<Model | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  /**
   * The window, and what the model keeps out of it for its own answer.
   *
   * Facts about the model that everything sizing a prompt reads, apart from the
   * quotas, which are what this workspace will allow.
   */
  const [contextWindow, setContextWindow] = useState('');
  const [maxOutput, setMaxOutput] = useState('');
  /** '' sends nothing and lets the provider decide; 'one' and 'several' say so. Issue #530. */
  const [parallel, setParallel] = useState<'' | 'one' | 'several'>('');
  /** '' sends nothing and the deployment decides; only drawn where the provider's type declares it. */
  const [reasoningEffort, setReasoningEffort] = useState('');
  /**
   * What a chat model on the selected provider's type takes beyond the shared
   * settings, as the server declares it; null until known, and while it is
   * the stored value is sent back untouched rather than cleared.
   */
  const [chatParameters, setChatParameters] = useState<ChatParameterSpec[] | null>(null);
  // How the model picks its words; '' sends nothing. Issue #533.
  const [temperature, setTemperature] = useState('');
  const [topP, setTopP] = useState('');
  const [topK, setTopK] = useState('');
  const [minP, setMinP] = useState('');
  const [repeatPenalty, setRepeatPenalty] = useState('');
  const [voice, setVoice] = useState('');
  /** The model's own name, model ID and type, editable like the rest - a duplicate arrives as "(copy)". */
  const [name, setName] = useState('');
  const [modelIdDraft, setModelIdDraft] = useState('');
  const [kind, setKind] = useState<ModelKind>('CHAT');
  /** Which provider it is reached through; a change moves it there on save. */
  const [providerId, setProviderId] = useState('');
  /** The workspace's providers, for the select; null until they arrive, and the model's own is drawn meanwhile. */
  const [providers, setProviders] = useState<ModelProvider[] | null>(null);
  const [skipEmptyLines, setSkipEmptyLines] = useState(false);
  const [imageCost, setImageCost] = useState('');
  const [tokenLimit, setTokenLimit] = useState('');
  const [resetInterval, setResetInterval] = useState<ResetInterval>('MONTHLY');
  const [requestsPerMinute, setRequestsPerMinute] = useState('');
  /*
   * This model's own throttle, apart from the quotas: empty inherits the
   * provider's default, 0 turns that rate off, and Retry-After is a third state
   * — inherit the provider, obey, or ignore — so it is a select, not a box. #426.
   */
  const [throttleTokens, setThrottleTokens] = useState('');
  const [throttleRequests, setThrottleRequests] = useState('');
  const [retryAfter, setRetryAfter] = useState<'inherit' | 'obey' | 'ignore'>('inherit');
  /*
   * One save, one message. The window, the quotas and the throttle were three
   * cards with a Save each, so a page that had all three edited needed three
   * presses. They are one press now - issue #386 - and these three are what
   * that press reports.
   */
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (modelId === '') return;
    /*
     * An answer that is no longer wanted is dropped rather than drawn.
     *
     * `apply` fills every box from what came back, so a load that lands late
     * writes the stored model over whatever is in them - the same defect as
     * #324 in the function editor. Two ways in: a reply that arrives after
     * somebody has begun typing, which showed as a Context Window that saved as
     * empty however carefully it was entered; and the reply for the model that
     * was open a moment ago landing after the one now open, which draws one
     * model's numbers under another's name.
     *
     * Nothing on screen says either happened. The box still reads what was
     * typed - it is the state behind it that was put back, and the save sends
     * the state.
     */
    let abandoned = false;
    fetchModel(modelId)
      .then((found) => {
        if (abandoned) return;
        if (found === null) {
          setLoadError(t('That model does not exist, or you do not have access to it.'));
          return;
        }
        apply(found);
      })
      .catch((cause: unknown) => {
        if (abandoned) return;
        setLoadError(cause instanceof Error ? cause.message : t('Could not load the model.'));
      });

    return () => {
      abandoned = true;
    };
  }, [modelId]);

  /*
   * The providers a model can move to. Their own request, so a failure here
   * leaves the select holding the one the model is on rather than the form.
   */
  useEffect(() => {
    if (workspaceId === '') return;
    let abandoned = false;
    fetchProviders(workspaceId)
      .then((held) => {
        if (!abandoned) setProviders(held);
      })
      .catch(() => undefined);
    return () => {
      abandoned = true;
    };
  }, [workspaceId]);

  /*
   * The sampling and reasoning settings follow the provider picked above, so a
   * model moved from a llama.cpp server to Azure stops offering top-k and
   * starts offering a reasoning effort.
   */
  useEffect(() => {
    if (providerId === '') return;
    let abandoned = false;
    setChatParameters(null);
    fetchChatModelParameters(providerId)
      .then((held) => {
        if (!abandoned) setChatParameters(held);
      })
      .catch(() => undefined);
    return () => {
      abandoned = true;
    };
  }, [providerId]);

  function apply(found: Model) {
    setModel(found);
    setName(found.name);
    setModelIdDraft(found.modelId);
    setKind(found.kind);
    setProviderId(found.providerId);
    setContextWindow(found.contextWindow === null ? '' : String(found.contextWindow));
    setMaxOutput(found.maxOutput === null ? '' : String(found.maxOutput));
    setParallel(found.parallelToolCalls === null ? '' : found.parallelToolCalls ? 'several' : 'one');
    setReasoningEffort(found.reasoningEffort ?? '');
    setTemperature(found.temperature === null ? '' : String(found.temperature));
    setTopP(found.topP === null ? '' : String(found.topP));
    setTopK(found.topK === null ? '' : String(found.topK));
    setMinP(found.minP === null ? '' : String(found.minP));
    setRepeatPenalty(found.repeatPenalty === null ? '' : String(found.repeatPenalty));
    setVoice(found.voice ?? '');
    setSkipEmptyLines(found.skipEmptyLines);
    setImageCost(found.imageCostPerImage === null ? '' : String(found.imageCostPerImage));
    setTokenLimit(found.tokenLimit === null ? '' : String(found.tokenLimit));
    setResetInterval(found.resetInterval);
    setRequestsPerMinute(found.requestsPerMinute === null ? '' : String(found.requestsPerMinute));
    setThrottleTokens(found.throttleTokensPerSecond === null ? '' : String(found.throttleTokensPerSecond));
    setThrottleRequests(found.throttleRequestsPerSecond === null ? '' : String(found.throttleRequestsPerSecond));
    setRetryAfter(found.acceptRetryAfter === null ? 'inherit' : found.acceptRetryAfter ? 'obey' : 'ignore');
  }

  async function toggle() {
    if (model === null) return;
    try {
      apply(await setModelEnabled(model.id, !model.enabled));
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : t('Could not change the model.'));
    }
  }

  /**
   * An image model is billed per picture, so the window card is about a price.
   *
   * Same form and same save: the two fields it swaps for are meaningless on one
   * - a model that draws reads no context window and writes no tokens - and the
   * per-picture price had nowhere else to be changed, which would have made a
   * mistyped price permanent.
   */
  const draws = model?.kind === 'IMAGE';

  /**
   * A speech model reads in a voice, and this is where it is changed.
   *
   * The same gap the context window had: a field the create dialog offers and
   * the model's own page does not, so the only way to correct a voice was to
   * delete the model and make it again.
   */
  const reads = model?.kind === 'SPEECH';
  /** Whether the provider reads this setting for a chat model; only those are drawn and sent. */
  const offered = (setting: string): boolean =>
    kind === 'CHAT' && (chatParameters?.some((one) => one.name === setting) ?? false);
  /** The reasoning effort's choices where the provider reads one, else null. */
  const effortChoices = offered('reasoningEffort')
    ? (chatParameters?.find((one) => one.name === 'reasoningEffort')?.choices ?? null)
    : null;
  /**
   * What a setting is saved as: as stored while the provider's list is still
   * on its way, the box where it is drawn, and nothing where the provider does
   * not read it - the server refuses one there.
   */
  const sampled = (setting: string, typed: string, stored: number | null): number | null =>
    chatParameters === null ? stored : offered(setting) ? toNumber(typed) : null;
  const editableKinds =
    model !== null && !MAKEABLE_KINDS.includes(model.kind) ? [...MAKEABLE_KINDS, model.kind] : MAKEABLE_KINDS;

  /**
   * Everything the form can change, saved in one press. Answers the model as
   * it now stands, or null where the save was refused - the reason is then in
   * `saveError`.
   *
   * Three mutations, because they are three things on the server: the model's
   * own details, what the workspace allows it, and the pace it is let out at.
   * One press here, because the person pressing does not care which is which.
   *
   * One after another rather than at once. Each answers with the whole model,
   * and three in flight would answer in whatever order they landed, so the one
   * applied last could carry another's field as it was before that one wrote
   * it. In order, the last answer is the model with all three in it.
   *
   * **The details.** `updateModel` replaces a model's own details rather than
   * patching them, so the fields this form does not show are sent back exactly
   * as they were loaded: leaving one out would clear it.
   *
   * **The throttle.** null on a rate inherits the provider's default and 0
   * turns it off; Retry-After's inherit is null, so the three-way select
   * round-trips through null rather than a false.
   */
  async function save(): Promise<Model | null> {
    if (model === null || saving) return null;

    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      await updateModel(model.id, {
        name: name.trim(),
        modelId: modelIdDraft.trim(),
        kind,
        contextWindow: toNumber(contextWindow),
        maxOutput: toNumber(maxOutput),
        parallelToolCalls: parallel === '' ? null : parallel === 'several',
        // Not yet known is sent back as stored; known and not taken is nothing, which the server requires.
        reasoningEffort:
          chatParameters === null ? model.reasoningEffort : effortChoices === null || reasoningEffort === '' ? null : reasoningEffort,
        temperature: sampled('temperature', temperature, model.temperature),
        topP: sampled('topP', topP, model.topP),
        topK: sampled('topK', topK, model.topK),
        minP: sampled('minP', minP, model.minP),
        repeatPenalty: sampled('repeatPenalty', repeatPenalty, model.repeatPenalty),
        inputCostPerMillion: model.inputCostPerMillion,
        outputCostPerMillion: model.outputCostPerMillion,
        voice: reads ? (voice.trim() === '' ? null : voice.trim()) : model.voice,
        skipEmptyLines: reads ? skipEmptyLines : model.skipEmptyLines,
        // Sent back whatever it was, for the reason above: a field this form
        // does not show is a field left out and therefore cleared.
        imageCostPerImage: draws ? toNumber(imageCost) : model.imageCostPerImage,
        providerId,
      });
      await updateModelQuotas(model.id, {
        tokenLimit: toNumber(tokenLimit),
        resetInterval,
        requestsPerMinute: toNumber(requestsPerMinute),
      });
      const updated = await updateModelThrottle(model.id, {
        throttleTokensPerSecond: toNumber(throttleTokens),
        throttleRequestsPerSecond: toNumber(throttleRequests),
        acceptRetryAfter: retryAfter === 'inherit' ? null : retryAfter === 'obey',
      });
      apply(updated);
      setSaved(true);
      return updated;
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : t('Could not save the model.'));
      return null;
    } finally {
      setSaving(false);
    }
  }

  return {
    workspaceId,
    model,
    loadError,
    saveError,
    setSaveError,
    saved,
    setSaved,
    saving,
    save,
    toggle,
    draws,
    reads,
    offered,
    effortChoices,
    editableKinds,
    providers,
    fields: {
      name, setName,
      modelIdDraft, setModelIdDraft,
      kind, setKind,
      providerId, setProviderId,
      contextWindow, setContextWindow,
      maxOutput, setMaxOutput,
      parallel, setParallel,
      reasoningEffort, setReasoningEffort,
      temperature, setTemperature,
      topP, setTopP,
      topK, setTopK,
      minP, setMinP,
      repeatPenalty, setRepeatPenalty,
      voice, setVoice,
      skipEmptyLines, setSkipEmptyLines,
      imageCost, setImageCost,
      tokenLimit, setTokenLimit,
      resetInterval, setResetInterval,
      requestsPerMinute, setRequestsPerMinute,
      throttleTokens, setThrottleTokens,
      throttleRequests, setThrottleRequests,
      retryAfter, setRetryAfter,
    },
  };
}

export type ModelFormState = ReturnType<typeof useModelForm>;

/** A section of the form; every one is drawn only once the model has loaded. */
interface SectionProps {
  form: ModelFormState;
}

/** The provider, the name, the type, the model ID and the switch. */
export function ModelDetailsFields({ form }: SectionProps) {
  const { workspaceId, model, providers, editableKinds, fields } = form;
  if (model === null) return null;
  return (
    <div className={styles.detailGrid}>
      <div className={styles.detail}>
        {/*
          The provider is where its endpoint, key and limits live, and a model
          page that named it with no way there left somebody chasing a rate
          limit to go back to the list and find it.
        */}
        <div className={styles.labelRow}>
          <label className={styles.detailLabel} htmlFor="model-provider">{t('Provider')}</label>
          {fields.providerId !== '' && (
            <Link
              className={styles.labelLink}
              to={`/workspace/${workspaceId}/models/providers/${fields.providerId}`}
              data-testid="model-provider-link"
            >
              {t('Open provider')}
            </Link>
          )}
        </div>
        {/*
          A select rather than the name: a model can move to another of the
          workspace's providers, saved with the rest. Until the list arrives the
          one it is on is the only choice, so the box never reads empty.
        */}
        <div className={styles.selectWrapper}>
          <select
            id="model-provider"
            className={`${styles.input} ${styles.select}`}
            value={fields.providerId}
            onChange={(event) => fields.setProviderId(event.target.value)}
          >
            {(providers ?? [{ id: model.providerId, name: model.providerName }]).map((one) => (
              <option key={one.id} value={one.id}>{one.name}</option>
            ))}
          </select>
          <img className={styles.selectChevron} src={chevronDown12Icon} alt="" width={12} height={12} />
        </div>
      </div>
      <div className={styles.detail}>
        <label className={styles.detailLabel} htmlFor="model-name">{t('Name')}</label>
        <input
          id="model-name"
          className={styles.input}
          value={fields.name}
          onChange={(event) => fields.setName(event.target.value)}
        />
      </div>
      <div className={styles.detail}>
        <label className={styles.detailLabel} htmlFor="model-kind">{t('Type')}</label>
        <div className={styles.selectWrapper}>
          <select
            id="model-kind"
            className={`${styles.input} ${styles.select}`}
            value={fields.kind}
            onChange={(event) => fields.setKind(event.target.value as ModelKind)}
          >
            {editableKinds.map((one) => (
              <option key={one} value={one}>{modelKindLabel(one)}</option>
            ))}
          </select>
          <img className={styles.selectChevron} src={chevronDown12Icon} alt="" width={12} height={12} />
        </div>
      </div>
      <div className={styles.detail}>
        <label className={styles.detailLabel} htmlFor="model-id">{t('Model ID')}</label>
        <input
          id="model-id"
          className={`${styles.input} ${styles.detailMono}`}
          value={fields.modelIdDraft}
          onChange={(event) => fields.setModelIdDraft(event.target.value)}
          spellCheck={false}
        />
      </div>
      <div className={styles.detail}>
        <span className={styles.detailLabel}>{t('Status')}</span>
        <span className={styles.statusRow}>
          <button
            type="button"
            className={styles.toggle}
            onClick={() => void form.toggle()}
            role="switch"
            aria-checked={model.enabled}
            aria-label={`${model.enabled ? 'Deactivate' : 'Activate'} ${model.name}`}
          >
            <img src={model.enabled ? toggleOnIcon : toggleOffIcon} alt="" width={36} height={20} data-keeps-colour />
          </button>
          <span className={model.enabled ? styles.statusActive : styles.statusInactive}>
            {model.enabled ? 'Active' : 'Inactive'}
          </span>
        </span>
      </div>
    </div>
  );
}

/**
 * The window and how the model picks its words - or, on a model that draws,
 * the price of a picture - and a speech model's voice.
 *
 * Per model rather than per provider: one provider serves models whose windows
 * differ by an order of magnitude, so a number kept beside the key would be
 * wrong for all but one of them. Issue #252.
 */
export function ModelWindowFields({ form }: SectionProps) {
  const { draws, reads, offered, effortChoices, fields } = form;
  if (form.model === null) return null;
  return (
    <div className={styles.fieldRow}>
      {draws ? (
        <div className={styles.field}>
          <span className={styles.labelWithHint}>
            <label className={styles.label} htmlFor="image-cost">{t('$ / picture')}</label>
            <FieldHint label={t('$ / picture')}>
              {t('What the provider charges for one picture at the size this model draws. It is asked for here rather than as a price per million tokens because that is how these models are billed, and because an image call reports no tokens at all — costed the ordinary way, every picture would come out free. Empty means not recorded, and a drawing then reports no cost rather than nought.')}
            </FieldHint>
          </span>
          <input
            id="image-cost"
            className={`${styles.input} ${styles.inputMono}`}
            value={fields.imageCost}
            onChange={(event) => fields.setImageCost(event.target.value)}
            placeholder={t('Not recorded')}
            inputMode="decimal"
          />
        </div>
      ) : (
        <>
          <div className={styles.field}>
            <span className={styles.labelWithHint}>
              <label className={styles.label} htmlFor="context-window">
                {t('Context Window')}
              </label>
              <FieldHint label={t('Context Window')}>
                {t('How many tokens this model reads at once, as its provider states it. Nothing here asks the model: it is what the workspace records, and it is what a share of a session’s memory is worked out from — an agent given a share of a model with no window recorded falls back to a fixed built-in allowance. Empty means not recorded.')}
              </FieldHint>
            </span>
            <input
              id="context-window"
              className={`${styles.input} ${styles.inputMono}`}
              value={fields.contextWindow}
              onChange={(event) => fields.setContextWindow(event.target.value)}
              placeholder={t('Not recorded')}
              inputMode="numeric"
            />
          </div>
          <div className={styles.field}>
            <span className={styles.labelWithHint}>
              <label className={styles.label} htmlFor="max-output">{t('Max Output')}</label>
              <FieldHint label={t('Max Output')}>
                {t('The most this model will write in one answer. It comes out of the window above, so it is the other half of what a session may be given: a model that reserves most of its window for its answer can carry very little conversation.')}
              </FieldHint>
            </span>
            <input
              id="max-output"
              className={`${styles.input} ${styles.inputMono}`}
              value={fields.maxOutput}
              onChange={(event) => fields.setMaxOutput(event.target.value)}
              placeholder={t('Not recorded')}
              inputMode="numeric"
            />
          </div>
          <div className={styles.field}>
            <span className={styles.labelWithHint}>
              <label className={styles.label} htmlFor="parallel-tool-calls">{t('Tool Calls Per Reply')}</label>
              <FieldHint label={t('Tool Calls Per Reply')}>
                {t('Whether one reply may ask for several tools at once. Left to the provider, nothing is sent. One per reply sends parallel_tool_calls false, which a local server such as llama.cpp enforces in its grammar - a model that starts repeating the same calls in one reply then cannot, where otherwise it can write a hundred of them before its output runs out.')}
              </FieldHint>
            </span>
            <select
              id="parallel-tool-calls"
              className={styles.input}
              value={fields.parallel}
              onChange={(event) => fields.setParallel(event.target.value as '' | 'one' | 'several')}
            >
              <option value="">{t('Unset')}</option>
              <option value="one">{t('One per reply')}</option>
              <option value="several">{t('Several allowed')}</option>
            </select>
          </div>
          {effortChoices !== null && (
            <div className={styles.field}>
              <span className={styles.labelWithHint}>
                <label className={styles.label} htmlFor="reasoning-effort">{t('Reasoning effort')}</label>
                <FieldHint label={t('Reasoning effort')}>
                  {t('How long a reasoning model thinks before answering; default sends nothing.')}
                </FieldHint>
              </span>
              <select
                id="reasoning-effort"
                className={styles.input}
                value={fields.reasoningEffort}
                onChange={(event) => fields.setReasoningEffort(event.target.value)}
              >
                <option value="">{t('Unset')}</option>
                {effortChoices.map((one) => (
                  <option key={one} value={one}>{effortLabel(one)}</option>
                ))}
              </select>
            </div>
          )}
          {offered('temperature') && (
            <div className={styles.field}>
              <span className={styles.labelWithHint}>
                <label className={styles.label} htmlFor="temperature">{t('Temperature')}</label>
                <FieldHint label={t('Temperature')}>
                  {t('How freely the model picks its words: 0 always takes the likeliest, higher is looser. Empty sends nothing and the server uses its own default - a local model often runs at the 1.0 stored in its file. Between 0 and 2.')}
                </FieldHint>
              </span>
              <input
                id="temperature"
                className={`${styles.input} ${styles.inputMono}`}
                value={fields.temperature}
                onChange={(event) => fields.setTemperature(event.target.value)}
                placeholder={t('Server default')}
                inputMode="decimal"
              />
            </div>
          )}
          {offered('topP') && (
            <div className={styles.field}>
              <span className={styles.labelWithHint}>
                <label className={styles.label} htmlFor="top-p">{t('Top P')}</label>
                <FieldHint label={t('Top P')}>
                  {t('Only the likeliest words that together make up this share are considered. Empty sends nothing. Between 0 and 1.')}
                </FieldHint>
              </span>
              <input
                id="top-p"
                className={`${styles.input} ${styles.inputMono}`}
                value={fields.topP}
                onChange={(event) => fields.setTopP(event.target.value)}
                placeholder={t('Server default')}
                inputMode="decimal"
              />
            </div>
          )}
          {offered('topK') && (
            <div className={styles.field}>
              <span className={styles.labelWithHint}>
                <label className={styles.label} htmlFor="top-k">{t('Top K')}</label>
                <FieldHint label={t('Top K')}>
                  {t('Only this many of the likeliest words are considered. Empty sends nothing.')}
                </FieldHint>
              </span>
              <input
                id="top-k"
                className={`${styles.input} ${styles.inputMono}`}
                value={fields.topK}
                onChange={(event) => fields.setTopK(event.target.value)}
                placeholder={t('Server default')}
                inputMode="decimal"
              />
            </div>
          )}
          {offered('minP') && (
            <div className={styles.field}>
              <span className={styles.labelWithHint}>
                <label className={styles.label} htmlFor="min-p">{t('Min P')}</label>
                <FieldHint label={t('Min P')}>
                  {t('A word is dropped when it is less than this share as likely as the likeliest one. Empty sends nothing. Between 0 and 1.')}
                </FieldHint>
              </span>
              <input
                id="min-p"
                className={`${styles.input} ${styles.inputMono}`}
                value={fields.minP}
                onChange={(event) => fields.setMinP(event.target.value)}
                placeholder={t('Server default')}
                inputMode="decimal"
              />
            </div>
          )}
          {offered('repeatPenalty') && (
            <div className={styles.field}>
              <span className={styles.labelWithHint}>
                <label className={styles.label} htmlFor="repeat-penalty">{t('Repeat Penalty')}</label>
                <FieldHint label={t('Repeat Penalty')}>
                  {t('Makes words the model has just written less likely again; 1 is off, and a light 1.05 discourages repetition. Empty sends nothing. Between 0 and 2.')}
                </FieldHint>
              </span>
              <input
                id="repeat-penalty"
                className={`${styles.input} ${styles.inputMono}`}
                value={fields.repeatPenalty}
                onChange={(event) => fields.setRepeatPenalty(event.target.value)}
                placeholder={t('Server default')}
                inputMode="decimal"
              />
            </div>
          )}
        </>
      )}
      {reads && (
        <div className={styles.field}>
          <span className={styles.labelWithHint}>
            <label className={styles.label} htmlFor="model-voice">{t('Voice')}</label>
            <FieldHint label={t('Voice')}>
              {t('Which voice reads. The names belong to the provider: OpenAI knows alloy and nova, a self-hosted reader knows the voice pack it loaded. Left empty, alloy is sent, which a reader that has never heard of it refuses.')}
            </FieldHint>
          </span>
          <input
            id="model-voice"
            className={`${styles.input} ${styles.inputMono}`}
            value={fields.voice}
            onChange={(event) => fields.setVoice(event.target.value)}
            placeholder="alloy"
          />
        </div>
      )}
      {reads && (
        <div className={styles.field}>
          <span className={styles.checkboxWithHint}>
            <label className={styles.checkboxField}>
              <input
                type="checkbox"
                checked={fields.skipEmptyLines}
                onChange={(event) => fields.setSkipEmptyLines(event.target.checked)}
              />
              <span>{t('Skip empty lines when reading')}</span>
            </label>
            {/*
              Beside the box, not inside its label: the (?) is a button, and a
              button inside a <label> would tick the box on its way to opening.
            */}
            <FieldHint label={t('Skip empty lines when reading')}>
              {t('A blank line is something the eye reads and the ear cannot, and readers differ on it: some pause far too long, some treat it as the end and clip what follows. Turn this on where yours does. It changes the text handed over, never where an answer is cut.')}
            </FieldHint>
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * What the workspace allows the model. `between` is drawn under the token
 * limit, which is where the page shows how much of it is spent.
 */
export function ModelQuotaFields({ form, between }: SectionProps & { between?: ReactNode }) {
  const { fields } = form;
  if (form.model === null) return null;
  return (
    <>
      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="token-limit">{t('Token Limit')}</label>
          <input
            id="token-limit"
            className={`${styles.input} ${styles.inputMono}`}
            value={fields.tokenLimit}
            onChange={(event) => fields.setTokenLimit(event.target.value)}
            placeholder={t('No limit')}
            inputMode="numeric"
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="reset-interval">
            {t('Reset Interval')}
          </label>
          <div className={styles.selectWrapper}>
            <select
              id="reset-interval"
              className={`${styles.input} ${styles.select}`}
              value={fields.resetInterval}
              onChange={(event) => fields.setResetInterval(event.target.value as ResetInterval)}
            >
              {RESET_INTERVALS.map((interval) => (
                <option key={interval} value={interval}>
                  {resetIntervalLabel(interval)}
                </option>
              ))}
            </select>
            <img className={styles.selectChevron} src={chevronDown12Icon} alt="" width={12} height={12} />
          </div>
        </div>
      </div>

      {between}

      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="rpm">
            {t('Requests per Minute (RPM)')}
          </label>
          <input
            id="rpm"
            className={`${styles.input} ${styles.inputMono}`}
            value={fields.requestsPerMinute}
            onChange={(event) => fields.setRequestsPerMinute(event.target.value)}
            placeholder={t('No limit')}
            inputMode="numeric"
          />
        </div>
        <div className={styles.field} />
      </div>
    </>
  );
}

/**
 * The pace a call is let out at. Empty inherits the provider's default; a typed
 * 0 turns that rate off though the provider sets one.
 */
export function ModelThrottleFields({ form }: SectionProps) {
  const { fields } = form;
  if (form.model === null) return null;
  return (
    <>
      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="throttle-tokens">{t('Tokens per second')}</label>
          <input
            id="throttle-tokens"
            className={`${styles.input} ${styles.inputMono}`}
            value={fields.throttleTokens}
            onChange={(event) => fields.setThrottleTokens(event.target.value)}
            placeholder={t('Inherit')}
            inputMode="decimal"
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="throttle-requests">{t('Requests per second')}</label>
          <input
            id="throttle-requests"
            className={`${styles.input} ${styles.inputMono}`}
            value={fields.throttleRequests}
            onChange={(event) => fields.setThrottleRequests(event.target.value)}
            placeholder={t('Inherit')}
            inputMode="decimal"
          />
        </div>
      </div>

      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="retry-after">{t('Obey Retry-After')}</label>
          <div className={styles.selectWrapper}>
            <select
              id="retry-after"
              className={`${styles.input} ${styles.select}`}
              value={fields.retryAfter}
              onChange={(event) => fields.setRetryAfter(event.target.value as 'inherit' | 'obey' | 'ignore')}
            >
              <option value="inherit">{t('Inherit provider')}</option>
              <option value="obey">{t('Obey')}</option>
              <option value="ignore">{t('Ignore')}</option>
            </select>
            <img className={styles.selectChevron} src={chevronDown12Icon} alt="" width={12} height={12} />
          </div>
        </div>
        <div className={styles.field} />
      </div>
    </>
  );
}
