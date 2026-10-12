/**
 * Which time zone times are drawn in.
 *
 * The person's own choice, kept with their account and handed over with the
 * session - like the language, it follows them between machines, and a
 * borrowed browser's clock is not something they chose. Null while they have
 * not chosen, and every time is drawn in the browser's own zone, which is what
 * the formatters do when given no zone at all.
 */
let chosen: string | null = null;

/** Takes the zone the session carries. A name this browser does not know is ignored rather than thrown on. */
export function adoptTimeZone(name: string | null | undefined): void {
  chosen = name != null && known(name) ? name : null;
}

/** The zone they chose, or null where the browser's own is used. */
export function chosenTimeZone(): string | null {
  return chosen;
}

/** The browser's own zone, for the picker to name as the default. */
export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Every zone this browser can draw in, by IANA name. */
export function timeZones(): string[] {
  const all = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone');
  return all ?? [browserTimeZone(), 'UTC'];
}

/**
 * Formatter options with the chosen zone in them. Every date the interface
 * shows goes through this - `at.toLocaleString(undefined, zoned())`,
 * `new Intl.DateTimeFormat('en-US', zoned({ ... }))` - so one choice moves
 * them all, and a formatter that skips it is drawn in the browser's zone.
 */
export function zoned(options: Intl.DateTimeFormatOptions = {}): Intl.DateTimeFormatOptions {
  return chosen === null ? options : { ...options, timeZone: chosen };
}

function known(name: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: name });
    return true;
  } catch {
    return false;
  }
}
