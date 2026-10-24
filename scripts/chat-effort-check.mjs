/**
 * The reasoning effort in the chat composer. Issue #654.
 *
 * - It is drawn beside the microphone and voice-mode buttons, level with them.
 * - Its menu offers "Model default" and exactly the words the chat's model
 *   takes, with no explanation beside any of them.
 * - A pick is sent to the server as the chat's effort, and the control shows it.
 * - A chat whose model takes no effort draws no control at all.
 *
 * Which words a model takes is answered by the check, so no Azure deployment
 * has to exist; what the server does with a pick is ChatReasoningEffortTest's.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });
const NAME = `zz effort ${Date.now()}`;

let levels = ['low', 'medium', 'high'];
let held = null;
const sent = [];

let chatId = null;
try {
  chatId = (await graphql(`mutation($input: StartChatInput!) { startChat(input: $input) { id } }`, {
    input: { workspaceId: WORKSPACE, title: NAME },
  })).startChat.id;

  await page.route('**/graphql', async (route) => {
    const body = route.request().postDataJSON() ?? {};
    const query = body.query ?? '';
    if (query.includes('setChatReasoningEffort')) {
      sent.push(body.variables);
      held = body.variables.effort ?? null;
      return route.fulfill({ json: { data: { setChatReasoningEffort: { reasoningEffort: held, reasoningEfforts: levels } } } });
    }
    if (query.includes('reasoningEfforts')) {
      return route.fulfill({ json: { data: { chatSession: { reasoningEffort: held, reasoningEfforts: levels } } } });
    }
    return route.continue();
  });

  await page.goto(`${BASE}/chat/${chatId}`, { waitUntil: 'domcontentloaded' });
  const pill = page.getByTestId('chat-effort');
  await pill.waitFor({ timeout: 20_000 }).catch(() => undefined);
  record((await pill.count()) === 1, 'a chat whose model takes an effort draws the control');

  /* ---- beside the microphone and voice mode ---- */
  const placed = await page.evaluate(() => {
    const pill = document.querySelector('[data-testid="chat-effort"]');
    const box = document.querySelector('#chat-composer');
    if (!pill || !box) return null;
    const holder = pill.parentElement;
    // The next control drawn after it: the microphone, or voice mode where there is no microphone.
    const neighbours = [
      document.querySelector('button[aria-label="Record a message"]'),
      document.querySelector('[data-testid="voice-unavailable"]'),
      document.querySelector('button[aria-label="Enter voice mode"]'),
    ].filter((one) => one !== null);
    const next = neighbours
      .map((one) => ({ one, rect: one.getBoundingClientRect() }))
      .sort((a, b) => a.rect.left - b.rect.left)[0];
    const a = pill.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    return {
      sameRow: holder?.parentElement === box.parentElement,
      afterBox: Math.round(a.left - b.right),
      gap: next ? Math.round(next.rect.left - a.right) : null,
      centres: next ? Math.round(Math.abs(a.top + a.height / 2 - (next.rect.top + next.rect.height / 2))) : null,
      height: Math.round(a.height),
      nextHeight: next ? Math.round(next.rect.height) : null,
    };
  });
  record(placed !== null && placed.sameRow && placed.afterBox >= 0, `it sits in the composer's row, after the box (${JSON.stringify(placed)})`);
  record(
    placed !== null && placed.gap !== null && placed.gap >= 0 && placed.gap <= 16,
    `directly before the microphone or voice-mode button (${placed?.gap}px between)`,
  );
  record(
    placed !== null && placed.centres !== null && placed.centres <= 2 && placed.height === placed.nextHeight,
    `level with it and as tall (${JSON.stringify(placed)})`,
  );

  /* ---- the menu ---- */
  await pill.click();
  const menu = page.getByTestId('chat-effort-menu');
  await menu.waitFor({ timeout: 3_000 }).catch(() => undefined);
  const offered = (await menu.getByRole('menuitemradio').allInnerTexts()).map((one) => one.trim());
  record(
    JSON.stringify(offered) === JSON.stringify(['Model default', 'Low', 'Medium', 'High']),
    `the menu offers the model default and the model's own words, and only those (${JSON.stringify(offered)})`,
  );
  const above = await page.evaluate(() => {
    const menu = document.querySelector('[data-testid="chat-effort-menu"]');
    const pill = document.querySelector('[data-testid="chat-effort"]');
    if (!menu || !pill) return null;
    return { menuBottom: Math.round(menu.getBoundingClientRect().bottom), pillTop: Math.round(pill.getBoundingClientRect().top) };
  });
  record(above !== null && above.menuBottom <= above.pillTop, `and opens above the button (${JSON.stringify(above)})`);
  const lines = await menu.getByRole('menuitemradio').evaluateAll((items) => items.map((one) => Math.round(one.getBoundingClientRect().height)));
  record(lines.every((height) => height < 36), `each option is one line (${JSON.stringify(lines)})`);

  /* ---- a pick is sent ---- */
  await menu.getByRole('menuitemradio', { name: 'Medium' }).click();
  await page.waitForTimeout(400);
  record(sent.length === 1 && sent[0].effort === 'medium' && String(sent[0].id) === String(chatId), `picking Medium sends it as the chat's effort (${JSON.stringify(sent)})`);
  record((await pill.innerText()).trim() === 'Medium', `and the control says so (${(await pill.innerText()).trim()})`);
  record((await menu.count()) === 0, 'and the menu closes');

  await pill.click();
  await page.getByTestId('chat-effort-menu').getByRole('menuitemradio', { name: 'Model default' }).click();
  await page.waitForTimeout(400);
  record(sent.length === 2 && sent[1].effort === null, `Model default sends no effort (${JSON.stringify(sent[1])})`);

  /* ---- a model that takes none ---- */
  levels = [];
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('#chat-composer').waitFor({ timeout: 20_000 }).catch(() => undefined);
  await page.waitForTimeout(1_500);
  record((await page.getByTestId('chat-effort').count()) === 0, 'a chat whose model takes no effort draws no control');
} finally {
  if (chatId !== null) await graphql('mutation($id: ID!) { deleteChat(id: $id) }', { id: chatId }).catch(() => undefined);
}

await finish(browser);
