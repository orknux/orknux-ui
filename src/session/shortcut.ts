import { useSyncExternalStore } from 'react';

const KEY = 'orknux.paletteShortcut';
const RECENT_KEY = 'orknux.recentShortcut';
const SAVE_KEY = 'orknux.saveShortcut';
const FORMAT_KEY = 'orknux.formatShortcut';
const TURN_KEY = 'orknux.turnShortcut';
const UNDO_KEY = 'orknux.undoShortcut';
const REDO_KEY = 'orknux.redoShortcut';
const DUPLICATE_KEY = 'orknux.duplicateShortcut';
const COPY_KEY = 'orknux.copyShortcut';
const CUT_KEY = 'orknux.cutShortcut';
const PASTE_KEY = 'orknux.pasteShortcut';
const ADD_KEY = 'orknux.addShortcut';
const SELECT_KEY = 'orknux.selectShortcut';
const JOINT_KEY = 'orknux.jointShortcut';
const PUBLISH_KEY = 'orknux.publishShortcut';
const VOICE_MUTE_KEY = 'orknux.voiceMuteShortcut';
const ZOOM_IN_KEY = 'orknux.zoomInShortcut';
const ZOOM_OUT_KEY = 'orknux.zoomOutShortcut';
const ARRANGE_KEY = 'orknux.arrangeShortcut';
const MAGIC_RECTANGLE_KEY = 'orknux.magicRectangleShortcut';
const MAGIC_LASSO_KEY = 'orknux.magicLassoShortcut';
const MAGIC_ALL_KEY = 'orknux.magicAllShortcut';
const NEXT_TAB_KEY = 'orknux.nextTabShortcut';
const PREVIOUS_TAB_KEY = 'orknux.previousTabShortcut';

/** What opens the palette when nothing has been chosen. */
export const DEFAULT_SHORTCUT = 'Ctrl+Q';

/**
 * What opens the same box straight onto Recently opened when nothing has been
 * chosen.
 *
 * Ctrl+Shift+E, which is what issue #246 asked for. It is the palette's box and
 * the palette's list — the difference is only which of the two questions somebody
 * arrived with. Ctrl+Q is "where is the thing called X"; this is "put me back
 * where I was", which is the more common of the two and the one that should not
 * cost a search.
 *
 * A modifier pair rather than a bare letter, like everything but the two canvas
 * keys: this is heard wherever the caret is, including in a text box.
 *
 * Nothing else here claims it: the editor's keystrokes are Ctrl+S, Ctrl+Z,
 * Ctrl+Shift+Z, Ctrl+Y, Ctrl+D, Ctrl+Enter, R, A and Escape, the palette is
 * Ctrl+Q and the formatter Ctrl+Shift+F.
 */
export const DEFAULT_RECENT_SHORTCUT = 'Ctrl+Shift+E';

/**
 * What saves an editor when nothing has been chosen.
 *
 * Ctrl+S, because that is what hands already do. It means the browser's own
 * save-page has to be prevented wherever this is honoured — which is most of the
 * reason it is worth binding at all.
 */
export const DEFAULT_SAVE_SHORTCUT = 'Ctrl+S';

/**
 * What lays out the code when nothing has been chosen.
 *
 * Ctrl+Shift+F, because that is what every editor with a formatter uses and hands
 * already know it. It has to be prevented like the others: it is a browser find in
 * some, and full-screen in others.
 */
export const DEFAULT_FORMAT_SHORTCUT = 'Ctrl+Shift+F';

/**
 * What turns a node on the canvas when nothing has been chosen.
 *
 * Bare R, unlike the others: the graph is not a text field, so a letter on its
 * own is free there, and turning is something somebody does four times in a row
 * - a modifier on each press is three modifiers too many. It is ignored while a
 * caret is in a box, where R is somebody typing the letter.
 */
export const DEFAULT_TURN_SHORTCUT = 'R';

/**
 * What steps back and forward when nothing has been chosen.
 *
 * Ctrl+Z and Ctrl+Shift+Z, which every machine already answers to. Ctrl+Y is
 * honoured for redo as well and is not rebindable: it is the other habit, and
 * taking it away from somebody who has it would be a change nobody asked for.
 */
export const DEFAULT_UNDO_SHORTCUT = 'Ctrl+Z';
export const DEFAULT_REDO_SHORTCUT = 'Ctrl+Shift+Z';

