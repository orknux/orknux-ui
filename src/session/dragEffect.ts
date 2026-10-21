const KEY = 'orknux.dragEffect';

/** How a workflow node moves while it is dragged: plainly, like jelly, or like jelly that slides on when let go. */
export type DragEffect = 'off' | 'jelly' | 'slide';

const EFFECTS: readonly DragEffect[] = ['off', 'jelly', 'slide'];

/**
 * The drag effect chosen in Preferences, sliding jelly until one is.
 *
 * Kept in the browser, as the theme is: it is about how this screen feels to
 * whoever is at it, and read at the start of every drag, so a change applies
 * without leaving the editor.
 */
export function currentDragEffect(): DragEffect {
  try {
    const held = window.localStorage.getItem(KEY);
    return EFFECTS.includes(held as DragEffect) ? (held as DragEffect) : 'slide';
  } catch {
    return 'slide';
  }
}

export function rememberDragEffect(effect: DragEffect): void {
  try {
    window.localStorage.setItem(KEY, effect);
  } catch {
    // Not remembered is not broken: the choice holds until the tab is closed.
  }
}
