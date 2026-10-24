import type { DesignVideo } from '../../api/videos';
import { playingTime } from './DesignVideosPage';
import { t, tf } from '../../i18n';

/**
 * How many percentage points a video must have moved since it was first
 * measured before a time left is worked out from them. Under that the pace is
 * mostly the noise of where the first step happened to land, and a number
 * drawn from it would swing by minutes between two reads.
 */
const MEASURED_ENOUGH = 5;

/**
 * At or past this the server has nothing more to count. OpenAI's progress is
 * held under 100 until the file is there, and stable-diffusion.cpp's reaches it
 * when its last sampling step is done - and the decode that comes after is not
 * counted at all (see `progressSamplingOnly`).
 */
const COUNTED_OUT = 99;

/**
 * What a video's wait has been measured to be, kept between reads of it.
 *
 * Every time is on the server's clock - `asOf` is that clock when the video
 * was read - so a browser whose clock is a minute out still counts from when
 * the video really started.
 */
export interface VideoPace {
  videoId: string;
  /** The server's clock minus this browser's, at the last read. */
  skew: number;
  /** When it started, on the server's clock; null while it has not. */
  startedAt: number | null;
  /** The last progress the server said; held over a read that said none, as a poll that failed does. */
  progress: number | null;
  /** When that progress was read, on the server's clock. */
  readAt: number;
  /**
   * Where the pace is measured from: when it started at 0, or - once progress
   * has gone back, which is stable-diffusion.cpp starting a further sampling
   * pass, whose steps it counts afresh - where that pass was first seen.
   */
  from: { at: number; progress: number };
  /** Whether progress counts only the sampling steps. */
  samplingOnly: boolean;
}

/** The pace with one more read of the video folded in; null for a video not being made. */
export function paceAfter(held: VideoPace | null, video: DesignVideo | null, clientNow: number): VideoPace | null {
  if (video === null || video.status !== 'GENERATING') return null;
  const skew = typeof video.asOf === 'string' && !Number.isNaN(Date.parse(video.asOf)) ? Date.parse(video.asOf) - clientNow : 0;
  const readAt = clientNow + skew;
  const startedAt = video.startedAt !== null && !Number.isNaN(Date.parse(video.startedAt)) ? Date.parse(video.startedAt) : null;
  const same = held !== null && held.videoId === video.id ? held : null;
  const progress = video.progress ?? same?.progress ?? null;
  let from = same?.from ?? (startedAt !== null ? { at: startedAt, progress: 0 } : { at: readAt, progress: progress ?? 0 });
  // Gone back: counted afresh from here, since the pass before says nothing of how long this one takes.
  if (same !== null && progress !== null && same.progress !== null && progress < same.progress) from = { at: readAt, progress };
  return { videoId: video.id, skew, startedAt, progress, readAt, from, samplingOnly: video.progressSamplingOnly === true };
}

/** About how long, said as roughly as it is known: minutes past a minute and a half, five seconds under. */
function roughly(millis: number, samplingOnly: boolean): string {
  const seconds = millis / 1000;
  if (seconds >= 90) {
    const minutes = Math.round(seconds / 60);
    return samplingOnly ? tf('about {minutes} min of sampling left', { minutes }) : tf('about {minutes} min left', { minutes });
  }
  const rounded = Math.max(5, Math.ceil(seconds / 5) * 5);
  return samplingOnly ? tf('about {seconds} s of sampling left', { seconds: rounded }) : tf('about {seconds} s left', { seconds: rounded });
}

/**
 * The time line under a video being made: how long it has taken, and about how
 * long is left where the server's progress says - "1:12 elapsed · about 2 min
 * left".
 *
 * The time left is only ever measured: the time since the pace was first
 * measured, over the share of the work done in it, less what has passed since.
 * Before that share is enough to go on it says Estimating…, where the server
 * gives no progress at all it says nothing but the time taken, and once the
 * figure has run out it says nothing rather than a number it has no reading for.
 *
 * stable-diffusion.cpp counts only its sampling steps: Wan's VAE decode after
 * the last one takes about as long again as the sampling, and nothing reports
 * on it. So for that server the time left is said to be the sampling's, and
 * once the steps are done the line says Finishing… for however long the decode
 * takes, rather than a total that was never measured.
 */
export function paceLine(pace: VideoPace, clientNow: number): string {
  const now = clientNow + pace.skew;
  const parts: string[] = [];
  if (pace.startedAt !== null) parts.push(tf('{time} elapsed', { time: playingTime(Math.max(0, now - pace.startedAt) / 1000) }));
  const progress = pace.progress;
  if (progress === null) return parts.join(' · ');
  if (progress >= COUNTED_OUT) {
    parts.push(t('Finishing…'));
  } else if (progress - pace.from.progress > MEASURED_ENOUGH && pace.readAt > pace.from.at) {
    const leftAtRead = ((100 - progress) * (pace.readAt - pace.from.at)) / (progress - pace.from.progress);
    const left = leftAtRead - (now - pace.readAt);
    if (left > 0) parts.push(roughly(left, pace.samplingOnly));
  } else {
    parts.push(t('Estimating…'));
  }
  return parts.join(' · ');
}

/** How wide the bar is drawn, in percent: what the server last said, held over a read that said nothing. */
export function paceShare(pace: VideoPace | null, video: DesignVideo): number {
  return video.progress ?? (pace?.videoId === video.id ? pace.progress : null) ?? 0;
}