/**
 * What copies the selected node when nothing has been chosen.
 *
 * Ctrl+D, which is what every canvas with a duplicate in it uses. It has to be
 * prevented wherever it is honoured: the browser's own meaning for it is a
 * bookmark, and a graph editor that quietly bookmarked the page every time
 * somebody copied a node would be the worse of the two surprises.
 */
export const DEFAULT_DUPLICATE_SHORTCUT = 'Ctrl+D';

/**
 * What copies, cuts and pastes the selected nodes of a workflow when nothing
 * has been chosen: Ctrl+C, Ctrl+X and Ctrl+V, which hands already do. Heard
 * only on the canvas - inside a text box they are the box's own, as Ctrl+Z is
 * - and Cmd stands in for Ctrl, so a Mac answers to the same three.
 */
export const DEFAULT_COPY_SHORTCUT = 'Ctrl+C';
export const DEFAULT_CUT_SHORTCUT = 'Ctrl+X';
export const DEFAULT_PASTE_SHORTCUT = 'Ctrl+V';

/**
 * What opens the workflow editor's Add menu when nothing has been chosen.
 *
 * Bare A, for the reason turning is a bare R: the canvas is not a text field, so
 * a letter on its own is free there, and adding is the thing somebody does most
 * in this editor - a modifier on every node would be a modifier too many. It is
 * ignored while a caret is in a box, where A is somebody typing the letter.
 *
 * Nothing else claims it. The editor's other keystrokes are Ctrl+S, Ctrl+Z,
 * Ctrl+Shift+Z, Ctrl+Y, Ctrl+D, R and Escape; the palette is Ctrl+Q; and React
 * Flow's own keys are Backspace, Shift, Space and the platform modifier.
 */
export const DEFAULT_ADD_SHORTCUT = 'A';

/**
 * What switches the canvas between panning and drawing a selection rectangle
 * when nothing has been chosen: S, for select. A bare letter for the reason A
 * is, and held to the canvas the same way. React Flow draws the rectangle on
 * a Shift-drag whatever this says; the mode is for a trackpad, where holding a
 * key through a drag is the awkward part.
 */
export const DEFAULT_SELECT_SHORTCUT = 'S';

/**
 * What switches the workflow canvas's Joint tool on and off when nothing has
 * been chosen: J, for joint. A bare letter for the reason S is - only the
 * canvas hears it. While the tool is on, one click on a line puts a joint
 * where it landed.
 */
export const DEFAULT_JOINT_SHORTCUT = 'J';

/**
 * What publishes the workflow on screen when nothing has been chosen.
 *
 * Ctrl+Enter, which is what "commit this, I have finished" already means almost
 * everywhere a person types: a message goes, a comment is posted, a cell runs.
 * Publishing is the end of a piece of work in exactly that sense - the graph
 * stops being a draft and becomes the one that runs - so the keystroke is the
 * habit rather than a new thing to learn.
 *
 * Not a bare letter, unlike turning and adding. Those are done four times in a
 * row on a canvas and undone as easily; publishing makes a change everybody
 * else's runs will see, and a stray keypress on a canvas should not be able to
 * do that. A modifier is the difference between a gesture and an accident.
 *
 * Nothing else claims it. The editor's other keystrokes are Ctrl+S, Ctrl+Z,
 * Ctrl+Shift+Z, Ctrl+Y, Ctrl+D, R, A and Escape; the palette is Ctrl+Q; the
 * format shortcut is Ctrl+Shift+F; React Flow's own keys are Backspace, Shift,
 * Space and the platform modifier. Plain Enter is taken all over the product -
 * it sends a chat message, adds a label, takes up a row in a picker - and
 * Shift+Enter is a newline in every box that has one, but neither of those is
 * this: the browser gives Ctrl+Enter no meaning of its own in a text box, which
 * is why it is free to be given one here.
 */
export const DEFAULT_PUBLISH_SHORTCUT = 'Ctrl+Enter';

/**
 * What mutes and unmutes the microphone in voice mode when nothing has been
 * chosen.
 *
 * Alt+M, M for mute. A modifier rather than a bare M, because it is heard while
 * the composer beside the panel has the caret, and somebody typing a word with
 * an M in it should not go deaf. Not Ctrl+M, which a browser can take to mute
 * the tab - the opposite direction - nor Ctrl+Shift+M, which opens Chrome's
 * profile menu. Nothing else here claims it.
 */
export const DEFAULT_VOICE_MUTE_SHORTCUT = 'Alt+M';

