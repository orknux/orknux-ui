/**
 * The function editor takes the whole window, as the Design editors do: the
 * details down the left, the code in the middle, the chat down the right, and
 * no workspace menu and no floating "Ask AI" beside them - even in a workspace
 * that has a quick chat model, where every other page shows one.
 *
 * Its chat offers a rewrite into the same Accept and Reject the code column
 * has always drawn; its auto-completion is on until switched off, the switch
 * sits beside the wand and is remembered over a reload, and with it on the
 * completion model's code is drawn after the caret as Monaco's ghost text.
 *
 * Read off the DOM: the columns' left edges from getBoundingClientRect, the
 * diff's and the ghost text's elements counted. The models are never asked:
 * `askFunction` and `functionCompletion` are answered in the page, so what is
 * checked is the editor, not a model. Points the workspace's quick chat and
 * completion models at one of its chat models for the length of the check and
 * puts both back.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });

const { models } = await graphql(`query($w: ID!) { models(workspaceId: $w) { id kind } }`, { w: WORKSPACE }).catch(() => ({ models: [] }));
const chat = models.find((m) => m.kind === 'CHAT');
record(chat !== undefined, 'the workspace has a chat model to point the chats at');
if (chat === undefined) await finish(browser);

const had = (await graphql(`query($w: ID!) { workspace(id: $w) { quickChatModelId completionModelId } }`, { w: WORKSPACE })).workspace;
await graphql(`mutation($w: ID!, $id: ID) { setWorkspaceQuickChatModel(workspaceId: $w, modelId: $id) { id } }`, { w: WORKSPACE, id: chat.id });
// With no completion model the switch is greyed out; hovering offers to set the workspace's, which asks to confirm.
await graphql(`mutation($w: ID!) { setWorkspaceCompletionModel(workspaceId: $w, modelId: null) { id } }`, { w: WORKSPACE });
await page.goto(`${BASE}/workspace/${WORKSPACE}/functions/new`, { waitUntil: 'domcontentloaded' });
const grey = page.locator('[data-testid="function-autocomplete"]:disabled');
await grey.waitFor({ timeout: 20_000 });
const offerButton = page.getByTestId('function-autocomplete-set');
await offerButton.waitFor({ state: 'attached', timeout: 10_000 });
const shownAt = () => offerButton.evaluate((one) => getComputedStyle(one.parentElement).opacity);
const greyLook = await grey.evaluate((one) => Number(getComputedStyle(one).opacity));
record(greyLook < 1, `with no completion model the switch is greyed out (opacity ${greyLook})`);
await page.mouse.move(0, 0);
record((await shownAt()) === '0', 'and offers nothing until hovered');
await grey.hover({ force: true });
record((await shownAt()) === '1', 'hovering it shows the offer');
record((await offerButton.innerText()) === 'Set workspace completion model', `which says what it does (${await offerButton.innerText()})`);
await offerButton.click();
const confirmButton = page.getByTestId('function-autocomplete-confirm');
record(await confirmButton.isDisabled(), 'confirming is refused until a model is chosen');
const pickIt = async () => {
  await page.locator('#function-autocomplete-model').click();
  await page.locator(`[data-model-menu="function-autocomplete-model"] li[data-value="${chat.id}"]`).click();
};
await pickIt();
await page.getByTestId('function-autocomplete-cancel').click();
const afterCancel = (await graphql(`query($w: ID!) { workspace(id: $w) { completionModelId } }`, { w: WORKSPACE })).workspace.completionModelId;
record(afterCancel === null && (await page.getByTestId('function-autocomplete-dialog').count()) === 0, 'Cancel closes it and sets nothing');
await grey.hover({ force: true });
await offerButton.click();
await pickIt();
const notYet = (await graphql(`query($w: ID!) { workspace(id: $w) { completionModelId } }`, { w: WORKSPACE })).workspace.completionModelId;
record(notYet === null, 'choosing alone sets nothing');
await confirmButton.click();
await page.locator('[data-testid="function-autocomplete"][aria-pressed="true"]').waitFor({ timeout: 10_000 }).catch(() => undefined);
record((await page.locator('[data-testid="function-autocomplete"]').getAttribute('aria-pressed').catch(() => null)) === 'true', 'confirming turns it on');
const chosen = (await graphql(`query($w: ID!) { workspace(id: $w) { completionModelId } }`, { w: WORKSPACE })).workspace.completionModelId;
record(chosen === chat.id, `and sets the workspace's completion model (${chosen})`);
await graphql(`mutation($w: ID!, $id: ID) { setWorkspaceCompletionModel(workspaceId: $w, modelId: $id) { id } }`, { w: WORKSPACE, id: chat.id });

const REWRITE = 'export default function fresh(n: number): number {\n  return n * 2;\n}';
const asked = [];
await page.route('**/graphql', async (route) => {
  const body = route.request().postDataJSON() ?? {};
  const query = String(body.query ?? '');
  if (query.includes('askFunction(')) {
    asked.push(body.variables);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { askFunction: { answer: 'It doubles now.', suggestion: { code: REWRITE, note: 'Doubles it' } } } }),
    });
    return;
  }
  if (query.includes('functionCompletion(')) {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { functionCompletion: 'GHOSTLY_COMPLETION()' } }) });
    return;
  }
  await route.fallback();
});

