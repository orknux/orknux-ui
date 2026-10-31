/**
 * The quick chat's copy button shows only while the pointer is on its message.
 *
 * It was always drawn, in the bubble, which made a one-word question twice as
 * tall. Read off what is drawn: the button's opacity with the pointer away and on
 * the message, and the bubble's height against one line of its text.
 *
 * Sets the workspace's quick-chat model and puts it back. The request is stopped
 * in the browser, so no model is asked; the question stays on the panel.
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

try {
  await page.route('**/quick-chat', (route) => route.abort());
  await page.goto(`${BASE}/workspace/${WORKSPACE}/agents`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Ask AI' }).last().click();
  await page.getByLabel('Ask about this page').fill('hi');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();

  const copy = page.getByTestId('quick-chat-message-copy').first();
  await copy.waitFor({ state: 'attached', timeout: 5_000 });
  const opacity = () => copy.evaluate((button) => {
    let seen = 1;
    for (let at = button; at !== null; at = at.parentElement) seen *= Number(getComputedStyle(at).opacity);
    return seen;
  });
  const bubble = page.locator('p', { hasText: /^hi$/ }).last();
  const message = bubble.locator('..');

  await page.mouse.move(5, 5);
  await page.waitForTimeout(250);
  record((await opacity()) === 0, `with the pointer elsewhere the copy button is not drawn (opacity ${await opacity()})`);

  await message.hover();
  await page.waitForTimeout(250);
  // The button is drawn a little faded until it is itself hovered, so anything well above nothing is shown.
  record((await opacity()) >= 0.5, `on the message it is (opacity ${await opacity()})`);

  const inner = await bubble.boundingBox();
  const outer = await message.boundingBox();
  const line = await bubble.evaluate((one) => parseFloat(getComputedStyle(one).lineHeight) || 24);
  record(inner.height <= line + 1 && outer.height - inner.height <= 32, `a one-word question is one line tall, with no blank row in its bubble (${outer.height}px)`);

  const button = await copy.boundingBox();
  await page.mouse.move(button.x + button.width / 2, button.y + button.height / 2, { steps: 5 });
  await page.waitForTimeout(250);
  record((await opacity()) >= 0.5, 'and it stays while the pointer crosses to it');
} finally {
  await graphql(SET, { w: WORKSPACE, id: had }).catch(() => undefined);
}
await finish(browser);
