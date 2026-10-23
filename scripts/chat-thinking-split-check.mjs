/**
 * Thinking is drawn where it happened. A model that thinks, calls a tool and
 * thinks again had all of it joined into the one section above its calls, so
 * what it thought after reading a tool's answer read as if it came first. The
 * thinking before the first call stays above the calls; thinking after a call
 * is a folded section of its own, in its place among them.
 */
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });

const { chatSessions } = await graphql(`query ($w: ID!) { chatSessions(workspaceId: $w) { id title } }`, { w: WORKSPACE });
const chat = chatSessions[0];
if (chat === undefined) {
  record(false, 'the workspace has a chat to open; the seed builds one');
  await finish(browser);
}

await page.route('**/graphql', async (route) => {
  const body = route.request().postData() ?? '';
  if (body.includes('ChatMessages')) {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { chatMessages: [] } }) });
    return;
  }
  await route.continue();
});

const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
await page.route('**/api/chats/*/stream', (route) =>
  route.fulfill({
    status: 200,
    contentType: 'text/event-stream',
    body: [
      frame('thinking', { text: 'FIRST-THOUGHT which list to read.' }),
      frame('call', { at: 0, tool: 'split_lookup', arguments: '{}' }),
      frame('called', { at: 0, result: '{"ok":true}', failed: false }),
      frame('thinking', { text: 'SECOND-THOUGHT the answer says ok.' }),
      frame('call', { at: 1, tool: 'split_after', arguments: '{}' }),
      frame('called', { at: 1, result: '{}', failed: false }),
      frame('chunk', { text: 'Done looking.' }),
      frame('done', { millis: 120, thinkingMillis: 0, inputTokens: 3, outputTokens: 4, cost: null }),
    ].join(''),
  }),
);

await page.goto(`${BASE}/chat/${chat.id}`, { waitUntil: 'domcontentloaded' });
if (await drawn(page, 'the chat log')) {
  await page.waitForTimeout(500);
  await page.fill('textarea', 'look it up');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2500);
  // Every Thinking section opened, then the order of what is drawn read off the page.
  const toggles = page.locator('[class*="assistantRow"]').last().locator('button[aria-expanded="false"]');
  for (let i = (await toggles.count()) - 1; i >= 0; i -= 1) await toggles.nth(i).click().catch(() => {});
  await page.waitForTimeout(300);
  const order = await page.locator('[class*="assistantRow"]').last().evaluate((row) => {
    const text = row.textContent ?? '';
    const where = (word) => text.indexOf(word);
    return {
      first: where('FIRST-THOUGHT'),
      lookup: where('split_lookup'),
      second: where('SECOND-THOUGHT'),
      after: where('split_after'),
      sections: row.querySelectorAll('[data-thought]').length,
    };
  });
  record(order.first >= 0 && order.first < order.lookup, `the thinking before the first call is above it (${JSON.stringify(order)})`);
  record(order.second > order.lookup && order.second < order.after, 'the thinking after a call is drawn after that call, before the next');
  record(order.sections === 1, `as a section of its own (${order.sections})`);
}

await finish(browser);
