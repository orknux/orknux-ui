import { graphql } from './client';

/** One answer on offer: `id` is what is sent back, `label` what the button says. */
export interface InteractionOption {
  id: string;
  label: string;
  /** A hint for drawing it: primary, danger, or null. */
  style: string | null;
}

/**
 * A question put to a person in a conversation on behalf of something that
 * needs a decision - an agent asking to expose a port, and whatever asks next.
 * Drawn from its options alone; `kind` only says which server-side handler
 * acts on the answer.
 */
export interface InteractionRequest {
  id: string;
  kind: string;
  askedBy: string | null;
  question: string;
  options: InteractionOption[];
  /** What it is about, item by item - the tools an agent asks for - drawn as a list under the question. */
  items: InteractionItem[];
  /** The option chosen; `settled` when it was decided elsewhere; null while open. */
  chosen: string | null;
  chosenBy: string | null;
  chosenAt: string | null;
  /** What became of it, kept up to date when it changes elsewhere. */
  outcome: string | null;
  createdAt: string;
}

/** One thing a request is about: a tool asked for, with what sort of tool it is and what it does. */
export interface InteractionItem {
  name: string;
  kind: string | null;
  description: string | null;
}

const FIELDS =
  'id kind askedBy question options { id label style } items { name kind description } chosen chosenBy chosenAt outcome createdAt';

export async function fetchSessionRequests(sessionId: string): Promise<InteractionRequest[]> {
  const data = await graphql<{ sessionRequests: InteractionRequest[] }>(
    `query SessionRequests($sessionId: ID!) { sessionRequests(sessionId: $sessionId) { ${FIELDS} } }`,
    { sessionId },
  );
  return data.sessionRequests;
}

export async function answerRequest(id: string, option: string): Promise<InteractionRequest> {
  const data = await graphql<{ answerRequest: InteractionRequest }>(
    `mutation AnswerRequest($id: ID!, $option: String!) { answerRequest(id: $id, option: $option) { ${FIELDS} } }`,
    { id, option },
  );
  return data.answerRequest;
}