/**
 * Zooming the image editor's canvas in and out.
 *
 * `Ctrl+=` is Ctrl and the key that carries +: the key is named by what it
 * types without Shift, which is how every other shortcut here is read. The
 * number pad's + and - are heard as well, whatever is chosen.
 */
export const DEFAULT_ZOOM_IN_SHORTCUT = 'Ctrl+=';
export const DEFAULT_ZOOM_OUT_SHORTCUT = 'Ctrl+-';

/**
 * Laying a diagram out again, in the diagram editor: Ctrl+Shift+L, L for
 * layout, with Shift because Ctrl+L is the browser's address bar.
 */
export const DEFAULT_ARRANGE_SHORTCUT = 'Ctrl+Shift+L';

/**
 * Magic edit's two ways of selecting, in the image editor: M for the rectangle
 * (a marquee) and L for the lasso, as image editors have them. A bare letter,
 * because it is heard only on the editor's canvas and never in a text box.
 */
export const DEFAULT_MAGIC_RECTANGLE_SHORTCUT = 'M';
export const DEFAULT_MAGIC_LASSO_SHORTCUT = 'L';
/** Magic edit over the whole picture: select all, as everywhere else. */
export const DEFAULT_MAGIC_ALL_SHORTCUT = 'Ctrl+A';

/**
 * The desktop app's next and previous tab, when nothing has been chosen:
 * Ctrl+PageDown and Ctrl+PageUp, which every browser and most editors with tabs
 * answer to. Only the desktop app has tabs of its own, so only it hears these -
 * `desktop.ts` hands them over - and it hears them whichever tab has the caret.
 * Ctrl+Tab and Ctrl+Shift+Tab are honoured as well and are not rebindable, as
 * Ctrl+Y is for redo: they are the other habit.
 */
export const DEFAULT_NEXT_TAB_SHORTCUT = 'Ctrl+PageDown';
export const DEFAULT_PREVIOUS_TAB_SHORTCUT = 'Ctrl+PageUp';

/**
 * The image editor's own tools - the rail down the canvas's left, the brush's
 * width, and the blur's three shapes - when nothing has been chosen.
 *
 * Bare keys, as Magic edit's M and L are: they are heard only on the editor's
 * canvas and never while a caret is in a box. The letters are an image
 * editor's: B for the brush, C for crop, U for blur (B is taken), H and V for
 * flipping horizontally and vertically, R to turn right and Shift+R to turn
 * back, [ and ] for a narrower and a wider brush. Layers is Shift+L because L
 * is Magic edit's lasso. The blur's shapes are 1, 2 and 3, in the order its bar
 * shows them, and pick the blur up if it is not in hand.
 *
 * Nothing else on the page claims any of them: its other keys are M, L, Ctrl+A,
 * Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y, Ctrl+S, Ctrl+= and Ctrl+-, Enter and Escape.
 */
export const DEFAULT_IMAGE_EDITOR_SHORTCUTS = {
  rotateLeft: 'Shift+R',
  rotateRight: 'R',
  flipHorizontal: 'H',
  flipVertical: 'V',
  brush: 'B',
  crop: 'C',
  blur: 'U',
  layers: 'Shift+L',
  brushSmaller: '[',
  brushLarger: ']',
  blurRectangle: '1',
  blurLasso: '2',
  blurGradual: '3',
} as const;

/** One of the image editor's own shortcuts, by name. */
export type ImageEditorShortcut = keyof typeof DEFAULT_IMAGE_EDITOR_SHORTCUTS;

/** Their names, in the order Preferences lists them: the rail top to bottom, then the brush and the blur. */
export const IMAGE_EDITOR_SHORTCUTS = Object.keys(DEFAULT_IMAGE_EDITOR_SHORTCUTS) as ImageEditorShortcut[];

/**
 * Which keystroke opens the command palette, written the way it is shown:
 * modifiers in a fixed order, then the key — `Ctrl+Q`, `Ctrl+Shift+P`, `Alt+G`.
 *
 * Anything can be chosen, because which keys are free depends on the machine:
 * Ctrl+K is a browser's address bar on some and a chat search on others, Ctrl+Q
 * quits an application on a Mac, and somebody's window manager has taken the
 * one we would have picked. Whoever is typing knows what they can spare.
 *
 * Kept in the browser, like the theme and the collapsed menu: it belongs to the
 * keyboard in front of somebody, not to their account.
 */
