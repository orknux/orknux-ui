/**
 * A tool call that named a run, a research or another item with a page links
 * to it from its own line in the chat - while the turn is going and after a
 * reload - folded or not. Issue #660.
 *
 * The server reads the page off what the tool returned and sends it as `link`,
 * on the `called` frame and on a reloaded call line; `ItemLinksTest`,
 * `ChatStreamRedactionTest` and `ChatInSessionTest` hold that half. This holds
 * the drawing: the page's own network answers the turn, so no model is needed.
 */
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });

const { chatSessions } = await graphql(`query ($w: ID!) { chatSessions(workspaceId: $w) { id } }`, { w: WORKSPACE });
const chat = chatSessions[0];
if (chat === undefined) {
  record(false, 'the workspace has a chat to open; the seed builds one');
  await finish(browser);
}

const run = `/workspace/${WORKSPACE}/executions/12`;
const issue = `/workspace/${WORKSPACE}/issues/7`;
const line = (role, content, extra = {}) => ({
  role, content, actor: null, takes: [], thinking: null, thinkingMillis: null, at: null, attachments: [], link: null, ...extra,
});

await page.route('**/graphql', async (route) => {
  if ((route.request().postData() ?? '').includes('ChatMessages')) {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          chatMessages: [
            line('user', 'File the export bug'),
            line('tool', '{"title":"Export runs twice"}', { actor: 'orknux_open_issue', link: { url: issue, name: 'Export runs twice' } }),
            line('tool', '{"query":"export"}', { actor: 'search_tickets' }),
            line('assistant', 'Filed as #7.'),
          ],
        },
      }),
    });
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
      frame('call', { at: 0, tool: 'orknux_run_workflow', arguments: '{"workflow":"Nightly export"}' }),
      frame('called', {
        at: 0,
        result: JSON.stringify({ started: 12, workflow: 'Nightly export', url: `${BASE}${run}` }),
        failed: false,
        link: { url: run, name: 'Nightly export' },
      }),
      frame('call', { at: 1, tool: 'web_search', arguments: '{"query":"export"}' }),
      frame('called', { at: 1, result: '{"results":[]}', failed: false, link: null }),
      frame('chunk', { text: 'Started run 12.' }),
      frame('done', { millis: 120, thinkingMillis: 0, inputTokens: 3, outputTokens: 4, cost: null }),
    ].join(''),
  }),
);

const items = () =>
  page.locator('[data-testid="call-item"]').evaluateAll((all) =>
    all.map((one) => {
      const box = one.getBoundingClientRect();
      return { href: one.getAttribute('href'), text: one.textContent, shown: box.width > 0 && box.height > 0 };
    }),
  );

await page.goto(`${BASE}/chat/${chat.id}`, { waitUntil: 'domcontentloaded' });
if (await drawn(page, 'the chat log')) {
  await page.waitForTimeout(800);

  const reloaded = await items();
  const calls = await page.locator('[data-testid="call-line"]').count();
  record(
    reloaded.length === 1 && reloaded[0].href === issue && reloaded[0].shown,
    `a call read back from the session links to the issue it filed, on its folded line (${calls} calls drawn, links ${JSON.stringify(reloaded)})`,
  );
  record(reloaded[0]?.text === 'Issue #7: Export runs twice', `and says what it is and its name (${reloaded[0]?.text})`);

  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('start the export');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2000);

  const live = (await items()).filter((one) => one.href !== issue);
  record(
    live.length === 1 && live[0].href === run && live[0].shown,
    `a call made in the turn links to the run it started, folded (${JSON.stringify(live)})`,
  );
  record(live[0]?.text === 'Workflow run #12: Nightly export', `its kind, number and name (${live[0]?.text})`);
  record((await items()).length === 2, 'and a call that named nothing grows no link');

  await page.locator(`[data-testid="call-item"][href="${run}"]`).click();
  await page.waitForTimeout(800);
  record(new URL(page.url()).pathname === run, `pressing it opens the run's page (${page.url()})`);
}

await finish(browser);
