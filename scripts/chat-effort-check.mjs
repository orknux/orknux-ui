/**
 * The reasoning effort in the chat composer. Issue #654.
 *
 * - It is drawn in the composer's row as one of a pair: the effort pill, then
 *   the chat's mode switch directly after it, then the microphone or voice
 *   mode - each next to the one before, level with it and as tall.
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
  // With an agent, so the mode switch (#653) is drawn beside the pill and the order of the three can be measured.
  const { workspaceAgents } = await graphql(
    `query($w: ID!) { workspaceAgents(workspaceId: $w, page: 0, size: 50) { content { id } } }`,
    { w: WORKSPACE },
  );
  const agent = workspaceAgents.content[0];
  if (agent === undefined) throw new Error('this workspace has no agent, so the mode switch cannot be drawn beside the pill');
  chatId = (await graphql(`mutation($input: StartChatInput!) { startChat(input: $input) { id } }`, {
    input: { workspaceId: WORKSPACE, title: NAME, agentId: agent.id },
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

  /* ---- effort, then mode, then the microphone or voice mode ---- */
  const placed = await page.evaluate(() => {
    const pill = document.querySelector('[data-testid="chat-effort"]');
    const mode = document.querySelector('[data-testid="chat-mode"]');
    const box = document.querySelector('#chat-composer');
    if (!pill || !mode || !box) return null;
    const holder = pill.parentElement;
    // The first speaking control: the microphone, or voice mode where there is no microphone.
    const speaking = [
      document.querySelector('button[aria-label="Record a message"]'),
      document.querySelector('[data-testid="voice-unavailable"]'),
      document.querySelector('button[aria-label="Enter voice mode"]'),
    ]
      .filter((one) => one !== null)
      .map((one) => one.getBoundingClientRect())
      .sort((a, b) => a.left - b.left)[0];
    const a = pill.getBoundingClientRect();
    const m = mode.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    const centre = (r) => r.top + r.height / 2;
    return {
      sameRow: holder?.parentElement === box.parentElement,
      afterBox: Math.round(a.left - b.right),
      effortToMode: Math.round(m.left - a.right),
      modeToSpeaking: speaking ? Math.round(speaking.left - m.right) : null,
      centres: speaking ? Math.round(Math.max(Math.abs(centre(a) - centre(m)), Math.abs(centre(m) - centre(speaking)))) : null,
      heights: [Math.round(a.height), Math.round(m.height), speaking ? Math.round(speaking.height) : null],
    };
  });
  record(placed !== null && placed.sameRow && placed.afterBox >= 0, `it sits in the composer's row, after the box (${JSON.stringify(placed)})`);
  record(
    placed !== null && placed.effortToMode >= 0 && placed.effortToMode <= 16,
    `the mode switch comes directly after it (${placed?.effortToMode}px between)`,
  );
  record(
    placed !== null && placed.modeToSpeaking !== null && placed.modeToSpeaking >= 0 && placed.modeToSpeaking <= 16,
    `and the microphone or voice-mode button directly after the switch (${placed?.modeToSpeaking}px between)`,
  );
  record(
    placed !== null && placed.centres !== null && placed.centres <= 2 && new Set(placed.heights).size === 1,
    `all three level and as tall (${JSON.stringify(placed)})`,
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
