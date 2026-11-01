import { useEffect, useRef, useState } from 'react';
import { fetchChatEffort, setChatReasoningEffort } from '../../api/chat';
import type { ChatEffort as Effort } from '../../api/chat';
import { effortLabel } from '../../components/ModelForm';
import { t, tf } from '../../i18n';
import chevronIcon from '../../assets/chevron-down.svg';
import styles from './ChatEffort.module.css';

interface Props {
  chatId: string;
  /**
   * What answers the chat - its agent and model - so the levels are asked
   * again when that changes: another model may take other words, or none.
   */
  answeredBy: string;
  /** Nothing has been said in it yet, so it starts on the level last chosen. */
  fresh: boolean;
}

/** On this machine, as the theme is: the last level picked here, which a new chat starts on. */
const REMEMBERED = 'orknux.chat.effort';

function remembered(): string | null {
  try {
    return window.localStorage.getItem(REMEMBERED);
  } catch {
    return null;
  }
}

function remember(level: string | null) {
  try {
    if (level === null) window.localStorage.removeItem(REMEMBERED);
    else window.localStorage.setItem(REMEMBERED, level);
  } catch {
    // Not remembered, which costs a click on the next chat and nothing else.
  }
}

/**
 * How hard the chat's model thinks, chosen beside the microphone. Issue #654.
 *
 * The chat's own setting, not the model's: unset is "Model default", and a
 * pick changes only this chat's next turns. Drawn only where the model
 * answering takes an effort at all, and offering only the words it takes - the
 * server answers both from the same rule the model page is drawn from, so the
 * two cannot disagree.
 *
 * Its own component and its own fetch rather than more fields on the chat the
 * page already holds: the levels are read off the model's provider, which the
 * sidebar's list of every chat has no use for.
 */
export function ChatEffort({ chatId, answeredBy, fresh }: Props) {
  const [effort, setEffort] = useState<Effort | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const holder = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let live = true;
    setOpen(false);
    fetchChatEffort(chatId)
      .then(async (found) => {
        const wanted = remembered();
        // Only where the model takes that word; another model keeps its default and the word stays remembered.
        const starts = fresh && found !== null && found.reasoningEffort === null && wanted !== null && found.reasoningEfforts.includes(wanted);
        const held = starts ? await setChatReasoningEffort(chatId, wanted).catch(() => found) : found;
        if (live) setEffort(held);
      })
      // A chat whose effort cannot be read draws no control, which is what a model taking none looks like too.
      .catch(() => {
        if (live) setEffort(null);
      });
    return () => {
      live = false;
    };
    // `fresh` is left out: it goes false with the first message, which is no reason to ask again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, answeredBy]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!holder.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (effort === null || effort.reasoningEfforts.length === 0) return null;

  const chosen = effort.reasoningEffort;
  const shown = chosen === null ? t('Model default') : effortLabel(chosen);

  async function choose(level: string | null) {
    setOpen(false);
    remember(level);
    if (level === chosen) return;
    setSaving(true);
    try {
      setEffort(await setChatReasoningEffort(chatId, level));
    } catch {
      // Whatever the server holds is what is drawn; a refusal leaves the old choice showing.
      setEffort(await fetchChatEffort(chatId).catch(() => effort));
    } finally {
      setSaving(false);
    }
  }

  return (
    <span ref={holder} className={styles.holder}>
      <button
        type="button"
        className={styles.pill}
        onClick={() => setOpen((was) => !was)}
        disabled={saving}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={tf('Reasoning effort: {level}', { level: shown })}
        title={tf('Reasoning effort: {level}', { level: shown })}
        data-testid="chat-effort"
      >
        <span className={styles.pillLabel}>{shown}</span>
        <img src={chevronIcon} alt="" width={12} height={12} />
      </button>
      {open && (
        <span className={styles.menu} role="menu" aria-label={t('Reasoning effort')} data-testid="chat-effort-menu">
          {[null, ...effort.reasoningEfforts].map((level) => (
            <button
              key={level ?? ''}
              type="button"
              role="menuitemradio"
              aria-checked={level === chosen}
              className={level === chosen ? `${styles.option} ${styles.optionOn}` : styles.option}
              onClick={() => void choose(level)}
              data-effort={level ?? ''}
            >
              {level === null ? t('Model default') : effortLabel(level)}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
