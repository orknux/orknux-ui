import { useEffect, useState } from 'react';

import {
  fetchWatcherSettings,
  setWatcherMaxPerAgent,
  setWatcherMaxSeconds,
  looksWithin,
  setWatcherLookBackoff,
  setWatcherMinAgentCheckSeconds,
  setWatcherMinIntervalSeconds,
} from '../../api/watchers';
import type { LookBackoff, WatcherSettings } from '../../api/watchers';
import { FieldHint } from '../../components/FieldHint';
import { t, tf } from '../../i18n';
import page from './AdminSettingsPage.module.css';
import type { PendingWrite } from './LogLevelsSection';

export interface WatchersSectionProps {
  /** Told which of the numbers differ from the server's, so the page's Save can send them. */
  onPending: (writes: PendingWrite[]) => void;
  /** While the page is saving, so the boxes are not typed into mid-save. */
  busy?: boolean;
}

/**
 * Admin -> Settings -> Watchers. Issue #606.
 *
 * The numbers bounding what an agent may ask a watcher to do: how long one
 * may run, how often it may call its tool, how often it may wake the agent to
 * look at the result itself (#618), how those looks back off where the agent
 * gave no spacing, and how many one agent may have running. Under the backoff,
 * what it would do to a few watcher lengths, worked out as it is typed.
 * They go out with the page's one Save, like its other numbers.
 */
