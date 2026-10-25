/**
 * While a turn runs, only the thinking still going on is live.
 *
 * The thinking above the calls - the first round's - was drawn live for the
 * whole turn, so once the model had called a tool and was thinking again, two
 * sections blinked: the first, long over, and the one actually going on. The
 * stream is held open here mid-turn, after a call and a second round of
 * thinking, by a fetch the page is handed before it loads, since a route can
 * only answer a whole body and a whole body ends the turn.
 */
import { BASE, open, record, drawn, finish } from './suite/harness.mjs';
import { WORKSPACE } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });

const { chatSessions } = await graphql(`query ($w: ID!) { chatSessions(workspaceId: $w) { id } }`, { w: WORKSPACE });
const chat = chatSessions[0];
if (chat === undefined) {
  record(false, 'the workspace has a chat to open; the seed builds one');
  await finish(browser);
}

await page.route('**/graphql', async (route) => {
  if ((route.request().postData() ?? '').includes('ChatMessages')) {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { chatMessages: [] } }) });
    return;
  }
  await route.continue();
});

// A stream that says its frames and then stays open, as a model mid-turn does.
await page.addInitScript(() => {
  const real = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!/\/api\/chats\/[^/]+\/stream$/.test(url)) return real(input, init);
    const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    const frames = [
      frame('thinking', { text: 'FIRST-THOUGHT which list to read.' }),
      frame('thought', { millis: 1200 }),
      frame('call', { at: 0, tool: 'live_lookup', arguments: '{}' }),
      frame('called', { at: 0, result: '{"ok":true}', failed: false }),
      frame('thinking', { text: 'SECOND-THOUGHT still going.' }),
    ];
    const body = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        frames.forEach((one, at) => setTimeout(() => controller.enqueue(encoder.encode(one)), 100 * (at + 1)));
        // Never closed: the turn is still running when the page is read.
      },
    });
    return Promise.resolve(new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }));
  };
});

await page.goto(`${BASE}/chat/${chat.id}`, { waitUntil: 'domcontentloaded' });
if (await drawn(page, 'the chat log')) {
  await page.waitForTimeout(500);
  await page.fill('textarea', 'look it up');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2500);
  const sections = await page.locator('[class*="assistantRow"]').last().evaluate((row) =>
    [...row.querySelectorAll('[data-testid="thinking"]')].map((one) => ({
      live: one.getAttribute('data-live'),
      later: one.closest('[data-thought]') !== null,
    })),
  );
  const first = sections.find((one) => !one.later);
  const later = sections.find((one) => one.later);
  record(first !== undefined && later !== undefined, `the turn draws the first round's thinking and a later round's (${JSON.stringify(sections)})`);
  record(first?.live === 'false', `the first round's thinking is over once a call follows it, not live (${first?.live})`);
  record(later?.live === 'true', `the round still thinking is the live one (${later?.live})`);
  record(sections.filter((one) => one.live === 'true').length === 1, `one thinking section is live at a time (${sections.filter((one) => one.live === 'true').length})`);
}

await finish(browser);
