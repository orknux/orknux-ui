/**
 * A picture a tool drew is shown once while the answer streams, and inside that answer. It is put in
 * the thread as its own line and filed against the chat, and the page also
 * listed the filed copy under the answer - so it showed twice until a reload.
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

/** One answer: a picture drawn into the thread, the file it was kept as, then the sentence about it. */
await page.route('**/api/chats/*/stream', async (route) => {
  const frames = [
    'event: drew', 'data: {"markdown":"![](/api/attachments/90210)"}', '',
    'event: filed', 'data: {"id":"90210","filename":"svg-draw.png","contentType":"image/png","sizeBytes":68}', '',
    'event: chunk', 'data: {"text":"A sunset."}', '',
    'event: done', 'data: {"millis":120,"thinkingMillis":0,"inputTokens":3,"outputTokens":4,"cost":null}', '', '',
  ].join(String.fromCharCode(10));
  await route.fulfill({ status: 200, contentType: 'text/event-stream', body: frames });
});

await page.goto(`${BASE}/chat/${chat.id}`, { waitUntil: 'domcontentloaded' });
if (await drawn(page, 'the chat log')) {
  await page.waitForTimeout(500);
  await page.fill('textarea', 'draw me an svg');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2500);
  const shown = await page.locator('img[src*="/api/attachments/90210"]').count();
  record(shown === 1, `the picture is shown once, not again under the answer (${shown})`);
  // And inside the answer the turn gave, not as a message of its own above it.
  // The message row the picture is drawn in is the one holding the answer's words.
  const together = await page.locator('img[src*="/api/attachments/90210"]').first().evaluate(
    (picture) => (picture.closest('[class*="assistantRow"]')?.textContent ?? '').includes('A sunset.'),
  );
  record(together, 'and is drawn in the answer that goes with it, not as a message of its own');
}

await finish(browser);
