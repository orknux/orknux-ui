import { nextTabShortcut, nextWindowShortcut, onTabShortcuts, previousTabShortcut, previousWindowShortcut } from './shortcut';

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
  /** Absent on an app older than this page: the server updates itself, and the app it runs in need not have. */
  windowShortcuts?(next: string, previous: string): void;
  recordingKeys(on: boolean): void;
  /** Absent on an app older than this page, as `windowShortcuts` is. */
  connectedServer?(): string | null;
  disconnect?(): void;
  /** Absent on an app older than this page, as the others are. */
  packageUpdate?: PackageUpdateBridge;
}

/**
 * Where a newer package of the desktop app stands: the app's own answer, read
 * and moved by the Updates page. The app decides everything - which feed, which
 * file, whether this install can update itself - and the page only asks.
 */
export interface PackageUpdateState {
  phase: 'idle' | 'checking' | 'current' | 'none' | 'available' | 'downloading' | 'installing' | 'failed' | 'unavailable';
  /** This app's version. */
  current: string;
  /** The newer package's, once one was found. */
  version: string | null;
  notes: string | null;
  releasedAt: string | null;
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
  error: string | null;
  /** Why this install cannot update itself, when the phase is unavailable. */
  reason: string | null;
  /** Where to get a package by hand, beside that reason. */
  releases?: string;
}

interface PackageUpdateBridge {
  state(): PackageUpdateState | null;
  check(): void;
  install(): void;
  onState(listener: (state: PackageUpdateState) => void): () => void;
}

function bridge(): DesktopBridge | null {
  return (window as unknown as { orknuxDesktop?: DesktopBridge }).orknuxDesktop ?? null;
}

/** Whether this page is in the desktop app, which is the only place with tabs of its own. */
export function inDesktopApp(): boolean {
  return bridge() !== null;
}

/** Hands the app the tab and window shortcuts now and on every change. */
export function shareTabShortcuts(): void {
  const app = bridge();
  if (app === null) return;
  const share = () => {
    app.tabShortcuts(nextTabShortcut(), previousTabShortcut());
    app.windowShortcuts?.(nextWindowShortcut(), previousWindowShortcut());
  };
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

/** The server this app is connected to, or null in a browser, in an older app, and where it runs its own. */
export function connectedServer(): string | null {
  return bridge()?.connectedServer?.() ?? null;
}

/** Asks the app to leave that server: it asks the person, then starts again at the question of where to connect. */
export function disconnectFromServer(): void {
  bridge()?.disconnect?.();
}

/** The desktop app's package updates, or null in a browser and in an app too old to offer them. */
export function packageUpdates(): PackageUpdateBridge | null {
  return bridge()?.packageUpdate ?? null;
}
