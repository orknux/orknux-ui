import { useEffect, useRef, useState } from 'react';
import { fetchChatEffort, setChatReasoningEffort } from '../../api/chat';
import type { ChatEffort as Effort } from '../../api/chat';
import { effortLabel } from '../../components/ModelForm';
import { t, tf } from '../../i18n';
import brainIcon from '../../assets/brain.svg';
import styles from './ChatEffort.module.css';

interface Props {
  chatId: string;
  /**
   * What answers the chat - its agent and model - so the levels are asked
   * again when that changes: another model may take other words, or none.
   */
  answeredBy: string;
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
export function ChatEffort({ chatId, answeredBy }: Props) {
  const [effort, setEffort] = useState<Effort | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const holder = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let live = true;
    setOpen(false);
    fetchChatEffort(chatId)
      .then((found) => {
        if (live) setEffort(found);
      })
      // A chat whose effort cannot be read draws no control, which is what a model taking none looks like too.
      .catch(() => {
        if (live) setEffort(null);
      });
    return () => {
      live = false;
    };
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
        className={chosen === null ? styles.pill : `${styles.pill} ${styles.pillSet}`}
        onClick={() => setOpen((was) => !was)}
        disabled={saving}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={tf('Reasoning effort: {level}', { level: shown })}
        title={tf('Reasoning effort: {level}', { level: shown })}
        data-testid="chat-effort"
      >
        <img src={brainIcon} alt="" width={14} height={14} />
        {chosen !== null && <span className={styles.pillLabel}>{shown}</span>}
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
