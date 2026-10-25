import { diffArrays, diffWords } from 'diff';

/**
 * What changed between two versions of a document, as somebody reads it: the
 * blocks of its Markdown - a paragraph, a heading, a list, a table - compared
 * as blocks, and a block that was edited rather than added or taken out
 * compared word by word inside it.
 *
 * jsdiff (`diff`) does both comparisons. `components/diff.ts` is a line diff
 * written by hand for a function's code; prose wants words, and the shortest
 * edit script over words, with whitespace kept, is exactly what that library
 * is for.
 */
export type DiffPieceKind = 'same' | 'added' | 'removed';

export interface DiffPiece {
  kind: DiffPieceKind;
  text: string;
}

export interface DiffBlock {
  /** `changed` is a block edited in place: its pieces say which words came and went. */
  kind: DiffPieceKind | 'changed';
  pieces: DiffPiece[];
}

/** A document's Markdown in its blocks: what the server writes a blank line between. */
export function blocksOf(markdown: string): string[] {
  return markdown
    .split(/\n{2,}/)
    .map((block) => block.replace(/\s+$/, ''))
    .filter((block) => block.trim() !== '');
}

/**
 * [after] block by block, marked against [before]. With no [before] - the
 * oldest version kept - every block is simply what the version held.
 */
export function documentDiff(before: string | null, after: string): DiffBlock[] {
  const newer = blocksOf(after);
  if (before === null) return newer.map((text) => ({ kind: 'same', pieces: [{ kind: 'same', text }] }));
  const older = blocksOf(before);
  const found: DiffBlock[] = [];
  let removed: string[] = [];
  let added: string[] = [];

  // A run of blocks taken out next to a run put in is, pairwise, blocks edited in place.
  const flush = () => {
    const paired = Math.min(removed.length, added.length);
    for (let at = 0; at < paired; at += 1) {
      const pieces = diffWords(removed[at], added[at]).map(
        (part): DiffPiece => ({ kind: part.added ? 'added' : part.removed ? 'removed' : 'same', text: part.value }),
      );
      found.push({ kind: 'changed', pieces });
    }
    removed.slice(paired).forEach((text) => found.push({ kind: 'removed', pieces: [{ kind: 'removed', text }] }));
    added.slice(paired).forEach((text) => found.push({ kind: 'added', pieces: [{ kind: 'added', text }] }));
    removed = [];
    added = [];
  };

  for (const part of diffArrays(older, newer)) {
    if (part.removed) removed.push(...part.value);
    else if (part.added) added.push(...part.value);
    else {
      flush();
      part.value.forEach((text) => found.push({ kind: 'same', pieces: [{ kind: 'same', text }] }));
    }
  }
  flush();
  return found;
}

/** How many blocks were added, taken out and edited: the line above a comparison. */
export function diffCounts(blocks: DiffBlock[]): { added: number; removed: number; changed: number } {
  return {
    added: blocks.filter((one) => one.kind === 'added').length,
    removed: blocks.filter((one) => one.kind === 'removed').length,
    changed: blocks.filter((one) => one.kind === 'changed').length,
  };
}
