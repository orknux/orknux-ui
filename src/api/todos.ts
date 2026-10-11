import { graphql } from './client';

/**
 * A session's to-do list: the plan an agent keeps with its todo_* tools, read
 * back for the session page. Read-only - the plan is the agent's.
 */
export interface SessionTodo {
  /** The number the agent gave it. */
  id: number;
  text: string;
  note: string | null;
  done: boolean;
}

/** One session's to-do items, in the agent's order, open and done alike. */
export async function fetchSessionTodos(sessionId: string): Promise<SessionTodo[]> {
  const data = await graphql<{ sessionTodos: SessionTodo[] }>(
    `query SessionTodos($sessionId: ID!) { sessionTodos(sessionId: $sessionId) { id text note done } }`,
    { sessionId },
  );
  return data.sessionTodos;
}
