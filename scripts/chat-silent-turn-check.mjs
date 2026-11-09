/**
 * A turn that ends without a word leaves no empty message behind - and the
 * one still being written is not taken for it.
 *
 * An agent that asks the person something ends its turn there, as it is told
 * to, and says nothing: the question's card is the turn. The empty answer used
 * to stay under it as a bubble with a name and no words, which reads as an
 * answer that went missing. Hiding it is only right once the turn is over: the
 * answer being written starts as that same empty message, and it is where the
 * wait is said, so hidden too early the chat looked dead until the first word.
 *
 * The chat and the send are answered in the browser; the send is held open so
 * the wait can be read, and then ends having said nothing.
 */
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });

const { chatSessions } = await graphql(`query ($w: ID!) { chatSessions(workspaceId: $w) { id title } }`, { w: WORKSPACE });
const chat = chatSessions[0];
if (chat === undefined) {
  record(false, 'the workspace has a chat to open; the seed builds one');
  await finish(browser);
}

const line = (role, content) => ({ role, content, actor: null, takes: [], thinking: null, thinkingMillis: null, at: new Date().toISOString(), attachments: [] });
let releaseSend = null;

await page.route('**/graphql', async (route) => {
  const body = route.request().postData() ?? '';
  if (body.includes('query ChatMessages(')) {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { chatMessages: [line('user', 'When does the deploy run?'), line('assistant', 'Every weekday at nine.')] } }),
    });
    return;
  }
  await route.continue();
});
await page.route('**/api/chats/*/stream', async (route) => {
  await new Promise((resolve) => {
    releaseSend = resolve;
  });
  // Done, and not a chunk before it: the turn said nothing.
  const frames = ['event: done', 'data: {"millis":1}', '', ''].join(String.fromCharCode(10));
  await route.fulfill({ status: 200, contentType: 'text/event-stream', body: frames }).catch(() => {});
});

/** The agent's rows drawn after the last answer the chat opened with. */
const rowsAfter = () =>
  page.evaluate(() => {
    const rows = [...document.querySelectorAll('[class*="assistantRow"]')];
    const after = rows.slice(rows.findIndex((row) => (row.textContent ?? '').includes('Every weekday at nine.')) + 1);
    return { rows: after.length, waits: document.querySelectorAll('[data-waiting]').length };
  });

await page.goto(`${BASE}/chat/${chat.id}`, { waitUntil: 'domcontentloaded' });
if (await drawn(page, 'the chat log')) {
  const box = page.locator('#chat-composer');
  await box.click();
  await box.fill('Order it.');
  await box.press('Enter');
  await page.locator('[data-waiting]').waitFor({ timeout: 5_000 }).catch(() => undefined);
  const during = await rowsAfter();
  record(during.rows === 1 && during.waits === 1, `while the turn runs its empty message is drawn, with the wait in it (${during.rows} rows, ${during.waits} waits)`);

  releaseSend?.();
  await page.locator('[data-waiting]').waitFor({ state: 'detached', timeout: 5_000 }).catch(() => undefined);
  await page.waitForTimeout(500);
  const ended = await rowsAfter();
  record(ended.rows === 0, `once it has ended without a word, no empty message is left under it (${ended.rows} rows)`);
  record((await page.getByText('Order it.').count()) > 0, 'and what the person wrote is still there');
}

await finish(browser);
