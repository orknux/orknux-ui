/**
 * A reload in the middle of an editor chat's answer does not lose it - in the
 * document, sheet, wireframe and diagram editors alike.
 *
 * The editors waited for the answer on the request that asked, so a reload -
 * or a dropped connection - threw it away while the server went on writing
 * it: the page came back with the question and nothing under it, for good.
 * Now the question is kept on the server and the page waits for it by its id,
 * so what is asserted, in each editor, is the page after a reload:
 *
 *  - the question is there, with the working row under it, while the answer
 *    is still being written;
 *  - and the answer is drawn under it when it comes, once, with the working
 *    row gone, the question asked once.
 *
 * The model is stood in for by routes that hold the answer until the check
 * lets it go. Makes its own items and removes them.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';
import { standInForEditorAsks } from './suite/editor-asks.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 900 } });
const stamp = Date.now().toString(36);
const STUB = {
  id: '97001', providerId: '1', workspaceId: WORKSPACE, providerName: 'Stub', name: 'Stub chat', modelId: 'stub-chat', kind: 'CHAT', enabled: true,
  contextWindow: null, maxOutput: null, parallelToolCalls: null,
};
const editors = [
  { kind: 'Document', prefix: 'document', path: (id) => `design/documents/${id}` },
  { kind: 'Sheet', prefix: 'sheet', path: (id) => `design/sheets/${id}` },
  { kind: 'Wireframe', prefix: 'wireframe', path: (id) => `design/wireframes/${id}` },
  { kind: 'Diagram', prefix: 'diagram', path: (id) => `explore/diagrams/${id}` },
];

await page.route('**/graphql', async (route) => {
  const query = route.request().postDataJSON()?.query ?? '';
  if (!query.includes('models(')) return route.continue();
  const json = await (await route.fetch()).json();
  const list = json?.data?.models;
  if (Array.isArray(list) && !list.some((one) => one.kind === 'CHAT' && one.enabled !== false)) list.push(STUB);
  return route.fulfill({ json });
});

for (const editor of editors) {
  const id = (await graphql(`mutation ($w: ID!, $n: String!) { create${editor.kind}(workspaceId: $w, name: $n) { id } }`, { w: WORKSPACE, n: `Reload ${stamp}` }))[
    `create${editor.kind}`
  ].id;
  let release = null;
  let asked = 0;
  const answer = `Here is what the ${editor.prefix} needs.`;
  try {
    await standInForEditorAsks(page, editor.prefix, async () => {
      asked += 1;
      await new Promise((resolve) => (release = resolve));
      return { answer };
    });

    await page.goto(`${BASE}/workspace/${WORKSPACE}/${editor.path(id)}`, { waitUntil: 'domcontentloaded' });
    const input = page.getByTestId(`${editor.prefix}-chat-input`);
    await input.waitFor({ timeout: 20_000 });
    await page.waitForTimeout(800);
    await input.fill('Make a start');
    await page.getByTestId(`${editor.prefix}-chat-send`).click();
    await page.getByTestId(`${editor.prefix}-chat-working`).waitFor({ timeout: 10_000 }).catch(() => undefined);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await input.waitFor({ timeout: 20_000 });
    await page.getByTestId(`${editor.prefix}-chat-working`).waitFor({ timeout: 10_000 }).catch(() => undefined);
    const questions = page.locator(`[data-testid="${editor.prefix}-chat-message"][data-role="user"]`);
    const answers = page.locator(`[data-testid="${editor.prefix}-chat-message"][data-role="assistant"]`);
    record((await questions.allTextContents()).some((text) => text.includes('Make a start')), `${editor.kind}: after a reload the question is still there`);
    record(await page.getByTestId(`${editor.prefix}-chat-working`).isVisible().catch(() => false), `${editor.kind}: with the working row under it, while the answer is written`);

    release?.();
    await page.getByText(answer).waitFor({ timeout: 15_000 }).catch(() => undefined);
    record((await answers.allTextContents()).some((text) => text.includes(answer)), `${editor.kind}: the answer arrives under it when it comes`);
    record((await answers.count()) === 1 && (await page.getByTestId(`${editor.prefix}-chat-working`).count()) === 0,
      `${editor.kind}: drawn once, and the working row goes (${await answers.count()})`);
    record(asked === 1, `${editor.kind}: the question was asked once, not again on the reload (${asked})`);
  } finally {
    release?.();
    await page.unroute(`**/api/**`).catch(() => undefined);
    await graphql(`mutation ($id: ID!) { delete${editor.kind}(id: $id) }`, { id }).catch(() => undefined);
  }
}
await finish(browser);
