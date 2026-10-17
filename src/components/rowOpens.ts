import type { MouseEvent } from 'react';

/**
 * A row's click handler that stands aside for the controls on the row.
 *
 * A row that opens its page carries a real link in it - the name, for the
 * keyboard - and often a button or two. A click on the link navigates on its
 * own, then bubbles to the row, which navigated again to the same place: two
 * history entries, and Back had to be pressed twice to leave the page. So the
 * row acts only on a click that no control claimed.
 */
export function unlessControl(open: () => void): (event: MouseEvent<HTMLElement>) => void {
  return (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('a, button, input, select, textarea, label') !== null) return;
    open();
  };
}
