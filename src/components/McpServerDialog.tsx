import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { authTypeHint, authTypeLabel, secretPlaceholder, checkMcpServerDraft, createMcpServer } from '../api/integrations';
import type { AuthType, HttpHeader, McpServer, McpServerCheck } from '../api/integrations';
import chevronDown12Icon from '../assets/chevron-down-12.svg';
import styles from './Dialog.module.css';
import status from '../pages/workspace/IntegrationSettings.module.css';
import { HeaderRowsEditor } from './HeaderRowsEditor';
import { SecretField, useSecretField } from './SecretField';
import { useWorkspaceVariables } from '../pages/workspace/workspaceVariables';
import { t } from '../i18n';
import { Select } from './Select';

export interface McpServerDialogProps {
  open: boolean;
  workspaceId: string;
  onClose: () => void;
  onCreated: (server: McpServer) => void;
}

const AUTH_TYPES: AuthType[] = ['NONE', 'API_KEY', 'BEARER_TOKEN', 'BASIC'];

/**
 * Add Server. The connection modals frame has no MCP variant, so this follows
 * the Add Connection modal with the fields of the MCP server settings page.
 */
export function McpServerDialog({ open, workspaceId, onClose, onCreated }: McpServerDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [authType, setAuthType] = useState<AuthType>('API_KEY');
  /** The credential: typed here, or read from a workspace secret. Its own choice. */
  const secret = useSecretField();
  const { variables, refresh: refreshVariables } = useWorkspaceVariables(workspaceId);
  const [headers, setHeaders] = useState<HttpHeader[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;

    if (open && !dialog.open) {
      setName('');
      setAddress('');
      setAuthType('API_KEY');
      secret.clear();
      setHeaders([]);
      setError(null);
      setSubmitting(false);
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const complete = name.trim() !== '' && address.trim() !== '' && !secret.unchosen;
  const [testing, setTesting] = useState(false);
  const [tested, setTested] = useState<McpServerCheck | null>(null);

  /**
   * The secrets this workspace keeps, and only those: a VALUE is read with the
   * variable listing, so the server refuses one as a credential and offering it
   * here would teach that at the cost of a save.
   */
  const secrets = useMemo(
    () =>
      variables
        .filter((variable) => variable.kind === 'SECRET')
        .map((variable) => ({ value: variable.id, label: variable.name, hint: variable.catalogName })),
    [variables],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!complete || submitting) return;

    const sending = secret.sending;

    setSubmitting(true);
    setError(null);
    try {
      const created = await createMcpServer(asked(sending));
      onCreated(created);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not add the server.'));
      setSubmitting(false);
    }
  }

  /** What the form holds, as the server takes it - for adding the server and for testing it first. */
  function asked(sending: typeof secret.sending) {
    return {
      workspaceId,
      name: name.trim(),
      address: address.trim(),
      authType,
      // One of the two, never both: sending the pair is refused rather than
      // resolved by precedence, and sending neither adds a server with no
      // credential, which is a thing somebody may perfectly well want.
      ...(sending === null
        ? {}
        : 'variable' in sending
          ? { secretVariableId: sending.variable }
          : { secret: sending.value.trim() || undefined }),
      headers: headers.filter((header) => header.name.trim() !== ''),
    };
  }

  /** The same check the saved server's page makes, on what is typed here; nothing is saved. */
  async function handleTest() {
    setTesting(true);
    setTested(null);
    try {
      setTested(await checkMcpServerDraft(asked(secret.sending)));
    } catch (cause) {
      setTested({ reachable: false, detail: cause instanceof Error ? cause.message : t('The check could not be made.'), tools: null });
    } finally {
      setTesting(false);
    }
  }

  return (
    <dialog ref={dialogRef} className={`${styles.dialog} ${styles.dialogWide}`} onCancel={onClose} onClose={onClose}>
      <form className={styles.body} onSubmit={handleSubmit}>
        <header className={styles.header}>
          <h2 className={styles.title}>{t('Add MCP Server')}</h2>
        </header>

        <p className={styles.dialogMessage}>
          {t('Add a server this workspace’s agents may connect to')}
        </p>

        <div className={styles.fields}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="mcp-server-name">{t('Name')}</label>
            <div className={styles.inputWrapper}>
              <input
                id="mcp-server-name"
                name="serverName"
                className={`${styles.input} ${styles.inputMono}`}
                type="text"
                placeholder="brave-search"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoFocus
                required
              />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="mcp-server-address">{t('Address')}</label>
            <div className={styles.inputWrapper}>
              <input
                id="mcp-server-address"
                name="serverAddress"
                className={`${styles.input} ${styles.inputMono}`}
                type="text"
                placeholder="https://"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                required
              />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="mcp-server-auth">{t('Auth Type')}</label>
            <div className={styles.inputWrapper}>
              <Select
                id="mcp-server-auth"
                name="authType"
                className={`${styles.input} ${styles.select}`}
                value={authType}
                onChange={(picked) => setAuthType(picked as AuthType)}
                chevron={false}
              >
                {AUTH_TYPES.map((candidate) => (
                  <option key={candidate} value={candidate} data-hint={authTypeHint(candidate)}>
                    {authTypeLabel(candidate)}
                  </option>
                ))}
              </Select>
              <img src={chevronDown12Icon} alt="" width={12} height={12} />
            </div>
          </div>

          {authType !== 'NONE' && (
            /* One field, asked for one way at a time - and the choice stands
               beside this field's name rather than above the dialog, because a
               dialog-level switch would be a claim about every field in it. */
            <SecretField
              id="mcp-server-secret"
              label={t('Token / Key')}
              field={secret}
              options={secrets}
              variablesPath={`/workspace/${workspaceId}/variables`}
              placeholder={secretPlaceholder(authType)}
              hint={t("Whatever the server expects, sent the way the authentication method above says.")}
              onSource={(next) => {
                secret.choose(next);
                if (next === 'VARIABLE') refreshVariables();
                setError(null);
              }}
              onValue={() => setError(null)}
              onVariable={() => setError(null)}
            />
          )}

          <HeaderRowsEditor headers={headers} onChange={setHeaders} compact />
        </div>

        {error !== null && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        {/* What the last Test found, the width of the dialog; Test itself is beside Add Server, which it comes before. */}
        <div className={status.statusRow} data-testid="mcp-draft-check">
          <span
            className={`${status.statusDot} ${
              tested === null ? status.statusIdle : tested.reachable ? status.statusConnected : status.statusFailed
            }`}
          />
          <span className={status.statusLabel}>
            {tested === null ? t('Not checked') : tested.reachable ? t('Connected') : t('Failed')}
          </span>
          <span
            className={status.statusDetail}
            title={tested?.detail ?? undefined}
            data-check-reachable={tested === null ? undefined : String(tested.reachable)}
          >
            {tested === null ? t('Ask the server whether it answers, before adding it.') : tested.detail}
          </span>
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.ghost} onClick={onClose} disabled={submitting}>
            {t('Cancel')}
          </button>
          <button
            type="button"
            className={styles.ghost}
            onClick={() => void handleTest()}
            disabled={address.trim() === '' || testing || submitting}
          >
            {testing ? t('Testing…') : t('Test')}
          </button>
          <button type="submit" className={styles.filled} disabled={!complete || submitting}>
            {submitting ? t('Adding…') : t('Add Server')}
          </button>
        </div>
      </form>
    </dialog>
  );
}
