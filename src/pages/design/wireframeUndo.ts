import type { WireframeElement } from '../../api/wireframes';

/**
 * The wireframe editor's undo and redo, kept in this browser so a reload does
 * not throw them away.
 *
 * The steps are whole drawings, and they are only true of the drawing they
 * lead back from - the head. So the head is kept with them, as the editor
 * serialises it, beside the revision it was saved at, and a stack is handed
 * back only to a wireframe the server returns at that revision with exactly
 * that drawing. Anything else - a save from another tab, the model drawing
 * while this page was closed, changes that were never saved - is a different
 * drawing, and undoing into the old one would write it over what is there.
 */

export interface KeptUndo {
  past: WireframeElement[][];
  future: WireframeElement[][];
}

interface Stored extends KeptUndo {
  revision: number;
  head: string;
  at: number;
}

const PREFIX = 'orknux.wireframe.undo.';
const keyOf = (id: string) => `${PREFIX}${id}`;

/**
 * The most one wireframe's history may take in storage, in characters. Browser
 * storage is a few megabytes for the whole application, shared with everything
 * else it remembers, so the oldest steps go first once a history outgrows this.
 * A browser's limit rather than a behaviour anybody would tune, so it is a
 * constant like the depth the editor keeps in memory.
 */
const MOST_CHARACTERS = 1_000_000;

/** How many wireframes keep a history here; the ones worked on longest ago are forgotten. */
const MOST_WIREFRAMES = 10;

/** The history kept for this wireframe, if it was left at this revision with this drawing. */
export function restoreUndo(id: string, revision: number, head: string): KeptUndo | null {
  try {
    forgetOldest(id);
    const raw = localStorage.getItem(keyOf(id));
    if (raw === null) return null;
    const kept = JSON.parse(raw) as Partial<Stored>;
    if (kept.revision !== revision || kept.head !== head || !Array.isArray(kept.past) || !Array.isArray(kept.future)) {
      localStorage.removeItem(keyOf(id));
      return null;
    }
    return { past: kept.past, future: kept.future };
  } catch {
    return null;
  }
}

/** Keeps the history of a wireframe whose drawing is `head`, saved at `revision`. */
export function keepUndo(id: string, revision: number, head: string, undo: KeptUndo): void {
  try {
    if (undo.past.length === 0 && undo.future.length === 0) {
      localStorage.removeItem(keyOf(id));
      return;
    }
    const past = [...undo.past];
    const future = [...undo.future];
    const at = Date.now();
    let text = JSON.stringify({ at, revision, head, past, future } satisfies Stored);
    if (text.length > MOST_CHARACTERS) {
      // Counted step by step rather than written out again after each one is dropped.
      let over = text.length - MOST_CHARACTERS;
      while (over > 0 && (past.length > 0 || future.length > 0)) {
        const dropped = past.length > 0 ? past.shift() : future.pop();
        over -= JSON.stringify(dropped).length + 1;
      }
      text = JSON.stringify({ at, revision, head, past, future } satisfies Stored);
    }
    localStorage.setItem(keyOf(id), text);
  } catch {
    // Full, or nowhere to keep it: the history lasts as long as the page.
    try {
      localStorage.removeItem(keyOf(id));
    } catch {
      // Nothing to clear.
    }
  }
}

export function forgetUndo(id: string): void {
  try {
    localStorage.removeItem(keyOf(id));
  } catch {
    // Nothing kept.
  }
}

function forgetOldest(keeping: string) {
  const held: { key: string; at: number }[] = [];
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    if (key === null || !key.startsWith(PREFIX) || key === keyOf(keeping)) continue;
    // When it was kept is written first, so it is read without parsing a whole history.
    const at = Number(/^\{"at":(\d+)/.exec(localStorage.getItem(key) ?? '')?.[1] ?? 0);
    held.push({ key, at });
  }
  held
    .sort((a, b) => b.at - a.at)
    .slice(MOST_WIREFRAMES - 1)
    .forEach((one) => localStorage.removeItem(one.key));
}
