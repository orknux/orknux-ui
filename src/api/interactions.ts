import { graphql } from './client';

/** One answer on offer: `id` is what is sent back, `label` what the button says. */
export interface InteractionOption {
  id: string;
  label: string;
  /** A hint for drawing it: primary, danger, or null. */
  style: string | null;
  /** What choosing it means, in a line. */
  description: string | null;
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
  /** Whether several options may be chosen; `chosen` is then their ids joined by commas. */
  multiple: boolean;
  /** Whether the person may answer in their own words. */
  allowsText: boolean;
  /** What the person wrote, where they wrote anything. */
  text: string | null;
}

/** One thing a request is about: a tool asked for, with what sort of tool it is and what it does. */
export interface InteractionItem {
  name: string;
  kind: string | null;
  description: string | null;
}

const FIELDS =
  'id kind askedBy question options { id label style description } items { name kind description } chosen chosenBy chosenAt outcome createdAt multiple allowsText text';

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

/** Any number of the options a request offers, and the person's own words where it takes them. */
export async function answerRequestWith(id: string, options: string[], text: string | null): Promise<InteractionRequest> {
  const data = await graphql<{ answerRequest: InteractionRequest }>(
    `mutation AnswerRequest($id: ID!, $options: [String!], $text: String) {
       answerRequest(id: $id, options: $options, text: $text) { ${FIELDS} }
     }`,
    { id, options, text },
  );
  return data.answerRequest;
}
