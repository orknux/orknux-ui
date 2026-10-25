import { tf } from '../i18n';

/** About how long, said as roughly as it is known: minutes past a minute and a half, five seconds under. */
export function roughly(millis: number, samplingOnly = false): string {
  const seconds = millis / 1000;
  if (seconds >= 90) {
    const minutes = Math.round(seconds / 60);
    return samplingOnly ? tf('about {minutes} min of sampling left', { minutes }) : tf('about {minutes} min left', { minutes });
  }
  const rounded = Math.max(5, Math.ceil(seconds / 5) * 5);
  return samplingOnly ? tf('about {seconds} s of sampling left', { seconds: rounded }) : tf('about {seconds} s left', { seconds: rounded });
}