export type Shortcut = string;

/** The keys that are only ever part of a combination, never the whole of one. */
const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta', 'OS', 'AltGraph', 'CapsLock', 'Dead']);

/**
 * One remembered keystroke: read it, set it, subscribe to it.
 *
 * A factory because there is more than one now — opening the palette, and saving —
 * and two copies of this would be two places to fix the day local storage throws or
 * what is stored changes shape.
 */
function remembered(key: string, fallback: Shortcut) {
  const read = (): Shortcut => {
    try {
      return window.localStorage.getItem(key)?.trim() || fallback;
    } catch {
      return fallback;
    }
  };

  let held: Shortcut = read();
  const listeners = new Set<() => void>();

  const get = (): Shortcut => held;

  const set = (next: Shortcut): void => {
    if (next === held) return;
    held = next;
    try {
      window.localStorage.setItem(key, next);
    } catch {
      // Not worth failing over: the choice lasts as long as the page does.
    }
    listeners.forEach((listener) => listener());
  };

  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  return { get, set, subscribe, use: (): Shortcut => useSyncExternalStore(subscribe, get, get) };
}

const palette = remembered(KEY, DEFAULT_SHORTCUT);
const recent = remembered(RECENT_KEY, DEFAULT_RECENT_SHORTCUT);
const saving = remembered(SAVE_KEY, DEFAULT_SAVE_SHORTCUT);
const formatting = remembered(FORMAT_KEY, DEFAULT_FORMAT_SHORTCUT);
const turning = remembered(TURN_KEY, DEFAULT_TURN_SHORTCUT);
const undoing = remembered(UNDO_KEY, DEFAULT_UNDO_SHORTCUT);
const redoing = remembered(REDO_KEY, DEFAULT_REDO_SHORTCUT);
const duplicating = remembered(DUPLICATE_KEY, DEFAULT_DUPLICATE_SHORTCUT);
const copying = remembered(COPY_KEY, DEFAULT_COPY_SHORTCUT);
const cutting = remembered(CUT_KEY, DEFAULT_CUT_SHORTCUT);
const pasting = remembered(PASTE_KEY, DEFAULT_PASTE_SHORTCUT);
const addingNode = remembered(ADD_KEY, DEFAULT_ADD_SHORTCUT);
const selecting = remembered(SELECT_KEY, DEFAULT_SELECT_SHORTCUT);
const jointing = remembered(JOINT_KEY, DEFAULT_JOINT_SHORTCUT);
const publishing = remembered(PUBLISH_KEY, DEFAULT_PUBLISH_SHORTCUT);
const voiceMuting = remembered(VOICE_MUTE_KEY, DEFAULT_VOICE_MUTE_SHORTCUT);
const zoomingIn = remembered(ZOOM_IN_KEY, DEFAULT_ZOOM_IN_SHORTCUT);
const zoomingOut = remembered(ZOOM_OUT_KEY, DEFAULT_ZOOM_OUT_SHORTCUT);
const arranging = remembered(ARRANGE_KEY, DEFAULT_ARRANGE_SHORTCUT);
const magicRectangle = remembered(MAGIC_RECTANGLE_KEY, DEFAULT_MAGIC_RECTANGLE_SHORTCUT);
const magicLasso = remembered(MAGIC_LASSO_KEY, DEFAULT_MAGIC_LASSO_SHORTCUT);
const magicAll = remembered(MAGIC_ALL_KEY, DEFAULT_MAGIC_ALL_SHORTCUT);
const nextTab = remembered(NEXT_TAB_KEY, DEFAULT_NEXT_TAB_SHORTCUT);
const previousTab = remembered(PREVIOUS_TAB_KEY, DEFAULT_PREVIOUS_TAB_SHORTCUT);

export function paletteShortcut(): Shortcut {
  return palette.get();
}

export function setPaletteShortcut(next: Shortcut): void {
  palette.set(next);
}

export function usePaletteShortcut(): Shortcut {
  return palette.use();
}

export function recentShortcut(): Shortcut {
  return recent.get();
}

export function setRecentShortcut(next: Shortcut): void {
  recent.set(next);
}

export function useRecentShortcut(): Shortcut {
  return recent.use();
}

export function saveShortcut(): Shortcut {
  return saving.get();
}

export function setSaveShortcut(next: Shortcut): void {
  saving.set(next);
}

export function useSaveShortcut(): Shortcut {
  return saving.use();
}

