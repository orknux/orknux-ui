/**
 * Where a search term sits inside a piece of text.
 *
 * One matcher for both places a hit is shown — the snippet beside the result and
 * the prose on the page — so the two cannot disagree about what matched. The
 * docs search itself selects pages with a lowercased `includes`, and this splits
 * on the same terms: plain substring, case-insensitive, every occurrence.
 *
 * Deliberately not a regular expression. The needle is whatever somebody typed
 * into the box, and `c++`, `$ref` or an unclosed `(` would either throw when
 * compiled or quietly match something else.
 */

export interface Segment {
  text: string;
  /** True for the parts that matched, which are the ones drawn as a mark. */
  match: boolean;
}

/**
 * Splits `text` around every occurrence of `needle`.
 *
 * An empty needle, or one that does not appear, yields the whole string as a
 * single unmatched segment — so a caller can render the result without first
 * asking whether anything matched.
 */
export function segments(text: string, needle: string): Segment[] {
  const wanted = needle.trim().toLowerCase();
  if (wanted === '') return [{ text, match: false }];

  const haystack = text.toLowerCase();
  const found: Segment[] = [];
  let at = 0;

  for (;;) {
    const next = haystack.indexOf(wanted, at);
    if (next === -1) break;
    if (next > at) found.push({ text: text.slice(at, next), match: false });
    found.push({ text: text.slice(next, next + wanted.length), match: true });
    at = next + wanted.length;
  }

  if (found.length === 0) return [{ text, match: false }];
  if (at < text.length) found.push({ text: text.slice(at), match: false });
  return found;
}

/**
 * The words of what was typed, each a term of its own.
 *
 * Lowercased, without repeats, and longest first, so where one term is inside
 * another - `log` and `login` - the longer is what a mark is drawn around.
 */
export function termsOf(query: string): string[] {
  const words = query.toLowerCase().split(/\s+/).filter((word) => word !== '');
  return [...new Set(words)].sort((a, b) => b.length - a.length);
}

/** Where the first of `terms` starts in `text`, or -1 where none of them is in it. */
export function firstMatch(text: string, terms: readonly string[]): number {
  const haystack = text.toLowerCase();
  let first = -1;
  for (const term of terms) {
    const at = haystack.indexOf(term);
    if (at !== -1 && (first === -1 || at < first)) first = at;
  }
  return first;
}

/**
 * Splits `text` around every occurrence of any of `terms`, which `termsOf`
 * made: lowercased, longest first.
 *
 * Leftmost first, and at one place the longest term that starts there, so two
 * words of a query never draw overlapping marks. No terms, or none present,
 * yields the whole string as one unmatched segment.
 */
export function segmentsOfTerms(text: string, terms: readonly string[]): Segment[] {
  if (terms.length === 0 || text === '') return [{ text, match: false }];
  const haystack = text.toLowerCase();
  const found: Segment[] = [];
  let at = 0;
  for (;;) {
    let next = -1;
    let length = 0;
    for (const term of terms) {
      const hit = haystack.indexOf(term, at);
      // Longest first, so at a tie the one already held is the longer.
      if (hit !== -1 && (next === -1 || hit < next)) {
        next = hit;
        length = term.length;
      }
    }
    if (next === -1) break;
    if (next > at) found.push({ text: text.slice(at, next), match: false });
    const last = found[found.length - 1];
    // Two words that meet - "quill" and "moss" in "quillmoss" - are one mark, not two side by side.
    if (next === at && last?.match === true) last.text += text.slice(next, next + length);
    else found.push({ text: text.slice(next, next + length), match: true });
    at = next + length;
  }
  if (found.length === 0) return [{ text, match: false }];
  if (at < text.length) found.push({ text: text.slice(at), match: false });
  return found;
}

/** How much of the text around a match an excerpt keeps, before and in all. */
const EXCERPT_BEFORE = 40;
const EXCERPT_LENGTH = 160;

/**
 * A short piece of `text` around the first of `terms`, on one line, or null
 * where none of them is in it.
 *
 * For a card whose match is in a part it does not draw: the body of a skill,
 * the fourth line of a memory. Cut at a space where there is one near, so it
 * does not open half way through a word, and marked with an ellipsis at each
 * end where something was left off.
 */
export function excerptAround(text: string, terms: readonly string[]): string | null {
  const flat = text.replace(/\s+/g, ' ');
  const at = firstMatch(flat, terms);
  if (at === -1) return null;
  let from = Math.max(0, at - EXCERPT_BEFORE);
  if (from > 0) {
    const space = flat.indexOf(' ', from);
    if (space !== -1 && space < at) from = space + 1;
  }
  let to = Math.min(flat.length, from + EXCERPT_LENGTH);
  if (to < flat.length) {
    const space = flat.lastIndexOf(' ', to);
    if (space > at) to = space;
  }
  return `${from > 0 ? '… ' : ''}${flat.slice(from, to).trim()}${to < flat.length ? ' …' : ''}`;
}
