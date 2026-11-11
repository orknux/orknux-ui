import { t } from '../i18n';
/** One turn of the panel's conversation. Kept on the server, which draws it again when the panel opens. */
export interface QuickChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Where the person is, sent with every question.
 *
 * The label is what the interface itself calls the page, so the model answers
 * about "Executions" rather than about a URL; the path carries the ids, which is
 * what makes "why did this fail" answerable without asking which one.
 */
export interface QuickChatPage {
  label: string | null;
  path: string;
}

/**
 * A change the assistant is offering for a function's code.
 *
 * Beside the answer rather than inside it: it is not prose, and the panel draws
 * it against what the function says now with an accept and a reject under it.
 * Nothing has been saved when this arrives — that is what the accept is for.
 */
export interface QuickChatSuggestion {
  functionId: string;
  /** What the function is called, for the line above the diff. */
  function: string;
  note: string | null;
  code: string;
}

/**
 * The same offer, made about a tool's code.
 *
 * Its own type rather than the one above with the names changed, because the
 * two are settled in different places: a function's change is saved with a
 * parameter list read off the declaration, and a tool has no parameter list —
 * it is a default export handed one argument.
 */
export interface QuickChatToolSuggestion {
  toolId: string;
  /** What the tool is called, for the line above the diff. */
  tool: string;
  note: string | null;
  code: string;
}

export interface QuickChatAnswer {
  answer: string;
  suggestion?: QuickChatSuggestion;
  toolSuggestion?: QuickChatToolSuggestion;
}

/**
 * Asks the quick chat.
 *
 * REST rather than GraphQL to sit beside the other things a chat needs, and
 * because there is no record being made: the panel keeps its conversation in
 * the browser for as long as it is open and nowhere else.
 */
export async function askQuickChat(
  workspaceId: string,
  messages: QuickChatTurn[],
  page: QuickChatPage,
  /**
   * Aborts the request when the person presses Stop while the model thinks.
   *
   * The panel has no streaming to interrupt - one request, one answer - so
   * stopping is dropping the request rather than telling the server to halt.
   * The fetch rejects with an AbortError, which the caller reads as "stopped"
   * rather than as a failure.
   */
  signal?: AbortSignal,
  /** 'CLAUDE_CODE' to have the person's own Claude Code answer, where it is offered; absent for the workspace's model. */
  answeredBy?: string,
): Promise<QuickChatAnswer> {
  const answer = await fetch(`/api/workspaces/${workspaceId}/quick-chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages, page, ...(answeredBy ? { answeredBy } : {}) }),
    credentials: 'include',
    signal,
  });

  const said = (await answer.json().catch(() => null)) as
    | {
        answer?: string;
        error?: string;
        suggestion?: QuickChatSuggestion;
        toolSuggestion?: QuickChatToolSuggestion;
      }
    | null;
  if (!answer.ok) throw new Error(said?.error ?? t('That could not be answered.'));
  return { answer: said?.answer ?? '', suggestion: said?.suggestion, toolSuggestion: said?.toolSuggestion };
}

/** What the server has made of a question so far. */
export type QuickChatAskStatus = 'WAITING' | 'ANSWERED' | 'FAILED' | 'STOPPED';

export interface QuickChatAsked extends Partial<QuickChatAnswer> {
  id: string;
  status: QuickChatAskStatus;
  error?: string;
}

/** The conversation the panel held last in this workspace, and the question still being answered. */
export interface QuickChatThread {
  messages: QuickChatTurn[];
  pending: string | null;
  error: string | null;
}

async function said<T>(answer: Response): Promise<T> {
  const body = (await answer.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!answer.ok || body === null) throw new Error(body?.error ?? t('That could not be answered.'));
  return body;
}

/**
 * Puts a question to the panel. Answers with its id at once: the answer is
 * worked out on the server whoever is still waiting, so it survives the page
 * closing and the server restarting, and is read with `awaitQuickChat`.
 */
export async function beginQuickChat(
  workspaceId: string,
  messages: QuickChatTurn[],
  page: QuickChatPage,
  answeredBy?: string,
): Promise<QuickChatAsked> {
  return said<QuickChatAsked>(
    await fetch(`/api/workspaces/${workspaceId}/quick-chat/asks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages, page, ...(answeredBy ? { answeredBy } : {}) }),
      credentials: 'include',
    }),
  );
}

/**
 * Waits for a question's answer. Asks the server to hold each request up to
 * twenty-five seconds, and asks again while it is still waiting - through a
 * restart too, which a lost request is no more than.
 */
export async function awaitQuickChat(workspaceId: string, id: string, signal?: AbortSignal): Promise<QuickChatAsked> {
  for (let failures = 0; ; ) {
    const began = Date.now();
    try {
      const answer = await fetch(`/api/workspaces/${workspaceId}/quick-chat/asks/${id}?wait=25`, {
        credentials: 'include',
        signal,
      });
      // A server on its way back answers 502 or 503 from whatever stands in front of it; that is waiting, not an answer.
      if (answer.status >= 500) throw new Error(`${answer.status}`);
      const held = await said<QuickChatAsked>(answer);
      if (held.status !== 'WAITING') return held;
      failures = 0;
      // A server that did not hold the request is not asked again in a tight loop.
      if (Date.now() - began < 1_000) await new Promise((done) => window.setTimeout(done, 1_000));
    } catch (cause) {
      if (signal?.aborted || (cause instanceof DOMException && cause.name === 'AbortError')) throw cause;
      failures++;
      // Twenty tries a few seconds apart is long enough for a server to restart.
      if (failures > 20) throw cause instanceof Error ? cause : new Error(t('That could not be answered.'));
      await new Promise((done) => window.setTimeout(done, 3_000));
    }
  }
}

/** Stop: the question is dropped, and an answer that still comes is not kept. */
export async function stopQuickChat(workspaceId: string, id: string): Promise<void> {
  await fetch(`/api/workspaces/${workspaceId}/quick-chat/asks/${id}/stop`, { method: 'POST', credentials: 'include' }).catch(() => undefined);
}

/** The conversation to draw on opening. */
export async function fetchQuickChatThread(workspaceId: string): Promise<QuickChatThread> {
  const held = await said<{ messages?: QuickChatTurn[]; pending?: string; error?: string }>(
    await fetch(`/api/workspaces/${workspaceId}/quick-chat/thread`, { credentials: 'include' }),
  );
  return { messages: held.messages ?? [], pending: held.pending ?? null, error: held.error ?? null };
}

/** New conversation: what was said is put away, and the panel opens empty from now on. */
export async function clearQuickChatThread(workspaceId: string): Promise<void> {
  await said(await fetch(`/api/workspaces/${workspaceId}/quick-chat/thread`, { method: 'DELETE', credentials: 'include' }));
}