export function WatchersSection({ onPending, busy = false }: WatchersSectionProps) {
  const [held, setHeld] = useState<WatcherSettings | null>(null);
  const [maxSeconds, setMaxSeconds] = useState('');
  const [minInterval, setMinInterval] = useState('');
  const [perAgent, setPerAgent] = useState('');
  const [agentCheck, setAgentCheck] = useState('');
  const [lookInitial, setLookInitial] = useState('');
  const [lookMultiplier, setLookMultiplier] = useState('');
  const [lookMax, setLookMax] = useState('');
  const [error, setError] = useState<string | null>(null);

  function hold(settings: WatcherSettings) {
    setHeld(settings);
    setMaxSeconds(String(settings.maxSeconds));
    setMinInterval(String(settings.minIntervalSeconds));
    setPerAgent(String(settings.maxPerAgent));
    setAgentCheck(String(settings.minAgentCheckSeconds));
    setLookInitial(String(settings.lookBackoff.initialSeconds));
    setLookMultiplier(String(settings.lookBackoff.multiplier));
    setLookMax(String(settings.lookBackoff.maxSeconds));
  }

  useEffect(() => {
    let abandoned = false;
    fetchWatcherSettings()
      .then((settings) => {
        if (!abandoned) hold(settings);
      })
      .catch((cause: unknown) => {
        if (!abandoned) setError(cause instanceof Error ? cause.message : t('Could not read the watcher settings.'));
      });
    return () => {
      abandoned = true;
    };
  }, []);

  useEffect(() => {
    if (held === null) {
      onPending([]);
      return;
    }
    const writes: PendingWrite[] = [];
    const changed = (typed: string, stored: number, write: (value: number) => Promise<WatcherSettings>) => {
      if (typed.trim() === '' || Number(typed) === stored) return;
      const value = Number(typed);
      writes.push(async () => {
        setError(null);
        try {
          hold(await write(value));
        } catch (cause: unknown) {
          setError(cause instanceof Error ? cause.message : t('That could not be saved.'));
          throw cause;
        }
      });
    };
    changed(maxSeconds, held.maxSeconds, setWatcherMaxSeconds);
    changed(minInterval, held.minIntervalSeconds, setWatcherMinIntervalSeconds);
    changed(perAgent, held.maxPerAgent, setWatcherMaxPerAgent);
    changed(agentCheck, held.minAgentCheckSeconds, setWatcherMinAgentCheckSeconds);
    const backoff = typedBackoff(lookInitial, lookMultiplier, lookMax);
    const stored = held.lookBackoff;
    if (
      backoff !== null &&
      (backoff.initialSeconds !== stored.initialSeconds || backoff.multiplier !== stored.multiplier || backoff.maxSeconds !== stored.maxSeconds)
    ) {
      // One write for all three: the ceiling is only valid against the initial delay.
      writes.push(async () => {
        setError(null);
        try {
          hold(await setWatcherLookBackoff(backoff));
        } catch (cause: unknown) {
          setError(cause instanceof Error ? cause.message : t('That could not be saved.'));
          throw cause;
        }
      });
    }
    onPending(writes);
  }, [held, maxSeconds, minInterval, perAgent, agentCheck, lookInitial, lookMultiplier, lookMax, onPending]);

  const simulated = typedBackoff(lookInitial, lookMultiplier, lookMax);
  const floor = Number(agentCheck) > 0 ? Number(agentCheck) : 0;

  return (
    <>
      <h2 id="watchers" className={page.sectionHeading}>
        {t('Watchers')}
      </h2>

      {error !== null && (
        <p className={`${page.notice} ${page.noticeError}`} role="alert">
          {error}
        </p>
      )}

      <div className={page.setting}>
        <div className={page.settingText}>
          <span className={page.labelWithHint}>
            <p className={page.settingLabel}>{t('The longest a watcher may run')}</p>
            <FieldHint label={t('The longest a watcher may run')}>
              {t('A watcher is one of the tools an agent holds, called on an interval until what it returns matches a condition, when the agent is woken. This is the most an agent may ask one to keep looking for; it is fixed when the watcher is set, so lowering it does not end the ones already running. Between 60 seconds and a year.')}
            </FieldHint>
          </span>
        </div>
        <div className={page.retention}>
          <input
            id="watcher-max-seconds"
            name="watcherMaxSeconds"
            className={page.input}
            type="number"
            min={60}
            max={31536000}
            value={maxSeconds}
            onChange={(event) => setMaxSeconds(event.target.value)}
            disabled={busy || held === null}
            aria-label={t('The longest a watcher may run')}
          />
          <span className={page.retentionUnit}>{t('seconds')}</span>
        </div>
      </div>

      <div className={page.setting}>
        <div className={page.settingText}>
          <span className={page.labelWithHint}>
            <p className={page.settingLabel}>{t('The shortest interval between two checks')}</p>
            <FieldHint label={t('The shortest interval between two checks')}>
              {t('Every check calls the tool, so this bounds how hard a watcher may lean on whatever the tool reaches. Watchers are looked at on the tick of the scheduler, ten seconds unless the operator changed it, so an interval shorter than that is not kept exactly. Between 1 second and a day.')}
            </FieldHint>
          </span>
        </div>
        <div className={page.retention}>
          <input
            id="watcher-min-interval"
            name="watcherMinIntervalSeconds"
            className={page.input}
            type="number"
            min={1}
            max={86400}
            value={minInterval}
            onChange={(event) => setMinInterval(event.target.value)}
            disabled={busy || held === null}
            aria-label={t('The shortest interval between two checks')}
          />
          <span className={page.retentionUnit}>{t('seconds')}</span>
        </div>
      </div>

      <div className={page.setting}>
        <div className={page.settingText}>
          <span className={page.labelWithHint}>
            <p className={page.settingLabel}>{t('The shortest interval between two looks by the agent')}</p>
            <FieldHint label={t('The shortest interval between two looks by the agent')}>
              {t('Each look wakes the agent for a turn of its own, to judge the latest result itself and change or end the watcher - so this bounds what one watcher may spend on a model. An agent can also ask for no shorter than its own interval between checks. Between 1 second and a year.')}
            </FieldHint>
          </span>
        </div>
        <div className={page.retention}>
          <input
            id="watcher-min-agent-check"
            name="watcherMinAgentCheckSeconds"
            className={page.input}
            type="number"
            min={1}
            max={31536000}
            value={agentCheck}
            onChange={(event) => setAgentCheck(event.target.value)}
            disabled={busy || held === null}
            aria-label={t('The shortest interval between two looks by the agent')}
          />
          <span className={page.retentionUnit}>{t('seconds')}</span>
        </div>
      </div>

      <section className={page.settingGroup} aria-labelledby="watcher-looks" data-testid="watcher-looks">
        <span className={page.labelWithHint}>
          <p className={page.settingLabel} id="watcher-looks">{t('Agent\'s watcher looks')}</p>
          <FieldHint label={t('Agent\'s watcher looks')}>
            {t('Where the agent gave no agent check, its looks back off exponentially: the first after the first delay, each wait after that the last one times the multiplier, never longer than the longest wait.')}
          </FieldHint>
        </span>

        <div className={page.setting}>
          <div className={page.settingText}>
            <span className={page.labelWithHint}>
              <p className={page.settingLabel}>{t('First look after')}</p>
              <FieldHint label={t('First look after')}>{t('Between 60 seconds and a week.')}</FieldHint>
            </span>
          </div>
          <div className={page.retention}>
            <input
              id="watcher-look-initial"
              name="watcherLookInitialSeconds"
              className={page.input}
              type="number"
              min={60}
              max={604800}
              value={lookInitial}
              onChange={(event) => setLookInitial(event.target.value)}
              disabled={busy || held === null}
              aria-label={t('First look after')}
            />
            <span className={page.retentionUnit}>{t('seconds')}</span>
          </div>
        </div>

        <div className={page.setting}>
          <div className={page.settingText}>
            <span className={page.labelWithHint}>
              <p className={page.settingLabel}>{t('Each wait multiplied by')}</p>
              <FieldHint label={t('Each wait multiplied by')}>
                {t('2 doubles every wait; 1 keeps the first delay as a fixed interval. Between 1 and 10.')}
              </FieldHint>
            </span>
          </div>
          <div className={page.retention}>
            <input
              id="watcher-look-multiplier"
              name="watcherLookMultiplier"
              className={page.input}
              type="number"
              min={1}
              max={10}
              step={0.1}
              value={lookMultiplier}
              onChange={(event) => setLookMultiplier(event.target.value)}
              disabled={busy || held === null}
              aria-label={t('Each wait multiplied by')}
            />
          </div>
        </div>

        <div className={page.setting}>
          <div className={page.settingText}>
            <span className={page.labelWithHint}>
              <p className={page.settingLabel}>{t('Longest wait')}</p>
              <FieldHint label={t('Longest wait')}>
                {t('Once a wait reaches this it stops growing, so a week-long watcher is still looked at. At least the first delay, and at most a year.')}
              </FieldHint>
            </span>
          </div>
          <div className={page.retention}>
            <input
              id="watcher-look-max"
              name="watcherLookMaxSeconds"
              className={page.input}
              type="number"
              min={60}
              max={31536000}
              value={lookMax}
              onChange={(event) => setLookMax(event.target.value)}
              disabled={busy || held === null}
              aria-label={t('Longest wait')}
            />
            <span className={page.retentionUnit}>{t('seconds')}</span>
          </div>
        </div>

        <div className={page.setting} data-testid="watcher-look-simulation">
          <div className={page.settingText}>
            <p className={page.settingLabel}>{t('When the agent would look')}</p>
            {simulated === null ? (
              <p className={page.settingNote}>{t('Not a backoff: the first delay must be 60 seconds or more, the multiplier 1 to 10, and the longest wait at least the first delay.')}</p>
            ) : (
              SIMULATED_LENGTHS.map((length) => (
                <p key={length} className={page.settingNote} data-testid="watcher-look-simulated">
                  {simulatedLine(length, looksWithin(simulated, length, floor))}
                </p>
              ))
            )}
          </div>
        </div>
      </section>

      <div className={page.setting}>
        <div className={page.settingText}>
          <span className={page.labelWithHint}>
            <p className={page.settingLabel}>{t('How many watchers one agent may have running')}</p>
            <FieldHint label={t('How many watchers one agent may have running')}>
              {t('Counted across every conversation of that agent. An agent at the limit is told to finish one first. Zero switches watchers off, and agents are then not offered the tools at all. Between 0 and 1000.')}
            </FieldHint>
          </span>
        </div>
        <div className={page.retention}>
          <input
            id="watcher-max-per-agent"
            name="watcherMaxPerAgent"
            className={page.input}
            type="number"
            min={0}
            max={1000}
            value={perAgent}
            onChange={(event) => setPerAgent(event.target.value)}
            disabled={busy || held === null}
            aria-label={t('How many watchers one agent may have running')}
          />
        </div>
      </div>
    </>
  );
}

