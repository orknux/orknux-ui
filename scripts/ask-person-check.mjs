/**
 * An agent's ask_person question in the chat: an option per row with the line
 * saying what it means, several to tick where it allows them, and a box for
 * the person's own words - and what is sent is what was chosen.
 *
 * The questions are canned on their way to the chat page, and the answer is
 * caught on its way out, so no model has to ask.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });
const NAME = `zz ask person ${Date.now()}`;

const question = (id, multiple) => ({
  id,
  kind: 'agent.question',
  askedBy: 'Helper',
  question: multiple ? 'Which parts should the graph show?' : 'Which dependency graph should I add?',
  options: [
    { id: '1', label: 'Workflows', style: null, description: 'Which workflows call which' },
    { id: '2', label: 'Workspace parts', style: null, description: 'Workflow to agents, functions and models' },
    { id: '3', label: 'Issues', style: null, description: 'Depends-on links between issues' },
  ],
  items: [],
  chosen: null,
  chosenBy: null,
  chosenAt: null,
  outcome: null,
  createdAt: new Date().toISOString(),
  multiple,
  allowsText: true,
  text: null,
});
const REQUESTS = [question('999101', false), question('999102', true)];
const sent = [];

let chatId = null;
try {
  chatId = (await graphql(`mutation($input: StartChatInput!) { startChat(input: $input) { id } }`, {
    input: { workspaceId: WORKSPACE, title: NAME },
  })).startChat.id;
  await page.route('**/graphql', async (route) => {
    const body = route.request().postDataJSON() ?? {};
    const query = body.query ?? '';
    if (query.includes('sessionRequests')) return route.fulfill({ json: { data: { sessionRequests: REQUESTS } } });
    if (query.includes('answerRequest')) {
      sent.push(body.variables);
      const asked = REQUESTS.find((one) => one.id === body.variables.id);
      return route.fulfill({
        json: { data: { answerRequest: { ...asked, chosen: (body.variables.options ?? []).join(',') || 'own-words', chosenBy: 'alice', outcome: 'answered', text: body.variables.text } } },
      });
    }
    if (!query.includes('llmSessionId')) return route.continue();
    // A chat has a conversation only once something is said in it; this one is given one, so the page asks for its questions.
    const answered = await route.fetch();
    const json = await answered.json();
    const give = (node) => {
      if (Array.isArray(node)) return node.forEach(give);
      if (node === null || typeof node !== 'object') return;
      if (String(node.id) === String(chatId) && 'llmSessionId' in node) node.llmSessionId = '999100';
      Object.values(node).forEach(give);
    };
    give(json);
    return route.fulfill({ response: answered, json });
  });
  await page.goto(`${BASE}/chat/${chatId}`, { waitUntil: 'domcontentloaded' });
  const one = page.locator('[data-interaction="999101"]');
  const many = page.locator('[data-interaction="999102"]');
  await one.waitFor({ timeout: 20_000 }).catch(() => undefined);

  const row = (await one.locator('[data-interaction-option="2"]').innerText().catch(() => '')).replace(/\s+/g, ' ');
  record(/Workspace parts/.test(row) && /Workflow to agents, functions and models/.test(row), `each option says what it means (${row})`);
  record((await one.locator('[data-interaction-text]').count()) === 1, 'with a box for the person\'s own words');
  await one.screenshot({ path: '/tmp/ask-person.png' });

  // One to choose: a click is the answer.
  await one.locator('[data-interaction-option="2"]').click();
  await page.waitForTimeout(500);
  record(sent[0]?.option === "2", `a click on one sends it (${JSON.stringify(sent[0])})`);

  // Several to tick, with words beside them, sent together.
  const send = many.locator('[data-interaction-send]');
  record(await send.isDisabled(), 'with nothing ticked or written, Send waits');
  await many.locator('[data-interaction-option="1"]').click();
  await many.locator('[data-interaction-option="3"]').click();
  record((await many.locator('[aria-pressed="true"]').count()) === 2, 'ticking two marks both');
  await many.locator('[data-interaction-text]').fill('and plugins');
  await send.click();
  await page.waitForTimeout(500);
  record(
    JSON.stringify(sent[1]?.options) === '["1","3"]' && sent[1]?.text === 'and plugins',
    `Send sends the ticked and the words (${JSON.stringify(sent[1])})`,
  );
} finally {
  if (chatId !== null) await graphql(`mutation($id: ID!) { deleteChat(id: $id) }`, { id: chatId }).catch(() => undefined);
}

await finish(browser);
