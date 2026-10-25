import { useEffect, useRef, useState } from 'react';

/**
 * Inline completion: words a completion model suggests after the caret, drawn
 * grey for Tab to take. Issue #649 built it for the chat composer; the document
 * editor asks the same way, so the asking lives here once.
 *
 * Asked after a pause in the typing, and only while the caller says it is
 * ready - the caret at the end of something typed, no menu open, nothing being
 * sent. The timer and the request are both thrown away when anything changes,
 * so typing is never waited on and an answer for text that is no longer there
 * is never drawn. A request that fails shows nothing: the person asked for
 * nothing. The server hangs up the older request a newer one replaces.
 */
export interface Suggestion {
  /** The text the words were asked for. */
  after: string;
  /** The words that follow it. */
  words: string;
}

/**
 * What of [suggestion] is still to come after [text]: its words less what has
 * been typed of them since. Typing the suggested words is taking them a letter
 * at a time, and the rest stays drawn.
 */
export function stillSuggested(suggestion: Suggestion | null, text: string): string | null {
  if (suggestion === null || !text.startsWith(suggestion.after)) return null;
  const whole = suggestion.after + suggestion.words;
  if (!whole.startsWith(text) || whole.length <= text.length) return null;
  return whole.slice(text.length);
}

export interface InlineCompletionOptions {
  /** How long the typing has to pause before asking, or null where nothing is ever asked. */
  pause: number | null;
  /** What is typed: the text the suggestion follows. */
  text: string;
  /** Whether asking makes sense now: the caret at the end, no menu, nothing going. */
  ready: boolean;
  /** The request; aborted through [signal] when anything changes. */
  ask: (text: string, signal: AbortSignal) => Promise<string | null>;
  /** Anything else that makes an older answer worthless - the chat or the document being written in. */
  scope?: string | null;
}

/** The suggestion for what is typed, asked for on a pause; `rest` is what is still to be drawn after a text. */
export function useInlineCompletion({ pause, text, ready, ask, scope = null }: InlineCompletionOptions) {
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const asking = useRef(ask);
  asking.current = ask;

  useEffect(() => {
    if (pause === null || !ready || text.trim() === '') return;
    // Being typed through: the rest is on screen already, and asking again would only redraw it.
    if (text !== suggestion?.after && stillSuggested(suggestion, text) !== null) return;
    const asked = text;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      asking.current(asked, controller.signal)
        .then((words) => {
          if (controller.signal.aborted || words === null || words.trim() === '') return;
          setSuggestion({ after: asked, words });
        })
        .catch(() => undefined);
    }, pause);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // `suggestion` is read only to skip a request, never to make one: an answer arriving is not a reason to ask.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pause, ready, text, scope]);

  return {
    suggestion,
    setSuggestion,
    rest: (typed: string) => stillSuggested(suggestion, typed),
  };
}
