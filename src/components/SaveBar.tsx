import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties, ReactNode, Ref } from 'react';

import styles from './SaveBar.module.css';
import { t } from '../i18n';

export interface SaveBarProps {
  /** What the bar holds: the page's note (Saved., a refusal), its secondary buttons, Discard, then Save. */
  children?: ReactNode;
  /**
   * Where a form that draws its own buttons puts them - `AgentForm` and its
   * siblings portal their Save into an element the page hands them. Given,
   * the bar's row is that element.
   */
  slot?: Ref<HTMLDivElement>;
}

interface Placement {
  left: number;
  bottom: number;
  paddingLeft: number;
  paddingRight: number;
}

/**
 * A page's Save, in a strip along the bottom of the window.
 *
 * It was in the page's header since #386, which answered "a button at the foot
 * of a long page is one somebody scrolls past" - but a button at the top of a
 * long page is one somebody scrolls away from, with the field they just changed
 * at the bottom. Floating, it is in view wherever the reader is. It is always
 * there on a page that saves; Save and Discard are off while there is nothing
 * to save, as Save always was.
 *
 * One strip with the shell rather than a card on the page: it starts where the
 * shell's sidebar ends, runs to the window's right edge, and sits directly on
 * the attribution footer, in the sidebar's own colour, with its top border the
 * only line between it and the page. Its contents keep the page's own side
 * padding, so Save lines up with the right edge of the content above it. The
 * quick chat's launcher sits in the footer's row below it, clear of the strip,
 * so Save is always above the AI button.
 *
 * Fixed to the window and drawn into the body: the page's content enters with
 * a transform, and a transformed ancestor makes `fixed` mean fixed to it. The
 * frame it measures is the shell's `main`, which every page with a bar scrolls
 * (`scrollContent`), so the footer is always at the window's foot to sit on.
 * A spacer of the strip's height stays in the page, so the last field rests
 * above the strip rather than under it.
 */
export function SaveBar({ children, slot }: SaveBarProps) {
  const spacer = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState<Placement | null>(null);
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    const frame = spacer.current?.closest('main') ?? null;
    if (frame === null) return undefined;
    /*
     * Whose padding the row keeps: the box the page scrolls in. That is the
     * frame, except on a page that scrolls a column of its own inside a flush
     * frame (Preferences), where the column holds the page's margins.
     */
    let scroller: HTMLElement = frame;
    for (let held = spacer.current?.parentElement ?? null; held !== null && held !== frame; held = held.parentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(held).overflowY)) {
        scroller = held;
        break;
      }
    }
    const measure = () => {
      const box = frame.getBoundingClientRect();
      const style = getComputedStyle(scroller);
      const footer = document.querySelector<HTMLElement>('[data-shell-footer]');
      const next: Placement = {
        left: box.left,
        bottom: footer === null ? 0 : Math.max(0, window.innerHeight - footer.getBoundingClientRect().top),
        paddingLeft: parseFloat(style.paddingLeft) + (scroller.getBoundingClientRect().left - box.left),
        // What the scroller keeps for its scrollbar is inside its box, so the bar's row ends where the content does.
        paddingRight: parseFloat(style.paddingRight) + (scroller.offsetWidth - scroller.clientWidth) + (box.right - scroller.getBoundingClientRect().right),
      };
      setPlaced((was) =>
        was !== null && was.left === next.left && was.bottom === next.bottom
          && was.paddingLeft === next.paddingLeft && was.paddingRight === next.paddingRight
          ? was
          : next,
      );
      setHeight(bar.current?.getBoundingClientRect().height ?? 0);
    };
    measure();
    const watcher = new ResizeObserver(measure);
    watcher.observe(frame);
    if (bar.current !== null) watcher.observe(bar.current);
    const footer = document.querySelector<HTMLElement>('[data-shell-footer]');
    if (footer !== null) watcher.observe(footer);
    window.addEventListener('resize', measure);
    // The frame slides in on arrival; a box measured mid-animation is off by the slide, and its size never changes to say so.
    window.addEventListener('animationend', measure, true);
    return () => {
      watcher.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('animationend', measure, true);
    };
  }, []);

  const style: CSSProperties = placed === null
    ? { visibility: 'hidden' }
    : { left: placed.left, bottom: placed.bottom, paddingLeft: placed.paddingLeft, paddingRight: placed.paddingRight };

  return (
    <>
      <div
        ref={spacer}
        className={styles.spacer}
        style={{ height }}
        aria-hidden="true"
        data-save-bar-spacer=""
      />
      {createPortal(
        <div ref={bar} className={styles.bar} data-testid="save-bar" style={style}>
          <div className={styles.row} ref={slot}>
            {children}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

export interface DiscardButtonProps {
  /** Puts the page's fields back to what was last loaded or saved. */
  onDiscard: () => void;
  /** Off exactly when Save has nothing to do - a page with no changes has nothing to throw away. */
  disabled: boolean;
}

/**
 * The bar's way back: beside Save, enabled when Save is, and drawn the same on
 * every page so it is one control to learn. A page that had a Discard of its
 * own uses this one in its place.
 */
export function DiscardButton({ onDiscard, disabled }: DiscardButtonProps) {
  return (
    <button type="button" className={styles.discard} onClick={onDiscard} disabled={disabled} data-testid="save-bar-discard">
      {t('Discard')}
    </button>
  );
}
