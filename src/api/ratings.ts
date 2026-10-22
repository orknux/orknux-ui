import { graphql } from './client';
import type { PromptSource, UsageFilter, UsageTracking } from './usage';

/** One review a person wrote about a conversation, sent on by the agent through rate_session. */
export interface SessionRating {
  id: string;
  at: string;
  /** From 1 to 5. */
  score: number;
  /** What the person wrote; null where they gave only a score. */
  review: string | null;
  sessionId: string;
  /** Null for a session that has been removed. */
  sessionTitle: string | null;
  workspaceId: string;
  workspaceName: string | null;
  agentName: string;
  source: PromptSource;
  personKey: string;
  personName: string | null;
}

/** One day of the ratings chart: how many gave each score, 1 to 5, and the mean; null on a day with none. */
export interface RatingDay {
  day: string;
  counts: number[];
  average: number | null;
}

export interface SessionRatingReport {
  total: number;
  average: number | null;
  /** How many gave each score, 1 to 5. */
  counts: number[];
  /** Every day of the period, oldest first, quiet days included. */
  days: RatingDay[];
  rows: SessionRating[];
}

/** What the reviews can be put in the order of; AT is the server's own, so it is sent as none. */
export type RatingOrder = 'AT' | 'SCORE' | 'PERSON' | 'AGENT' | 'SESSION';

const SWITCH_FIELDS = 'enabled changedAt changedBy';

export async function fetchSessionRatingsEnabled(): Promise<UsageTracking> {
  const data = await graphql<{ sessionRatingsEnabled: UsageTracking }>(`query { sessionRatingsEnabled { ${SWITCH_FIELDS} } }`);
  return data.sessionRatingsEnabled;
}

export async function setSessionRatings(enabled: boolean): Promise<UsageTracking> {
  const data = await graphql<{ setSessionRatings: UsageTracking }>(
    `mutation($enabled: Boolean!) { setSessionRatings(enabled: $enabled) { ${SWITCH_FIELDS} } }`,
    { enabled },
  );
  return data.setSessionRatings;
}

export async function fetchChatReviewsEnabled(): Promise<UsageTracking> {
  const data = await graphql<{ chatReviewsEnabled: UsageTracking }>(`query { chatReviewsEnabled { ${SWITCH_FIELDS} } }`);
  return data.chatReviewsEnabled;
}

export async function setChatReviews(enabled: boolean): Promise<UsageTracking> {
  const data = await graphql<{ setChatReviews: UsageTracking }>(
    `mutation($enabled: Boolean!) { setChatReviews(enabled: $enabled) { ${SWITCH_FIELDS} } }`,
    { enabled },
  );
  return data.setChatReviews;
}

export async function fetchSessionRatings(
  filter: UsageFilter,
  page: number,
  size: number,
  order: RatingOrder = 'AT',
  ascending = false,
): Promise<SessionRatingReport> {
  const data = await graphql<{ sessionRatings: SessionRatingReport }>(
    `query($filter: UsageReportFilter, $page: Int, $size: Int, $order: String, $ascending: Boolean) {
       sessionRatings(filter: $filter, page: $page, size: $size, order: $order, ascending: $ascending) {
         total average counts
         days { day counts average }
         rows { id at score review sessionId sessionTitle workspaceId workspaceName agentName source personKey personName }
       }
     }`,
    { filter, page, size, order: order === 'AT' ? null : order, ascending },
  );
  return data.sessionRatings;
}

/** Whether reviews can be sent at all, for the chat's menu. */
export async function fetchSessionReviewsOffered(): Promise<boolean> {
  const data = await graphql<{ sessionReviewsOffered: boolean }>('query { sessionReviewsOffered }');
  return data.sessionReviewsOffered;
}

/** A review of the person's own chat: a score from 1 to 5, and their words if any. */
export async function sendChatReview(chatId: string, score: number, review: string): Promise<void> {
  await graphql<{ sendChatReview: boolean }>(
    'mutation($chatId: ID!, $score: Int!, $review: String) { sendChatReview(chatId: $chatId, score: $score, review: $review) }',
    { chatId, score, review: review.trim() || null },
  );
}

/** A review as the chat it reviews draws it. */
export interface ChatReview {
  id: string;
  at: string;
  score: number;
  review: string | null;
  personName: string | null;
}

/** The reviews of the person's own chat, oldest first: from its menu and through rate_session alike. */
export async function fetchChatReviews(chatId: string): Promise<ChatReview[]> {
  const data = await graphql<{ chatReviews: ChatReview[] }>(
    'query($chatId: ID!) { chatReviews(chatId: $chatId) { id at score review personName } }',
    { chatId },
  );
  return data.chatReviews;
}
