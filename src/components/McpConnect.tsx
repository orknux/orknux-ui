import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import hljs from 'highlight.js/lib/core';
import ini from 'highlight.js/lib/languages/ini';
import json from 'highlight.js/lib/languages/json';

import { commandLine } from './shellGrammar';

import { t } from '../i18n';
import { CopyButton } from './CopyButton';
import dialog from './Dialog.module.css';
import styles from './McpConnect.module.css';
import indicators from './DeviceIndicators.module.css';
import { Light } from './DeviceIndicators';
import { useHoverHint } from './HoverHint';
import { OrknuxMark } from './OrknuxMark';

export interface McpConnectProps {
  /** The workspace being looked at, as its path: `/workspace/<id>/…`. Nothing is drawn without one. */
  workspacePath?: string;
  /** Whether the viewer administers the installation, who is shown the way to make a token for somebody else. */
  admin?: boolean;
  /** Whether an MCP client of the viewer's is connected now, drawn as the light after the name; none while unknown. */
  connected?: boolean;
  /** Drawn smaller, for the footer strip of the chat page. */
  compact?: boolean;
  /**
   * Opened from a line of text rather than the corner button: the MCP pages,
   * which list the clients that connected, say there how to connect one.
   */
  asLink?: boolean;
}

/** What the token is written as in the instructions, until somebody puts their own in. */
const TOKEN = 'orkx_…';

/** One client, and what is pasted where to reach this workspace from it. */
interface Client {
  key: string;
  name: string;
  /** Where it goes: a terminal, or which file - in the reader's language. */
  where: () => string;
  /** What goes there. */
  text: (address: string) => string;
  /** The grammar it is coloured with; none for prose. */
  language?: 'bash' | 'ini' | 'json';
}

/*
 * The three grammars the snippets are written in, on highlight.js's core so
 * nothing else of it is carried. TOML is ini's: highlight.js reads one as the
 * other. The shell is the chat's own command-line grammar, which colours the
 * command and its flags - `claude mcp add --transport http` holds no keyword
 * stock bash would colour.
 */
hljs.registerLanguage('bash', commandLine);
hljs.registerLanguage('ini', ini);
hljs.registerLanguage('json', json);

/** A snippet as highlighted markup; highlight.js escapes what it is handed. */
function highlighted(text: string, language: Client['language']): string | null {
  if (language === undefined) return null;
  return hljs.highlight(text, { language, ignoreIllegals: true }).value;
}

/*
 * Each in the client's own spelling, which is the part people get wrong and
 * the part that differs: Claude Code takes a command, Codex a TOML table that
 * reads the token from the environment, Cursor and VS Code JSON under two
 * different keys. "Other" is the two facts every client needs in some shape.
 */
const CLIENTS: Client[] = [
  {
    key: 'claude-code',
    name: 'Claude Code',
    where: () => t('In a terminal, with your token in place of orkx_…'),
    language: 'bash',
    text: (address) => `claude mcp add --transport http orknux ${address} --header "Authorization: Bearer ${TOKEN}"`,
  },
  {
    key: 'codex',
    name: 'Codex',
    where: () => t('In ~/.codex/config.toml, with the token in the ORKNUX_TOKEN environment variable'),
    language: 'ini',
    text: (address) => `[mcp_servers.orknux]\nurl = "${address}"\nbearer_token_env_var = "ORKNUX_TOKEN"`,
  },
  {
    key: 'cursor',
    name: 'Cursor',
    where: () => t('In ~/.cursor/mcp.json, with your token in place of orkx_…'),
    language: 'json',
    text: (address) => JSON.stringify({ mcpServers: { orknux: { url: address, headers: { Authorization: `Bearer ${TOKEN}` } } } }, null, 2),
  },
  {
    key: 'vscode',
    name: 'VS Code',
    where: () => t('In .vscode/mcp.json, with your token in place of orkx_…'),
    language: 'json',
    text: (address) =>
      JSON.stringify({ servers: { orknux: { type: 'http', url: address, headers: { Authorization: `Bearer ${TOKEN}` } } } }, null, 2),
  },
  {
    key: 'other',
    name: 'Other',
    where: () => t('Any client that speaks MCP over HTTP: this address, and this header on every request'),
    text: (address) => `URL: ${address}\nHeader: Authorization: Bearer ${TOKEN}`,
  },
];

/**
 * A button in the corner beside Ask AI, opening how to reach this workspace
 * from an AI client over MCP: its address, where a token is made, and what to
 * paste into each of the usual clients.
 *
 * The address is this server's own, as the browser reached it, and this
 * workspace's: the one thing that is different on every installation, and the
 * thing somebody setting it up would otherwise have to work out from the
 * manual. The token is left for them to put in - the interface never holds one
 * it could print.
 */
