/**
 * An answered question is drawn in the answer of the turn that asked it.
 *
 * The answer is dated when it lands, which is after the question was asked
 * during its turn, so the card was placed just before the answer: between the
 * person's message and the agent's reply, under nobody's name. Here a chat
 * holds the person's message, then the agent's answer; the question was asked
 * between the two and answered later. It is drawn inside the answer.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });
const NAME = `zz question in answer ${Date.now()}`;
const at = (minutes) => new Date(Date.UTC(2026, 9, 24, 1, minutes, 0)).toISOString();

const REQUEST = {
  id: '999201',
  kind: 'agent.question',
  askedBy: 'Helper',
  question: 'File the findings as issues now?',
  options: [{ id: '1', label: 'Yes', style: null, description: null }, { id: '2', label: 'No', style: null, description: null }],
  items: [],
  chosen: '2',
  chosenBy: 'alice',
  chosenAt: at(27),
  outcome: 'answered',
  createdAt: at(25) .replace(':00.000Z', ':58.000Z'),
  multiple: false,
  allowsText: true,
  text: null,
};
const MESSAGES = [
  { role: 'user', content: 'how long now?', actor: null, takes: [], thinking: null, thinkingMillis: null, at: at(25), attachments: [] },
  { role: 'assistant', content: 'ANSWER-WORDS pick one above.', actor: null, takes: [], thinking: null, thinkingMillis: null, at: at(26), attachments: [] },
];

let chatId = null;
try {
  chatId = (await graphql(`mutation($input: StartChatInput!) { startChat(input: $input) { id } }`, {
    input: { workspaceId: WORKSPACE, title: NAME },
  })).startChat.id;
  await page.route('**/graphql', async (route) => {
    const body = route.request().postDataJSON() ?? {};
    const query = body.query ?? '';
    if (query.includes('sessionRequests')) return route.fulfill({ json: { data: { sessionRequests: [REQUEST] } } });
    if (query.includes('chatMessages')) return route.fulfill({ json: { data: { chatMessages: MESSAGES } } });
    if (!query.includes('llmSessionId')) return route.continue();
    const answered = await route.fetch();
    const json = await answered.json();
    const give = (node) => {
      if (Array.isArray(node)) return node.forEach(give);
      if (node === null || typeof node !== 'object') return;
      if (String(node.id) === String(chatId) && 'llmSessionId' in node) node.llmSessionId = '999200';
      Object.values(node).forEach(give);
    };
    give(json);
    return route.fulfill({ response: answered, json });
  });
  await page.goto(`${BASE}/chat/${chatId}`, { waitUntil: 'domcontentloaded' });
  const card = page.locator('[data-interaction="999201"]');
  await card.waitFor({ timeout: 20_000 }).catch(() => undefined);
  const placed = await card.evaluate((one) => {
    const row = one.closest('[class*="assistantRow"]');
    return { inAnswer: row !== null && (row.textContent ?? '').includes('ANSWER-WORDS') };
  }).catch(() => ({ inAnswer: false, missing: true }));
  record(placed.inAnswer === true, `the question is drawn inside the answer of the turn that asked it (${JSON.stringify(placed)})`);
  const order = await page.evaluate(() => {
    const text = document.body.textContent ?? '';
    return { asked: text.indexOf('how long now?'), question: text.indexOf('File the findings'), answer: text.indexOf('ANSWER-WORDS') };
  });
  record(order.asked < order.question && order.question < order.answer, `after the person's message, before the answer's words (${JSON.stringify(order)})`);
} finally {
  if (chatId !== null) await graphql(`mutation($id: ID!) { deleteChat(id: $id) }`, { id: chatId }).catch(() => undefined);
}

await finish(browser);
