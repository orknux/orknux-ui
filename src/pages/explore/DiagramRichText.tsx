import type { CSSProperties, ReactNode } from 'react';

/**
 * Part of a label styled: `**bold**`, `*italic*`, `__underlined__`,
 * `~~struck through~~` and `[coloured]{#dc2626}`, nesting, with a backslash
 * taking a mark literally - the server's `DiagramStyledText`, read the same
 * way, so the picture exported says what the canvas shows. A mark opens only
 * before a word and closes only after one, so `2 * 3 * 4` stays arithmetic.
 */
export type TextStyle = { bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean; color?: string };
export type TextRun = { text: string; style: TextStyle };

const LITERAL = '*_~[]{}\\';
const COLOUR = /^\{(#[0-9a-fA-F]{6})\}/;
const PAIRS: [string, keyof TextStyle][] = [
  ['**', 'bold'],
  ['__', 'underline'],
  ['~~', 'strike'],
];

const blank = (c: string | undefined) => c === undefined || /\s/.test(c);

/** Where [mark] opened at [from] closes, past escapes and - for one star - past pairs; -1 where it opens before a space or never closes. */
function close(text: string, mark: string, from: number): number {
  if (from >= text.length || blank(text[from])) return -1;
  let at = from;
  while (at < text.length) {
    if (text[at] === '\\' && at + 1 < text.length) {
      at += 2;
      continue;
    }
    if (mark === '*' && text.startsWith('**', at)) {
      at += 2;
      continue;
    }
    if (text.startsWith(mark, at) && at > from && !blank(text[at - 1])) {
      // A run of stars closes on its last pair, so `***both***` is bold round italic.
      let last = at;
      if (mark === '**') while (text.startsWith('**', last + 1)) last += 1;
      return last;
    }
    at += 1;
  }
  return -1;
}

function bracket(text: string, from: number): number {
  let depth = 0;
  for (let at = from; at < text.length; at += 1) {
    if (text[at] === '\\') at += 1;
    else if (text[at] === '[') depth += 1;
    else if (text[at] === ']') {
      depth -= 1;
      if (depth === 0) return at;
    }
  }
  return -1;
}

function read(text: string, style: TextStyle, into: TextRun[]) {
  let words = '';
  const flush = () => {
    if (words !== '') into.push({ text: words, style });
    words = '';
  };
  let at = 0;
  while (at < text.length) {
    const c = text[at];
    if (c === '\\' && at + 1 < text.length && LITERAL.includes(text[at + 1])) {
      words += text[at + 1];
      at += 2;
      continue;
    }
    const pair = PAIRS.find(([mark]) => text.startsWith(mark, at));
    if (pair !== undefined) {
      const end = close(text, pair[0], at + 2);
      if (end >= 0) {
        flush();
        read(text.slice(at + 2, end), { ...style, [pair[1]]: true }, into);
        at = end + 2;
        continue;
      }
    }
    if (c === '*') {
      const end = close(text, '*', at + 1);
      if (end >= 0) {
        flush();
        read(text.slice(at + 1, end), { ...style, italic: true }, into);
        at = end + 1;
        continue;
      }
    }
    if (c === '[') {
      const end = bracket(text, at);
      const colour = end > at + 1 ? COLOUR.exec(text.slice(end + 1)) : null;
      if (colour !== null) {
        flush();
        read(text.slice(at + 1, end), { ...style, color: colour[1].toLowerCase() }, into);
        at = end + 1 + colour[0].length;
        continue;
      }
    }
    words += c;
    at += 1;
  }
  flush();
}

/** The label as runs of one style each, marks taken out. */
export function runsOf(text: string): TextRun[] {
  const runs: TextRun[] = [];
  read(text, {}, runs);
  return runs;
}

/** The words alone, as they are measured and read. */
export function plainOf(text: string): string {
  return /[*_~[\\]/.test(text) ? runsOf(text).map((run) => run.text).join('') : text;
}

function cssOf(style: TextStyle): CSSProperties | undefined {
  const lines = [style.underline ? 'underline' : '', style.strike ? 'line-through' : ''].filter((one) => one !== '').join(' ');
  const css: CSSProperties = {
    ...(style.bold ? { fontWeight: 700 } : {}),
    ...(style.italic ? { fontStyle: 'italic' } : {}),
    ...(lines !== '' ? { textDecoration: lines } : {}),
    ...(style.color !== undefined ? { color: style.color } : {}),
  };
  return Object.keys(css).length === 0 ? undefined : css;
}

/** A label drawn with its styled parts styled and its marks gone; a label with no marks is its text, unchanged. */
export function Styled({ text }: { text: string }): ReactNode {
  if (!/[*_~[\\]/.test(text)) return text;
  return runsOf(text).map((run, at) => {
    const css = cssOf(run.style);
    return css === undefined ? (
      <span key={at}>{run.text}</span>
    ) : (
      <span key={at} style={css} data-styled="">
        {run.text}
      </span>
    );
  });
}

/** What every word of a label shares: bold only where all of it is bold, a colour only where all of it is that colour. */
export function wholeStyleOf(text: string): TextStyle {
  const runs = runsOf(text).filter((run) => run.text.trim() !== '');
  if (runs.length === 0) return {};
  const all = (key: 'bold' | 'italic' | 'underline' | 'strike') => runs.every((run) => run.style[key] === true);
  const colour = runs[0].style.color;
  return {
    bold: all('bold'),
    italic: all('italic'),
    underline: all('underline'),
    strike: all('strike'),
    ...(colour !== undefined && runs.every((run) => run.style.color === colour) ? { color: colour } : {}),
  };
}

const escaped = (text: string) => text.replace(/[*_~[\]{}\\]/g, (c) => `\\${c}`);

type Mark = 'color' | 'bold' | 'italic' | 'underline' | 'strike';
/** Outermost first: a colour round everything inside it, then bold, italic, underline and strike. */
const MARK_ORDER: Mark[] = ['color', 'bold', 'italic', 'underline', 'strike'];

const sameValue = (a: TextStyle, b: TextStyle, mark: Mark) => (mark === 'color' ? a.color === b.color : (a[mark] === true) === (b[mark] === true));

/** [runs] written with the marks from [at] in [MARK_ORDER] inward: each stretch sharing one is wrapped once, so `**a*b***` and not `**a*****b***`. */
function written(runs: TextRun[], at: number): string {
  if (at === MARK_ORDER.length) return runs.map((run) => escaped(run.text)).join('');
  const mark = MARK_ORDER[at];
  const stretches: TextRun[][] = [];
  for (const run of runs) {
    const last = stretches[stretches.length - 1];
    if (last !== undefined && sameValue(last[0].style, run.style, mark)) last.push(run);
    else stretches.push([run]);
  }
  return stretches
    .map((stretch) => {
      const style = stretch[0].style;
      const on = mark === 'color' ? style.color !== undefined : style[mark] === true;
      if (!on) return written(stretch, at + 1);
      // The spaces at either end are left outside: a mark opens only before a word and closes only after one.
      const whole = stretch.map((run) => run.text).join('');
      const lead = /^\s*/.exec(whole)?.[0].length ?? 0;
      const trail = /\s*$/.exec(whole)?.[0].length ?? 0;
      if (lead === whole.length) return written(stretch, at + 1);
      const inner = cut(stretch, lead, whole.length - trail);
      const [open, close] = mark === 'color' ? ['[', `]{${style.color}}`] : mark === 'bold' ? ['**', '**'] : mark === 'italic' ? ['*', '*'] : mark === 'underline' ? ['__', '__'] : ['~~', '~~'];
      return `${escaped(whole.slice(0, lead))}${open}${written(inner, at + 1)}${close}${escaped(whole.slice(whole.length - trail))}`;
    })
    .join('');
}

/** The runs between two character offsets of their joined text. */
function cut(runs: TextRun[], from: number, to: number): TextRun[] {
  const kept: TextRun[] = [];
  let at = 0;
  for (const run of runs) {
    const start = Math.max(from, at);
    const end = Math.min(to, at + run.text.length);
    if (start < end) kept.push({ text: run.text.slice(start - at, end - at), style: run.style });
    at += run.text.length;
  }
  return kept;
}

/**
 * Runs written back as a label: the words alone where nothing is styled and
 * they read back as themselves, and the marks otherwise - what the editor
 * keeps when a styled label is put down.
 */
export function labelOf(runs: TextRun[]): string {
  const words = runs.map((run) => run.text).join('');
  if (runs.every((run) => cssOf(run.style) === undefined) && plainOf(words) === words) return words;
  return written(runs.filter((run) => run.text !== ''), 0);
}

/**
 * The whole label given a style, or a style taken off the whole of it - the
 * side panel's Text row, for a shape or several. A colour of null takes the
 * label's colours off. Parts styled differently keep what this does not touch.
 */
export function restyled(text: string, change: { bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean; color?: string | null }): string {
  if (text.trim() === '') return text;
  // Only where something is said with marks is the label rewritten: plain words keep their own spelling.
  const runs = runsOf(text).map((run) => {
    const style: TextStyle = { ...run.style };
    for (const key of ['bold', 'italic', 'underline', 'strike'] as const) {
      if (change[key] === true) style[key] = true;
      else if (change[key] === false) delete style[key];
    }
    if (change.color === null) delete style.color;
    else if (change.color !== undefined) style.color = change.color;
    return { text: run.text, style };
  });
  return labelOf(runs);
}

/* ---- Typing styled words ---- */

/** A label as it is typed: its characters and the style of each - the marks are written only when it is put down. */
export type Typed = { text: string; styles: TextStyle[] };

export function typedOf(label: string): Typed {
  const runs = runsOf(label);
  return { text: runs.map((run) => run.text).join(''), styles: runs.flatMap((run) => Array.from({ length: run.text.length }, () => run.style)) };
}

export function labelOfTyped(typed: Typed): string {
  const runs: TextRun[] = [];
  for (let at = 0; at < typed.text.length; at += 1) {
    const style = typed.styles[at] ?? {};
    const last = runs[runs.length - 1];
    if (last !== undefined && JSON.stringify(last.style) === JSON.stringify(style)) last.text += typed.text[at];
    else runs.push({ text: typed.text[at], style });
  }
  return labelOf(runs);
}

const html = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The typed words as the editable box's content: a span per run, styled as it is drawn, carrying its style to be read back. */
export function htmlOfTyped(typed: Typed): string {
  let out = '';
  let at = 0;
  while (at < typed.text.length) {
    const style = typed.styles[at] ?? {};
    let end = at + 1;
    while (end < typed.text.length && JSON.stringify(typed.styles[end] ?? {}) === JSON.stringify(style)) end += 1;
    const css = cssOf(style);
    const inline = css === undefined ? '' : Object.entries(css).map(([key, value]) => `${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}:${value}`).join(';');
    out += `<span data-s="${html(JSON.stringify(style)).replace(/"/g, '&quot;')}"${inline === '' ? '' : ` style="${inline}"`}>${html(typed.text.slice(at, end))}</span>`;
    at = end;
  }
  // A last empty line has nothing to hold the caret on it without this.
  if (typed.text === '' || typed.text.endsWith('\n')) out += '<br data-tail="">';
  return out;
}

/** What the box holds now, read back off its content - whatever the browser did to it while typing. */
export function typedOfBox(box: HTMLElement): Typed {
  const typed: Typed = { text: '', styles: [] };
  const styleOf = (node: Node): TextStyle => {
    const held = (node.parentElement?.closest('[data-s]') as HTMLElement | null)?.dataset.s;
    try {
      return held === undefined ? {} : (JSON.parse(held) as TextStyle);
    } catch {
      return {};
    }
  };
  const walk = (node: Node) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        const words = (child.textContent ?? '').replace(/​/g, '');
        const style = styleOf(child);
        typed.text += words;
        for (let at = 0; at < words.length; at += 1) typed.styles.push(style);
      } else if (child instanceof HTMLBRElement) {
        if (child.dataset.tail === undefined) {
          typed.text += '\n';
          typed.styles.push({});
        }
      } else if (child instanceof HTMLElement) {
        // A block the browser made of a new line starts one.
        if ((child.tagName === 'DIV' || child.tagName === 'P') && typed.text !== '' && !typed.text.endsWith('\n')) {
          typed.text += '\n';
          typed.styles.push({});
        }
        walk(child);
      }
    });
  };
  walk(box);
  return typed;
}

