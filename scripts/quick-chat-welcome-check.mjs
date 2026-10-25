/**
 * The quick chat opens on a greeting and questions worth asking, not on a
 * paragraph: the way the wireframe and diagram editors open their chats.
 *
 * Its button says "Ask AI". Pressing one of the questions sends it, which is
 * caught at the route, so no model decides anything here: what is asserted is
 * what is drawn, and what was sent.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const { models } = await graphql(
  `query($w: ID!) { models(workspaceId: $w) { id kind } }`,
  { w: WORKSPACE },
).catch(() => ({ models: [] }));
const chat = models.find((m) => m.kind === 'CHAT');
record(chat !== undefined, 'the workspace has a chat model to point the panel at');
if (chat === undefined) await finish(browser);

const had = (
  await graphql(`query($w: ID!) { workspace(id: $w) { quickChatModelId } }`, { w: WORKSPACE })
).workspace.quickChatModelId;
await graphql(
  `mutation($w: ID!, $id: ID) { setWorkspaceQuickChatModel(workspaceId: $w, modelId: $id) { id } }`,
  { w: WORKSPACE, id: chat.id },
);

const sent = [];
await page.route('**/quick-chat', async (route) => {
  sent.push(route.request().postDataJSON());
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ answer: 'Stubbed answer.' }) });
});

try {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/agents`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  const launcher = page.getByRole('button', { name: 'Ask AI' }).last();
  const label = ((await launcher.textContent().catch(() => '')) ?? '').trim();
  record(label === 'Ask AI', `the button says Ask AI (${JSON.stringify(label)})`);

  await launcher.click();
  await page.waitForTimeout(400);

  const welcome = page.getByTestId('quick-chat-welcome');
  const hello = ((await welcome.locator('h2').textContent().catch(() => '')) ?? '').trim();
  record(/^Hi .+!/.test(hello), `it opens on a greeting by name (${JSON.stringify(hello)})`);

  const ideas = page.getByTestId('quick-chat-idea');
  const count = await ideas.count();
  record(count === 4, `with questions worth asking under it (${count})`);

  const icons = await ideas.locator('img').evaluateAll((all) => all.filter((one) => one.naturalWidth > 0).length).catch(() => 0);
  record(icons === count && count > 0, `each with its icon drawn (${icons} of ${count})`);

  const title = ((await ideas.first().locator('span').nth(2).textContent().catch(() => '')) ?? '').trim();
  await ideas.first().click();
  await page.waitForTimeout(800);
  const asked = sent.at(-1)?.messages?.at(-1)?.content;
  record(sent.length === 1 && typeof asked === 'string' && asked.length > title.length, `pressing one asks it (${title} -> ${String(asked).slice(0, 80)})`);
  record(await welcome.count() === 0, 'and the greeting gives way to the conversation');
} finally {
  await graphql(
    `mutation($w: ID!, $id: ID) { setWorkspaceQuickChatModel(workspaceId: $w, modelId: $id) { id } }`,
    { w: WORKSPACE, id: had },
  ).catch(() => undefined);
}
await finish(browser);