/** The watcher lengths the backoff is shown against: short to the week a watcher may run by default. */
const SIMULATED_LENGTHS = [10 * 60, 30 * 60, 60 * 60, 4 * 60 * 60, 24 * 60 * 60, 7 * 24 * 60 * 60];

/** The most look times one line names; the rest are counted. */
const SHOWN_LOOKS = 8;

/** The three boxes as a backoff, or null where they do not make one - the server's LookBackoff.problem. */
function typedBackoff(initial: string, multiplier: string, max: string): LookBackoff | null {
  if (initial.trim() === '' || multiplier.trim() === '' || max.trim() === '') return null;
  const backoff = { initialSeconds: Number(initial), multiplier: Number(multiplier), maxSeconds: Number(max) };
  const whole = Number.isInteger(backoff.initialSeconds) && Number.isInteger(backoff.maxSeconds);
  const fits =
    backoff.initialSeconds >= 60 &&
    backoff.initialSeconds <= 604800 &&
    backoff.multiplier >= 1 &&
    backoff.multiplier <= 10 &&
    backoff.maxSeconds >= backoff.initialSeconds &&
    backoff.maxSeconds <= 31536000;
  return whole && fits ? backoff : null;
}

/** "1 h watcher: 3 looks, at 5m, 15m, 35m" - when, from the moment it was set. */
function simulatedLine(length: number, at: number[]): string {
  const watcher = tf('{length} watcher', { length: compact(length) });
  if (at.length === 0) return tf('{watcher}: no look', { watcher });
  const shown = at.slice(0, SHOWN_LOOKS).map(compact).join(', ');
  const more = at.length > SHOWN_LOOKS ? tf(' and {count} more', { count: at.length - SHOWN_LOOKS }) : '';
  return tf('{watcher}: {count} looks, at {times}{more}', { watcher, count: at.length, times: shown, more });
}

/** 300 -> "5m", 4500 -> "1h15m", 90000 -> "1d1h". */
function compact(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const parts = [days > 0 ? `${days}d` : '', hours > 0 ? `${hours}h` : '', minutes > 0 ? `${minutes}m` : '', rest > 0 ? `${rest}s` : ''];
  return parts.filter((part) => part !== '').slice(0, 2).join('') || '0s';
}