export function formatShortcut(): Shortcut {
  return formatting.get();
}

export function setFormatShortcut(next: Shortcut): void {
  formatting.set(next);
}

export function useFormatShortcut(): Shortcut {
  return formatting.use();
}

export function turnShortcut(): Shortcut {
  return turning.get();
}

export function setTurnShortcut(next: Shortcut): void {
  turning.set(next);
}

export function useTurnShortcut(): Shortcut {
  return turning.use();
}

export function undoShortcut(): Shortcut {
  return undoing.get();
}

export function setUndoShortcut(next: Shortcut): void {
  undoing.set(next);
}

export function useUndoShortcut(): Shortcut {
  return undoing.use();
}

export function redoShortcut(): Shortcut {
  return redoing.get();
}

export function setRedoShortcut(next: Shortcut): void {
  redoing.set(next);
}

export function useRedoShortcut(): Shortcut {
  return redoing.use();
}

export function duplicateShortcut(): Shortcut {
  return duplicating.get();
}

export function setDuplicateShortcut(next: Shortcut): void {
  duplicating.set(next);
}

export function useDuplicateShortcut(): Shortcut {
  return duplicating.use();
}

export function copyShortcut(): Shortcut {
  return copying.get();
}

export function setCopyShortcut(next: Shortcut): void {
  copying.set(next);
}

export function useCopyShortcut(): Shortcut {
  return copying.use();
}

export function cutShortcut(): Shortcut {
  return cutting.get();
}

export function setCutShortcut(next: Shortcut): void {
  cutting.set(next);
}

export function useCutShortcut(): Shortcut {
  return cutting.use();
}

export function pasteShortcut(): Shortcut {
  return pasting.get();
}

export function setPasteShortcut(next: Shortcut): void {
  pasting.set(next);
}

export function usePasteShortcut(): Shortcut {
  return pasting.use();
}

export function addShortcut(): Shortcut {
  return addingNode.get();
}

export function setAddShortcut(next: Shortcut): void {
  addingNode.set(next);
}

export function useAddShortcut(): Shortcut {
  return addingNode.use();
}

export function selectShortcut(): Shortcut {
  return selecting.get();
}

export function setSelectShortcut(next: Shortcut): void {
  selecting.set(next);
}

export function useSelectShortcut(): Shortcut {
  return selecting.use();
}

export function jointShortcut(): Shortcut {
  return jointing.get();
}

export function setJointShortcut(next: Shortcut): void {
  jointing.set(next);
}

export function useJointShortcut(): Shortcut {
  return jointing.use();
}

export function publishShortcut(): Shortcut {
  return publishing.get();
}

export function setPublishShortcut(next: Shortcut): void {
  publishing.set(next);
}

export function usePublishShortcut(): Shortcut {
  return publishing.use();
}

export function voiceMuteShortcut(): Shortcut {
  return voiceMuting.get();
}

export function setVoiceMuteShortcut(next: Shortcut): void {
  voiceMuting.set(next);
}

export function useVoiceMuteShortcut(): Shortcut {
  return voiceMuting.use();
}

export function zoomInShortcut(): Shortcut {
  return zoomingIn.get();
}

export function setZoomInShortcut(next: Shortcut): void {
  zoomingIn.set(next);
}

export function useZoomInShortcut(): Shortcut {
  return zoomingIn.use();
}

export function zoomOutShortcut(): Shortcut {
  return zoomingOut.get();
}

export function setZoomOutShortcut(next: Shortcut): void {
  zoomingOut.set(next);
}

export function useZoomOutShortcut(): Shortcut {
  return zoomingOut.use();
}

export function arrangeShortcut(): Shortcut {
  return arranging.get();
}

export function setArrangeShortcut(next: Shortcut): void {
  arranging.set(next);
}

export function useArrangeShortcut(): Shortcut {
  return arranging.use();
}

export function magicRectangleShortcut(): Shortcut {
  return magicRectangle.get();
}

export function setMagicRectangleShortcut(next: Shortcut): void {
  magicRectangle.set(next);
}

export function useMagicRectangleShortcut(): Shortcut {
  return magicRectangle.use();
}

export function magicLassoShortcut(): Shortcut {
  return magicLasso.get();
}

export function setMagicLassoShortcut(next: Shortcut): void {
  magicLasso.set(next);
}

export function useMagicLassoShortcut(): Shortcut {
  return magicLasso.use();
}

