import { useEffect, useRef, useState } from 'react';

import { ClientPairingButton } from './ClientPairing';
import { CopyButton } from './CopyButton';
import dialog from './Dialog.module.css';
import styles from './McpConnect.module.css';
import { t, tf } from '../i18n';

/** Which commands to show first: the ones for the machine this page is read on. */
function onWindows(): boolean {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  return nav.userAgentData?.platform === 'Windows' || /Windows/.test(nav.userAgent);
}

function Command({ text, label, testId }: { text: string; label: string; testId?: string }) {
  return (
    <span className={styles.row}>
      <pre className={styles.code} data-testid={testId}>
        {text}
      </pre>
      <CopyButton text={text} label={label} />
    </span>
  );
}

export interface ClaudeCodeGuideProps {
  open: boolean;
  onClose: () => void;
  /** Whether the person's Claude Code is connected now, which the guide says at its top. */
  connected: boolean;
  /** No longer read: a pairing link works for every account, so nobody is sent to an administrator for a token. Kept so callers need not change. */
  admin?: boolean;
}

/**
 * How to connect the Orknux channel plugin for Claude Code, step by step,
 * filled in for this server: its address in the configure command, the way to
 * a token, and the commands for the machine the page is read on. Opened from
 * the corner's Claude Code indicator.
 *
 * The last part is what to do when it does not connect, in the order that
 * finds the cause: run the plugin by hand, which separates the plugin, Bun,
 * the token and the network from Claude Code starting it.
 */
export function ClaudeCodeGuide({ open, onClose, connected }: ClaudeCodeGuideProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [windows, setWindows] = useState(onWindows);

  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  const server = window.location.origin;
  const install = windows ? 'powershell -c "irm bun.sh/install.ps1 | iex"' : 'curl -fsSL https://bun.sh/install | bash';
  const start = 'claude --dangerously-load-development-channels plugin:orknux@orknux';
  // Whichever version is installed: the folder is named after it.
  const byHand = windows
    ? 'bun (Get-ChildItem "$HOME\\.claude\\plugins\\cache\\orknux\\orknux\\*\\dist\\server.js" | Select-Object -Last 1).FullName'
    : 'bun "$(ls -d ~/.claude/plugins/cache/orknux/orknux/*/dist/server.js | tail -1)"';

  return (
    <dialog
      ref={ref}
      className={`${dialog.dialog} ${styles.dialog}`}
      onCancel={onClose}
      onClose={onClose}
      aria-labelledby="claude-code-guide-title"
      data-testid="claude-code-guide"
    >
      {open && (
        <div className={dialog.body}>
          <header className={dialog.header}>
            <h2 className={dialog.title} id="claude-code-guide-title">
              {t('Connect your Claude Code')}
            </h2>
          </header>

          <p className={styles.lead}>
            {connected
              ? t('Your Claude Code is connected. Pick My Claude Code in a chat, in the assistant of a document, diagram, wireframe or sheet, or in Ask AI.')
              : t('The Orknux plugin for Claude Code lets you talk to your own Claude Code from Orknux. Claude Code does the work on your computer, signed in as you; Orknux only carries the messages. Set it up once, on the computer Claude Code runs on.')}
          </p>

          <div className={styles.tabs} role="tablist" aria-label={t('Your computer')}>
            {[true, false].map((one) => (
              <button
                key={String(one)}
                type="button"
                role="tab"
                aria-selected={one === windows}
                className={one === windows ? `${styles.tab} ${styles.tabOn}` : styles.tab}
                onClick={() => setWindows(one)}
              >
                {/* Products' own names, the same in every language. */}
                {one ? 'Windows' : 'macOS, Linux'}
              </button>
            ))}
          </div>

          <section className={styles.part}>
            <span className={styles.step}>{t('1. Install Bun')}</span>
            <span className={styles.note}>
              {t('The plugin runs on Bun, as Anthropic’s own channel plugins do. Afterwards open a new terminal, which is the one that finds it - an ordinary one, not as administrator.')}
            </span>
            <Command text={install} label={t('Copy it')} />
          </section>

          <section className={styles.part}>
            <span className={styles.step}>{t('2. Add the plugin to Claude Code')}</span>
            <span className={styles.note}>{t('In Claude Code:')}</span>
            <Command text={'/plugin marketplace add orknux/orknux-claude\n/plugin install orknux@orknux'} label={t('Copy it')} />
          </section>

          <section className={styles.part}>
            <span className={styles.step}>{t('3. Start Claude Code with the channel')}</span>
            <span className={styles.note}>
              {t('Channels are a research preview, and until this one is on Anthropic’s approved list it is started with the development flag. Confirm the warning Claude Code shows.')}
            </span>
            <Command text={start} label={t('Copy it')} testId="claude-code-guide-start" />
          </section>

          <section className={styles.part}>
            <span className={styles.step}>{t('4. Connect it')}</span>
            <span className={styles.note}>
              {t('Make a pairing link and paste what is shown into Claude Code. It connects at once, as you, with no restart. It works for every account, a directory one too.')}
            </span>
            <ClientPairingButton forClaudeCode />
            <span className={styles.note}>
              {t('Within half a minute the light beside Claude Code in this corner turns green. In Claude Code, /mcp lists plugin:orknux:orknux with a tick.')}
            </span>
          </section>

          <section className={styles.part}>
            <span className={styles.step}>{t('If it does not connect')}</span>
            <span className={styles.note}>
              {t('Run the plugin by hand in a terminal. If it stays silent and the light beside Claude Code turns green, the plugin, Bun, the token and the network all work, and Claude Code is not starting it: start Claude Code from that same terminal. If it prints something, that is the cause.')}
            </span>
            <Command text={byHand} label={t('Copy it')} />
            <span className={styles.note}>
              {t('Most often /mcp shows plugin:orknux:orknux failed because Claude Code cannot find Bun: it was started from a terminal or an IDE that was open before Bun was installed, and new tabs inherit the old path. Close every window of it, or add Bun to the path where you start Claude Code:')}
            </span>
            <Command text={windows ? `$env:Path += ";$HOME\\.bun\\bin"\n${start}` : `export PATH="$HOME/.bun/bin:$PATH"\n${start}`} label={t('Copy it')} />
            <span className={styles.note}>
              {t('Stop it with Ctrl+C before you chat: while it runs with no Claude Code attached, it takes your messages and nobody answers them. In Claude Code, /mcp shows why plugin:orknux:orknux failed when you select it and press Enter.')}
            </span>
          </section>

          <p className={styles.note}>
            {tf('This server: {server}', { server })}
          </p>

          <div className={dialog.actions}>
            <button type="button" className={dialog.ghost} onClick={onClose} autoFocus>
              {t('Close')}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
