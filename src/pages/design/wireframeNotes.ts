/**
 * How tall a sticky note has to be for its words: the same numbers the server
 * reads a note with (`WireframeNotes` in Wireframe.kt), so the note drawn while
 * somebody types is the note that is saved. 13px type, 10px padding, lines 1.4
 * of the type apart, a character taken as 0.6 of the type - generous on
 * purpose, since a line too tall reads fine and a line too short hides words.
 */
const TYPE = 13;
const PADDING = 10;
const LINE = 1.4;
const CHARACTER = 0.6;

function linesOf(paragraph: string, perLine: number): number {
  const words = paragraph.trim().split(/\s+/).filter((one) => one !== '');
  if (words.length === 0) return 1;
  let lines = 1;
  let used = 0;
  for (const word of words) {
    // A word longer than a line breaks across lines, as overflow-wrap: anywhere does.
    const length = word.length;
    if (used === 0) {
      lines += Math.floor((length - 1) / perLine);
      used = ((length - 1) % perLine) + 1;
    } else if (used + 1 + length <= perLine) {
      used += 1 + length;
    } else {
      lines += 1 + Math.floor((length - 1) / perLine);
      used = ((length - 1) % perLine) + 1;
    }
  }
  return lines;
}

/** The least height a note of this width needs for these words; 0 for none. */
export function noteHeightFor(text: string, width: number): number {
  if (text.trim() === '') return 0;
  const perLine = Math.max(1, Math.floor((width - 2 * PADDING) / (TYPE * CHARACTER)));
  const lines = text.split('\n').reduce((sum, paragraph) => sum + linesOf(paragraph, perLine), 0);
  return Math.ceil(lines * TYPE * LINE + 2 * PADDING + 2);
}