export function magicAllShortcut(): Shortcut {
  return magicAll.get();
}

export function setMagicAllShortcut(next: Shortcut): void {
  magicAll.set(next);
}

export function useMagicAllShortcut(): Shortcut {
  return magicAll.use();
}

export function nextTabShortcut(): Shortcut {
  return nextTab.get();
}

export function setNextTabShortcut(next: Shortcut): void {
  nextTab.set(next);
}

export function useNextTabShortcut(): Shortcut {
  return nextTab.use();
}

export function previousTabShortcut(): Shortcut {
  return previousTab.get();
}

export function setPreviousTabShortcut(next: Shortcut): void {
  previousTab.set(next);
}

export function usePreviousTabShortcut(): Shortcut {
  return previousTab.use();
}

/** Each of the image editor's own shortcuts, remembered as every other one is, under a key of its own. */
const imageEditor = Object.fromEntries(
  IMAGE_EDITOR_SHORTCUTS.map((name) => [name, remembered(`orknux.imageEditor.${name}Shortcut`, DEFAULT_IMAGE_EDITOR_SHORTCUTS[name])]),
) as Record<ImageEditorShortcut, ReturnType<typeof remembered>>;

export function imageEditorShortcut(name: ImageEditorShortcut): Shortcut {
  return imageEditor[name].get();
}

export function setImageEditorShortcut(name: ImageEditorShortcut, next: Shortcut): void {
  imageEditor[name].set(next);
}

export function useImageEditorShortcut(name: ImageEditorShortcut): Shortcut {
  return imageEditor[name].use();
}

/**
 * All of them at once, for the editor, which hears them in one listener. The
 * list is fixed, so the hooks are called in the same order on every render.
 */
export function useImageEditorShortcuts(): Record<ImageEditorShortcut, Shortcut> {
  const held = {} as Record<ImageEditorShortcut, Shortcut>;
  for (const name of IMAGE_EDITOR_SHORTCUTS) held[name] = imageEditor[name].use();
  return held;
}

/** Called whenever either tab shortcut changes; what `desktop.ts` passes on to the app. */
export function onTabShortcuts(listener: () => void): () => void {
  const one = nextTab.subscribe(listener);
  const two = previousTab.subscribe(listener);
  return () => {
    one();
    two();
  };
}

/** One key, named as somebody would read it rather than as the browser sends it. */
function keyName(key: string): string {
  if (key === ' ') return 'Space';
  if (key.length === 1) return key.toUpperCase();
  return key;
}

/**
 * The keystroke that was just pressed, written the way it is shown.
 *
 * Null while only modifiers are held: `Ctrl` on its own is somebody on their way
 * to pressing something, not a choice.
 */
export function describe(event: KeyboardEvent): Shortcut | null {
  if (MODIFIER_KEYS.has(event.key)) return null;

  const held: string[] = [];
  if (event.ctrlKey) held.push('Ctrl');
  if (event.altKey) held.push('Alt');
  if (event.shiftKey) held.push('Shift');
  if (event.metaKey) held.push('Meta');
  held.push(keyName(event.key));
  return held.join('+');
}

/**
 * Whether a keystroke without a modifier is a reasonable thing to reserve.
 *
 * A bare letter would open the palette every time somebody typed it into a form,
 * so only the keys nothing else claims — the function row — stand alone.
 */
export function usable(chosen: Shortcut): boolean {
  const parts = chosen.split('+');
  if (parts.length > 1) return true;
  return /^F([1-9]|1[0-2])$/.test(parts[0] ?? '');
}

/** Whether this keystroke is the one chosen. */
export function matches(event: KeyboardEvent, chosen: Shortcut): boolean {
  const said = describe(event);
  return said !== null && said.toLowerCase() === chosen.trim().toLowerCase();
}

/**
 * The same, with Cmd standing in for Ctrl: what a Mac means by Ctrl+C is Cmd+C,
 * and a copy key that answered only to the other is one a Mac never presses.
 */
export function matchesCommand(event: KeyboardEvent, chosen: Shortcut): boolean {
  if (matches(event, chosen)) return true;
  if (!event.metaKey || event.ctrlKey || MODIFIER_KEYS.has(event.key)) return false;
  const held: string[] = ['Ctrl'];
  if (event.altKey) held.push('Alt');
  if (event.shiftKey) held.push('Shift');
  held.push(keyName(event.key));
  return held.join('+').toLowerCase() === chosen.trim().toLowerCase();
}
