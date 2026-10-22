import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import {
  authTypeLabel, secretPlaceholder,
  connectionKindLabel,
  connectionTypeLabel,
  disconnectWorkspaceConnection,
  fetchPluginConnectionTypes,
  fetchSlackSocket,
  fetchWorkspaceConnection,
  pluginKindOptionLabel,
  reconnectSlackConnection,
  revealWorkspaceConnectionAppToken,
  revealWorkspaceConnectionUserToken,
  revealWorkspaceConnectionSecret,
  statusLabel,
  testWorkspaceConnection,
  updateWorkspaceConnection,
} from '../../api/integrations';
import type {
  AuthType,
  ConnectionStatus,
  ConnectionType,
  MailSecurity,
  PluginConnectionType,
  SlackSocketState,
  SlackSocketStatus,
  WorkspaceConnection,
} from '../../api/integrations';
import type { SessionUser } from '../../api/session';
import { fetchSlackBotUsers } from '../../api/triggers';
import type { SlackBotUser } from '../../api/triggers';
import chevronDown12Icon from '../../assets/chevron-down-12.svg';
import lockIcon from '../../assets/lock-keyhole.svg';
import { AppShell } from '../../components/AppShell';
import { DiscardButton, SaveBar } from '../../components/SaveBar';
import { useDirty } from '../../components/useDirty';
import { BackLink } from '../../components/BackLink';
import { FieldHint } from '../../components/FieldHint';
import { WorkspaceSidebar } from '../../components/WorkspaceSidebar';
import { Loader } from '../../components/Loader';
import { SecretField, useSecretField } from '../../components/SecretField';
import type { SecretFieldHandle, SecretSource } from '../../components/SecretField';
import { shellUser } from '../../session/user';
import { useWorkspaceVariables } from './workspaceVariables';
import styles from './IntegrationSettings.module.css';
import dialog from '../../components/Dialog.module.css';
import { t, tf } from '../../i18n';
import { zoned } from '../../session/timeZone';
import { ConnectionGuide } from '../../components/ConnectionGuide';

export interface ConnectionSettingsPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

const AUTH_TYPES: AuthType[] = ['NONE', 'API_KEY', 'BEARER_TOKEN', 'BASIC'];

/** How the session with a mail server is secured, and the port that goes with it. */
const SECURITY: { value: MailSecurity; label: string; port: number }[] = [
  { value: 'STARTTLS', label: 'STARTTLS', port: 587 },
  { value: 'TLS', label: t('TLS (implicit)'), port: 465 },
  { value: 'NONE', label: t('None'), port: 25 },
];

/**
 * A connection as one workspace holds it. What the admin defines stays locked;
 * the credentials and the endpoint override are the workspace's own.
 */
/**
 * The kinds a connection may be, in the order the form that creates one offers
 * them - so choosing here and choosing there are the same list in the same
 * order rather than two lists that drift.
 */
const CONNECTION_TYPES: ConnectionType[] = ['SLACK', 'SMTP', 'HTTP'];

/**
 * What this field is called, which is what the service filling it calls it.
 *
 * Not one name for the shared column: Slack calls its own the bot token, and a
 * mail server has a password. "API Token" is left for the kinds where that is
 * genuinely the word - whatever the endpoint at the other end expects.
 */
function secretLabel(kind: ConnectionType | null): string {
  switch (kind) {
    case 'SMTP':
      return 'Password';
    case 'SLACK':
      return t('Bot token');
    default:
      return t('API Token');
  }
}

/**
 * Which credential this field wants, named for the service it belongs to.
 *
 * Written per kind rather than as one sentence about tokens in general: the
 * whole difficulty is that Slack hands you three different strings and only one
 * of them belongs here.
 */
function secretHint(kind: ConnectionType | null) {
  switch (kind) {
    case 'SLACK':
      return (
        <>
          The <strong>bot</strong> token, beginning <code>xoxb-</code>. In your Slack app under{' '}
          <strong>{t('OAuth & Permissions')}</strong>, as the Bot User OAuth Token. Not the app-level
          <code> xapp-</code> token, which has its own field below, and not the signing secret.
        </>
      );
    case 'SMTP':
      return (
        <>
          The password for the mailbox above. Where the provider offers one, use an app password
          rather than the account&apos;s own - it can be withdrawn on its own.
        </>
      );
    default:
      return <>Whatever the endpoint expects, sent the way the authentication method above says.</>;
  }
}

