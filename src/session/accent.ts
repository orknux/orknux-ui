const KEY = 'orknux.accent';

/**
 * The colour the interface is accented in: primary actions, the person's own
 * messages, what is selected. Blue is the default for somebody who has never
 * chosen; moss is the brand's, and the one `tokens.css` holds as its own.
 *
 * Kept in the browser beside the theme, for the theme's reason: it is applied
 * before the first paint, and a colour fetched after it would flash the old one
 * on every load. The colours themselves are in `tokens.css`, one per theme, so
 * each is chosen to carry on its own background rather than computed.
 */
export const ACCENTS = ['moss', 'blue', 'teal', 'violet', 'magic', 'rose', 'amber', 'slate'] as const;

export type Accent = (typeof ACCENTS)[number];

export const DEFAULT_ACCENT: Accent = 'blue';

/** The accent `tokens.css` holds without an attribute: the brand's. */
const TOKENS_OWN: Accent = 'moss';

export function currentAccent(): Accent {
  try {
    const held = window.localStorage.getItem(KEY);
    return (ACCENTS as readonly string[]).includes(held ?? '') ? (held as Accent) : DEFAULT_ACCENT;
  } catch {
    return DEFAULT_ACCENT;
  }
}

/** Puts the accent on the root element, where `tokens.css` picks it up; moss, the tokens' own, writes none. */
export function applyAccent(accent: Accent): void {
  const root = document.documentElement;
  if (accent === TOKENS_OWN) {
    root.removeAttribute('data-accent');
  } else {
    root.setAttribute('data-accent', accent);
  }
}

export function rememberAccent(accent: Accent): void {
  try {
    window.localStorage.setItem(KEY, accent);
  } catch {
    // Not remembered is not broken: the choice holds until the tab is closed.
  }
}
