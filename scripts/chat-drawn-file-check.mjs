/**
 * A picture the model draws lands in the chat's files, without a reload.
 *
 * The strip above the composer is read back from the server after a send - and
 * it was read back only when the send carried files of its own. So a picture
 * `chat_draw_picture` made was filed against the chat, shown in the
 * transcript, and missing from the strip until somebody reloaded the page: the
 * one place the strip is wrong is the one place it is filled by something
 * other than the person typing.
 *
 * The turn is stubbed rather than asked for. A seeded installation has no
 * image model it can reach, and what is measured here is whether the page
 * reads its files back - not whether a model draws.
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

/** One answer: a drawn picture, then the sentence about it. */
await page.route('**/api/chats/*/stream', async (route) => {
  filed = [{ id: '90210', filename: 'drawn.png', contentType: 'image/png', sizeBytes: 68 }];
  const frames = [
    'event: drew\ndata: {"markdown":"![a red bicycle](/api/chat-pictures/7)"}\n\n',
    'event: chunk\ndata: {"text":"Here it is."}\n\n',
    'event: done\ndata: {"millis":120,"thinkingMillis":0,"inputTokens":3,"outputTokens":4,"cost":null}\n\n',
  ].join('');
  await route.fulfill({ status: 200, contentType: 'text/event-stream', body: frames });
});

await page.goto(`${BASE}/chat/${chat.id}`, { waitUntil: 'domcontentloaded' });
if (await drawn(page, 'the chat log')) {
  await page.waitForTimeout(500);

  /** The thumbnails above the composer. */
  const strip = () =>
    page.evaluate(() => {
      const label = [...document.querySelectorAll('span')].find(
        (one) => one.textContent.trim() === 'Files',
      );
      const box = label?.parentElement ?? null;
      return box === null ? 0 : box.querySelectorAll('img').length;
    });

  record((await strip()) === 0, `the chat starts with no files (${await strip()})`);

  await page.fill('textarea', 'draw me a red bicycle');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2500);

  const after = await strip();
  record(after === 1, `the drawn picture is in the files strip, unreloaded (${after})`);

  /*
   * And it is the strip that changed, not the transcript alone: the picture is
   * in both, which is what filing it against the chat means.
   */
  const inProse = await page.locator('img[src*="/api/chat-pictures/"]').count();
  record(inProse > 0, `and still in the answer where it was drawn (${inProse})`);
}

await finish(browser);
