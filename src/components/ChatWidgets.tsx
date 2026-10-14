import { useEffect, useRef, useState } from 'react';
import flagIcon from '../assets/flag.svg';
import pauseIcon from '../assets/pause.svg';
import playIcon from '../assets/play.svg';
import resetIcon from '../assets/rotate-cw.svg';
import removeIcon from '../assets/trash-2.svg';
import type { ChatWidget } from '../api/widgets';
import { t } from '../i18n';
import styles from './ChatWidgets.module.css';

interface ChatWidgetsProps {
  widgets: ChatWidget[];
  /** `pause`, `resume`, `reset` or `lap` pressed on one. */
  onAct: (widget: ChatWidget, action: string) => void;
  onRemove: (widget: ChatWidget) => void;
  /** Whether a timer sounds when it ends, where its agent made no choice for it: the workspace's setting. */
  soundByDefault?: boolean;
}

/**
 * Three short tones, made here rather than played from a file: a sound the
 * page synthesises cannot fail to load, and needs no asset in the bundle. A
 * browser that refuses audio before the person has touched the page is left
 * to refuse - the timer still shows it ended.
 */
function chime() {
  try {
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Context === undefined) return;
    const audio = new Context();
    const start = audio.currentTime + 0.05;
    for (let at = 0; at < 3; at += 1) {
      const tone = audio.createOscillator();
      const level = audio.createGain();
      tone.type = 'sine';
      tone.frequency.value = 880;
      const from = start + at * 0.35;
      level.gain.setValueAtTime(0.0001, from);
      level.gain.exponentialRampToValueAtTime(0.3, from + 0.02);
      level.gain.exponentialRampToValueAtTime(0.0001, from + 0.25);
      tone.connect(level).connect(audio.destination);
      tone.start(from);
      tone.stop(from + 0.3);
    }
    window.setTimeout(() => void audio.close().catch(() => undefined), 1_500);
  } catch {
    // No sound is not worth failing a page over.
  }
}

/** 75 -> "1:15", 3725 -> "1:02:05". */
export function clock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
}

/**
 * The widgets an agent keeps in this chat, in a row above the composer.
 *
 * Ticked here, from the moments the server gave - when a timer ends, when a
 * stopwatch started - rather than by asking the server every second. The
 * browser's clock is corrected by how far it was from the server's when the
 * widgets were read (`asOf`), so a laptop a minute fast does not show a minute
 * gone that is not.
 */
export function ChatWidgets({ widgets, onAct, onRemove, soundByDefault = true }: ChatWidgetsProps) {
  const [now, setNow] = useState(() => Date.now());
  const anyRunning = widgets.some((one) => one.running);
  useEffect(() => {
    if (!anyRunning) return;
    const tick = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(tick);
  }, [anyRunning]);
  // When these widgets were read, by both clocks: the difference is how far the browser's is off.
  const [readAt] = useState(() => new Map<string, number>());

  /*
   * A timer sounds when it is seen to reach nought: running on one tick, done
   * on the next. Not one that was already done when the page opened - that
   * ended while nobody was looking, and a chime on every visit would be noise.
   * Whether it sounds is the agent's choice for that timer where it made one
   * (only when the person asked), and the workspace's otherwise.
   */
  const counting = useRef(new Set<string>());
  useEffect(() => {
    const seen = new Set<string>();
    for (const widget of widgets) {
      if (widget.kind !== 'TIMER') continue;
      const key = widget.id;
      const left = widget.endsAt === null ? (widget.remainingSeconds ?? 0) : Date.parse(widget.endsAt) - (now + (Date.parse(widget.asOf) - (readAt.get(`${widget.id}:${widget.asOf}`) ?? now)));
      const runningNow = widget.endsAt !== null && left > 0;
      if (runningNow) seen.add(key);
      else if (widget.endsAt !== null && counting.current.has(key) && (widget.sound ?? soundByDefault)) chime();
    }
    counting.current = seen;
  }, [now, widgets, soundByDefault, readAt]);

  if (widgets.length === 0) return null;
  return (
    <div className={styles.row} data-chat-widgets="">
      {widgets.map((widget) => {
        const key = `${widget.id}:${widget.asOf}`;
        if (!readAt.has(key)) readAt.set(key, Date.now());
        const skew = Date.parse(widget.asOf) - (readAt.get(key) ?? Date.now());
        const serverNow = now + skew;
        const timer = widget.kind === 'TIMER';
        const remaining = timer
          ? widget.endsAt !== null
            ? Math.max(0, Math.ceil((Date.parse(widget.endsAt) - serverNow) / 1000))
            : (widget.remainingSeconds ?? 0)
          : 0;
        const elapsedMillis = timer
          ? 0
          : (widget.accumulatedMillis ?? 0) + (widget.startedAt !== null ? Math.max(0, serverNow - Date.parse(widget.startedAt)) : 0);
        const running = timer ? widget.endsAt !== null && remaining > 0 : widget.startedAt !== null;
        const done = timer && remaining <= 0;
        const shown = timer ? clock(remaining) : clock(elapsedMillis / 1000);
        const share = timer && widget.durationSeconds ? remaining / widget.durationSeconds : null;
        const laps = widget.laps ?? [];
        return (
          <div
            key={widget.id}
            className={`${styles.card} ${done ? styles.done : ''}`}
            data-chat-widget={widget.id}
            data-widget-kind={widget.kind}
            data-widget-running={running ? 'true' : 'false'}
            data-widget-sound={timer ? ((widget.sound ?? soundByDefault) ? 'on' : 'off') : undefined}
            title={laps.length > 0 ? laps.map((lap, at) => `${t('Lap')} ${at + 1}: ${clock(lap / 1000)}`).join('\n') : undefined}
          >
            <div className={styles.top}>
              <span className={styles.label}>{widget.label}</span>
              <span className={styles.actions}>
                <button
                  type="button"
                  className={styles.action}
                  onClick={() => onAct(widget, running ? 'pause' : 'resume')}
                  disabled={done}
                  aria-label={running ? t('Pause') : t('Resume')}
                  title={running ? t('Pause') : t('Resume')}
                >
                  <img src={running ? pauseIcon : playIcon} alt="" />
                </button>
                {!timer && (
                  <button type="button" className={styles.action} onClick={() => onAct(widget, 'lap')} aria-label={t('Lap')} title={t('Lap')}>
                    <img src={flagIcon} alt="" />
                  </button>
                )}
                <button type="button" className={styles.action} onClick={() => onAct(widget, 'reset')} aria-label={t('Reset')} title={t('Reset')}>
                  <img src={resetIcon} alt="" />
                </button>
                <button type="button" className={styles.action} onClick={() => onRemove(widget)} aria-label={t('Remove')} title={t('Remove')}>
                  <img src={removeIcon} alt="" />
                </button>
              </span>
            </div>
            <span className={styles.digits} data-widget-digits="">
              {shown}
            </span>
            {share !== null && (
              <span className={styles.bar} aria-hidden="true">
                <span className={styles.fill} style={{ width: `${Math.round(share * 100)}%` }} />
              </span>
            )}
            {!timer && laps.length > 0 && (
              <span className={styles.laps} data-widget-laps="">
                {laps.length === 1 ? t('1 lap') : `${laps.length} ${t('laps')}`}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
