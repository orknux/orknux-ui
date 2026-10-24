import { nextTabShortcut, onTabShortcuts, previousTabShortcut } from './shortcut';

/**
 * What the desktop app's preload puts on a page of the interface, and nothing
 * anywhere else does: a browser tab has no `orknuxDesktop`, and every call here
 * is then nothing.
 *
 * The tab strip is the app's and not the page's, so the keys that move along it
 * are heard by the app before any page sees them. Which keys those are is still
 * a shortcut like the others - chosen on Preferences, kept in this browser - so
 * the page tells the app, at its start and whenever they change.
 */
interface DesktopBridge {
  tabShortcuts(next: string, previous: string): void;
  recordingKeys(on: boolean): void;
}

function bridge(): DesktopBridge | null {
  return (window as unknown as { orknuxDesktop?: DesktopBridge }).orknuxDesktop ?? null;
}

/** Whether this page is in the desktop app, which is the only place with tabs of its own. */
export function inDesktopApp(): boolean {
  return bridge() !== null;
}

/** Hands the app the tab shortcuts now and on every change. */
export function shareTabShortcuts(): void {
  const app = bridge();
  if (app === null) return;
  const share = () => app.tabShortcuts(nextTabShortcut(), previousTabShortcut());
  share();
  onTabShortcuts(share);
}

/**
 * Says a shortcut is being recorded: the app lets every key through to this
 * page meanwhile, or the tab keys it holds could never be recorded at all.
 */
export function recordingKeys(on: boolean): void {
  bridge()?.recordingKeys(on);
}
