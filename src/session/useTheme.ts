import { useEffect, useState } from 'react';

import { currentTheme } from './theme';
import type { Theme } from './theme';

/**
 * Which way round the interface is drawn, for anything that has to know.
 *
 * Almost nothing does: the tokens carry the theme, so a component styles
 * itself and never asks. What asks is a component drawing something the
 * cascade cannot reach — an SVG behind an `<img>` is its own document, and a
 * glyph in black on a dark ground is a square of nothing.
 *
 * Watched rather than read once. The theme is toggled while the page is open,
 * and a picture chosen at mount would stay wrong until something else made the
 * component render. The attribute on the root element is the fact
 * [applyTheme] writes, so that is what is watched — anything that changes the
 * theme goes through it.
 */
export function useTheme(): Theme {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  useEffect(() => {
    const root = document.documentElement;
    const look = (): void => {
      // Dark writes no attribute at all - it is what the tokens already are -
      // so its absence is the answer rather than a missing one.
      setTheme(root.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
    };

    look();
    const watching = new MutationObserver(look);
    watching.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => watching.disconnect();
  }, []);

  return theme;
}
