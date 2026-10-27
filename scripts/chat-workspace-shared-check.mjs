/**
 * A chat that writes into a shared session says so, and Continue in chat warns
 * before it opens one.
 *
 * A chat started from Chats is its owner's alone. One continued from a session
 * writes into that session, which everybody in the workspace reads - so it is
 * labelled Workspace shared beside its title, and the session page's Continue
 * in chat asks first, saying the same. Every chat keeps a session of its own,
 * so a chat bound to a session is not the test: the server answers
 * `sharedSession`, and a private chat was once labelled shared because the
 * label read the binding instead.
 *
 * Measured: a new private chat draws no label; a chat the server calls shared
 * draws it beside its title (the chat stubbed, as a continued chat needs a run
 * to exist); Continue in chat opens a dialog naming the sharing and opens no
 * chat until it is confirmed. Makes one chat and deletes it.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1400, height: 1000 } });

const made = (await graphql(
  'mutation ($input: StartChatInput!) { startChat(input: $input) { id sharedSession } }',
  { input: { workspaceId: WORKSPACE, title: `zzShared ${Date.now()}` } },
)).startChat;

try {
  record(made.sharedSession === false, 'the server calls a chat started from Chats private');
  await page.goto(`${BASE}/chat/${made.id}`, { waitUntil: 'domcontentloaded' });
  await page.locator('h1').first().waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
  record((await page.getByTestId('chat-workspace-shared').count()) === 0, 'a private chat carries no Workspace shared label');

  /* The same chat, as the server answers one continued from a session. */
  await page.route('**/graphql', async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    await route.fulfill({ response, body: body.replaceAll('"sharedSession":false', '"sharedSession":true') });
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  const tag = page.getByTestId('chat-workspace-shared');
  const shown = await tag.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
  record(shown, 'a chat writing into a shared session is labelled Workspace shared');
  if (shown) {
    const [tagBox, titleBox] = [await tag.boundingBox(), await page.locator('h1').first().boundingBox()];
    record(
      tagBox !== null && titleBox !== null && Math.abs(tagBox.y + tagBox.height / 2 - (titleBox.y + titleBox.height / 2)) < 8 && tagBox.x > titleBox.x,
      'beside its title',
    );
  }
  await page.unroute('**/graphql');

  /* Continue in chat, on a session page: asked first. */
  const sessions = (await graphql(`query ($w: ID!) { llmSessions(workspaceId: $w, page: 0, size: 20) { content { id key } } }`, { w: WORKSPACE })).llmSessions.content;
  const shared = sessions.find((one) => !one.key.startsWith('chat:'));
  if (shared === undefined) {
    record(false, 'the workspace has a session to continue');
  } else {
    await page.goto(`${BASE}/workspace/${WORKSPACE}/sessions/${shared.id}`, { waitUntil: 'domcontentloaded' });
    const button = page.getByTestId('session-continue');
    await button.waitFor({ timeout: 20_000 });
    const before = page.url();
    await button.click();
    const dialog = page.locator('dialog[open]');
    const asked = await dialog.waitFor({ timeout: 5_000 }).then(() => true).catch(() => false);
    record(asked, 'Continue in chat asks first');
    record(asked && /everybody in the workspace can read it/.test(await dialog.innerText()), 'saying the workspace can read what is said');
    record(page.url() === before, 'and opens no chat until it is confirmed');
    if (asked) await dialog.getByRole('button', { name: 'Cancel' }).click();
  }
} finally {
  await graphql('mutation ($id: ID!) { deleteChat(id: $id) }', { id: made.id }).catch(() => undefined);
}
await finish(browser);
