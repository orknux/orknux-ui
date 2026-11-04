import { useEffect, useState } from 'react';

/**
 * Whether this tab is being looked at, for what holds a connection open.
 *
 * A browser keeps six connections to one host over plain HTTP, and every tab
 * of an editor, a chat or a task held one for as long as it was open - its
 * live stream. Past six tabs every other request queued inside the browser:
 * the server was idle, and Orknux read as frozen. So a tab out of sight lets
 * go of its stream, and takes it up again when it is looked at.
 *
 * Out of sight for a while first, so a glance at another tab and back does not
 * close a stream and open it again - and does not mark a person away in an
 * editor somebody else has open. How long is the installation's, under Admin ›
 * Settings › Limits; [AWAY_AFTER_MS] until the server has said.
 */
export const AWAY_AFTER_MS = 30_000;

let awayAfter = AWAY_AFTER_MS;

/** The installation's number, in seconds, as soon as the shell has it. A tab already away keeps the wait it began. */
export function setAwayAfterSeconds(seconds: number): void {
  if (Number.isFinite(seconds) && seconds > 0) awayAfter = seconds * 1000;
}

/** Whether the page is hidden now; a browser without the API is always looking. */
function hidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

/**
 * Calls [onAway] once the page has been out of sight for [AWAY_AFTER_MS], and
 * [onBack] when it is looked at again after that. Returns the way to stop.
 */
export function whileLookedAt(onAway: () => void, onBack: () => void, after?: number): () => void {
  let timer: number | null = null;
  let away = false;
  const changed = () => {
    if (hidden()) {
      if (timer === null && !away) {
        timer = window.setTimeout(() => {
          timer = null;
          away = true;
          onAway();
        }, after ?? awayAfter);
      }
    } else {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
      if (away) {
        away = false;
        onBack();
      }
    }
  };
  document.addEventListener('visibilitychange', changed);
  changed();
  return () => {
    document.removeEventListener('visibilitychange', changed);
    if (timer !== null) window.clearTimeout(timer);
  };
}

/** The same as state: false once the page has been out of sight long enough to let go of its streams. */
export function useLookedAt(): boolean {
  const [looked, setLooked] = useState(true);
  useEffect(() => whileLookedAt(() => setLooked(false), () => setLooked(true)), []);
  return looked;
}
