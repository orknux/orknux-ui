/**
 * A review the agent sends from inside a turn - rate_session - is drawn in the
 * chat as the turn goes on, not after a reload. The page read the reviews again
 * only when the number of messages changed, and a call made after the answer's
 * own line was on the page changed nothing.
 */
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });

const { chatSessions } = await graphql(
  `query ($w: ID!) { chatSessions(workspaceId: $w) { id title } }`,
  { w: WORKSPACE },
);
const chat = chatSessions[0];
if (chat === undefined) {
  record(false, 'the workspace has a chat to open; the seed builds one');
  await finish(browser);
}

/** One red pixel, so a thumbnail that draws has bytes that are ours. */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
await page.route('**/api/attachments/*', (route) =>
  route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }),
);
await page.route('**/api/chat-pictures/**', (route) =>
  route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }),
);

/**
 * What the server holds for this chat.
 *
 * Empty until the turn has been answered, which is the whole point: the strip
 * must be filled by the page reading it back, not by it having been there all
 * along.
 */
let filed = [];
/** The chat's reviews: none until the agent's call has come back. */
let reviews = [];
await page.route('**/graphql', async (route) => {
  const body = route.request().postData() ?? '';
  if (body.includes('ChatMessages')) {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { chatMessages: [] } }),
    });
    return;
  }
  if (body.includes('chatReviews')) {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { chatReviews: reviews } }) });
    return;
  }
  if (body.includes('ChatAttachments')) {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { chatAttachments: filed } }),
    });
    return;
  }
  await route.continue();
});

/** One turn: the person's rating sent with rate_session, then a sentence; held open a moment so the page is still in the turn. */
await page.route('**/api/chats/*/stream', async (route) => {
  // After the page has read the reviews on sending, as a call made later in the turn is.
  await new Promise((done) => setTimeout(done, 1500));
  reviews = [{ id: '990777', at: new Date().toISOString(), score: 3, review: null, personName: 'alice', withdrawnAt: null }];
  const frames = [
    'event: call', 'data: {"at":0,"tool":"rate_session","arguments":"{\\"score\\":3}"}', '',
    'event: called', 'data: {"at":0,"result":"{\\"sent\\":true,\\"id\\":990777}","failed":false}', '',
    'event: chunk', 'data: {"text":"Sent - 3/5 is on record."}', '',
    'event: done', 'data: {"millis":120,"thinkingMillis":0,"inputTokens":3,"outputTokens":4,"cost":null}', '', '',
  ].join(String.fromCharCode(10));
  await route.fulfill({ status: 200, contentType: 'text/event-stream', body: frames });
});

await page.goto(`${BASE}/chat/${chat.id}`, { waitUntil: 'domcontentloaded' });
if (await drawn(page, 'the chat log')) {
  await page.waitForTimeout(500);
  await page.fill('textarea', 'I rate this answer 3/5');
  await page.keyboard.press('Enter');
  const card = page.getByTestId('chat-review');
  const seen = await card.first().waitFor({ timeout: 5_000 }).then(() => true).catch(() => false);
  record(seen, `the review is drawn without a reload (${await card.count()} card)`);
}

await finish(browser);