function ConnectionSettingsView({ session, onSignOut, onDiscard }: ConnectionSettingsPageProps & { onDiscard: () => void }) {
  /** True while the export is being confirmed; the name once it has happened. */
  const { workspaceId = '', connectionId = '' } = useParams();
  const navigate = useNavigate();

  const [connection, setConnection] = useState<WorkspaceConnection | null>(null);
  /** Bumped after each save, so what the fields say is the baseline again; the first arrival of the connection is the other. */
  const [stores, setStores] = useState(0);
  const [name, setName] = useState('');
  /** The connection's own address - a mail connection's server - where it is this workspace's to change. */
  const [address, setAddress] = useState('');
  /** What it is for, where the connection is the workspace's own. */
  const [description, setDescription] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [namedSaved, setNamedSaved] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [authType, setAuthType] = useState<AuthType>('NONE');
  /**
   * The kind being chosen, which is not always the kind that is stored.
   *
   * The fields below follow this rather than the saved connection, so picking
   * Slack shows the app-level token straight away instead of after a save - and
   * the token is what somebody came here to type.
   */
  const [type, setType] = useState<ConnectionType | null>(null);
  /**
   * The plugin label being chosen, beside the kind. Issue #363.
   *
   * Null until the menu is touched, so opening the page and saving a credential
   * does not rewrite the label; the id of a plugin kind once one is picked; and
   * an empty string once a core kind is picked over a label, which is what the
   * server takes as "clear it".
   */
  const [pluginChoice, setPluginChoice] = useState<string | null>(null);
  /** The kinds the loaded plugins declare; empty where none does. */
  const [kinds, setKinds] = useState<PluginConnectionType[]>([]);
  /**
   * The two credentials, each holding its own answer to the same question.
   *
   * This is the whole of #244. One switch above the card cannot say "the bot
   * token is a workspace secret and the app-level token is this connection's
   * own", because that sentence is about two fields; two handles can, and each
   * carries its own box, its own picker, its own reveal and its own rule about
   * what an emptied box means.
   */
  const secret = useSecretField();
  const appToken = useSecretField();
  const userToken = useSecretField();
  const { variables, refresh: refreshVariables } = useWorkspaceVariables(workspaceId);
  const [urlOverride, setUrlOverride] = useState('');
  /** Whether a new agent starts with this connection granted. */
  const [grantNewAgents, setGrantNewAgents] = useState(false);
  const [smtpUsername, setSmtpUsername] = useState('');
  const [smtpFrom, setSmtpFrom] = useState('');
  const [smtpSecurity, setSmtpSecurity] = useState<MailSecurity>('STARTTLS');
  const [smtpPort, setSmtpPort] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (connectionId === '') return;
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
    fetchWorkspaceConnection(connectionId)
      .then((found) => {
        if (abandoned) return;
        if (found === null) {
          setLoadError(t('That connection does not exist, or you do not have access to it.'));
          return;
        }
        setConnection(found);
        setName(found.name);
        setAddress(found.url);
        setDescription(found.description ?? '');
        setAuthType(found.authType);
        setUrlOverride(found.urlOverride ?? '');
        setGrantNewAgents(found.grantNewAgents);
        setSmtpUsername(found.smtpUsername ?? '');
        setSmtpFrom(found.smtpFrom ?? '');
        setSmtpSecurity(found.smtpSecurity);
        setSmtpPort(found.smtpPort === null ? '' : String(found.smtpPort));
        secret.reset({ stored: found.secretSet, variable: found.secretVariableId });
        appToken.reset({ stored: found.appTokenSet, variable: found.appTokenVariableId });
        userToken.reset({ stored: found.userTokenSet, variable: found.userTokenVariableId });
      })
      .catch((cause: unknown) => {
        if (abandoned) return;
        setLoadError(cause instanceof Error ? cause.message : t('Could not load the connection.'));
      });
    return () => {
      abandoned = true;
    };
  }, [connectionId]);

  useEffect(() => {
    let current = true;
    fetchPluginConnectionTypes()
      .then((found) => {
        if (current) setKinds(found);
      })
      .catch(() => {
        // The menu offers the core kinds alone, as it did before plugins had any.
      });
    return () => {
      current = false;
    };
  }, []);

  /** What is on the page now: the choice if one has been made, else what is stored. */
  const kind = type ?? connection?.type ?? null;
  /** The plugin label in force: the one chosen, else the one stored; empty for none. */
  const pluginType = pluginChoice ?? connection?.pluginType ?? '';
  /**
   * What the Type menu stands on. A plugin kind's id where one is in force, so
   * the menu says "Prometheus server" and not the HTTP it is underneath.
   */
  const typeChoice = pluginType !== '' ? pluginType : (kind ?? '');

  /** One pick answers both questions: which kind, and whether a plugin labels it. */
  function chooseType(picked: string) {
    const labelled = kinds.some((one) => one.id === picked) || picked === connection?.pluginType;
    setType(labelled ? 'HTTP' : (picked as ConnectionType));
    setPluginChoice(labelled ? picked : '');
  }
  const mail = kind === 'SMTP';
  /*
   * One Slack kind, where there were two.
   *
   * This page asked for `SLACK` while the form that creates a connection asked
   * for `SLACK_SOCKET_MODE` - opposite values, so the one kind that needed an
   * app-level token was the one kind that could never be shown the field. The
   * two kinds have since been collapsed into this one, which holds the
   * app-level token when it is meant to listen and leaves it empty when it is
   * only meant to send.
   */
  const slack = kind === 'SLACK';
  /** Slack has one address and an inherited connection follows the default's; every other one is the workspace's. */
  const addressEditable = connection !== null && !connection.inherited && !slack;

  /**
   * What Slack said this token can do, where this connection is a Slack one.
   *
   * Asked of the workspace and read for one row, because that is the only shape
   * the query has - and it costs nothing extra: the server keeps each
   * connection's answer for ten minutes against the token's own fingerprint, so
   * opening this page after the trigger list that sent somebody here asks Slack
   * nothing at all.
   *
   * Only for a Slack connection. An SMTP server has no bot user and no scopes,
   * and a page that asked anyway would be spending a round trip to be told so.
   */
  const [botUser, setBotUser] = useState<SlackBotUser | null>(null);

  useEffect(() => {
    if (!slack || workspaceId === '' || connectionId === '') return;
    let current = true;
    fetchSlackBotUsers(workspaceId)
      .then((bots) => {
        if (current) setBotUser(bots.find((held) => held.connectionId === connectionId) ?? null);
      })
      .catch(() => {
        if (current) setBotUser(null);
      });
    return () => {
      current = false;
    };
  }, [slack, workspaceId, connectionId]);

  /**
   * The Socket Mode socket this server holds for a Slack connection. #592.
   *
   * A socket that died without the client noticing used to stay "open" and
   * hear nothing until a restart, and nothing on this page said so. The line
   * says when it opened and when an event last arrived - "connected since
   * nine, last event three days ago" is the shape of a dead socket - and
   * Reconnect closes it and opens it again, on every server.
   */
  const [socket, setSocket] = useState<SlackSocketState | null>(null);
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    if (!slack || connectionId === '') return;
    let current = true;
    fetchSlackSocket(connectionId)
      .then((state) => {
        if (current) setSocket(state);
      })
      .catch(() => {
        if (current) setSocket(null);
      });
    return () => {
      current = false;
    };
  }, [slack, connectionId]);

  async function handleReconnect() {
    if (reconnecting) return;
    setReconnecting(true);
    setSaveError(null);
    try {
      setSocket(await reconnectSlackConnection(connectionId));
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : t('Could not reconnect to Slack.'));
    } finally {
      setReconnecting(false);
    }
  }

  /** Changing how the session is secured moves the port with it, until it is typed over. */
  function changeSecurity(next: MailSecurity) {
    const previous = SECURITY.find((candidate) => candidate.value === smtpSecurity);
    setSmtpSecurity(next);
    if (smtpPort === '' || smtpPort === String(previous?.port)) {
      setSmtpPort(String(SECURITY.find((candidate) => candidate.value === next)?.port ?? ''));
    }
  }

  async function handleRevealAppToken() {
    try {
      appToken.show((await revealWorkspaceConnectionAppToken(connectionId)) ?? '');
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : t('Could not reveal the app-level token.'));
    }
  }

  async function handleRevealUserToken() {
    try {
      userToken.show((await revealWorkspaceConnectionUserToken(connectionId)) ?? '');
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : t('Could not reveal the user token.'));
    }
  }

  async function handleReveal() {
    try {
      secret.show((await revealWorkspaceConnectionSecret(connectionId)) ?? '');
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : t('Could not reveal the credentials.'));
    }
  }

  /**
   * The secrets this workspace keeps, and only those.
   *
   * A VALUE is read with the variable listing, and a value on a listing is a
   * value on a screen - so a credential may not be pointed at one, and the
   * server refuses it. Filtered here rather than left to that refusal: an
   * option offered and then rejected teaches the rule at the cost of a save.
   */
  const secrets = useMemo(
    () =>
      variables
        .filter((variable) => variable.kind === 'SECRET')
        .map((variable) => ({ value: variable.id, label: variable.name, hint: variable.catalogName })),
    [variables],
  );

  /**
   * The list one field offers, with whatever it already reads kept in it even
   * before the variables arrive.
   *
   * The connection carries each variable's name and catalog precisely so a
   * screen need not ask twice; without this row the picker would sit on its
   * placeholder while the list is in flight, which reads as a field that has
   * chosen nothing.
   */
  function offered(held: string | null, called: string | null, catalog: string | null) {
    if (held === null || called === null) return secrets;
    if (secrets.some((option) => option.value === held)) return secrets;
    return [{ value: held, label: called, hint: catalog ?? '' }, ...secrets];
  }

  /** Which of the two a field is, and what that costs this form. */
  function chooseSource(field: SecretFieldHandle, next: SecretSource) {
    field.choose(next);
    // Reaching for the list is a reason to read it again: somebody about to
    // point a field at a secret has often just been to Variables to make it.
    if (next === 'VARIABLE') refreshVariables();
    setSaveError(null);
    setSaved(false);
  }

  /** Cleared as soon as either field is touched, whichever way it was touched. */
  function touched() {
    setSaveError(null);
    setSaved(false);
  }

  /**
   * Saved on its own, because the name is not a credential: pressing "Save
   * Credentials" to rename something would be a surprise, and renaming should
   * not ask for the secret to be re-entered.
   */
  /**
   * Whether the General card says anything the stored connection does not.
   * The page has one Save now, and it renames only where there is a rename.
   */
  const named = () =>
    !locked &&
    connection !== null &&
    !(name.trim() === connection.name &&
      (!addressEditable || address.trim() === connection.url) &&
      description.trim() === (connection.description ?? ''));

  /**
   * The page's one Save: the General card where it changed, then the
   * credentials, as their own two presses used to.
   *
   * There were two, one per card, and a page with two buttons that both say
   * Save is two decisions about which one the change needed. Kept as two calls,
   * because the name is not a credential and the server takes them apart.
   */
  async function saveAll() {
    if (named()) {
      if (name.trim() === '' || (addressEditable && address.trim() === '')) {
        setNameError(t('A connection needs a name and an address.'));
        return;
      }
      await handleSaveName();
    }
    await handleSave();
  }

  async function handleSaveName() {
    if (savingName) return;

    setSavingName(true);
    setNameError(null);
    setNamedSaved(false);
    try {
      /*
       * The address with the name, where the address is the workspace's: a
       * connection it made pointed where it was made pointing, and the only
       * way to move it was the override below - which a mail connection does
       * not have, so its server could not be changed at all.
       */
      const updated = await updateWorkspaceConnection(connectionId, {
        name: name.trim(),
        ...(addressEditable ? { url: address.trim() } : {}),
        ...(locked ? {} : { description: description.trim() }),
      });
      setConnection(updated);
      setName(updated.name);
      setAddress(updated.url);
      setDescription(updated.description ?? '');
      setNamedSaved(true);
      setStores((held) => held + 1);
    } catch (cause) {
      setNameError(cause instanceof Error ? cause.message : t('Could not rename the connection.'));
    } finally {
      setSavingName(false);
    }
  }

  async function handleSave(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (saving) return;

    // Said before the save rather than after it: a picker left on its
    // placeholder is a field that has not been answered.
    if (secret.unchosen) {
      setSaveError(`Choose the workspace secret this connection reads its ${secretLabel(kind)} from.`);
      setSaved(false);
      return;
    }
    if (slack && appToken.unchosen) {
      setSaveError(t('Choose the workspace secret this connection reads its app-level token from.'));
      setSaved(false);
      return;
    }
    if (slack && userToken.unchosen) {
      setSaveError(t('Choose the workspace secret this connection reads its user token from.'));
      setSaved(false);
      return;
    }

    const sendingSecret = secret.sending;
    const sendingAppToken = appToken.sending;
    const sendingUserToken = userToken.sending;

    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const updated = await updateWorkspaceConnection(connectionId, {
        // Only when it has actually been changed, so opening the page and
        // saving a credential does not also rewrite the kind.
        type: type !== null && type !== connection?.type ? type : undefined,
        // The same rule for the label: only once the menu has been touched and
        // only where it changed. An empty string is the server's word for
        // "clear it", so a core kind picked over a label clears it.
        pluginType:
          pluginChoice !== null && pluginChoice !== (connection?.pluginType ?? '') ? pluginChoice : undefined,
        // Not for Slack, whose controls are gone: the server overwrites
        // authType on every save, and a Slack connection has nowhere else to
        // point. Sending them would write settings the form no longer shows.
        authType: slack ? undefined : authType,
        /*
         * Each field's answer, in the names this mutation gives it.
         *
         * One of the two, never both and never neither by accident. A variable
         * sent drops any copy that field held and a value sent drops any
         * reference, so the exclusivity is the server's rule as much as this
         * form's - and sending the pair is a BAD_REQUEST rather than something
         * resolved by precedence. Nothing sent is what says "leave the stored
         * one alone", which is what a masked box means and is the easiest thing
         * on this page to break.
         */
        ...(sendingSecret === null
          ? {}
          : 'variable' in sendingSecret
            ? { secretVariableId: sendingSecret.variable }
            : { secret: sendingSecret.value }),
        ...(sendingAppToken === null
          ? {}
          : 'variable' in sendingAppToken
            ? { appTokenVariableId: sendingAppToken.variable }
            : { appToken: sendingAppToken.value }),
        ...(sendingUserToken === null
          ? {}
          : 'variable' in sendingUserToken
            ? { userTokenVariableId: sendingUserToken.variable }
            : { userToken: sendingUserToken.value }),
        urlOverride: slack ? undefined : urlOverride.trim(),
        grantNewAgents,
        // Only for a mail connection: sending these for a Slack one would write
        // settings nothing reads and clear what somebody typed elsewhere.
        smtpPort: mail ? Number(smtpPort) : undefined,
        smtpUsername: mail ? smtpUsername.trim() : undefined,
        smtpFrom: mail ? smtpFrom.trim() : undefined,
        smtpSecurity: mail ? smtpSecurity : undefined,
      });
      setConnection(updated);
      secret.reset({ stored: updated.secretSet, variable: updated.secretVariableId });
      appToken.reset({ stored: updated.appTokenSet, variable: updated.appTokenVariableId });
      userToken.reset({ stored: updated.userTokenSet, variable: updated.userTokenVariableId });
      setSaved(true);
      setStores((held) => held + 1);
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : t('Could not save the credentials.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    if (testing) return;

    setTesting(true);
    setSaveError(null);
    try {
      setConnection(await testWorkspaceConnection(connectionId));
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : t('Could not check the connection.'));
    } finally {
      setTesting(false);
    }
  }

  async function handleDisconnect() {
    await disconnectWorkspaceConnection(connectionId);
    navigate(`/workspace/${workspaceId}/integrations`);
  }

  const locked = connection?.inherited ?? false;

  /*
   * Whether there is anything to save: what the fields would send, against
   * what the page last agreed with the server. Save and Discard are off while
   * there is not.
   */
  const changed = useDirty({ name, address, description, type, pluginChoice, authType, urlOverride, grantNewAgents, smtpPort, smtpUsername, smtpFrom, smtpSecurity, secret: secret.sending, appToken: appToken.sending, userToken: userToken.sending }, [connection === null, stores]);

  return (
    <AppShell
      scrollContent
      title={connection?.name}
      user={shellUser(session)}
      workspacePath={`/workspace/${workspaceId}`}
      showAdmin={session.admin}
      onSignOut={onSignOut}
      sidebar={<WorkspaceSidebar workspaceId={workspaceId} />}
    >
      <header className={styles.contentHeader}>
        <p className={styles.breadcrumb}>
          <BackLink to={`/workspace/${workspaceId}/integrations`} label={t('Integrations')} />
          <Link className={styles.crumbLink} to={`/workspace/${workspaceId}/integrations`}>
            {t('Integrations')}
          </Link>
          <span className={styles.crumbSeparator}>/</span>
          <span className={styles.crumbCurrent}>{connection?.name ?? '…'}</span>
        </p>
        <h1 className={styles.title}>{t('Connection Settings')}</h1>
      </header>

      {loadError !== null ? (
        <section className={styles.card}>
          <p className={styles.loadError} role="alert">
            {loadError}
          </p>
        </section>
      ) : connection === null ? (
        <section className={styles.card}>
          <Loader />
        </section>
      ) : (
        <>
          <section className={styles.card}>
            <div className={styles.cardHead}>
              <div className={styles.cardTitles}>
                <h2 className={styles.cardTitle}>{t('General')}</h2>
                <p className={styles.cardSubtitle}>
                  {locked
                    ? t('Connection settings inherited from admin defaults')
                    : t('Connection settings for this workspace')}
                </p>
              </div>
            </div>

            {/*
              An inherited connection's name belongs to the admin default, so it
              stays read-only. A workspace's own is the workspace's to change —
              the API has always accepted it; there was simply nowhere to type.
            */}
            {locked ? (
              <>
                <ReadOnlyField label={t('Integration Name')} value={connection?.name ?? ''} locked />
                {connection?.description != null && (
                  <ReadOnlyField label={t('Description')} value={connection.description} locked />
                )}
              </>
            ) : (
              <div className={styles.field}>
                <label className={styles.label} htmlFor="connection-name">
                  {t('Integration Name')}
                </label>
                <div className={styles.inputWrapper}>
                  <input
                    id="connection-name"
                    className={styles.input}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={t('Name this connection')}
                  />
                </div>
              </div>
            )}
            {!locked && connection !== null && (
              <div className={styles.field}>
                <label className={styles.label} htmlFor="connection-description">
                  {t('Description')}
                </label>
                <div className={styles.inputWrapper}>
                  <input
                    id="connection-description"
                    className={styles.input}
                    maxLength={500}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder={t('What it is for, e.g. production Jira, the support project')}
                  />
                </div>
              </div>
            )}
            {/*
              Editable, where the connection is this workspace's own.

              An inherited one follows the installation's default and is shown
              rather than offered, as everything else on it is. The server has
              always accepted a change of kind; only this page refused to make
              one, so a connection created as the wrong kind had to be deleted
              and built again, taking its credentials with it.
            */}
            {locked || connection === null ? (
              <ReadOnlyField
                label={t('Type')}
                value={connection === null ? '' : connectionKindLabel(connection, kinds)}
                locked={locked}
              />
            ) : (
              <div className={styles.field}>
                <label className={styles.label} htmlFor="connection-type">{t('Type')}</label>
                <div className={styles.inputWrapper}>
                  <select
                    id="connection-type"
                    name="type"
                    className={styles.input}
                    value={typeChoice}
                    onChange={(event) => chooseType(event.target.value)}
                  >
                    {CONNECTION_TYPES.map((candidate) => (
                      <option key={candidate} value={candidate}>
                        {connectionTypeLabel(candidate)}
                      </option>
                    ))}
                    {/* The plugins' kinds, offered as the dialog that creates a connection offers them. */}
                    {kinds.length > 0 && (
                      <optgroup label={t('From plugins')}>
                        {kinds.map((one) => (
                          <option key={one.id} value={one.id} title={one.description ?? undefined}>
                            {pluginKindOptionLabel(one, kinds)}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {/*
                      The label it wears, even where no loaded plugin declares it
                      any more: the connection is still set to it, and the menu
                      must not report a plain endpoint over a label that is
                      stored. Picking anything else is how it is cleared.
                    */}
                    {connection.pluginType !== null && !kinds.some((one) => one.id === connection.pluginType) && (
                      <option value={connection.pluginType}>
                        {tf('{kind} (no longer offered)', { kind: connection.pluginType })}
                      </option>
                    )}
                  </select>
                </div>
              </div>
            )}
            {/* The plugin's setup notes for the kind chosen, folded: by now it is usually done. */}
            <ConnectionGuide kind={kinds.find((one) => one.id === typeChoice) ?? null} />
            {addressEditable ? (
              <div className={styles.field}>
                <label className={styles.label} htmlFor="connection-url">
                  {mail ? t('Mail Server') : t('URL')}
                </label>
                <div className={styles.inputWrapper}>
                  <input
                    id="connection-url"
                    name="url"
                    className={styles.input}
                    type="text"
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                    placeholder={mail ? 'smtp.example.com' : 'https://'}
                  />
                </div>
              </div>
            ) : (
              <ReadOnlyField
                label={mail ? t('Mail Server') : t('Default API Host URL')}
                value={connection?.url ?? ''}
                locked={locked}
              />
            )}

          </section>

          <form id="connection-credentials" className={styles.card} onSubmit={handleSave}>
            <h2 className={styles.cardTitle}>{t('Active Credentials')}</h2>

            {/*
              * Not for Slack, which authenticates one way. The server sets
              * BEARER_TOKEN on every save regardless of what arrives, so a
              * chooser here offers four answers and keeps one.
              */}
            {!slack && !mail && (
            <div className={styles.field}>
              <label className={styles.label} htmlFor="connection-auth">{t('Auth Type')}</label>
              <div className={styles.inputWrapper}>
                <select
                  id="connection-auth"
                  name="authType"
                  className={`${styles.input} ${styles.select}`}
                  value={authType}
                  onChange={(event) => setAuthType(event.target.value as AuthType)}
                >
                  {AUTH_TYPES.map((candidate) => (
                    <option key={candidate} value={candidate}>
                      {authTypeLabel(candidate)}
                    </option>
                  ))}
                </select>
                <img src={chevronDown12Icon} alt="" width={12} height={12} />
              </div>
            </div>
            )}

            {mail && (
              <>
                <div className={styles.field}>
                  <span className={styles.labelWithHint}>
                    <label className={styles.label} htmlFor="connection-smtp-from">
                      {t('From Address')}
                    </label>
                    <FieldHint label={t('From Address')}>
                      {t('Every mail this connection sends is from this address, and a provider that has not authorised it refuses the message however good the password is.')}
                    </FieldHint>
                  </span>
                  <div className={styles.inputWrapper}>
                    <input
                      id="connection-smtp-from"
                      name="smtpFrom"
                      className={styles.input}
                      type="email"
                      placeholder="orknux@example.com"
                      value={smtpFrom}
                      onChange={(event) => setSmtpFrom(event.target.value)}
                    />
                  </div>
                </div>

                <div className={styles.field}>
                  <label className={styles.label} htmlFor="connection-smtp-security">
                    {t('Security')}
                  </label>
                  <div className={styles.inputWrapper}>
                    <select
                      id="connection-smtp-security"
                      name="smtpSecurity"
                      className={`${styles.input} ${styles.select}`}
                      value={smtpSecurity}
                      onChange={(event) => changeSecurity(event.target.value as MailSecurity)}
                    >
                      {SECURITY.map((candidate) => (
                        <option key={candidate.value} value={candidate.value}>
                          {candidate.label}
                        </option>
                      ))}
                    </select>
                    <img src={chevronDown12Icon} alt="" width={12} height={12} />
                  </div>
                </div>

                <div className={styles.field}>
                  <label className={styles.label} htmlFor="connection-smtp-port">{t('Port')}</label>
                  <div className={styles.inputWrapper}>
                    <input
                      id="connection-smtp-port"
                      name="smtpPort"
                      className={`${styles.input} ${styles.inputMono}`}
                      type="number"
                      min={1}
                      max={65535}
                      value={smtpPort}
                      onChange={(event) => setSmtpPort(event.target.value)}
                    />
                  </div>
                </div>

                <div className={styles.field}>
                  <label className={styles.label} htmlFor="connection-smtp-username">
                    {t('Username')}
                  </label>
                  <div className={styles.inputWrapper}>
                    <input
                      id="connection-smtp-username"
                      name="smtpUsername"
                      className={styles.input}
                      type="text"
                      placeholder={t('Leave empty to send without authenticating')}
                      value={smtpUsername}
                      onChange={(event) => setSmtpUsername(event.target.value)}
                    />
                  </div>
                </div>
              </>
            )}

            {/*
              Each credential, and where it comes from - the choice standing
              beside that field's own name rather than above the card.

              A connection is exactly the shape that makes the difference
              visible. A Slack one holds two credentials, and "this connection
              uses a workspace secret" cannot mean one of them without meaning
              the other; two of these can, because each is named after the field
              it governs and each has one input under it. See
              components/SecretField.tsx.
            */}
            <SecretField
              id="connection-secret"
              label={secretLabel(kind)}
              field={secret}
              options={offered(
                connection?.secretVariableId ?? null,
                connection?.secretVariableName ?? null,
                connection?.secretVariableCatalog ?? null,
              )}
              variablesPath={`/workspace/${workspaceId}/variables`}
              placeholder={mail ? t('Enter password...') : secretPlaceholder(authType)}
              hint={secretHint(kind)}
              onSource={(next) => chooseSource(secret, next)}
              onValue={touched}
              onVariable={touched}
              onReveal={() => void handleReveal()}
              broken={
                connection?.secretVariableMissing === true
                  ? `The workspace secret this ${secretLabel(kind).toLowerCase()} was read from is gone, so this connection has nothing to authenticate with. Its address is fine. Point this field at another secret, or give it a value of its own.`
                  : null
              }
            />

            {slack && (
              <SecretField
                id="connection-app-token"
                label={t('App-Level Token')}
                field={appToken}
                options={offered(
                  connection.appTokenVariableId,
                  connection.appTokenVariableName,
                  connection.appTokenVariableCatalog,
                )}
                variablesPath={`/workspace/${workspaceId}/variables`}
                placeholder="xapp-..."
                hint={
                  <>
                    Optional, and beginning <code>xapp-</code>. From Basic Information, with
                    connections:write. Given one, orknux listens for mentions and runs the triggers
                    waiting on them; left empty, this connection only sends.
                  </>
                }
                onSource={(next) => chooseSource(appToken, next)}
                onValue={touched}
                onVariable={touched}
                onReveal={() => void handleRevealAppToken()}
                broken={
                  connection.appTokenVariableMissing
                    ? t('The workspace secret this app-level token was read from is gone, so this connection cannot listen. Point this field at another secret, or give it a value of its own.')
                    : null
                }
              />
            )}

            {slack && (
              <SecretField
                id="connection-user-token"
                label={t('User Token')}
                field={userToken}
                options={offered(
                  connection.userTokenVariableId,
                  connection.userTokenVariableName,
                  connection.userTokenVariableCatalog,
                )}
                variablesPath={`/workspace/${workspaceId}/variables`}
                placeholder="xoxp-..."
                hint={
                  <>
                    Optional, and beginning <code>xoxp-</code>. From OAuth &amp; Permissions, a User
                    OAuth Token with search:read. Search runs on this token when one is stored,
                    because Slack answers search only for a user; everything else keeps using the
                    bot token above.
                  </>
                }
                onSource={(next) => chooseSource(userToken, next)}
                onValue={touched}
                onVariable={touched}
                onReveal={() => void handleRevealUserToken()}
                broken={
                  connection.userTokenVariableMissing
                    ? t('The workspace secret this user token was read from is gone, so this connection cannot search. Point this field at another secret, or give it a value of its own.')
                    : null
                }
              />
            )}

            {/*
              * Nor for Slack. There is one Slack and one Web API base under it;
              * every Slack connection sends, and an app-level token is what
              * additionally makes it listen. Neither of those is a webhook
              * pointed somewhere else, so there is no Slack connection for
              * which an override here means anything.
              */}
            {!slack && !mail && (
            <div className={styles.field}>
              <label className={styles.label} htmlFor="connection-url-override">
                {t('URL Override')}
              </label>
              <div className={styles.inputWrapper}>
                <input
                  id="connection-url-override"
                  name="urlOverride"
                  className={styles.input}
                  type="text"
                  placeholder={connection?.url ?? 'https://'}
                  value={urlOverride}
                  onChange={(event) => setUrlOverride(event.target.value)}
                />
              </div>
            </div>
            )}

            <label className={dialog.checkboxField}>
              <input
                type="checkbox"
                checked={grantNewAgents}
                onChange={(event) => setGrantNewAgents(event.target.checked)}
                data-testid="connection-grant-new-agents"
              />
              <span>
                {t('Grant to new agents')}
                <span className={dialog.checkboxHint}>{t('A new agent starts with it ticked; agents already made are left as they are.')}</span>
              </span>
            </label>

            {saveError !== null && (
              <p className={styles.error} role="alert">
                {saveError}
              </p>
            )}

            <div className={styles.statusRow}>
              <span className={statusClass(connection?.status)} aria-hidden="true" />
              <span className={styles.statusLabel}>
                {connection === null ? '…' : statusLabel(connection.status)}
              </span>
              {connection?.lastCheckMessage != null && (
                <span className={styles.statusDetail}>{connection.lastCheckMessage}</span>
              )}
              {/* Test on the line that says what it found; Save is in the strip at the foot of the window. */}
              <button
                type="button"
                className={`${styles.testButton} ${styles.statusAction}`}
                onClick={handleTest}
                disabled={testing}
                data-status-action=""
              >
                {testing ? 'Checking…' : t('Test Connection')}
              </button>
            </div>

            {/*
              What this token cannot do, beside what it is.

              A connection can be green - the credential is real, Slack answered
              it - and still be one no message will ever arrive on, because a
              bot token set up only to post carries no history scope. That is a
              fact about the token and belongs on the token's page, in the words
              the server already uses for it.

              `receives === false` and never `!receives`: null is Slack having
              said nothing about scopes, and a page that warned on it would send
              somebody to rebuild an installation that is fine.
            */}
            {botUser?.receives === false && botUser.message !== '' && (
              <p className={styles.cannotReceive} id="connection-receives">
                {botUser.message}
              </p>
            )}

            {/*
              The socket, on its own line under the token's: the check above
              says the token is real, and this says whether anything is
              listening with it. Reconnect sits on the line it acts on.
            */}
            {slack && socket !== null && (
              <div className={styles.statusRow} id="connection-socket">
                <span className={socketDotClass(socket.status)} aria-hidden="true" />
                <span className={styles.statusDetail} id="connection-socket-state">
                  {socketLine(socket)}
                </span>
                {socket.status !== 'NOT_LISTENING' && (
                  <button
                    type="button"
                    className={styles.testButton}
                    id="connection-reconnect"
                    onClick={handleReconnect}
                    disabled={reconnecting}
                  >
                    {reconnecting ? t('Reconnecting…') : t('Reconnect')}
                  </button>
                )}
              </div>
            )}

            {/*
              Slack hands each of an app's connections a share of its events,
              whichever server opened them - so another installation listening
              with the same app takes some of the mentions this one is waiting
              for, and a trigger reads as working only sometimes.
            */}
            {slack && socket?.sharedWithOthers === true && (
              <p className={styles.cannotReceive} id="connection-socket-shared">
                {sharedLine(socket.appConnections ?? 0)}
              </p>
            )}

          </form>

          <section className={`${styles.card} ${styles.dangerCard}`}>
            <h2 className={styles.dangerHeading}>{t('Danger Zone')}</h2>
            <div className={styles.dangerRow}>
              <div className={styles.dangerText}>
                <p className={styles.dangerTitle}>Disconnect {connection?.name ?? ''}</p>
                <p className={styles.dangerMessage}>
                  {locked
                    ? t('Clear the credentials this workspace stored and reset to admin defaults.')
                    : t('Permanently remove this custom integration connection from the workspace.')}
                </p>
              </div>
              <button type="button" className={styles.dangerActionFilled} onClick={handleDisconnect}>
                {t('Disconnect')}
              </button>
            </div>
          </section>
          {/* Floating at the foot of the window, in view wherever the reader has scrolled to - and above the AI button. */}
          <SaveBar>
            {nameError !== null && <p className={styles.savedNote}>{nameError}</p>}
            {saveError === null && nameError === null && (saved || namedSaved) && <p className={styles.savedNote}>{t('Saved.')}</p>}
            <DiscardButton onDiscard={onDiscard} disabled={saving || savingName || !changed} />
            <button
              type="button"
              className={styles.save}
              onClick={() => void saveAll()}
              disabled={saving || savingName || !changed}
            >
              {saving || savingName ? t('Saving…') : t('Save Changes')}
            </button>
          </SaveBar>
        </>
      )}
    </AppShell>
  );
}

/** Green once the service answered, red when the check failed, grey until then. */
function statusClass(status: ConnectionStatus | undefined): string {
  switch (status) {
    case 'CONNECTED':
      return `${styles.statusDot} ${styles.statusConnected}`;
    case 'FAILED':
      return `${styles.statusDot} ${styles.statusFailed}`;
    default:
      return `${styles.statusDot} ${styles.statusIdle}`;
  }
}

/** Green while the socket is open, red when it would not open, grey otherwise. */
function socketDotClass(status: SlackSocketStatus): string {
  switch (status) {
    case 'CONNECTED':
      return `${styles.statusDot} ${styles.statusConnected}`;
    case 'FAILED':
      return `${styles.statusDot} ${styles.statusFailed}`;
    default:
      return `${styles.statusDot} ${styles.statusIdle}`;
  }
}

/** One line: when it opened and what it last heard, or why it is not open. */
function socketLine(socket: SlackSocketState): string {
  switch (socket.status) {
    case 'CONNECTED': {
      const since = clock(socket.connectedSince);
      return socket.lastEventAt === null
        ? tf('Connected since {time}, no event yet', { time: since })
        : tf('Connected since {time}, last event {ago}', { time: since, ago: ago(socket.lastEventAt) });
    }
    case 'CONNECTING':
      return t('Not connected yet; the socket opens within a minute');
    case 'FAILED':
      return tf('Could not connect: {reason}', { reason: socket.lastFailure ?? t('no reason given') });
    case 'NOT_LISTENING':
      return t('Not listening: there is no app-level token');
    case 'DISABLED':
      return t('This server does not listen to Slack');
    case 'ELSEWHERE':
      // Several servers on one database: only the one holding the cluster
      // lease opens sockets, and its socket is not this server's to describe.
      return t('Listened to by another server of this installation');
  }
}

/** Somebody else listening with the same Slack app, and taking a share of its events. */
function sharedLine(count: number): string {
  return tf('Slack splits this app’s events between {count} connections; another server is listening with this app', {
    count,
  });
}

/** The time of day, with the date only when it is not today. */
function clock(iso: string | null): string {
  if (iso === null) return '—';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return at.toDateString() === new Date().toDateString()
    ? at.toLocaleTimeString([], zoned({ hour: '2-digit', minute: '2-digit' }))
    : at.toLocaleString([], zoned({ dateStyle: 'short', timeStyle: 'short' }));
}

/** "2 min ago", in whichever language is being read. */
function ago(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return t('just now');
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return tf('{count} min ago', { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return tf('{count} h ago', { count: hours });
  return tf('{count} d ago', { count: Math.round(hours / 24) });
}

/** A field the admin owns: shown, but not the workspace's to change. */
function ReadOnlyField({ label, value, locked }: { label: string; value: string; locked: boolean }) {
  return (
    <div className={styles.field}>
      <p className={styles.label}>{label}</p>
      <div className={locked ? `${styles.inputWrapper} ${styles.inputWrapperLocked}` : styles.inputWrapper}>
        <span className={`${styles.input} ${styles.inputMono}`}>{value}</span>
        {locked && <img src={lockIcon} alt={t("Managed by the admin")} width={12} height={12} />}
      </div>
    </div>
  );
}

/**
 * The page, started over by Discard.
 *
 * Discard puts every field back to what the server holds. This page keeps
 * its drafts across many fields and sections, so rather than a second copy
 * of the code that fills them, the page is drawn again from the start and
 * fills them the one way it always does - a round trip, which is the price
 * of there being one way.
 */
export function ConnectionSettingsPage(props: ConnectionSettingsPageProps) {
  const [discards, setDiscards] = useState(0);
  return <ConnectionSettingsView key={discards} {...props} onDiscard={() => setDiscards((held) => held + 1)} />;
}
