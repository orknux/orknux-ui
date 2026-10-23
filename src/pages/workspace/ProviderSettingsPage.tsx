import { useEffect, useId, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import {
  createProvider,
  fetchModels,
  fetchProvider,
  providerStatusLabel,
  providerTypeLabel,
  removeProvider,
  revealProviderSecret,
  offersAllByDefault,
  checkProviderDraft,
  TYPE_TOOL_CAPS,
  updateProvider,
} from '../../api/models';
import type { ChatApi, EditMask, ModelProvider, ProviderAuthMethod, ProviderType } from '../../api/models';
import type { SessionUser } from '../../api/session';
import chevronDown12Icon from '../../assets/chevron-down-12.svg';
import toggleOffIcon from '../../assets/toggle-off.svg';
import toggleOnIcon from '../../assets/toggle-on.svg';
import { AppShell } from '../../components/AppShell';
import { DiscardButton, SaveBar } from '../../components/SaveBar';
import { useDirty } from '../../components/useDirty';
import { BackLink } from '../../components/BackLink';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { FieldHint } from '../../components/FieldHint';
import { UsedBy } from '../../components/UsedBy';
import { Loader } from '../../components/Loader';
import { SecretField, useSecretField } from '../../components/SecretField';
import type { SecretSource } from '../../components/SecretField';
import { WorkspaceSidebar } from '../../components/WorkspaceSidebar';
import { shellUser } from '../../session/user';
import { useWorkspaceVariables } from './workspaceVariables';
import styles from './ProviderSettingsPage.module.css';
import { t } from '../../i18n';
import { Select } from '../../components/Select';

export interface ProviderSettingsPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

// The type says what the endpoint speaks, not who is answering at it, which is
// why there is no entry here for a provider we have not heard of. Anything that
// speaks the OpenAI shape at an address of its own - a local server, a gateway,
// Google's OpenAI-compatible surface - is OpenAI with its own endpoint typed
// below, and that is exactly what the "Custom" this replaces was sending.
const PROVIDER_TYPES: ProviderType[] = [
  'OPENAI',
  'ANTHROPIC',
  'AZURE_OPENAI',
  'OLLAMA',
  // OpenAI-shaped, and also asked how far it has read a prompt - minutes of nothing otherwise. Issue #627.
  'LLAMA_CPP',
  // OpenAI-shaped pictures, with a picture edit's mask read white-for-the-change.
  'STABLE_DIFFUSION_CPP',
  // AUTOMATIC1111, Forge or SD.Next: held for upscaling, which no standard interface offers.
  'STABLE_DIFFUSION_WEBUI',
  // Not a language model: any server speaking the Jev format, which answers
  // typed questions with probabilities for a workflow's decision node. Issue #577.
  'SYSTEM_ONE',
];

/** The versions Azure OpenAI is commonly pinned to; the field still accepts any. */
// Offered, not imposed. Azure ships a new API version every few months and a
// model released after this list was written is only reachable on one that is
// not in it - so these are suggestions on a field that takes anything, and the
// provider column has always been free text. A closed list here was the whole
// reason a new deployment answered 404 with no way to say otherwise.
const API_VERSIONS = ['2024-06-01', '2024-08-01-preview', '2024-10-21', '2025-01-01-preview'];

const DEFAULT_SCOPE = 'https://cognitiveservices.azure.com/.default';

/** An empty box is no default throttle; a number is a rate, requests possibly fractional. */
function toNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/** What each type's endpoint usually looks like, as a hint and nothing more. */
function endpointHint(type: ProviderType): string {
  switch (type) {
    case 'OPENAI':
      return 'https://api.openai.com/v1';
    case 'ANTHROPIC':
      return 'https://api.anthropic.com/v1';
    case 'AZURE_OPENAI':
      return 'https://myinstance.openai.azure.com';
    case 'OLLAMA':
      // The OpenAI-compatible half of Ollama, which is the half this talks to:
      // `/v1/models` and `/v1/chat/completions`. The bare port serves Ollama's
      // own API at `/api/...` and 404s on both of those.
      return 'http://localhost:11434/v1';
    case 'LLAMA_CPP':
      return 'http://localhost:8080';
    case 'STABLE_DIFFUSION_CPP':
      return 'http://localhost:1234/v1';
    // The host alone: /sdapi/v1 after it is the server's own.
    case 'STABLE_DIFFUSION_WEBUI':
      return 'http://localhost:7860';
    // Any server speaking the Jev format, hosted or local, so no address is
    // assumed; `/v1/systemone` after it is added by the server.
    case 'SYSTEM_ONE':
      return '';
  }
}

/**
 * Adds a provider, and edits one afterwards — the same form either way, because
 * what it asks for does not change once the provider exists.
 */
function ProviderSettingsView({ session, onSignOut, onDiscard }: ProviderSettingsPageProps & { onDiscard: () => void }) {
  const { workspaceId = '', providerId } = useParams();
  const navigate = useNavigate();
  const adding = providerId === undefined;
  /** Ties the save strip's button to the form. See `SaveBar`. */
  const formId = useId();
  const { variables, refresh: refreshVariables } = useWorkspaceVariables(workspaceId);

  const [provider, setProvider] = useState<ModelProvider | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<ProviderType>('OPENAI');
  const [endpoint, setEndpoint] = useState('');
  const [authMethod, setAuthMethod] = useState<ProviderAuthMethod>('API_KEY');
  const [apiVersion, setApiVersion] = useState(API_VERSIONS[0]);
  const [deploymentName, setDeploymentName] = useState('');
  const [region, setRegion] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [clientId, setClientId] = useState('');
  const [scope, setScope] = useState(DEFAULT_SCOPE);
  /*
   * On for a new provider, which is what somebody adding one wants: it is
   * checked as soon as it is saved and the screen says whether it answered.
   * Turning it off is the deliberate act, so it is never the starting state.
   */
  const [checkEnabled, setCheckEnabled] = useState(true);
  /*
   * Off for a new provider, as the server would put it: echoing a model's old
   * thinking is what some providers need and others drop, so it is asked for.
   */
  const [sendsReasoning, setSendsReasoning] = useState(false);
  /*
   * Whether an agent on this provider is handed every tool up front. Null is
   * the type's default - on for Ollama and OpenAI - and stays null until somebody presses
   * the switch, so a provider moved to another type follows that type.
   */
  const [offerAllTools, setOfferAllTools] = useState<boolean | null>(null);
  /** The most tools one request carries, as typed; empty is what the type takes. */
  const [maxTools, setMaxTools] = useState('');
  /*
   * The throttle defaults this provider hands its models. Empty is no default:
   * a model may still set its own rate. Retry-After defaults to obeyed. #426.
   */
  const [throttleTokens, setThrottleTokens] = useState('');
  const [throttleRequests, setThrottleRequests] = useState('');
  const [acceptRetryAfter, setAcceptRetryAfter] = useState(true);
  /** Azure OpenAI only; a new provider starts on Responses, as the server would put it. */
  const [chatApi, setChatApi] = useState<ChatApi>('RESPONSES');
  /** Empty is the type's own way of reading an edit mask. */
  const [editMask, setEditMask] = useState<EditMask | ''>('');
  /**
   * The one secret this provider has, whatever it is called this minute.
   *
   * A provider keeps a single secret column, serving the API key or the Entra
   * client secret and never both at once — so there is one of these here. It is
   * a handle rather than four pieces of state on this page because a card with
   * two secrets is two calls to `useSecretField` and nothing else: a Slack
   * connection's bot token and app token would each get their own, each
   * answering for itself.
   */
  const key = useSecretField({ stored: !adding });

  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  /** The Danger Zone's Remove, asked about first; null while nobody has pressed it. */
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  /** The models reached through the provider, named in that question; null until read. */
  const [goingModels, setGoingModels] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  /*
   * How many times the boxes were filled from a stored provider - a load, a
   * save, a Discard. What "changed" is measured from moves with this and not
   * with `provider`, because the check a save sets off lands seconds later and
   * replaces `provider` to show its status while the boxes keep what is being
   * typed: measured from that, an edit made in those seconds read as already
   * saved, and Save went grey under it.
   */
  const [loaded, setLoaded] = useState(0);
  const [testing, setTesting] = useState(false);
  /** What Test found on the form as it stands; cleared by a save, which the stored status then speaks for. */
  const [checked, setChecked] = useState<{ connected: boolean; message: string } | null>(null);

  useEffect(() => {
    if (providerId === undefined) return;
    /*
     * An answer that is no longer wanted is dropped rather than applied.
     *
     * This fills the form from what came back, so a reply landing late writes
     * the stored version over whatever is in the boxes - somebody's typing, or
     * the record they opened after this one. Nothing on screen says it
     * happened: it is the state behind the fields that is replaced, and the
     * state is what the save sends. #324, #862 and #863 were three reports of
     * it on three pages.
     */
    let abandoned = false;
    fetchProvider(providerId)
      .then((found) => {
        if (abandoned) return;
        if (found === null) {
          setLoadError(t('That provider does not exist, or you do not have access to it.'));
          return;
        }
        apply(found);
      })
      .catch((cause: unknown) => {
        if (abandoned) return;
        setLoadError(cause instanceof Error ? cause.message : t('Could not load the provider.'));
      });
    return () => {
      abandoned = true;
    };
  }, [providerId]);

  /**
   * Saving a provider makes the server check it, on its own thread so the form
   * does not wait. The answer therefore lands just after the save returns, and
   * this is what picks it up — otherwise the page would say "Not checked" until
   * something else made it reload, which is the thing the automatic check was
   * meant to stop.
   *
   * It gives up rather than polling forever: if no check has landed in ten
   * seconds, the status on the screen is the true one.
   */
  useEffect(() => {
    if (providerId === undefined) return;
    if (provider === null || provider.status !== 'NOT_CHECKED') return;
    // Nothing is coming: the save publishes the same event, and the monitor
    // skips a provider whose checking is off. Polling for it would be five
    // requests for an answer nobody is going to send.
    if (!provider.checkEnabled) return;

    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (tries > 5) {
        clearInterval(timer);
        return;
      }
      fetchProvider(providerId)
        .then((found) => {
          if (found !== null && found.status !== 'NOT_CHECKED') {
            clearInterval(timer);
            setProvider(found);
          }
        })
        .catch(() => clearInterval(timer));
    }, 2000);

    return () => clearInterval(timer);
  }, [providerId, provider]);

  /**
   * Back to the provider as it was loaded or last saved, without asking the
   * server again; a provider being added holds nothing to go back to, so the
   * page starts over.
   */
  function discard() {
    if (provider === null) {
      onDiscard();
      return;
    }
    apply(provider);
  }

  function apply(found: ModelProvider) {
    setProvider(found);
    setLoaded((held) => held + 1);
    setName(found.name);
    setType(found.type);
    setEndpoint(found.endpoint);
    setAuthMethod(found.authMethod);
    setApiVersion(found.apiVersion ?? API_VERSIONS[0]);
    setDeploymentName(found.deploymentName ?? '');
    setRegion(found.region ?? '');
    setTenantId(found.tenantId ?? '');
    setClientId(found.clientId ?? '');
    setScope(found.scope ?? DEFAULT_SCOPE);
    setCheckEnabled(found.checkEnabled);
    setSendsReasoning(found.sendsReasoning);
    setOfferAllTools(found.offerAllTools);
    setMaxTools(found.maxTools === null ? '' : String(found.maxTools));
    setThrottleTokens(found.throttleTokensPerSecond === null ? '' : String(found.throttleTokensPerSecond));
    setThrottleRequests(found.throttleRequestsPerSecond === null ? '' : String(found.throttleRequestsPerSecond));
    setAcceptRetryAfter(found.acceptRetryAfter);
    setChatApi(found.chatApi ?? 'RESPONSES');
    setEditMask(found.editMask ?? '');
    key.reset({ stored: found.secretSet, variable: found.secretVariableId });
  }

  /** Which of the two the key field is, and what it costs this form. */
  function chooseSource(next: SecretSource) {
    key.choose(next);
    // Reaching for the list is a reason to read it again: somebody about to
    // point a provider at a secret has often just been to Variables to make it.
    if (next === 'VARIABLE') refreshVariables();
    setSaveError(null);
    setSaved(false);
  }

  const azure = type === 'AZURE_OPENAI';
  const entra = azure && authMethod === 'ENTRA_ID';
  /*
   * What the one secret field is called, which the authentication method
   * decides. The choice of where it comes from is that field's whatever it is
   * called this minute, so the label goes to the field and the field names the
   * control - rather than a card-level word standing in for both.
   */
  const secretLabel = entra ? t('Client Secret') : t('API Key');

  /**
   * The secrets this workspace keeps, and only those.
   *
   * A VALUE is read with the variable listing, and a value on a listing is a
   * value on a screen - so a provider may not be pointed at one, and the server
   * refuses it. Filtered here rather than left to that refusal: an option
   * offered and then rejected teaches the rule at the cost of a save, and the
   * rule is knowable before the choice is made.
   */
  const secrets = useMemo(
    () =>
      variables
        .filter((variable) => variable.kind === 'SECRET')
        .map((variable) => ({
          value: variable.id,
          label: variable.name,
          hint: variable.catalogName,
        })),
    [variables],
  );

  /*
   * The one it already reads, kept in the list even before the list arrives.
   *
   * The provider carries the variable's name and catalog with it precisely so a
   * screen need not ask twice; without this row the picker would sit on its
   * placeholder for as long as the variable list is in flight, which reads as a
   * provider that has chosen nothing.
   */
  const offered = useMemo(() => {
    const held = provider?.secretVariableId ?? null;
    const called = provider?.secretVariableName ?? null;
    if (held === null || called === null) return secrets;
    if (secrets.some((option) => option.value === held)) return secrets;
    return [{ value: held, label: called, hint: provider?.secretVariableCatalog ?? '' }, ...secrets];
  }, [provider, secrets]);

  /** What the form will not send, said before it is sent rather than after. */
  function refused(): string | null {
    if (key.unchosen) return `Choose the workspace secret this provider reads its ${secretLabel} from.`;
    return null;
  }

  function values() {
    const sending = key.sending;
    return {
      name: name.trim(),
      type,
      endpoint: endpoint.trim(),
      // Only Azure OpenAI offers Entra ID, so anything else is a key.
      authMethod: azure ? authMethod : ('API_KEY' as ProviderAuthMethod),
      /*
       * The key field's answer, in the names this mutation gives it.
       *
       * One of the two, never both and never neither by accident. A variable
       * sent drops any copy the provider held and a key sent drops any
       * reference, so the exclusivity is the server's rule as much as this
       * form's - and sending the pair is a BAD_REQUEST rather than something
       * resolved by precedence. Which of the three it is - the variable, a new
       * key, or nothing at all - is the field's own to work out, because that
       * is the rule a second secret field on a card would otherwise write out a
       * second time and slightly differently. Nothing sent is what says "leave
       * the stored one alone", and it is the easiest thing here to break.
       */
      ...(sending === null
        ? {}
        : 'variable' in sending
          ? { secretVariableId: sending.variable }
          : { secret: sending.value }),
      apiVersion: azure ? apiVersion : null,
      deploymentName: azure ? deploymentName.trim() || null : null,
      region: azure ? region.trim() || null : null,
      tenantId: entra ? tenantId.trim() || null : null,
      clientId: entra ? clientId.trim() || null : null,
      scope: entra ? scope.trim() || null : null,
      checkEnabled,
      sendsReasoning,
      offerAllTools,
      maxTools: toNumber(maxTools),
      throttleTokensPerSecond: toNumber(throttleTokens),
      throttleRequestsPerSecond: toNumber(throttleRequests),
      acceptRetryAfter,
      editMask: editMask === '' ? null : editMask,
      // Only Azure OpenAI chooses; the server refuses a choice on any other type.
      ...(azure ? { chatApi } : {}),
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim() === '' || endpoint.trim() === '' || saving) return;

    const wrong = refused();
    if (wrong !== null) {
      setSaveError(wrong);
      setSaved(false);
      return;
    }

    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      if (adding) {
        await createProvider(workspaceId, values());
        // Back to the list it was started from: the provider is made, and the
        // form has nothing left to say.
        navigate(`/workspace/${workspaceId}/models`);
        return;
      }
      apply(await updateProvider(providerId, values()));
      setChecked(null);
      setSaved(true);
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : t('Could not save the provider.'));
    } finally {
      setSaving(false);
    }
  }

  /** Checks what the form holds, without saving it: Test is not Save. */
  async function handleTest() {
    if (testing) return;

    const wrong = refused();
    if (wrong !== null) {
      setSaveError(wrong);
      return;
    }

    setTesting(true);
    setSaveError(null);
    setSaved(false);
    try {
      setChecked(await checkProviderDraft(workspaceId, values(), adding ? null : providerId));
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : t('Could not check the provider.'));
    } finally {
      setTesting(false);
    }
  }

  async function handleReveal() {
    if (providerId === undefined) return;
    try {
      key.show((await revealProviderSecret(providerId)) ?? '');
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : t('Could not reveal the credentials.'));
    }
  }

  function handleDiscard() {
    // Abandoning a create leaves nothing behind: Test saves nothing, so there is nothing to ask about.
    if (adding || providerId === undefined) {
      navigate(`/workspace/${workspaceId}/models`);
      return;
    }
    /*
     * Asked first: removing a provider takes every model reached through it,
     * and the question names them - read now rather than held, so it is the
     * list as it stands when the press is made.
     */
    setGoingModels(null);
    setConfirmingRemove(true);
    fetchModels(workspaceId)
      .then((models) => setGoingModels(models.filter((model) => model.providerId === providerId).map((model) => model.name)))
      .catch(() => setGoingModels(null));
  }

  async function confirmRemove() {
    if (providerId === undefined) return;
    await removeProvider(providerId);
    setConfirmingRemove(false);
    navigate(`/workspace/${workspaceId}/models`);
  }


  /*
   * Whether there is anything to save: what the fields would send, against
   * what the page last agreed with the server. Save and Discard are off while
   * there is not.
   */
  /*
   * Measured from what was loaded - and on a create, from the empty form for as
   * long as the create lasts: the row Test has to save is not the create
   * finished, so Create stays on.
   */
  const changed = useDirty(values(), [adding ? null : loaded]);

  return (
    <AppShell
      scrollContent
      title={adding ? t('New provider') : provider?.name}
      user={shellUser(session)}
      workspacePath={`/workspace/${workspaceId}`}
      showAdmin={session.admin}
      onSignOut={onSignOut}
      sidebar={<WorkspaceSidebar workspaceId={workspaceId} />}
    >
      <header className={styles.headerBlock}>
        <p className={styles.breadcrumbs}>
          <BackLink to={`/workspace/${workspaceId}/models`} label={t('Models')} />
          <Link className={styles.crumbLink} to={`/workspace/${workspaceId}/models`}>
            {t('Models')}
          </Link>
          <span className={styles.crumbSeparator}>/</span>
          <span className={styles.crumbCurrent}>{adding ? t('Add Provider') : (provider?.name ?? '…')}</span>
        </p>
        <div className={styles.titleRow}>
          <h1 className={styles.pageTitle}>{adding ? t('Add Provider') : (provider?.name ?? 'Provider')}</h1>
        </div>
        <p className={styles.subtitle}>{t('Configure a new LLM provider for your workspace')}</p>
      </header>

      {loadError !== null ? (
        <section className={styles.card}>
          <p className={styles.loadError} role="alert">
            {loadError}
          </p>
        </section>
      ) : !adding && provider === null ? (
        <section className={styles.card}>
          <Loader />
        </section>
      ) : (
        <form id={formId} className={styles.form} onSubmit={handleSubmit}>
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>{t('Provider')}</h2>
            <div className={styles.divider} />
            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="provider-type">
                  Provider Type <span className={styles.required}>*</span>
                </label>
                <div className={styles.selectWrapper}>
                  <Select
                    id="provider-type"
                    className={`${styles.input} ${styles.select}`}
                    value={type}
                    onChange={(picked) => setType(picked as ProviderType)}
                    chevron={false}
                  >
                    {PROVIDER_TYPES.map((option) => (
                      <option key={option} value={option}>
                        {providerTypeLabel(option)}
                      </option>
                    ))}
                  </Select>
                  <img className={styles.chevron} src={chevronDown12Icon} alt="" width={12} height={12} />
                </div>
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="provider-name">
                  Display Name <span className={styles.required}>*</span>
                </label>
                <input
                  id="provider-name"
                  className={styles.input}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t("Azure OpenAI Production")}
                  required
                />
              </div>
            </div>
          </section>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>{azure ? t('Azure Configuration') : 'Endpoint'}</h2>
            <div className={styles.divider} />
            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="provider-endpoint">
                  {azure ? t('Azure Endpoint') : t('API Endpoint')} <span className={styles.required}>*</span>
                </label>
                <input
                  id="provider-endpoint"
                  className={`${styles.input} ${styles.inputMono}`}
                  value={endpoint}
                  onChange={(event) => setEndpoint(event.target.value)}
                  placeholder={endpointHint(type)}
                  required
                />
              </div>
              {azure && (
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="api-version">
                    API Version <span className={styles.required}>*</span>
                  </label>
                  <input
                    id="api-version"
                    className={`${styles.input} ${styles.inputMono}`}
                    list="api-versions"
                    value={apiVersion}
                    onChange={(event) => setApiVersion(event.target.value)}
                    placeholder={API_VERSIONS[API_VERSIONS.length - 1]}
                    required
                  />
                  <datalist id="api-versions">
                    {API_VERSIONS.map((version) => (
                      <option key={version} value={version} />
                    ))}
                  </datalist>
                </div>
              )}
            </div>

            {azure && (
              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="deployment-name">
                    {/* Never required, so no asterisk: a blank one is the model's id, and the v1 surface names models directly. */}
                    {t('Deployment Name')}
                  </label>
                  <input
                    id="deployment-name"
                    className={`${styles.input} ${styles.inputMono}`}
                    value={deploymentName}
                    onChange={(event) => setDeploymentName(event.target.value)}
                    placeholder="gpt-4o-deployment"
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="region">
                    {t('Region')}
                  </label>
                  <input
                    id="region"
                    className={styles.input}
                    value={region}
                    onChange={(event) => setRegion(event.target.value)}
                    placeholder={t("East US")}
                  />
                </div>
              </div>
            )}

            {azure && (
              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <span className={styles.labelWithHint}>
                    <label className={styles.label} htmlFor="chat-api">{t('API')}</label>
                    <FieldHint label={t('API')}>
                      {t('Responses takes a reasoning model with its tools; chat completions is the old road, kept to go back to.')}
                    </FieldHint>
                  </span>
                  <div className={styles.selectWrapper}>
                    <Select
                      id="chat-api"
                      className={`${styles.input} ${styles.select}`}
                      value={chatApi}
                      onChange={(picked) => setChatApi(picked as ChatApi)}
                      chevron={false}
                    >
                      <option value="RESPONSES">{t('Responses')}</option>
                      <option value="CHAT_COMPLETIONS" data-hint={t('The older API, kept for servers that predate Responses.')}>
                        {t('Chat completions')}
                      </option>
                    </Select>
                    <img className={styles.chevron} src={chevronDown12Icon} alt="" width={12} height={12} />
                  </div>
                </div>
              </div>
            )}

            {/*
              How the server reads a picture edit's mask: a property of the server, so it sits by its address.
              Every type that can draw edits through the same standard interface, so every one of them asks;
              it was offered on two, and could not be set on a WebUI, llama.cpp, Ollama or Azure provider.
            */}
            {type !== 'ANTHROPIC' && type !== 'SYSTEM_ONE' && (
              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <span className={styles.labelWithHint}>
                    <label className={styles.label} htmlFor="edit-mask">{t('Edit mask')}</label>
                    <FieldHint label={t('Edit mask')}>
                      {t('How this server reads the area of a picture to change. The standard marks it transparent; stable-diffusion.cpp reads white on black.')}
                    </FieldHint>
                  </span>
                  <div className={styles.selectWrapper}>
                    <Select
                      id="edit-mask"
                      className={`${styles.input} ${styles.select}`}
                      value={editMask}
                      onChange={(picked) => setEditMask(picked as EditMask | '')}
                      data-testid="edit-mask"
                      chevron={false}
                    >
                      <option
                        value=""
                        data-hint={type === 'STABLE_DIFFUSION_CPP' ? t('White marks the change') : t('Transparent marks the change')}
                      >
                        {t("The type's default")}
                      </option>
                      <option value="TRANSPARENT">{t('Transparent marks the change')}</option>
                      <option value="WHITE">{t('White marks the change')}</option>
                    </Select>
                    <img className={styles.chevron} src={chevronDown12Icon} alt="" width={12} height={12} />
                  </div>
                </div>
              </div>
            )}

            {/*
              In the card that holds the address, because it is about the
              address: what it governs is who this application calls on a timer,
              and the endpoint above is what would be called.
            */}
            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <span className={styles.labelWithHint}>
                  <span className={styles.label} id="provider-check-label">{t('Automatic checks')}</span>
                  <FieldHint label={t('Automatic checks')}>
                    {t('Off for an endpoint that is only sometimes running; Test Connection still works, and so do the chats and tasks that use it.')}
                  </FieldHint>
                </span>
                <span className={styles.statusRow}>
                  <button
                    type="button"
                    className={styles.toggle}
                    onClick={() => {
                      setCheckEnabled(!checkEnabled);
                      setSaved(false);
                    }}
                    role="switch"
                    aria-checked={checkEnabled}
                    aria-labelledby="provider-check-label"
                    data-testid="provider-check-toggle"
                  >
                    <img
                      src={checkEnabled ? toggleOnIcon : toggleOffIcon}
                      alt=""
                      width={36}
                      height={20}
                      data-keeps-colour
                    />
                  </button>
                  <span className={checkEnabled ? styles.checkOn : styles.checkOff}>
                    {checkEnabled ? t('Checked every few minutes') : t('Checked only when asked')}
                  </span>
                </span>
              </div>
            </div>

            {/*
              Whether a model's earlier thinking goes back to it. A provider's
              setting and not a model's, because it is the provider's chat
              template that keeps or drops it.
            */}
            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <span className={styles.labelWithHint}>
                  <span className={styles.label} id="provider-reasoning-label">{t('Send thinking back')}</span>
                  <FieldHint label={t('Send thinking back')}>
                    {t('Whether the model is shown its own earlier thinking. Off suits models whose chat template drops old thinking, like Gemma on llama.cpp; turn it on for providers that need it, such as reasoning models that lose their plan without it.')}
                  </FieldHint>
                </span>
                <span className={styles.statusRow}>
                  <button
                    type="button"
                    className={styles.toggle}
                    onClick={() => {
                      setSendsReasoning(!sendsReasoning);
                      setSaved(false);
                    }}
                    role="switch"
                    aria-checked={sendsReasoning}
                    aria-labelledby="provider-reasoning-label"
                    data-testid="provider-reasoning-toggle"
                  >
                    <img
                      src={sendsReasoning ? toggleOnIcon : toggleOffIcon}
                      alt=""
                      width={36}
                      height={20}
                      data-keeps-colour
                    />
                  </button>
                  <span className={sendsReasoning ? styles.checkOn : styles.checkOff}>
                    {sendsReasoning ? t('Earlier thinking is sent back') : t('Earlier thinking is left out')}
                  </span>
                </span>
              </div>
            </div>

            {/*
              Whether an agent is handed every tool from its first round. A
              provider's setting, because what it protects is the provider's
              prompt cache: a tool loaded mid-turn changes the top of the prompt
              and a local server reads the whole session again.
            */}
            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <span className={styles.labelWithHint}>
                  <span className={styles.label} id="provider-all-tools-label">{t('All tools up front')}</span>
                  <FieldHint label={t('All tools up front')}>
                    {t('Hands an agent every tool it holds from its first round, with nothing to find or load, so the tool list never changes during a turn and a local server can reuse the prompt it has already read. On by default for Ollama and for OpenAI, which also covers OpenAI-compatible servers such as llama.cpp. Tools past the provider’s limit per request are still found as needed.')}
                  </FieldHint>
                </span>
                <span className={styles.statusRow}>
                  <button
                    type="button"
                    className={styles.toggle}
                    onClick={() => {
                      setOfferAllTools(!(offerAllTools ?? offersAllByDefault(type)));
                      setSaved(false);
                    }}
                    role="switch"
                    aria-checked={offerAllTools ?? offersAllByDefault(type)}
                    aria-labelledby="provider-all-tools-label"
                    data-testid="provider-all-tools-toggle"
                  >
                    <img
                      src={(offerAllTools ?? offersAllByDefault(type)) ? toggleOnIcon : toggleOffIcon}
                      alt=""
                      width={36}
                      height={20}
                      data-keeps-colour
                    />
                  </button>
                  <span className={(offerAllTools ?? offersAllByDefault(type)) ? styles.checkOn : styles.checkOff}>
                    {(offerAllTools ?? offersAllByDefault(type)) ? t('Every tool goes out up front') : t('Tools past the agent’s limit are found as needed')}
                    {offerAllTools === null && ` ${t('(default for this type)')}`}
                  </span>
                  {offerAllTools !== null && (
                    <button
                      type="button"
                      className={styles.linkButton}
                      onClick={() => {
                        setOfferAllTools(null);
                        setSaved(false);
                      }}
                      data-testid="provider-all-tools-default"
                    >
                      {t('Use the default')}
                    </button>
                  )}
                </span>
              </div>
              <div className={styles.field}>
                <span className={styles.labelWithHint}>
                  <label className={styles.label} htmlFor="provider-max-tools">{t('Most tools per request')}</label>
                  <FieldHint label={t('Most tools per request')}>
                    {t('How many tools one request to this provider may carry. Left empty it is what the type takes - 200 for llama.cpp, Ollama and OpenAI-compatible servers, 128 for Azure and OpenAI’s own API, 256 for Anthropic. Set it lower for a server that refuses fewer, or to keep a small model’s list short. Between 8 and 1024.')}
                  </FieldHint>
                </span>
                <input
                  id="provider-max-tools"
                  name="maxTools"
                  className={styles.input}
                  type="number"
                  min={8}
                  max={1024}
                  value={maxTools}
                  placeholder={String(TYPE_TOOL_CAPS[type])}
                  onChange={(event) => {
                    setMaxTools(event.target.value);
                    setSaved(false);
                  }}
                />
              </div>
            </div>
          </section>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>{t('Authentication')}</h2>
            <div className={styles.divider} />

            {/* Only Azure OpenAI has a second way in, so only it offers a choice. */}
            {azure && (
              <div className={styles.field}>
                <span className={styles.labelWithHint}>
                  <span className={styles.label}>{t('Authentication Method')}</span>
                  {/*
                    What the method chosen actually does, said about whichever
                    is chosen - the field is a pair of tabs, so the answer to
                    "what is this" changes with the tab and the (?) follows it.
                  */}
                  <FieldHint label={t('Authentication Method')}>
                    {entra
                      ? t('Signs in as an Entra ID service principal: the app registration and its secret are exchanged for a token on each call. No key is stored against the resource.')
                      : t('Sends one of the keys from the Azure OpenAI resource on every request.')}
                  </FieldHint>
                </span>
                <div className={styles.segmented} role="tablist" aria-label={t('Authentication method')}>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={authMethod === 'API_KEY'}
                    className={authMethod === 'API_KEY' ? styles.segmentActive : styles.segment}
                    onClick={() => setAuthMethod('API_KEY')}
                  >{t('API Key')}</button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={authMethod === 'ENTRA_ID'}
                    className={authMethod === 'ENTRA_ID' ? styles.segmentActive : styles.segment}
                    onClick={() => setAuthMethod('ENTRA_ID')}
                  >Service Principal</button>
                </div>
              </div>
            )}

            {entra && (
              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="tenant-id">
                    {t('Directory (tenant) ID')}
                  </label>
                  <input
                    id="tenant-id"
                    className={`${styles.input} ${styles.inputMono}`}
                    value={tenantId}
                    onChange={(event) => setTenantId(event.target.value)}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="client-id">
                    {t('Application (client) ID')}
                  </label>
                  <input
                    id="client-id"
                    className={`${styles.input} ${styles.inputMono}`}
                    value={clientId}
                    onChange={(event) => setClientId(event.target.value)}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  />
                </div>
              </div>
            )}

            {/*
              The key, and where it comes from - one field, asked for one way at
              a time.

              The choice used to be a pair of tabs above this card, and it read
              as a mode of the card because that is where it was. That is
              harmless here by accident: a provider keeps one secret, serving
              whichever of the two names this field has. It would be useless on
              a card with two, so the control has moved onto the field it
              governs and is named after it. See components/SecretField.tsx.
            */}
            <SecretField
              id="provider-secret"
              label={secretLabel}
              required={type !== 'SYSTEM_ONE'}
              field={key}
              options={offered}
              variablesPath={`/workspace/${workspaceId}/variables`}
              placeholder={entra ? t('Client secret') : 'sk-…'}
              hint={
                entra
                  ? t('Register an app in Azure AD → App registrations → Certificates & secrets.')
                  : azure
                    ? t('Found in Azure Portal → Resource → Keys and Endpoint.')
                    : type === 'SYSTEM_ONE'
                      ? t('Optional: only if the server asks for one.')
                      : type === 'LLAMA_CPP'
                        ? t('Any value works unless the server was started with --api-key.')
                        : t('The key the provider issued for this workspace.')
              }
              onSource={chooseSource}
              onValue={() => {
                setSaveError(null);
                setSaved(false);
              }}
              onVariable={() => {
                setSaveError(null);
                setSaved(false);
              }}
              /* There is nothing stored to reveal until the provider exists. */
              onReveal={adding ? undefined : () => void handleReveal()}
              /*
                A reference pointing at nothing, said in words about the
                variable and inside the field that holds it.

                It is an error and stays in the open - see UI-DESIGN-RULES.md.
                The sentence names the secret as the thing that is wrong and
                says the endpoint is not, because the failure this replaces is a
                provider reporting "check the endpoint" for a reason that has
                nothing to do with the endpoint, which is what issue #211 was.
              */
              broken={
                provider?.secretVariableMissing === true
                  ? `The workspace secret this ${secretLabel} was read from is gone, so this provider has nothing to call with. Its endpoint is fine. Point this field at another secret, or give it a key of its own.`
                  : null
              }
            />

            {entra && (
              <div className={styles.field}>
                <label className={styles.label} htmlFor="scope">{t('Scope')}</label>
                <input
                  id="scope"
                  className={`${styles.input} ${styles.inputMono}`}
                  value={scope}
                  onChange={(event) => setScope(event.target.value)}
                  placeholder={DEFAULT_SCOPE}
                />
              </div>
            )}
          </section>

          {/*
            The rate this provider's models default to, and whether they wait
            out a 429's Retry-After. Per model in the end, because limits differ
            by model — a model overrides these — but the defaults live here where
            one number can cover a provider's whole shelf. Issue #426.
          */}
          <section className={styles.card}>
            <span className={styles.labelWithHint}>
              <h2 className={styles.cardTitle}>{t('Throttle')}</h2>
              {/* About the card, not a field: what holding under a rate is for. */}
              <FieldHint label={t('Throttle')}>
                {t('Hold under the provider\'s limit instead of being turned away with a 429.')}
              </FieldHint>
            </span>
            <div className={styles.divider} />
            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="throttle-tokens">{t('Tokens per second')}</label>
                <input
                  id="throttle-tokens"
                  className={`${styles.input} ${styles.inputMono}`}
                  value={throttleTokens}
                  onChange={(event) => {
                    setThrottleTokens(event.target.value);
                    setSaved(false);
                  }}
                  placeholder={t('No default')}
                  inputMode="decimal"
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="throttle-requests">{t('Requests per second')}</label>
                <input
                  id="throttle-requests"
                  className={`${styles.input} ${styles.inputMono}`}
                  value={throttleRequests}
                  onChange={(event) => {
                    setThrottleRequests(event.target.value);
                    setSaved(false);
                  }}
                  placeholder={t('No default')}
                  inputMode="decimal"
                />
              </div>
            </div>
            <label className={styles.checkboxField}>
              <input
                type="checkbox"
                checked={acceptRetryAfter}
                onChange={(event) => {
                  setAcceptRetryAfter(event.target.checked);
                  setSaved(false);
                }}
              />
              <span>{t('Obey Retry-After')}</span>
            </label>
          </section>

          <div className={styles.footer}>
            <div className={styles.status}>
              {saveError !== null ? (
                <span className={styles.statusFailed} role="alert">
                  {saveError}
                </span>
              ) : checked !== null ? (
                <>
                  <span className={`${styles.dot} ${checked.connected ? styles.dotConnected : styles.dotFailed}`} aria-hidden="true" />
                  <span className={checked.connected ? styles.statusConnected : styles.statusFailed} data-testid="provider-check">
                    {checked.message}
                  </span>
                </>
              ) : provider !== null ? (
                <>
                  <span
                    className={`${styles.dot} ${
                      provider.status === 'CONNECTED'
                        ? styles.dotConnected
                        : provider.status === 'FAILED'
                          ? styles.dotFailed
                          : styles.dotIdle
                    }`}
                    aria-hidden="true"
                  />
                  <span
                    className={
                      provider.status === 'CONNECTED'
                        ? styles.statusConnected
                        : provider.status === 'FAILED'
                          ? styles.statusFailed
                          : styles.statusIdle
                    }
                  >
                    {/* What the check found, in its own words. A hardcoded
                        "Connection successful" over the top of it is how an
                        answer of 415 gets reported as a working provider. */}
                    {provider.lastCheckMessage ??
                      (provider.status === 'CONNECTED'
                        ? t('Connection successful')
                        : providerStatusLabel(provider.status))}
                  </span>
                </>
              ) : saved ? (
                <span className={styles.statusConnected}>{t('Saved.')}</span>
              ) : (
                // Before any check the line still stands, so Test has its place on it.
                <>
                  <span className={`${styles.dot} ${styles.dotIdle}`} aria-hidden="true" />
                  <span className={styles.statusIdle}>{t('Not checked')}</span>
                </>
              )}
            </div>
            {/* Test on the line that says what it found; Save is in the strip at the foot of the window. */}
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => void handleTest()}
              disabled={testing || name.trim() === '' || endpoint.trim() === ''}
              data-status-action=""
            >
              {testing ? 'Checking…' : t('Test Connection')}
            </button>
          </div>
        </form>
      )}

      {/* The models reached through it, which go with it - above the way to remove it. */}
      {!adding && providerId !== undefined && (
        <section className={styles.card}>
          <UsedBy kind="MODEL_PROVIDER" componentId={providerId} />
        </section>
      )}

      <section className={styles.dangerCard}>
        <h2 className={styles.dangerHeading}>{t('Danger Zone')}</h2>
        <div className={styles.divider} />
        <div className={styles.dangerRow}>
          <div className={styles.dangerText}>
            <span className={styles.dangerTitle}>{adding ? t('Discard Changes') : t('Remove Provider')}</span>
            <span className={styles.dangerNote}>
              {adding
                ? t('Cancel provider setup and return to Models')
                : t('Remove this provider, and every model reached through it')}
            </span>
          </div>
          <button type="button" className={styles.dangerButton} onClick={handleDiscard}>
            {adding ? 'Discard' : t('Remove Provider')}
          </button>
        </div>
      </section>
      {/* Save floats at the foot of the window, in view wherever the reader has scrolled to - and above the AI button. */}
      {loadError === null && (adding || provider !== null) && (
        <SaveBar>
          <DiscardButton onDiscard={discard} disabled={saving || !changed} />
      <ConfirmDialog
        subject={confirmingRemove ? (provider?.name ?? name) : null}
        kind="removeProvider"
        detail={
          goingModels === null ? undefined : (
            <span>
              {goingModels.length === 0
                ? t('No model is reached through it.')
                : `${t('Goes with it:')} ${goingModels.join(', ')}`}
            </span>
          )
        }
        onClose={() => setConfirmingRemove(false)}
        onConfirm={confirmRemove}
      />
          <button type="submit" form={formId} className={styles.primaryButton} disabled={saving || !changed}>
            {saving ? t('Saving…') : adding ? 'Create' : t('Save Changes')}
          </button>
        </SaveBar>
      )}
    </AppShell>
  );
}

/** The page, started over by Discard where it has nothing held to go back to - a provider being added. */
export function ProviderSettingsPage(props: ProviderSettingsPageProps) {
  const [discards, setDiscards] = useState(0);
  return <ProviderSettingsView key={discards} {...props} onDiscard={() => setDiscards((held) => held + 1)} />;
}
