import { useSyncExternalStore } from 'react';

/**
 * How fast answers are read aloud, chosen in voice mode. Issue #673.
 *
 * Kept in the browser, like the shortcuts: it belongs to the ears in front of
 * this screen, not to the account. Null is "not chosen", and then the server
 * reads at the installation's pace rather than at one invented here.
 */
const KEY = 'orknux.speech.speed';

/** The speeds offered, as multiples of the speech model's own pace. */
export const SPEECH_SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;

const read = (): number | null => {
  try {
    const held = Number(window.localStorage.getItem(KEY));
    return Number.isFinite(held) && held > 0 ? held : null;
  } catch {
    return null;
  }
};

let held: number | null = read();
const listeners = new Set<() => void>();

export function speechSpeed(): number | null {
  return held;
}

export function setSpeechSpeed(next: number | null): void {
  if (next === held) return;
  held = next;
  try {
    if (next === null) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, String(next));
  } catch {
    // The choice lasts as long as the page does.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSpeechSpeed(): number | null {
  return useSyncExternalStore(subscribe, speechSpeed, speechSpeed);
}
