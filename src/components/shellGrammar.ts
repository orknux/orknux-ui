import bash from 'highlight.js/lib/languages/bash';
import type { HLJSApi, Language } from 'highlight.js';

/** Shell words that open a construct rather than run a program. */
const RESERVED = [
  'if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'until', 'in', 'do', 'done',
  'case', 'esac', 'function', 'select', 'time', 'coproc',
].join('|');

/** A word a shell would look up and run: a name, a path, or a script. */
const WORD = String.raw`[A-Za-z_./~][\w./~+-]*`;

/**
 * highlight.js's bash, with the command and its flags coloured too.
 *
 * The stock grammar colours what a *script* is made of - keywords, strings,
 * variables, comments, and the builtins it knows by name - and leaves the name
 * of any program it does not know as plain text. A block of commands is almost
 * nothing else: `docker compose up -d` and `./mvnw test -pl app` hold no
 * keyword, no builtin and no string, so an answer that tells somebody what to
 * run came out in one colour while the manual's blocks, which carry comments,
 * looked highlighted. The command at the head of a line or after `|`, `&&`,
 * `||` or `;` is coloured as a name, and a `-flag` as a literal.
 *
 * The rest is bash's own, so everything it already coloured stays as it was,
 * and its aliases - `sh`, `zsh` - come with it.
 */
export function commandLine(hljs: HLJSApi): Language {
  const base = bash(hljs);
  return {
    ...base,
    contains: [
      {
        // A variable being set is not a command: `FOO=bar make` runs make.
        scope: 'title.function',
        begin: String.raw`(?<=(?:^|\||&&|;)[ \t]*(?:\$[ \t]+)?(?:[A-Za-z_]\w*=[^ \t]*[ \t]+)*)(?!(?:${RESERVED})\b)${WORD}(?=[ \t]|$)`,
        relevance: 0,
      },
      {
        scope: 'literal',
        begin: String.raw`(?<=[ \t])--?[A-Za-z][\w-]*`,
        relevance: 0,
      },
      ...(base.contains ?? []),
    ],
  };
}
