import { useEffect, useState } from 'react';

import {
  fetchWatcherSettings,
  setWatcherMaxPerAgent,
  setWatcherMaxSeconds,
  setWatcherMinIntervalSeconds,
} from '../../api/watchers';
import type { WatcherSettings } from '../../api/watchers';
import { FieldHint } from '../../components/FieldHint';
import { t } from '../../i18n';
import page from './AdminSettingsPage.module.css';
import type { PendingWrite } from './LogLevelsSection';

export interface WatchersSectionProps {
  /** Told which of the three numbers differ from the server's, so the page's Save can send them. */
  onPending: (writes: PendingWrite[]) => void;
  /** While the page is saving, so the boxes are not typed into mid-save. */
  busy?: boolean;
}

/**
 * Admin -> Settings -> Watchers. Issue #606.
 *
 * Three numbers bounding what an agent may ask a watcher to do: how long one
 * may run, how often it may call its tool, and how many one agent may have
 * running. They go out with the page's one Save, like its other numbers.
 */
export function WatchersSection({ onPending, busy = false }: WatchersSectionProps) {
  const [held, setHeld] = useState<WatcherSettings | null>(null);
  const [maxSeconds, setMaxSeconds] = useState('');
  const [minInterval, setMinInterval] = useState('');
  const [perAgent, setPerAgent] = useState('');
  const [error, setError] = useState<string | null>(null);

  function hold(settings: WatcherSettings) {
    setHeld(settings);
    setMaxSeconds(String(settings.maxSeconds));
    setMinInterval(String(settings.minIntervalSeconds));
    setPerAgent(String(settings.maxPerAgent));
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
    onPending(writes);
  }, [held, maxSeconds, minInterval, perAgent, onPending]);

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
