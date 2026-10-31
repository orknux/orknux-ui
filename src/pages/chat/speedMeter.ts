/**
 * How fast a model is writing, worked out from what reaches the page.
 *
 * Most providers say how many tokens they wrote only at the end of a call, so
 * while an answer is arriving this is an estimate at four characters to a token,
 * the same one the writing line uses. Over the last few seconds rather than the
 * whole turn, so it follows the model and falls away when the model stops to run
 * a tool.
 */
const CHARS_PER_TOKEN = 4;
const WINDOW_MILLIS = 3_000;
/** Less than this is not a rate: a whole answer arriving at once would read as millions. */
const SHORTEST_MILLIS = 500;

export class SpeedMeter {
  private pieces: { at: number; chars: number }[] = [];

  private first: number | null = null;

  private last: number | null = null;

  private total = 0;

  add(chars: number, now: number): void {
    if (chars <= 0) return;
    this.first ??= now;
    this.last = now;
    this.total += chars;
    this.pieces.push({ at: now, chars });
    this.pieces = this.pieces.filter((piece) => now - piece.at <= WINDOW_MILLIS);
  }

  /** Tokens a second just now, or null while there is too little to say or the model has gone quiet. */
  current(now: number): number | null {
    const recent = this.pieces.filter((piece) => now - piece.at <= WINDOW_MILLIS);
    if (recent.length === 0 || this.first === null) return null;
    const span = Math.min(WINDOW_MILLIS, now - this.first);
    if (span < SHORTEST_MILLIS) return null;
    return (recent.reduce((sum, piece) => sum + piece.chars, 0) / CHARS_PER_TOKEN) / (span / 1000);
  }

  /** Tokens a second across everything heard, for when a turn ends with nothing better; null if it came all at once. */
  overall(): number | null {
    if (this.first === null || this.last === null || this.last - this.first < SHORTEST_MILLIS) return null;
    return (this.total / CHARS_PER_TOKEN) / ((this.last - this.first) / 1000);
  }
}

/**
 * How fast a prompt is being read, from how far the server says it has got: tokens
 * it really counted, so nothing here is estimated but the clock. Null until it has
 * been reading long enough to say.
 */
export class PromptMeter {
  private first: { at: number; processed: number } | null = null;

  add(processed: number, now: number): number | null {
    if (this.first === null || processed < this.first.processed) {
      this.first = { at: now, processed };
      return null;
    }
    const span = now - this.first.at;
    if (span < SHORTEST_MILLIS || processed === this.first.processed) return null;
    return (processed - this.first.processed) / (span / 1000);
  }
}

/** "42 t/s", and "~42 t/s" where it is the estimate. */
export function speedText(perSecond: number, measured: boolean): string {
  const shown = perSecond < 10 ? perSecond.toFixed(1) : Math.round(perSecond).toLocaleString('en-US');
  return `${measured ? '' : '~'}${shown} t/s`;
}
