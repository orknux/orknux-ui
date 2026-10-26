/**
 * What a voice turn reads aloud: the agent's words between its calls, each as
 * it arrives, and then its answer.
 *
 * Issue #671. An agent that says "Checking your decks" before it calls a tool
 * sends that line as a `said` frame, apart from the answer - the server streams
 * no answer text until the tool loop is over, and a round's words beside its
 * calls are the only thing it has to say meanwhile. The panel was handed the
 * answer alone, so the line was drawn in the chat and never spoken, and the
 * panel said Thinking over it for as long as the tools ran.
 *
 * A reading takes one text that only ever grows (see `Reading.push`), so the
 * lines and the answer are folded into one here, in the order they arrived:
 * each line is a paragraph of its own, handed over `settled` so it is read at
 * once rather than held back as a sentence still being written.
 *
 * **A line already spoken is not spoken again.** The answer is the last
 * round's text alone, so it never carries the lines by construction - but a
 * model may open its answer by repeating the line it wrote before its calls,
 * and hearing it twice is a stutter. Where the answer starts with a line
 * already read, that much of it is skipped, and while the answer so far could
 * still turn out to be such a repeat nothing of it is handed over yet.
 */
export interface VoicedTurn {
  /** A line the agent wrote beside its calls: read now, as a whole. */
  said: (text: string) => void;
  /** The answer so far, from its beginning. */
  answered: (soFar: string) => void;
  /** Everything to read for the turn, once it is over. */
  text: () => string;
}

/** Hands `onProgress` the text to read so far, and whether it ends on a whole utterance. */
export function voicedTurn(onProgress: (soFar: string, settled?: boolean) => void): VoicedTurn {
  /** Handed over already, and never to change. */
  let sealed = '';
  /** The lines read so far, as compared against the answer. */
  const lines: string[] = [];
  let answer = '';
  /** Where in the answer the part not yet sealed starts. */
  let answerFrom = 0;

  const join = (before: string, after: string) => (before === '' ? after : after === '' ? before : `${before}\n\n${after}`);
  const current = (over: boolean) => join(sealed, unrepeated(answer.slice(answerFrom), lines, over));

  return {
    said(text) {
      const line = text.trim();
      if (line === '') return;
      // Whatever of the answer came before it stays where it was heard.
      sealed = join(current(true), line);
      answerFrom = answer.length;
      lines.push(line);
      onProgress(sealed, true);
    },
    answered(soFar) {
      answer = soFar;
      onProgress(current(false), false);
    },
    text: () => current(true),
  };
}

/**
 * The answer less the lines it opens by repeating.
 *
 * `over` says no more of it is coming. Until then an answer that is still the
 * start of a line might be that line again, so it is held - answering '' - and
 * read once it has either finished the line or left it.
 */
export function unrepeated(answer: string, lines: string[], over: boolean): string {
  let rest = answer;
  for (;;) {
    const open = rest.trimStart();
    if (open === '') return '';
    const repeated = lines.find((line) => open.startsWith(line));
    if (repeated !== undefined) {
      rest = open.slice(repeated.length);
      continue;
    }
    if (!over && lines.some((line) => line.startsWith(open))) return '';
    return open;
  }
}
