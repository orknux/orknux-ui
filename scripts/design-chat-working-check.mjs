/**
 * The working row in an editor's chat - the mark and "Drawing…", "Writing…"
 * under the person's message - is inset from the panel's edge as far as the
 * answers' words are, rather than sitting flush against it. Measured in the
 * three editors that share the chat: wireframes, documents and diagrams.
 *
 * A chat model is added to the list if the workspace has none, the first
 * question is answered here and the second is held unanswered, so the check
 * needs no model.
 *
 * Makes its own wireframe, document and diagram and removes them.
 */
import { BASE, WORKSPACE, open, record, finish, shot } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 900 } });
const stamp = Date.now().toString(36);

const STUB = {
  id: '97001', providerId: '1', workspaceId: WORKSPACE, providerName: 'Stub', name: 'Stub chat', modelId: 'stub-chat', kind: 'CHAT', enabled: true,
  contextWindow: null, maxOutput: null, parallelToolCalls: null,
};

const editors = [
  { kind: 'Wireframe', prefix: 'wireframe', path: (id) => `design/wireframes/${id}` },
  { kind: 'Document', prefix: 'document', path: (id) => `design/documents/${id}` },
  { kind: 'Diagram', prefix: 'diagram', path: (id) => `explore/diagrams/${id}` },
];

for (const editor of editors) {
  const made = await graphql(`mutation ($w: ID!, $n: String!) { create${editor.kind}(workspaceId: $w, name: $n) { id } }`, { w: WORKSPACE, n: `Working row ${stamp}` });
  const id = made[`create${editor.kind}`].id;

  let asked = 0;
  await page.route('**/graphql', async (route) => {
    const query = route.request().postDataJSON()?.query ?? '';
    if (query.includes(`ask${editor.kind}(`)) {
      asked += 1;
      // The second is held for good: the row under it is what is measured.
      if (asked > 1) return new Promise(() => {});
      const answer = { answer: 'Made a start with two parts and a button.', changed: false, [editor.prefix]: null };
      return route.fulfill({ json: { data: { [`ask${editor.kind}`]: answer } } });
    }
    if (query.includes('models(')) {
      const answered = await route.fetch();
      const json = await answered.json();
      const list = json?.data?.models;
      if (Array.isArray(list) && !list.some((one) => one.kind === 'CHAT' && one.enabled !== false)) list.push(STUB);
      return route.fulfill({ json });
    }
    return route.continue();
  });

  await page.goto(`${BASE}/workspace/${WORKSPACE}/${editor.path(id)}`, { waitUntil: 'domcontentloaded' });
  const input = page.getByTestId(`${editor.prefix}-chat-input`);
  await input.waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
  await input.fill('Start it');
  await page.getByTestId(`${editor.prefix}-chat-send`).click();
  await page.locator(`[data-testid="${editor.prefix}-chat-message"][data-role="assistant"]`).waitFor({ timeout: 10_000 });
  await input.fill('Add one more');
  await page.getByTestId(`${editor.prefix}-chat-send`).click();
  const chat = page.getByTestId(`${editor.prefix}-chat`);
  await chat.locator('[role="status"]').waitFor({ timeout: 10_000 });
  await page.waitForTimeout(300);

  const drawn = await chat.evaluate((talk) => {
    const panel = talk.getBoundingClientRect();
    const answer = talk.querySelector('[data-role="assistant"]');
    const range = document.createRange();
    range.selectNodeContents(answer.querySelector('p') ?? answer);
    const words = range.getBoundingClientRect();
    const row = talk.querySelector('[role="status"]').getBoundingClientRect();
    const question = [...talk.querySelectorAll('[data-role="user"]')].pop().getBoundingClientRect();
    const working = talk.querySelector('[data-testid$="-chat-working"]')?.getBoundingClientRect();
    return {
      below: working === undefined ? null : Math.round(working.top - question.bottom),
      answerInset: Math.round(words.left - panel.left),
      rowInset: Math.round(row.left - panel.left),
      questionInset: Math.round(panel.right - question.right),
    };
  });
  console.log(editor.prefix, JSON.stringify(drawn));
  await chat.screenshot({ path: shot(`design-chat-working-${editor.prefix}.png`) });

  record(drawn.rowInset === drawn.answerInset, `${editor.prefix}: the working row starts where the answers' words do (${drawn.rowInset}px and ${drawn.answerInset}px from the edge)`);
  // It sat 8px under the question, the list's own gap, and read as part of the bubble.
  record(drawn.below !== null && drawn.below >= 16, `${editor.prefix}: the working row stands 16px or more under the question (${drawn.below}px)`);
  record(drawn.rowInset === drawn.questionInset, `${editor.prefix}: the same inset as the question has on the right (${drawn.questionInset}px)`);

  // The copy button shows only while the pointer is on its message, and leaves no blank row in a short question.
  const copy = page.getByTestId(`${editor.prefix}-chat-message-copy`).first();
  const shown = () => copy.evaluate((button) => {
    let seen = 1;
    for (let at = button; at !== null; at = at.parentElement) seen *= Number(getComputedStyle(at).opacity);
    return seen;
  });
  await page.mouse.move(5, 5);
  await page.waitForTimeout(250);
  record((await shown()) === 0, `${editor.prefix}: with the pointer elsewhere the copy button is not drawn (${await shown()})`);
  const question = chat.locator('[data-role="user"]').first();
  await question.hover();
  await page.waitForTimeout(250);
  record((await shown()) >= 0.5, `${editor.prefix}: on the message it is (${await shown()})`);
  const tall = (await question.boundingBox()).height;
  record(tall <= 44, `${editor.prefix}: a one-line question has no blank row under its words (${tall}px)`);
  const button = await copy.boundingBox();
  await page.mouse.move(button.x + button.width / 2, button.y + button.height / 2, { steps: 5 });
  await page.waitForTimeout(250);
  record((await shown()) >= 0.5, `${editor.prefix}: and it stays while the pointer crosses to it`);

  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.goto('about:blank');
  await graphql(`mutation ($id: ID!) { delete${editor.kind}(id: $id) }`, { id });
}

await finish(browser);
