/**
 * A chat's mode, issue #653: the switch is in the composer's row beside the
 * send button, choosing a mode sends it and the server keeps it, and a plan
 * the agent put to the person is drawn as a plan - its markdown rendered -
 * with Approve and Keep planning, and Approve sends that answer.
 *
 * The switch is the application's own list, not a native select: a button
 * opening a listbox above the composer, the same height, outline and type as
 * the reasoning-effort pill beside it, with each row's one-line hint drawn
 * beside the row and every step reachable from the keyboard. A native select
 * fails the first of those - it is no combobox button and opens no listbox.
 *
 * The switch talks to the real server. The plan is canned on its way to the
 * page and the answer caught on its way out, so no model has to plan; the
 * effort's levels are canned too, so the pill is drawn to be compared with.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });
const PREFIX = 'zz chat mode';

const PLAN = {
  id: '999301',
  kind: 'agent.plan',
  askedBy: 'Planner',
  question: 'I read the logs.\n\n1. **Restart** the worker\n2. Watch the queue drain',
  options: [
    { id: 'approve', label: 'Approve', style: 'primary', description: null },
    { id: 'keep-planning', label: 'Keep planning', style: null, description: null },
  ],
  items: [],
  chosen: null,
  chosenBy: null,
  chosenAt: null,
  outcome: null,
  createdAt: new Date().toISOString(),
  multiple: false,
  allowsText: true,
  text: null,
};
const sent = [];

let chatId = null;
try {
  const { workspaceAgents } = await graphql(
    `query($w: ID!) { workspaceAgents(workspaceId: $w, page: 0, size: 50) { content { id name } } }`,
    { w: WORKSPACE },
  );
  const agent = workspaceAgents.content[0];
  if (agent === undefined) throw new Error('this workspace has no agent, so no chat can be started in it');

  const { chatSessions } = await graphql(`query($w: ID!) { chatSessions(workspaceId: $w) { id title } }`, { w: WORKSPACE });
  for (const old of chatSessions.filter((one) => (one.title ?? '').startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { deleteChat(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
  chatId = (await graphql(`mutation($input: StartChatInput!) { startChat(input: $input) { id } }`, {
    input: { workspaceId: WORKSPACE, title: `${PREFIX} ${Date.now()}`, agentId: agent.id },
  })).startChat.id;

  await page.route('**/graphql', async (route) => {
    const body = route.request().postDataJSON() ?? {};
    const query = body.query ?? '';
    if (query.includes('sessionRequests')) return route.fulfill({ json: { data: { sessionRequests: [PLAN] } } });
    if (query.includes('reasoningEfforts') && !query.includes('setChatReasoningEffort')) {
      return route.fulfill({ json: { data: { chatSession: { reasoningEffort: null, reasoningEfforts: ['low', 'medium', 'high'] } } } });
    }
    if (query.includes('answerRequest')) {
      sent.push(body.variables);
      return route.fulfill({
        json: { data: { answerRequest: { ...PLAN, chosen: body.variables.option ?? 'approve', chosenBy: 'alice', outcome: 'Approved' } } },
      });
    }
    if (!query.includes('llmSessionId')) return route.continue();
    // A chat has a conversation only once something is said in it; this one is given one, so the page asks for its requests.
    const answered = await route.fetch();
    const json = await answered.json();
    const give = (node) => {
      if (Array.isArray(node)) return node.forEach(give);
      if (node === null || typeof node !== 'object') return;
      if (String(node.id) === String(chatId) && 'llmSessionId' in node) node.llmSessionId = '999300';
      Object.values(node).forEach(give);
    };
    give(json);
    return route.fulfill({ response: answered, json });
  });

  await page.goto(`${BASE}/chat/${chatId}`, { waitUntil: 'domcontentloaded' });
  const select = page.locator('[data-testid="chat-mode"]');
  await select.waitFor({ timeout: 20_000 }).catch(() => undefined);

  // In the composer, on the row the send button is on.
  const placed = await page.evaluate(() => {
    const switched = document.querySelector('[data-testid="chat-mode"]');
    const send = document.getElementById('chat-composer')?.closest('form')?.querySelector('button[type="submit"]') ?? null;
    if (switched === null || send === null) return null;
    const a = switched.getBoundingClientRect();
    const b = send.getBoundingClientRect();
    return {
      inComposer: switched.closest('form') === send.closest('form'),
      sameRow: Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) < 6,
      before: a.right <= b.left,
      height: a.height,
    };
  });
  record(placed !== null && placed.inComposer && placed.sameRow && placed.before, `the switch is in the composer's row, before Send (${JSON.stringify(placed)})`);
  /* ---- the product's own list, not a native one ---- */
  const kind = await select.evaluate((one) => ({ tag: one.tagName, role: one.getAttribute('role') }));
  record(kind.tag === 'BUTTON' && kind.role === 'combobox', `the switch is the application's own list, not a native select (${JSON.stringify(kind)})`);
  record((await select.getAttribute('data-chat-mode')) === 'DEFAULT', 'a new chat is in Default');

  // Drawn as the effort pill beside it is: the same height, outline and type.
  await page.getByTestId('chat-effort').waitFor({ timeout: 10_000 }).catch(() => undefined);
  const look = await page.evaluate(() => {
    const read = (one) => {
      if (one === null) return null;
      const style = getComputedStyle(one);
      return {
        height: Math.round(one.getBoundingClientRect().height),
        radius: style.borderTopLeftRadius,
        border: `${style.borderTopWidth} ${style.borderTopStyle}`,
        font: style.fontSize,
      };
    };
    return { mode: read(document.querySelector('[data-testid="chat-mode"]')), effort: read(document.querySelector('[data-testid="chat-effort"]')) };
  });
  record(
    look.mode !== null && look.effort !== null && JSON.stringify(look.mode) === JSON.stringify(look.effort),
    `it matches the effort pill's size and look (${JSON.stringify(look)})`,
  );

  // Opened, it lists the three modes above the composer.
  await select.click();
  const list = page.locator('[role="listbox"]');
  await list.waitFor({ timeout: 3_000 }).catch(() => undefined);
  const offered = await list.locator('[role="option"]').evaluateAll((options) => options.map((one) => one.getAttribute('data-value')));
  record(JSON.stringify(offered) === '["DEFAULT","PLAN","AUTO"]', `it offers Default, Plan and Auto (${JSON.stringify(offered)})`);
  // Labels carry no explanation: one or two words each.
  const labels = (await list.locator('[role="option"]').allInnerTexts()).map((one) => one.trim());
  record(labels.every((label) => label.split(/\s+/).length <= 2), `the labels are a word each (${JSON.stringify(labels)})`);
  const above = await page.evaluate(() => {
    const listbox = document.querySelector('[role="listbox"]');
    const button = document.querySelector('[data-testid="chat-mode"]');
    const box = document.getElementById('chat-composer')?.closest('form');
    if (!listbox || !button || !box) return null;
    return {
      listBottom: Math.round(listbox.getBoundingClientRect().bottom),
      buttonTop: Math.round(button.getBoundingClientRect().top),
      composerTop: Math.round(box.getBoundingClientRect().top),
    };
  });
  record(above !== null && above.listBottom <= above.buttonTop, `and opens above the composer (${JSON.stringify(above)})`);

  // Each row's meaning is one line beside it, on hover - never in the row.
  await list.locator('[role="option"][data-value="AUTO"]').hover();
  const hint = page.locator('[data-select-hint="AUTO"]');
  await hint.waitFor({ timeout: 3_000 }).catch(() => undefined);
  const hinted = await hint.evaluate((one) => {
    const lineHeight = parseFloat(getComputedStyle(one).lineHeight) || 20;
    const padding = parseFloat(getComputedStyle(one).paddingTop) + parseFloat(getComputedStyle(one).paddingBottom);
    return { text: one.textContent ?? '', lines: Math.round((one.clientHeight - padding) / lineHeight) };
  }).catch(() => null);
  record(hinted !== null && hinted.text.length > 0 && hinted.lines === 1, `hovering Auto shows its hint on one line (${JSON.stringify(hinted)})`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  record((await list.count()) === 0 && (await select.getAttribute('data-chat-mode')) === 'DEFAULT', 'Escape closes it and changes nothing');

  // Chosen from the keyboard alone: the arrows open it and move, Enter takes. Choosing sends it, and the server keeps it.
  await select.focus();
  const setting = page.waitForRequest((request) => (request.postData() ?? '').includes('setChatMode'), { timeout: 10_000 }).catch(() => null);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(150);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  const request = await setting;
  record(request !== null && request.postDataJSON()?.variables?.mode === 'PLAN', `choosing Plan from the keyboard sends it (${JSON.stringify(request?.postDataJSON()?.variables)})`);
  await page.waitForTimeout(500);
  const kept = (await graphql(`query($id: ID!) { chatSession(id: $id) { mode } }`, { id: chatId })).chatSession?.mode;
  record(kept === 'PLAN', `the server keeps it (${kept})`);
  record((await select.getAttribute('data-chat-mode')) === 'PLAN', 'and the switch shows it');
  record((await select.innerText()).trim() === 'Plan', `and says so (${(await select.innerText()).trim()})`);

  // The plan, drawn as a plan: markdown rendered, with its two answers.
  const card = page.locator(`[data-interaction="${PLAN.id}"]`);
  await card.waitFor({ timeout: 20_000 }).catch(() => undefined);
  record((await card.count()) === 1, 'the plan is drawn in the chat');
  record((await card.locator('[data-interaction-plan] strong').count()) === 1, 'its markdown is rendered, not printed');
  record((await card.locator('[data-interaction-plan] ol li').count()) === 2, 'its steps are a list');
  const buttons = await card.locator('[data-interaction-option]').evaluateAll((all) => all.map((one) => one.getAttribute('data-interaction-option')));
  record(JSON.stringify(buttons) === '["approve","keep-planning"]', `with Approve and Keep planning (${JSON.stringify(buttons)})`);
  await card.screenshot({ path: '/tmp/chat-mode-plan.png' }).catch(() => undefined);

  await card.locator('[data-interaction-option="approve"]').click();
  await page.waitForTimeout(500);
  record(sent[0]?.option === 'approve', `Approve sends approve (${JSON.stringify(sent[0])})`);
} catch (failure) {
  record(false, String(failure));
} finally {
  if (chatId !== null) await graphql(`mutation($id: ID!) { deleteChat(id: $id) }`, { id: chatId }).catch(() => undefined);
}

await finish(browser);
