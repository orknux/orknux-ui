import { graphql } from './client';

/**
 * A session's timers: the reminders its agent set with timer_set, and a chat
 * timer widget's wake-up, read back for the session page. Read-only - the agent
 * calls one off with timer_cancel.
 */
export interface SessionTimer {
  /** The id timer_set answered. */
  id: string;
  /** What the agent wrote it was for. */
  note: string;
  createdAt: string;
  /** When it comes up, or came up. */
  dueAt: string;
  /** When the agent read it; null while it is still waiting. */
  rangAt: string | null;
}

/** One session's timers, waiting and rung, newest first. */
export async function fetchSessionTimers(sessionId: string): Promise<SessionTimer[]> {
  const data = await graphql<{ sessionTimers: SessionTimer[] }>(
    `query SessionTimers($sessionId: ID!) { sessionTimers(sessionId: $sessionId) { id note createdAt dueAt rangAt } }`,
    { sessionId },
  );
  return data.sessionTimers;
}
