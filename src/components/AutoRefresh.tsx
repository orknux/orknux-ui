import { useEffect } from 'react';

import { setRefreshSeconds, useRefreshSeconds } from '../session/refresh';
import { SelectField } from './SelectField';
import { t } from '../i18n';

export interface AutoRefreshProps {
  /** Called on every tick. Should be stable — a `useCallback` load function. */
  onRefresh: () => void;
  /** Paused while something else is already loading. */
  busy?: boolean;
  /**
   * The interval this screen starts at where nobody has chosen one. A run or a
   * session being followed wants every second; a list is left at Off.
   */
  defaultSeconds?: number;
}

/** Off, and the intervals worth offering. Seconds. */
const CHOICES: { value: number; label: string }[] = [
  { value: 0, label: t('Off') },
  /*
   * A second, for watching something happen rather than checking on it.
   *
   * The shortest interval used to be five, which is the right floor for a
   * queue somebody is keeping an eye on and too slow for a run being followed
   * line by line: a turn lands, and the page shows it a beat later. What makes
   * it affordable is that a tick is skipped while the last one is still in
   * flight, so a slow list asks once a second at most and never stacks.
   */
  { value: 1, label: '1s' },
  { value: 5, label: '5s' },
  { value: 15, label: '15s' },
  { value: 30, label: '30s' },
  { value: 60, label: '1m' },
];

/**
 * Reloads a screen on a timer, at an interval the person watching chooses.
 *
 * A running workflow changes without anyone touching the page, so a list of runs
 * is out of date the moment it is drawn. The interval is a choice rather than a
 * fixed number because the right one depends on what is being watched: a run
 * that takes seconds wants five, a queue that turns over hourly does not want to
 * be polled at all.
 *
 * Shared across the screens that want it, and shared as one setting: somebody
 * who has decided how often they want to be interrupted has decided it for all
 * of them.
 */
export function AutoRefresh({ onRefresh, busy = false, defaultSeconds = 0 }: AutoRefreshProps) {
  const seconds = useRefreshSeconds(defaultSeconds);

  useEffect(() => {
    if (seconds === 0) return;
    const timer = window.setInterval(() => {
      // Skipped rather than queued: a slow load should not stack up ticks
      // behind it and then fire them all at once.
      if (!busy) onRefresh();
    }, seconds * 1000);
    return () => window.clearInterval(timer);
  }, [seconds, busy, onRefresh]);

  return (
    <SelectField
      label={t('Auto')}
      value={String(seconds)}
      onChange={(value) => setRefreshSeconds(Number(value))}
      ariaLabel={t('Refresh automatically')}
      options={CHOICES.map((choice) => ({ value: String(choice.value), label: choice.label }))}
    />
  );
}
