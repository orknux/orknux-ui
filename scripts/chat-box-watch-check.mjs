/**
 * A box session an agent opens is watched from a link on the call's own line.
 *
 * The model used to be asked to paste the session's address into its answer,
 * and Qwen wrote a link to a task that had nothing to do with it (session
 * 870) while the address it had been handed was right. The page now draws the
 * link from what orkbox_open returned. The turn is answered by the page's own
 * network, so no model or box is needed.
 */
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });

const { chatSessions } = await graphql(`query ($w: ID!) { chatSessions(workspaceId: $w) { id } }`, { w: WORKSPACE });
const chat = chatSessions[0];
if (chat === undefined) {
  record(false, 'the workspace has a chat to open; the seed builds one');
  await finish(browser);
}
const watch = `${BASE}/workspace/${WORKSPACE}/sessions/${chat.id}?box=4242`;

await page.route('**/graphql', async (route) => {
  if ((route.request().postData() ?? '').includes('ChatMessages')) {
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
      frame('call', { at: 0, tool: 'orkbox_open', arguments: '{"box":"local"}' }),
      frame('called', { at: 0, result: JSON.stringify({ session: 4242, status: 'ready', url: watch }), failed: false }),
      frame('call', { at: 1, tool: 'orkbox_list', arguments: '{}' }),
      frame('called', { at: 1, result: JSON.stringify({ url: `${BASE}/elsewhere` }), failed: false }),
      frame('chunk', { text: 'I started a box session to unpack it.' }),
      frame('done', { millis: 120, thinkingMillis: 0, inputTokens: 3, outputTokens: 4, cost: null }),
    ].join(''),
  }),
);

await page.goto(`${BASE}/chat/${chat.id}`, { waitUntil: 'domcontentloaded' });
if (await drawn(page, 'the chat log')) {
  await page.waitForTimeout(500);
  await page.fill('textarea', 'analyse it');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2000);
  const links = await page.locator('[data-testid="call-watch"]').evaluateAll((all) => all.map((one) => ({ href: one.getAttribute('href'), text: one.textContent })));
  record(links.length === 1 && links[0].href === watch, `the orkbox_open line carries a link to the session it opened (${JSON.stringify(links)})`);
  record(links.length === 1, 'and no other call grows one for having a url in its answer');
}

await finish(browser);
