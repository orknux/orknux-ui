import { graphql } from './client';

/**
 * A chat's widget: a timer or stopwatch its agent put above the composer.
 *
 * The moments (`endsAt`, `startedAt`) are what the page ticks from, so nothing
 * is asked of the server once a second; `asOf` is the server's clock when the
 * counts were worked out, for correcting a browser clock that differs.
 */
export interface ChatWidget {
  id: string;
  kind: 'TIMER' | 'STOPWATCH' | string;
  label: string;
  createdBy: string;
  running: boolean;
  done: boolean;
  asOf: string;
  durationSeconds: number | null;
  endsAt: string | null;
  remainingSeconds: number | null;
  wake: boolean | null;
  /** Whether the timer sounds when it ends, where the agent chose; null follows the workspace. */
  sound: boolean | null;
  startedAt: string | null;
  accumulatedMillis: number | null;
  elapsedMillis: number | null;
  laps: number[] | null;
}

export const WIDGET_FIELDS =
  'id kind label createdBy running done asOf durationSeconds endsAt remainingSeconds wake sound startedAt accumulatedMillis elapsedMillis laps';

export async function fetchChatWidgets(chatId: string): Promise<ChatWidget[]> {
  const data = await graphql<{ chatWidgets: ChatWidget[] }>(
    `query ($chatId: ID!) { chatWidgets(chatId: $chatId) { ${WIDGET_FIELDS} } }`,
    { chatId },
  );
  return data.chatWidgets;
}

/** `pause`, `resume`, `reset` or `lap`, as the widget's kind allows. */
export async function actOnChatWidget(id: string, action: string): Promise<ChatWidget> {
  const data = await graphql<{ actOnChatWidget: ChatWidget }>(
    `mutation ($id: ID!, $action: String!) { actOnChatWidget(id: $id, action: $action) { ${WIDGET_FIELDS} } }`,
    { id, action },
  );
  return data.actOnChatWidget;
}

export async function removeChatWidget(id: string): Promise<void> {
  await graphql<{ removeChatWidget: boolean }>(`mutation ($id: ID!) { removeChatWidget(id: $id) }`, { id });
}
