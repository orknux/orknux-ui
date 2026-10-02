import { useSyncExternalStore } from 'react';

const KEY = 'orknux.refreshSeconds';

/** Off, and the intervals the control offers. */
const ALLOWED = [0, 1, 5, 15, 30, 60];

/**
 * How often a screen that watches something reloads it, in seconds. Zero is off.
 *
 * Kept in the browser and shared by every screen that offers it: somebody who
 * has decided how often they want to be interrupted has decided it once, not
 * per page. A store rather than context for the same reason the sidebar uses
 * one — the pages reading it are not all below one provider.
 */
function read(): number | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) return null;
    const stored = Number(raw);
    return ALLOWED.includes(stored) ? stored : null;
  } catch {
    return null;
  }
}

/**
 * Null until somebody chooses: a page then uses its own default - a run or a
 * session being followed wants every second, a list does not want polling at
 * all. Once chosen, the choice is everybody's, Off included.
 */
let seconds: number | null = read();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function refreshSeconds(): number | null {
  return seconds;
}

export function setRefreshSeconds(next: number): void {
  const chosen = ALLOWED.includes(next) ? next : 0;
  if (chosen === seconds) return;
  seconds = chosen;
  try {
    window.localStorage.setItem(KEY, String(chosen));
  } catch {
    // Not worth failing over: the choice lasts as long as the page does.
  }
  listeners.forEach((listener) => listener());
}

/** The chosen interval, or [fallback] where nobody has chosen one yet. */
export function useRefreshSeconds(fallback = 0): number {
  return useSyncExternalStore(subscribe, refreshSeconds, refreshSeconds) ?? fallback;
}
