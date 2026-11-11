import { editorTurnsInput } from './attachments';
import type { EditorTurn } from './attachments';
import { t } from '../i18n';

/**
 * A question put to an editor's chat, kept on the server until it is
 * answered: the editor waits for it here rather than on the request that
 * asked, so a reload, a closed tab or a dropped connection does not lose the
 * answer - the page opened again finds the question and waits for it too.
 */
export interface EditorAsked {
  id: string;
  status: 'WAITING' | 'ANSWERED' | 'FAILED';
  answer?: string;
  /** Whether the model saved anything; the editor reads the item again where it did. */
  changed?: boolean;
  revision?: number;
  compacted?: { summary: string; replaced: number; kept: number } | null;
  error?: string;
}

async function said<T>(answer: Response): Promise<T> {
  const body = (await answer.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!answer.ok || body === null) throw new Error(body?.error ?? t('The model could not answer.'));
  return body;
}

/** The editors whose chats keep their questions. */
export type EditorAskKind = 'document' | 'sheet' | 'wireframe' | 'diagram';

const ASK_PATHS: Record<EditorAskKind, (id: string) => string> = {
  document: (id) => `/api/design/documents/${id}/asks`,
  sheet: (id) => `/api/design/sheets/${id}/asks`,
  wireframe: (id) => `/api/design/wireframes/${id}/asks`,
  diagram: (id) => `/api/explore/diagrams/${id}/asks`,
};

/** Puts a question to a document's chat; answers its id at once. */
export async function beginDocumentAsk(id: string, modelId: string, messages: EditorTurn[], readOnly = false): Promise<string> {
  return beginEditorAsk('document', id, modelId, messages, readOnly);
}

/** Puts a question to an editor's chat; answers its id at once. */
export async function beginEditorAsk(kind: EditorAskKind, id: string, modelId: string, messages: EditorTurn[], readOnly = false): Promise<string> {
  const asked = await said<{ id: string }>(
    await fetch(ASK_PATHS[kind](id), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ modelId: Number(modelId), messages: editorTurnsInput(messages), readOnly }),
      credentials: 'include',
    }),
  );
  return asked.id;
}

/** The question still being answered on this document for whoever is signed in, or null. */
export async function fetchPendingDocumentAsk(id: string): Promise<string | null> {
  const held = await said<{ id: string | null }>(await fetch(`/api/design/documents/${id}/asks/pending`, { credentials: 'include' }));
  return held.id ?? null;
}

/**
 * Waits for a question's answer: the server holds each request up to
 * twenty-five seconds, and is asked again while the question is still being
 * answered - through a restart too, which a lost request is no more than.
 */
export async function awaitEditorAsk(id: string, signal?: AbortSignal): Promise<EditorAsked> {
  for (let failures = 0; ; ) {
    const began = Date.now();
    try {
      const answer = await fetch(`/api/editor-asks/${id}?wait=25`, { credentials: 'include', signal });
      if (answer.status >= 500) throw new Error(`${answer.status}`);
      const held = await said<EditorAsked>(answer);
      if (held.status !== 'WAITING') return held;
      failures = 0;
      if (Date.now() - began < 1_000) await new Promise((done) => window.setTimeout(done, 1_000));
    } catch (cause) {
      if (signal?.aborted || (cause instanceof DOMException && cause.name === 'AbortError')) throw cause;
      failures++;
      if (failures > 20) throw cause instanceof Error ? cause : new Error(t('The model could not answer.'));
      await new Promise((done) => window.setTimeout(done, 3_000));
    }
  }
}

/** Where a tab keeps the question being answered on one item, so a reload waits for its answer rather than losing it. */
export const keptAskKey = (kind: EditorAskKind, id: string) => `orknux.${kind}.ask.${id}`;

function keep(kind: EditorAskKind, id: string, askId: string | null) {
  try {
    if (askId === null) sessionStorage.removeItem(keptAskKey(kind, id));
    else sessionStorage.setItem(keptAskKey(kind, id), askId);
  } catch {
    // Not kept: a reload then loses this answer, as every answer used to.
  }
}

/** The question this tab was waiting for on the item when it was loaded again, or null. */
export function keptAskOf(kind: EditorAskKind, id: string): string | null {
  try {
    return sessionStorage.getItem(keptAskKey(kind, id));
  } catch {
    return null;
  }
}

/** A kept question's answer; a failure is thrown in the server's words, and the tab lets go of it either way. */
export async function resumeKept(kind: EditorAskKind, id: string, askId: string): Promise<EditorAsked> {
  try {
    const settled = await awaitEditorAsk(askId);
    if (settled.status === 'FAILED') throw new Error(settled.error ?? t('The model could not answer.'));
    return settled;
  } finally {
    keep(kind, id, null);
  }
}

/** Asks an editor's chat through a kept question, held for this tab until its answer is drawn. */
export async function askKept(kind: EditorAskKind, id: string, modelId: string, messages: EditorTurn[]): Promise<EditorAsked> {
  const askId = await beginEditorAsk(kind, id, modelId, messages);
  keep(kind, id, askId);
  return resumeKept(kind, id, askId);
}
