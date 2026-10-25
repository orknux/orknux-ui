import type { DesignImageJob } from '../../api/artifacts';
import { playingTime } from './DesignVideosPage';
import { roughly, roughlyEstimated } from '../../components/timeLeft';
import { t, tf } from '../../i18n';

/**
 * At or past this a WebUI has nothing more to count: what is left is the
 * picture being handed back and filed, which nothing reports on.
 */
const COUNTED_OUT = 99;

/**
 * A picture's wait as last read, on the server's clock: `asOf` is that clock
 * when the job was read, so a browser whose clock is out still counts from
 * when the drawing really started.
 */
export interface ImagePace {
  jobId: string;
  /** The server's clock minus this browser's, at the read. */
  skew: number;
  /** When it started being drawn, on the server's clock. */
  startedAt: number;
  /** When it was read, on the server's clock. */
  readAt: number;
  /** How far its WebUI said it was; null where its server says nothing. */
  progress: number | null;
  /** The seconds its WebUI reckoned were left, as of the read; null where it said nothing. */
  secondsLeft: number | null;
  /** How long the same model's newest pictures of this kind took, the median; null with too few. */
  typicalSeconds: number | null;
}

/** The pace of a picture being drawn, read at `clientNow`; null for one waiting, done or never started. */
export function imagePaceOf(job: DesignImageJob | null, clientNow: number): ImagePace | null {
  if (job === null || job.status !== 'DRAWING' || job.startedAt === null) return null;
  const startedAt = Date.parse(job.startedAt);
  if (Number.isNaN(startedAt)) return null;
  const asOf = typeof job.asOf === 'string' ? Date.parse(job.asOf) : Number.NaN;
  const skew = Number.isNaN(asOf) ? 0 : asOf - clientNow;
  return {
    jobId: job.id,
    skew,
    startedAt,
    readAt: clientNow + skew,
    progress: job.progress ?? null,
    secondsLeft: job.secondsLeft ?? null,
    typicalSeconds: job.typicalSeconds ?? null,
  };
}

/**
 * The time line beside a picture being drawn: how long it has taken, and how
 * long is left where anything knows - "0:42 elapsed · about 20 s left".
 *
 * Two sources, said differently because they are different things. A WebUI's
 * own reckoning of its time left is "about"; where the server says nothing,
 * the time the same model's pictures of this kind usually take, less the time
 * taken, is "estimated". Neither, and it says only the time taken; once an
 * estimate has run out it says nothing more rather than a number nobody has.
 */
export function imagePaceLine(pace: ImagePace, clientNow: number): string {
  const now = clientNow + pace.skew;
  const taken = Math.max(0, now - pace.startedAt);
  const parts = [tf('{time} elapsed', { time: playingTime(taken / 1000) })];
  if (pace.progress !== null && pace.progress >= COUNTED_OUT) {
    parts.push(t('Finishing…'));
  } else if (pace.secondsLeft !== null) {
    const left = pace.secondsLeft * 1000 - (now - pace.readAt);
    if (left > 0) parts.push(roughly(left));
  } else if (pace.progress === null && pace.typicalSeconds !== null) {
    const left = pace.typicalSeconds * 1000 - taken;
    if (left > 0) parts.push(roughlyEstimated(left));
  }
  return parts.join(' · ');
}
