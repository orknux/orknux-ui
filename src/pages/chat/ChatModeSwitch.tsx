import { useState } from 'react';
import { setChatMode, type ChatMode, type ChatSession } from '../../api/chat';
import { Select } from '../../components/Select';
import { t } from '../../i18n';
import styles from './ChatModeSwitch.module.css';

interface ChatModeSwitchProps {
  chat: ChatSession;
  /** The chat as the server answered it, so the caller can keep its list in step. */
  onChanged: (chat: ChatSession) => void;
}

const MODES: ChatMode[] = ['DEFAULT', 'PLAN', 'AUTO'];

function labelOf(mode: ChatMode): string {
  return mode === 'PLAN' ? t('Plan') : mode === 'AUTO' ? t('Auto') : t('Default');
}

/** What the chosen mode means, in a line, for the hover - never in the option itself. */
function hintOf(mode: ChatMode): string {
  return mode === 'PLAN'
    ? t('Only looks, then asks you to approve a plan')
    : mode === 'AUTO'
      ? t('Goes ahead without waiting for you to allow a step')
      : t('Asks you where a tool needs your leave');
}

/**
 * How the agent works in this chat, beside the composer's other controls.
 * Issue #653. Changed at once and confirmed by the server, as the pin is; a
 * refusal puts it back.
 *
 * The application's own `Select`, not a native one: the operating system
 * draws a native select's list outside the theme. `Select` opens above the
 * button when the room is there, which at the foot of the window it is, and
 * shows each row's one-line hint beside the row the pointer or the arrows are on.
 */
export function ChatModeSwitch({ chat, onChanged }: ChatModeSwitchProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(mode: ChatMode) {
    if (mode === chat.mode) return;
    setBusy(true);
    setError(null);
    onChanged({ ...chat, mode });
    try {
      onChanged(await setChatMode(chat.id, mode));
    } catch (cause) {
      onChanged(chat);
      setError(cause instanceof Error ? cause.message : t('Could not change the mode.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className={styles.wrap}>
      <Select
        className={chat.mode === 'DEFAULT' ? styles.select : `${styles.select} ${styles.active}`}
        value={chat.mode}
        disabled={busy}
        onChange={(mode) => void choose(mode as ChatMode)}
        aria-label={t('Mode')}
        title={error ?? hintOf(chat.mode)}
        data-testid="chat-mode"
        data-chat-mode={chat.mode}
      >
        {MODES.map((mode) => (
          <option key={mode} value={mode} data-hint={hintOf(mode)}>
            {labelOf(mode)}
          </option>
        ))}
      </Select>
    </span>
  );
}
