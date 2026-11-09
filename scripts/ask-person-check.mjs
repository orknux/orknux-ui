/**
 * An agent's ask_person question in the chat: an option per row with the line
 * saying what it means, several to tick where it allows them, and a box for
 * the person's own words - and what is sent is what was chosen.
 *
 * And Dismiss, on a question the server says may be closed without an answer:
 * on the answer row beside Send, sending the dismissal and nothing else, and
 * the card then saying who closed it. Not on one that may not.
 *
 * The questions are canned on their way to the chat page, and the answer is
 * caught on its way out, so no model has to ask.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });
const NAME = `zz ask person ${Date.now()}`;

const question = (id, multiple, dismissible = false) => ({
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
  dismissible,
});
const REQUESTS = [question('999101', false), question('999102', true), question('999103', false, true)];
const sent = [];
const dismissed = [];

let chatId = null;
try {
  chatId = (await graphql(`mutation($input: StartChatInput!) { startChat(input: $input) { id } }`, {
    input: { workspaceId: WORKSPACE, title: NAME },
  })).startChat.id;
  await page.route('**/graphql', async (route) => {
    const body = route.request().postDataJSON() ?? {};
    const query = body.query ?? '';
    if (query.includes('sessionRequests')) return route.fulfill({ json: { data: { sessionRequests: REQUESTS } } });
    if (query.includes('dismissRequest')) {
      dismissed.push(body.variables);
      // Kept as the server would keep it, since the page reads the conversation's questions again once one is answered.
      const at = REQUESTS.findIndex((one) => one.id === body.variables.id);
      REQUESTS[at] = { ...REQUESTS[at], chosen: 'dismissed', chosenBy: 'alice', outcome: 'Dismissed' };
      return route.fulfill({ json: { data: { dismissRequest: REQUESTS[at] } } });
    }
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
  // Numbered in order, the number before the label on the label's line, so an answer in words can say "the second".
  const numbers = await one.evaluate((card) =>
    [...card.querySelectorAll('[data-interaction-option]')].map((button) => {
      const number = button.querySelector('[data-choice-number]');
      const label = number?.nextElementSibling?.firstElementChild;
      if (number == null || label == null) return null;
      const a = number.getBoundingClientRect();
      const b = label.getBoundingClientRect();
      return { said: number.textContent, before: a.right <= b.left, sameLine: Math.abs(a.top - b.top) < 4 };
    }),
  );
  record(
    numbers.length > 1 && numbers.every((n, i) => n !== null && n.said === `${i + 1}.` && n.before && n.sameLine),
    `each option is numbered, before its label (${JSON.stringify(numbers)})`,
  );
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

  // Dismiss: only where the request allows it, beside Send, and it sends nothing but the dismissal.
  const closable = page.locator('[data-interaction="999103"]');
  record((await one.locator('[data-interaction-dismiss]').count()) === 0 && (await many.locator('[data-interaction-dismiss]').count()) === 0,
    'no Dismiss on a question that may not be dismissed');
  const dismiss = closable.locator('[data-interaction-dismiss]');
  const placed = await closable.evaluate((card) => {
    const button = card.querySelector('[data-interaction-dismiss]');
    const send = card.querySelector('[data-interaction-send]');
    if (button === null || send === null) return null;
    const a = button.getBoundingClientRect();
    const b = send.getBoundingClientRect();
    return { width: a.width, height: a.height, sameRow: Math.abs(a.top - b.top) < 4, after: a.left >= b.right, text: button.textContent };
  });
  record(placed !== null && placed.width > 0 && placed.height > 0, `a dismissible question has a Dismiss button (${JSON.stringify(placed)})`);
  record(placed?.sameRow === true && placed?.after === true, 'on the answer row, after Send');
  await closable.screenshot({ path: '/tmp/ask-person-dismiss.png' });
  const before = sent.length;
  await dismiss.click();
  await closable.locator('[data-interaction-outcome]').waitFor({ timeout: 5_000 }).catch(() => undefined);
  record(dismissed.length === 1 && dismissed[0]?.id === '999103' && sent.length === before, `Dismiss sends the dismissal and no answer (${JSON.stringify(dismissed)})`);
  const outcome = (await closable.locator('[data-interaction-outcome]').innerText().catch(() => '')).replace(/\s+/g, ' ');
  record(/Dismissed/.test(outcome) && /alice/.test(outcome) && (await dismiss.count()) === 0, `the card then says who dismissed it (${outcome})`);
} finally {
  if (chatId !== null) await graphql(`mutation($id: ID!) { deleteChat(id: $id) }`, { id: chatId }).catch(() => undefined);
}

await finish(browser);
