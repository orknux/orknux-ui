/**
 * A chat waiting for its answer draws one message, not two.
 *
 * The empty answer already drew a row of its own - the icon and the agent's
 * name - and "Waiting for …" was a second row under it, with the same icon,
 * so the page showed two messages from the agent before it had said anything.
 * The wait is now said inside the answer's row, under the name.
 *
 * The chat and the send are answered in the browser; the send is held open so
 * the wait can be read.
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
  const frames = ['event: chunk', 'data: {"text":"Done."}', '', 'event: done', 'data: {"millis":1}', '', ''].join(String.fromCharCode(10));
  await route.fulfill({ status: 200, contentType: 'text/event-stream', body: frames }).catch(() => {});
});

await page.goto(`${BASE}/chat/${chat.id}`, { waitUntil: 'domcontentloaded' });
if (await drawn(page, 'the chat log')) {
  const box = page.locator('#chat-composer');
  await box.click();
  await box.fill('And on Fridays?');
  await box.press('Enter');
  const waiting = page.locator('[data-waiting]');
  await waiting.waitFor({ timeout: 5_000 }).catch(() => undefined);
  const seen = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('[class*="assistantRow"]')];
    const after = rows.slice(rows.findIndex((row) => (row.textContent ?? '').includes('Every weekday at nine.')) + 1);
    return {
      waits: document.querySelectorAll('[data-waiting]').length,
      rowsAfter: after.length,
      icons: after.filter((row) => row.querySelector('[class*="assistantAvatar"] img') !== null).length,
      named: after.some((row) => row.querySelector('[data-turn-header]') !== null && row.querySelector('[data-waiting]') !== null),
    };
  });
  record(seen.waits === 1, `the wait is said once (${seen.waits})`);
  record(seen.rowsAfter === 1 && seen.icons === 1, `one message waits for the answer, with one icon (${seen.rowsAfter} rows, ${seen.icons} icons)`);
  record(seen.named, 'the wait is under the answer’s own name');
  releaseSend?.();
  await page.getByText('Done.').first().waitFor({ timeout: 5_000 }).catch(() => {});
  record((await waiting.count()) === 0, 'and goes once the answer begins');
}

await finish(browser);
