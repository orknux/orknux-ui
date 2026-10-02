/**
 * A section that can be folded down to its heading, and stays folded.
 *
 * The run page is a summary, a graph, a log and a rail of JSON, and which of
 * those somebody wants depends on what they came for: the log of a run whose
 * shape they know by heart, or the graph of one whose log is a thousand lines of
 * noise. Folding is a preference rather than a gesture, so it is remembered per
 * section and applies to every page that section appears on - one key per
 * section, not per run, because nobody wants to fold the summary again on every
 * run they open.
 *
 * The heading stays, and so does what sits beside it: a folded section is still
 * a heading to read and somewhere to unfold it from. The toggle is the heading's
 * own text with a chevron in front of it, a real button with `aria-expanded`, so
 * it is reached by Tab and read out as what it does.
 *
 * Storage is a convenience. A browser that keeps nothing - a private window,
 * site data blocked - opens every section, which is how the page always opened.
 */
import { useCallback, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import chevronIcon from '../assets/chevron-down-12.svg';
import styles from './Fold.module.css';

const PREFIX = 'orknux.fold.';

function readFolded(key: string): boolean {
  try {
    return window.localStorage.getItem(PREFIX + key) === 'folded';
  } catch {
    return false;
  }
}

function writeFolded(key: string, folded: boolean): void {
  try {
    if (folded) window.localStorage.setItem(PREFIX + key, 'folded');
    else window.localStorage.removeItem(PREFIX + key);
  } catch {
    // Kept for this page only; the next one opens it again.
  }
}

/**
 * Whether the section under `key` is open, and the way to change it.
 *
 * Read once, when the component mounts. Two sections under one key on one page
 * would drift apart until a reload, which is a reason not to share a key.
 */
export function useFold(key: string): [boolean, () => void] {
  const [open, setOpen] = useState(() => !readFolded(key));
  const toggle = useCallback(() => {
    setOpen((was) => {
      writeFolded(key, was);
      return !was;
    });
  }, [key]);
  return [open, toggle];
}

const MASK: CSSProperties = {
  maskImage: `url("${chevronIcon}")`,
  WebkitMaskImage: `url("${chevronIcon}")`,
};

/**
 * The heading's text, made the control that folds what is under it.
 *
 * Put inside the heading element rather than around it, so the outline of the
 * page is still headings and a screen reader's list of them still works.
 */
export function FoldToggle({
  open,
  onToggle,
  controls,
  className,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  /** The id of the body this folds. */
  controls: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={className === undefined ? styles.toggle : `${styles.toggle} ${className}`}
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
    >
      <span className={open ? styles.chevron : `${styles.chevron} ${styles.chevronShut}`} style={MASK} aria-hidden="true" />
      {children}
    </button>
  );
}

/**
 * What a section folds away.
 *
 * `display: contents` while open, so wrapping a section's body changes nothing
 * about how it was laid out - the card's own gap still spaces its children. The
 * children are not rendered at all while it is shut: a folded graph is a canvas
 * that is not polling layout, and a folded log is lines nobody is laying out.
 */
export function FoldBody({ id, open, children }: { id: string; open: boolean; children: ReactNode }) {
  return (
    <div id={id} className={styles.body} hidden={!open}>
      {open && children}
    </div>
  );
}