/** Where a point in the box is, counted in characters of what it holds. */
function offsetOf(box: HTMLElement, node: Node, offset: number): number {
  let count = 0;
  let found = -1;
  const walk = (at: Node): boolean => {
    if (at === node && at.nodeType !== Node.TEXT_NODE) {
      // An offset into an element counts its children before it.
      for (let child = 0; child < offset && child < at.childNodes.length; child += 1) count += lengthOf(at.childNodes[child]);
      found = count;
      return true;
    }
    if (at.nodeType === Node.TEXT_NODE) {
      if (at === node) {
        found = count + (at.textContent ?? '').slice(0, offset).replace(/​/g, '').length;
        return true;
      }
      count += (at.textContent ?? '').replace(/​/g, '').length;
      return false;
    }
    if (at instanceof HTMLBRElement) {
      if (at.dataset.tail === undefined) count += 1;
      return false;
    }
    for (const child of Array.from(at.childNodes)) if (walk(child)) return true;
    return false;
  };
  walk(box);
  return found < 0 ? count : found;
}

function lengthOf(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? '').replace(/​/g, '').length;
  if (node instanceof HTMLBRElement) return node.dataset.tail === undefined ? 1 : 0;
  return Array.from(node.childNodes).reduce((sum, child) => sum + lengthOf(child), 0);
}

