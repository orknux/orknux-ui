import { cloneElement, isValidElement } from 'react';
import type { ReactElement, ReactNode } from 'react';

import styles from './Highlighted.module.css';
import { segmentsOfTerms } from './searchMatches';

export interface HighlightedProps {
  /** The text as it is drawn. */
  text: string;
  /** What to mark in it, as `termsOf` gives them; empty marks nothing. */
  terms: readonly string[];
}

/**
 * Plain text with every occurrence of the search's words marked.
 *
 * The `<mark>` carries `data-search-match` as the manual's did, so a check can
 * find the marks without knowing the class a CSS module hashed.
 */
export function Highlighted({ text, terms }: HighlightedProps) {
  if (terms.length === 0) return <>{text}</>;
  return <>{marked(text, terms, 'h')}</>;
}

/** `text` as strings and marks, keyed under `prefix` so siblings cannot collide. */
function marked(text: string, terms: readonly string[], prefix: string): ReactNode[] {
  return segmentsOfTerms(text, terms).map((part, index) =>
    part.match ? (
      <mark key={`${prefix}-${index}`} className={styles.match} data-search-match="">
        {part.text}
      </mark>
    ) : (
      part.text
    ),
  );
}

/** A class on a rendered element, read off its props whatever shape they came in. */
function classesOf(element: ReactElement): string {
  const className = (element.props as { className?: unknown }).className;
  return typeof className === 'string' ? className : '';
}

/**
 * The same tree, with the search's words marked in its text.
 *
 * What makes the rendered markdown markable without parsing it again. The
 * `Markdown` component parses once per text and keeps the elements it got;
 * marking is this walk over those elements, which touches only the strings
 * between them - so a mark can never land inside a tag, an attribute or a link's
 * address, and a letter typed costs a walk over what is drawn rather than a
 * parse of every card. React then reconciles: a text node splits where a mark
 * appears and joins again when it goes.
 *
 * Maths is left alone. KaTeX draws a formula as spans that each hold a glyph or
 * two, and a mark inside them would be a highlight on half a symbol.
 */
export function markTree(node: ReactNode, terms: readonly string[]): ReactNode {
  return terms.length === 0 ? node : walk(node, terms, 'm');
}

/** As `markTree`, handing back the very node it was given wherever nothing in it matched. */
function walk(node: ReactNode, terms: readonly string[], prefix: string): ReactNode {
  if (typeof node === 'string') {
    const parts = marked(node, terms, prefix);
    return parts.length === 1 && typeof parts[0] === 'string' ? node : parts;
  }
  if (Array.isArray(node)) {
    let changed = false;
    // Flattened into the one list, so the marks sit beside the keyed elements they came between.
    const done = node.flatMap((child: ReactNode, index) => {
      const after = walk(child, terms, `${prefix}-${index}`);
      if (after !== child) changed = true;
      return Array.isArray(after) && !Array.isArray(child) ? after : [after];
    });
    return changed ? done : node;
  }
  if (!isValidElement(node)) return node;
  if (classesOf(node).includes('katex')) return node;
  const children = (node.props as { children?: ReactNode }).children;
  if (children === undefined || children === null) return node;
  const after = walk(children, terms, prefix);
  if (after === children) return node;
  // Handed over as arguments rather than as one list, so React reads them as written children and asks no keys of the strings.
  return Array.isArray(after) ? cloneElement(node, undefined, ...(after as ReactNode[])) : cloneElement(node, undefined, after);
}
