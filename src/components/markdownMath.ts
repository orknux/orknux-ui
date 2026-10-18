/**
 * The maths a model writes, put into the one spelling remark-math reads.
 *
 * Models write LaTeX four ways - `$x$`, `$$x$$`, `\(x\)` and `\[x\]` - and
 * remark-math knows only the dollar pair. Worse, read as it is, a single
 * dollar is maths, so "costs $5 and $10" would set "5 and " as a formula. So
 * remark-math is told to ignore single dollars, and this rewrites the source
 * before it is parsed:
 *
 * - `$x$` becomes `$$x$$` only where it reads as maths by the rule Pandoc and
 *   KaTeX's own auto-render use: no space just inside either dollar, and no
 *   digit straight after the closing one. "$5 and $10" fails it twice.
 * - `\(x\)` becomes `$$x$$`, inline.
 * - `\[x\]`, and a line that is nothing but `$$x$$`, become a display block.
 *
 * Code is left alone - a fenced block or a backtick span is text somebody
 * wants to see as written, dollars and backslashes included.
 */
export function normaliseMath(source: string): string {
  return splitCode(source)
    .map(([text, code]) => (code ? text : prose(text)))
    .join('');
}

/** The source in runs, each saying whether it is code: fenced blocks and backtick spans are. */
function splitCode(source: string): Array<[string, boolean]> {
  const runs: Array<[string, boolean]> = [];
  const code = /(^|\n)(```|~~~)[^\n]*\n[\s\S]*?(\n\2[^\n]*(?=\n|$)|$)|`+[^`]*`+/g;
  let at = 0;
  for (let found = code.exec(source); found !== null; found = code.exec(source)) {
    if (found.index > at) runs.push([source.slice(at, found.index), false]);
    runs.push([found[0], true]);
    at = found.index + found[0].length;
  }
  if (at < source.length) runs.push([source.slice(at), false]);
  return runs;
}

function prose(text: string): string {
  return text
    // \[ ... \] - a display block, on lines of its own so remark-math reads it as one.
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, body: string) => `\n$$\n${body.trim()}\n$$\n`)
    // A line that is only $$ ... $$ is meant as a display, not as maths inside a sentence.
    .replace(/^[ \t]*\$\$([^\n$]+?)\$\$[ \t]*$/gm, (_, body: string) => `$$\n${body.trim()}\n$$`)
    // \( ... \) - inline.
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, body: string) => `$$${body.trim()}$$`)
    // $x$ by the Pandoc rule; money stays money.
    .replace(/(?<![\\$\w])\$(?![\s$])([^$\n]*?[^\s$\\])\$(?![\d$])/g, (_, body: string) => `$$${body}$$`);
}
