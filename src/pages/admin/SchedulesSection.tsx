import { useEffect, useState } from 'react';

import { fetchScheduleSettings, setScheduleMaxPerAgent, setScheduleMinIntervalSeconds } from '../../api/schedules';
import type { ScheduleSettings } from '../../api/schedules';
import { FieldHint } from '../../components/FieldHint';
import { t } from '../../i18n';
import page from './AdminSettingsPage.module.css';
import type { PendingWrite } from './LogLevelsSection';

export interface SchedulesSectionProps {
  /** Told which of the numbers differ from the server's, so the page's Save can send them. */
  onPending: (writes: PendingWrite[]) => void;
  /** While the page is saving, so the boxes are not typed into mid-save. */
  busy?: boolean;
}

/**
 * Admin -> Settings -> Schedules: how often an agent's schedule may run, and
 * how many one agent may have. Every run is a turn of the agent's model, so
 * these bound what a schedule may spend. They go out with the page's one Save.
 */
export function SchedulesSection({ onPending, busy = false }: SchedulesSectionProps) {
  const [held, setHeld] = useState<ScheduleSettings | null>(null);
  const [minInterval, setMinInterval] = useState('');
  const [perAgent, setPerAgent] = useState('');
  const [error, setError] = useState<string | null>(null);

  function hold(settings: ScheduleSettings) {
    setHeld(settings);
    setMinInterval(String(settings.minIntervalSeconds));
    setPerAgent(String(settings.maxPerAgent));
  }

  useEffect(() => {
    let abandoned = false;
    fetchScheduleSettings()
      .then((settings) => {
        if (!abandoned) hold(settings);
      })
      .catch((cause: unknown) => {
        if (!abandoned) setError(cause instanceof Error ? cause.message : t('Could not read the schedule settings.'));
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
    const changed = (typed: string, stored: number, write: (value: number) => Promise<ScheduleSettings>) => {
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
    changed(minInterval, held.minIntervalSeconds, setScheduleMinIntervalSeconds);
    changed(perAgent, held.maxPerAgent, setScheduleMaxPerAgent);
    onPending(writes);
  }, [held, minInterval, perAgent, onPending]);

  return (
    <>
      <h2 id="schedules" className={page.sectionHeading}>
        {t('Schedules')}
      </h2>

      {error !== null && (
        <p className={`${page.notice} ${page.noticeError}`} role="alert">
          {error}
        </p>
      )}

      <div className={page.setting}>
        <div className={page.settingText}>
          <span className={page.labelWithHint}>
            <p className={page.settingLabel}>{t('The shortest interval between two runs of a schedule')}</p>
            <FieldHint label={t('The shortest interval between two runs of a schedule')}>
              {t('A schedule wakes its agent every time it runs, and each run is a turn of the agent\'s model - so this bounds what one schedule may spend. A cron that would run more often is refused. Fixed when the schedule is set, so raising it does not change the ones already running.')}
            </FieldHint>
          </span>
        </div>
        <div className={page.retention}>
          <input
            id="schedule-min-interval"
            name="scheduleMinIntervalSeconds"
            className={page.input}
            type="number"
            min={1}
            value={minInterval}
            onChange={(event) => setMinInterval(event.target.value)}
            disabled={busy || held === null}
            aria-label={t('The shortest interval between two runs of a schedule')}
          />
          <span className={page.retentionUnit}>{t('seconds')}</span>
        </div>
      </div>

      <div className={page.setting}>
        <div className={page.settingText}>
          <span className={page.labelWithHint}>
            <p className={page.settingLabel}>{t('Schedules one agent may have')}</p>
            <FieldHint label={t('Schedules one agent may have')}>
              {t('How many schedules one agent may have active at once. Zero switches schedules off: an agent is not offered the tools, and one set before still runs until it ends or is stopped.')}
            </FieldHint>
          </span>
        </div>
        <div className={page.retention}>
          <input
            id="schedule-max-per-agent"
            name="scheduleMaxPerAgent"
            className={page.input}
            type="number"
            min={0}
            value={perAgent}
            onChange={(event) => setPerAgent(event.target.value)}
            disabled={busy || held === null}
            aria-label={t('Schedules one agent may have')}
          />
          <span className={page.retentionUnit}>{t('schedules')}</span>
        </div>
      </div>
    </>
  );
}
