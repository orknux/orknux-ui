/**
 * The quick chat's header fits its window.
 *
 * The title, who answers, its picker, New conversation and Close sat in one
 * row of a 380-pixel window: every one of them wrapped onto two lines and
 * Close was pushed past the window's edge. Now the header is one row - the
 * title, New conversation and Close - and who answers is a row of its own
 * under it. Measured off what is drawn, with My Claude Code offered so the
 * picker is there:
 *
 *  - the header's parts sit on one line, none of them wrapped;
 *  - Close and New conversation are wholly inside the window;
 *  - and who answers is one line, its picker wholly inside the window.
 *
 * The server is stood in for by routes, so no model is asked.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });
const SET = 'mutation($w: ID!, $id: ID) { setWorkspaceQuickChatModel(workspaceId: $w, modelId: $id) { id } }';
const { models } = await graphql('query($w: ID!) { models(workspaceId: $w) { id kind } }', { w: WORKSPACE });
const chat = models.find((one) => one.kind === 'CHAT');
record(chat !== undefined, 'the workspace has a chat model to point the panel at');
if (chat === undefined) await finish(browser);
const had = (await graphql('query($w: ID!) { workspace(id: $w) { quickChatModelId } }', { w: WORKSPACE })).workspace.quickChatModelId;
await graphql(SET, { w: WORKSPACE, id: chat.id });

const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
try {
  await page.route('**/quick-chat/thread', (route) =>
    route.fulfill(json({ messages: [{ role: 'user', content: 'Tell me a story.' }, { role: 'assistant', content: 'The sea answered. Still here.' }], pending: null })));
  await page.route('**/graphql', async (route) => {
    const query = route.request().postDataJSON()?.query ?? '';
    if (query.includes('claudeCodeChat')) return route.fulfill(json({ data: { claudeCodeChat: { available: true, reason: null, connected: true } } }));
    return route.continue();
  });

  await page.goto(`${BASE}/workspace/${WORKSPACE}/agents`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Ask AI' }).last().click();
  const panel = page.getByTestId('quick-chat-panel');
  await panel.getByText('Still here.').waitFor({ timeout: 5_000 }).catch(() => undefined);
  await panel.getByTestId('quick-chat-answered-by').waitFor({ timeout: 5_000 }).catch(() => undefined);

  const drawn = await panel.evaluate((window) => {
    const box = (node) => node?.getBoundingClientRect() ?? null;
    const header = window.querySelector('[data-testid="quick-chat-header"]');
    const lineOf = (node) => parseFloat(getComputedStyle(node).lineHeight) || parseFloat(getComputedStyle(node).fontSize) * 1.3;
    const parts = header ? [...header.children].map((part) => ({ text: part.textContent?.trim() || part.getAttribute('aria-label'), ...JSON.parse(JSON.stringify(box(part))), line: lineOf(part) })) : [];
    const row = window.querySelector('[data-testid="quick-chat-answered-by-row"]');
    const picker = window.querySelector('[data-testid="quick-chat-answered-by"]');
    return {
      edge: JSON.parse(JSON.stringify(box(window))),
      parts,
      row: row ? { height: box(row).height, line: lineOf(row) } : null,
      picker: picker ? JSON.parse(JSON.stringify(box(picker))) : null,
    };
  });
  const middles = drawn.parts.map((part) => part.top + part.height / 2);
  record(drawn.parts.length === 3, `the header holds the title, New conversation and Close (${drawn.parts.map((part) => part.text).join(' | ')})`);
  record(Math.max(...middles) - Math.min(...middles) <= 2, `on one line (${middles.map(Math.round).join(', ')})`);
  record(drawn.parts.every((part) => part.height <= part.line * 1.5 + 8), `none of them wrapped (${drawn.parts.map((part) => `${part.text}: ${Math.round(part.height)}`).join(', ')})`);
  record(drawn.parts.every((part) => part.left >= drawn.edge.left && part.right <= drawn.edge.right - 4), 'every part wholly inside the window, Close included');
  record(drawn.row !== null && drawn.row.height <= drawn.row.line + 40, `who answers is a row of its own, one line high (${Math.round(drawn.row?.height ?? -1)}px)`);
  record(drawn.picker !== null && drawn.picker.right <= drawn.edge.right - 4, 'its picker wholly inside the window');
} finally {
  await graphql(SET, { w: WORKSPACE, id: had }).catch(() => undefined);
}
await finish(browser);
