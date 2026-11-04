import { useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';

import styles from './CornerButtons.module.css';

/** The space kept between the row's left edge and the attribution strip's last word. */
const REACH_GAP = 16;

/**
 * The buttons in the bottom right corner - Orknux MCP, and Ask AI where the
 * workspace has chosen a model for it - as one row fixed to the window.
 *
 * One row so that either may be missing without the other moving into a gap
 * or over it. The row measures how far it reaches in from the right, for the
 * attribution strip to end short of: measured, because the labels' widths
 * depend on the language and the font, and a fixed number let the strip run
 * under them. Ask AI measured itself alone until a second button stood beside it.
 */
export function CornerButtons({ children }: { children: ReactNode }) {
  const row = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const here = row.current;
    if (here === null) return undefined;
    const root = document.documentElement;
    const measure = () => {
      const box = here.getBoundingClientRect();
      // Nothing in it, nothing to keep clear of.
      const reach = box.width === 0 ? 0 : window.innerWidth - box.left + REACH_GAP;
      root.style.setProperty('--quick-chat-reach', `${Math.ceil(reach)}px`);
    };
    measure();
    const watching = new ResizeObserver(measure);
    watching.observe(here);
    window.addEventListener('resize', measure);
    return () => {
      watching.disconnect();
      window.removeEventListener('resize', measure);
      root.style.setProperty('--quick-chat-reach', '0px');
    };
  }, []);

  return (
    <div ref={row} className={styles.row} data-testid="corner-buttons">
      {children}
    </div>
  );
}