/** The selection in the box, in characters; null where it is not in the box. */
export function selectionIn(box: HTMLElement): { start: number; end: number } | null {
  const selection = window.getSelection();
  if (selection === null || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!box.contains(range.startContainer) || !box.contains(range.endContainer)) return null;
  return { start: offsetOf(box, range.startContainer, range.startOffset), end: offsetOf(box, range.endContainer, range.endOffset) };
}

/** A character offset as a point in the box, for putting the selection back. */
function pointAt(box: HTMLElement, offset: number): [Node, number] {
  let left = offset;
  const texts: Text[] = [];
  const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) {
      const length = (node.textContent ?? '').length;
      texts.push(node as Text);
      if (left <= length) return [node, left];
      left -= length;
    } else if (node instanceof HTMLBRElement && node.dataset.tail === undefined) {
      if (left === 0) return [node.parentNode as Node, Array.from(node.parentNode?.childNodes ?? []).indexOf(node)];
      left -= 1;
    }
  }
  const last = texts[texts.length - 1];
  return last === undefined ? [box, box.childNodes.length > 0 && (box.lastChild as HTMLElement)?.dataset?.tail !== undefined ? box.childNodes.length - 1 : box.childNodes.length] : [last, (last.textContent ?? '').length];
}

/** Puts [typed] in the box and the selection where it was asked to be. */
export function showTyped(box: HTMLElement, typed: Typed, start: number, end = start) {
  box.innerHTML = htmlOfTyped(typed);
  const selection = window.getSelection();
  if (selection === null) return;
  const range = document.createRange();
  const [startNode, startOffset] = pointAt(box, start);
  const [endNode, endOffset] = pointAt(box, end);
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * The selected characters given a style, or have it taken off where all of
 * them have it already - Ctrl+B twice is the words as they were. A colour is
 * set, or taken off where the selection is all that colour already.
 */
export function styledTyped(typed: Typed, start: number, end: number, change: { mark: 'bold' | 'italic' | 'underline' | 'strike' } | { color: string }): Typed {
  if (start === end) return typed;
  const picked = typed.styles.slice(start, end);
  const styles = typed.styles.slice();
  if ('mark' in change) {
    const on = !picked.every((style) => style[change.mark] === true);
    for (let at = start; at < end; at += 1) {
      const style = { ...styles[at] };
      if (on) style[change.mark] = true;
      else delete style[change.mark];
      styles[at] = style;
    }
  } else {
    const off = picked.every((style) => style.color === change.color);
    for (let at = start; at < end; at += 1) {
      const style = { ...styles[at] };
      if (off) delete style.color;
      else style.color = change.color;
      styles[at] = style;
    }
  }
  return { text: typed.text, styles };
}

/** [words] put in place of the characters from [start] to [end], in the style of the character before them. */
export function insertedTyped(typed: Typed, start: number, end: number, words: string): Typed {
  const style = start > 0 && typed.text[start - 1] !== '\n' ? typed.styles[start - 1] : (typed.styles[end] ?? {});
  return {
    text: typed.text.slice(0, start) + words + typed.text.slice(end),
    styles: [...typed.styles.slice(0, start), ...Array.from({ length: words.length }, () => (words === '\n' ? {} : style)), ...typed.styles.slice(end)],
  };
}
