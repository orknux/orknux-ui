/**
 * Ask AI is offered on any chat model by default, and None still takes it away.
 *
 * A workspace showed no Ask AI button until somebody found Quick Chat Model in
 * its settings and chose one. No choice now means Any - the first chat model
 * switched on - so the settings page says Any and the button is drawn. Choosing
 * None removes it, and a model of the workspace's own is shown as itself.
 *
 * Since 1.4.0 the same button is also the way to the person's own Claude Code,
 * where the server offers that (the local editions, `claudeCodeChat.available`):
 * there None takes the workspace's model away and Ask AI stays, answered by My
 * Claude Code alone. The check asks the server which installation this is.
 *
 * Sets the workspace's quick chat model and puts it back as it was.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });
const SET = 'mutation($w: ID!, $id: ID, $any: Boolean) { setWorkspaceQuickChatModel(workspaceId: $w, modelId: $id, useAny: $any) { id } }';

const { models } = await graphql('query($w: ID!) { models(workspaceId: $w) { id kind enabled } }', { w: WORKSPACE });
const chat = models.find((one) => one.kind === 'CHAT' && one.enabled);
record(chat !== undefined, 'the workspace has a chat model switched on');
if (chat === undefined) await finish(browser);
const had = (await graphql('query($w: ID!) { workspace(id: $w) { quickChatModelId quickChatModelAny } }', { w: WORKSPACE })).workspace;

/** Whether Ask AI is drawn on an ordinary page of the workspace. */
async function asked() {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/agents`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('mcp-connect').waitFor({ timeout: 20_000 });
  return page.locator('[aria-label="Ask AI"]').first().waitFor({ timeout: 5000 }).then(() => true).catch(() => false);
}

/** What the settings page's picker shows. */
async function picked() {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/settings`, { waitUntil: 'domcontentloaded' });
  const picker = page.locator('#quick-chat-model');
  await picker.waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
  return (await picker.innerText()).trim();
}

try {
  await graphql(SET, { w: WORKSPACE, id: null, any: true });
  record(await asked(), 'set to Any, Ask AI is in the corner');
  const any = await picked();
  record(/^Any/.test(any), `and the settings page says Any (${any})`);

  await graphql(SET, { w: WORKSPACE, id: null, any: false });
  const claude = (await graphql('query { claudeCodeChat { available } }')).claudeCodeChat?.available === true;
  record(
    (await asked()) === claude,
    claude ? 'set to None, Ask AI stays for My Claude Code alone, which this server offers' : 'set to None, there is no Ask AI',
  );
  const none = await picked();
  record(/^None/.test(none), `and the settings page says None (${none})`);

  await graphql(SET, { w: WORKSPACE, id: chat.id, any: false });
  record(await asked(), 'set to a model of its own, Ask AI is back');
} finally {
  await graphql(SET, { w: WORKSPACE, id: had.quickChatModelId, any: had.quickChatModelId === null && had.quickChatModelAny });
}

await finish(browser);