export function McpConnect({ workspacePath, admin = false, connected, compact = false, asLink = false }: McpConnectProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState(CLIENTS[0].key);
  const workspaceId = workspacePath?.split('/').filter(Boolean)[1];
  const { hintFor, hint } = useHoverHint();

  useEffect(() => {
    const shown = ref.current;
    if (shown === null) return;
    if (open && !shown.open) shown.showModal();
    else if (!open && shown.open) shown.close();
  }, [open]);

  if (workspaceId === undefined) return null;

  const address = `${window.location.origin}/mcp/${workspaceId}`;
  const client = CLIENTS.find((one) => one.key === chosen) ?? CLIENTS[0];
  const pasted = client.text(address);
  const coloured = highlighted(pasted, client.language);

  return (
    <>
      {asLink ? (
        <button
          type="button"
          className={styles.inlineLink}
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          data-testid="mcp-connect-link"
        >
          {t('How to connect an AI client')}
        </button>
      ) : (
      <>
      <button
        type="button"
        className={compact ? `${styles.launcher} ${indicators.compact}` : styles.launcher}
        onClick={() => setOpen(true)}
        {...hintFor(connected === true
          ? t('An AI client of yours is connected to Orknux MCP. Press to connect another, or to this workspace.')
          : t('Use this workspace from an AI client, over MCP'))}
        data-connected={connected === undefined ? undefined : String(connected)}
        aria-haspopup="dialog"
        data-testid="mcp-connect"
      >
        {/* The Orknux mark in its own colours, as in the top bar: this is Orknux, reached from somewhere else. */}
        <OrknuxMark width={16} height={14} />
        {/* The product's name and the protocol's, the same in every language. */}
        Orknux MCP
        {connected !== undefined && <Light on={connected} />}
      </button>
      {hint}
      </>
      )}

      <dialog
        ref={ref}
        className={`${dialog.dialog} ${styles.dialog}`}
        onCancel={() => setOpen(false)}
        onClose={() => setOpen(false)}
        aria-labelledby="mcp-connect-title"
        data-testid="mcp-connect-dialog"
      >
        {open && (
          <div className={dialog.body}>
            <header className={dialog.header}>
              <h2 className={dialog.title} id="mcp-connect-title">
                {t('Use this workspace from an AI client')}
              </h2>
            </header>

            <p className={styles.lead}>
              {t('Orknux serves this workspace over MCP, so an AI client can read and work on its workflows, runs, agents, issues, documents and diagrams. What it may see and change is what you may, as you.')}
            </p>

            <section className={styles.part}>
              <span className={styles.step}>{t("The workspace's MCP address")}</span>
              <span className={styles.row}>
                <code className={styles.code} data-testid="mcp-connect-address">
                  {address}
                </code>
                <CopyButton text={address} label={t('Copy the MCP address')} testId="mcp-connect-copy-address" />
              </span>
            </section>

            <section className={styles.part}>
              <span className={styles.step}>{t('An access token')}</span>
              <span className={styles.note}>
                {t('Make one under')}{' '}
                <Link to="/preferences" onClick={() => setOpen(false)}>
                  {t('Preferences › Your tokens')}
                </Link>
                {t('. It is you by another door: it carries your roles and nothing more.')}
              </span>
              {/*
                A directory account has no tokens of its own to make, so somebody
                reading this needs to know who does it and where - and an
                administrator reading it needs the way there.
              */}
              <span className={styles.note} data-testid="mcp-connect-directory">
                {t('A directory account cannot make its own. An administrator makes it under')}{' '}
                {admin ? (
                  <Link to="/admin/users" onClick={() => setOpen(false)} data-testid="mcp-connect-admin-users">
                    {t('Admin › Users')}
                  </Link>
                ) : (
                  <strong>{t('Admin › Users')}</strong>
                )}
                {t(': open the person, then Access Tokens, and hand them the token.')}
              </span>
            </section>

            <section className={styles.part}>
              <span className={styles.step}>{t('Your client')}</span>
              <div className={styles.tabs} role="tablist" aria-label={t('Your client')}>
                {CLIENTS.map((one) => (
                  <button
                    key={one.key}
                    type="button"
                    role="tab"
                    aria-selected={one.key === client.key}
                    className={one.key === client.key ? `${styles.tab} ${styles.tabOn}` : styles.tab}
                    onClick={() => setChosen(one.key)}
                    data-testid={`mcp-connect-client-${one.key}`}
                  >
                    {/* A product's own name stays as it is, in every language. */}
                    {one.key === 'other' ? t('Other') : one.name}
                  </button>
                ))}
              </div>
              <span className={styles.note} role="tabpanel">
                {client.where()}
              </span>
              <span className={styles.row}>
                {coloured === null ? (
                  <pre className={styles.code} data-testid="mcp-connect-pasted">
                    {pasted}
                  </pre>
                ) : (
                  <pre
                    className={styles.code}
                    data-testid="mcp-connect-pasted"
                    data-language={client.language}
                    dangerouslySetInnerHTML={{ __html: coloured }}
                  />
                )}
                <CopyButton text={pasted} label={t('Copy it')} testId="mcp-connect-copy" />
              </span>
            </section>

            <div className={dialog.actions}>
              <button type="button" className={dialog.ghost} onClick={() => setOpen(false)} autoFocus>
                {t('Close')}
              </button>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