const leftOf = async (selector) => (await page.locator(selector).first().boundingBox())?.x ?? null;

try {
  // The quick chat is there on an ordinary page of this workspace, so its absence below means something.
  await page.goto(`${BASE}/workspace/${WORKSPACE}/functions`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  record((await page.getByRole('button', { name: 'Ask AI' }).count()) > 0, 'the functions list shows Ask AI');

  await page.evaluate(() => localStorage.removeItem('orknux.function-editor.autocomplete.sieve'));
  await page.goto(`${BASE}/workspace/${WORKSPACE}/functions/new`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('function-panel').waitFor({ timeout: 20_000 });
  await page.locator('.view-lines').first().waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1000);

  record((await page.locator('[data-shell-sidebar]').count()) === 0, 'the editor has no workspace menu beside it');
  record((await page.getByRole('button', { name: 'Ask AI' }).count()) === 0, 'and no floating Ask AI');

  const details = await leftOf('aside');
  const code = await leftOf('#function-code-column');
  const talk = await leftOf('[data-testid="function-panel"]');
  record(
    details !== null && code !== null && talk !== null && details < code && code < talk,
    `details, then code, then chat, left to right (${details}, ${code}, ${talk})`,
  );
  record((await page.getByTestId('function-welcome').count()) === 1, 'the chat opens on its welcome');

  const wand = await page.getByTestId('function-wand').boundingBox();
  const toggle = page.getByTestId('function-autocomplete');
  const box = await toggle.boundingBox();
  record(
    wand !== null && box !== null && Math.abs(box.y + box.height / 2 - (wand.y + wand.height / 2)) < 4 && Math.abs(box.x - (wand.x + wand.width)) < 24,
    `auto-completion's switch sits beside the wand (wand ${JSON.stringify(wand)}, switch ${JSON.stringify(box)})`,
  );
  record((await toggle.getAttribute('aria-pressed')) === 'true', 'auto-completion is on by default');

  // Typed at the end of the code: the ghost text arrives after the completion pause.
  await page.locator('.view-lines').first().click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\nconst x = ');
  const ghost = page.locator('.ghost-text-decoration, .ghost-text');
  await ghost.first().waitFor({ timeout: 10_000 }).catch(() => undefined);
  const shown = (await ghost.allInnerTexts().catch(() => [])).join('');
  record(shown.includes('GHOSTLY_COMPLETION'), `the completion is drawn after the caret as ghost text (${JSON.stringify(shown)})`);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(300);
  const lines = (await page.locator('.view-lines').first().innerText()).replace(/ /g, ' ');
  record(lines.includes('const x = GHOSTLY_COMPLETION()'), 'Tab takes it into the code');

  await toggle.click();
  record((await toggle.getAttribute('aria-pressed')) === 'false', 'the switch turns it off');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('function-autocomplete').waitFor({ timeout: 20_000 });
  record((await page.getByTestId('function-autocomplete').getAttribute('aria-pressed')) === 'false', 'and it stays off over a reload');
  await page.getByTestId('function-autocomplete').click();

  // The chat's rewrite comes up as the diff, with Accept and Reject over it.
  await page.locator('.view-lines').first().waitFor({ timeout: 20_000 });
  const input = page.locator('[data-testid="function-chat-area"] textarea');
  await input.fill('Make it double');
  await input.press('Enter');
  await page.getByText('It doubles now.').waitFor({ timeout: 10_000 }).catch(() => undefined);
  record((await page.getByText('It doubles now.').count()) > 0, 'the answer is in the chat');
  record(asked.length === 1 && asked[0].functionId === null && typeof asked[0].code === 'string' && asked[0].code.length > 0,
    `asked about the unsaved code, with no id (${JSON.stringify(asked[0] ?? null).slice(0, 160)})`);
  const accept = page.getByRole('button', { name: 'Accept' });
  record((await accept.count()) === 1 && (await page.getByText('Doubles it').count()) > 0, 'the rewrite is offered over the code, with its note and Accept');
  await accept.click();
  // Accept compiles first, in the editor's own TypeScript worker, which takes a moment the first time.
  await page.getByText('I took the change into the editor. The function is not created yet.').waitFor({ timeout: 15_000 }).catch(() => undefined);
  const taken = (await page.locator('.view-lines').first().innerText()).replace(/ /g, ' ');
  record(taken.includes('return n * 2;'), 'Accept takes it into the editor of a function not created yet');
  record((await page.getByText('I took the change into the editor. The function is not created yet.').count()) > 0, 'and the chat is told so');
  const copies = page.locator('[data-testid$="-chat-message-copy"]');
  record((await copies.count()) >= 2, `every message of the chat has a copy button (${await copies.count()})`);
  await copies.first().click();
  record((await page.getByText('Copied').count()) === 1, 'and pressing one says it copied');
} finally {
  await graphql(`mutation($w: ID!, $id: ID) { setWorkspaceQuickChatModel(workspaceId: $w, modelId: $id) { id } }`, { w: WORKSPACE, id: had.quickChatModelId });
  await graphql(`mutation($w: ID!, $id: ID) { setWorkspaceCompletionModel(workspaceId: $w, modelId: $id) { id } }`, { w: WORKSPACE, id: had.completionModelId });
}

await finish(browser);
