/**
 * A question an agent asks arrives with its own fetch, after the turn that
 * asked it was drawn - and the chat follows it down rather than leaving it
 * below the fold.
 *
 * The questions are canned and held back a moment on their way to the page,
 * so they land as rows added to a log that was already drawn and at its foot.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 560 } });
const NAME = `zz question scroll ${Date.now()}`;

const question = (id) => ({
  id,
  kind: 'agent.question',
  askedBy: 'Helper',
  question: `Question ${id}: which way should I go?`,
  options: [
    { id: '1', label: 'North', style: null, description: 'The long way round' },
    { id: '2', label: 'South', style: null, description: 'The short way, with a ferry' },
    { id: '3', label: 'Stay', style: null, description: 'Wait for the weather' },
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
});
const REQUESTS = ['999201', '999202', '999203'].map(question);

let chatId = null;
try {
  chatId = (await graphql(`mutation($input: StartChatInput!) { startChat(input: $input) { id } }`, {
    input: { workspaceId: WORKSPACE, title: NAME },
  })).startChat.id;
  await page.route('**/graphql', async (route) => {
    const body = route.request().postDataJSON() ?? {};
    const query = body.query ?? '';
    if (query.includes('sessionRequests')) {
      // After the log is drawn, as a question asked in a turn arrives.
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return route.fulfill({ json: { data: { sessionRequests: REQUESTS } } });
    }
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
  const last = page.locator('[data-interaction="999203"]');
  await last.waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);

  const where = await last.evaluate((card) => {
    let log = card.parentElement;
    while (log !== null && log.scrollHeight <= log.clientHeight) log = log.parentElement;
    return log === null ? null : { overflow: log.scrollHeight - log.clientHeight, fromFoot: log.scrollHeight - log.clientHeight - log.scrollTop };
  });
  record(where !== null && where.overflow > 0, `the questions run past the window (${where?.overflow}px)`);
  record(where !== null && where.fromFoot < 40, `and the chat follows them to the last (${where?.fromFoot}px from the foot)`);
  const box = await last.boundingBox();
  record(box !== null && box.y + box.height <= 560, `the last question is in sight (its foot at ${Math.round((box?.y ?? 0) + (box?.height ?? 0))} of 560)`);
} finally {
  if (chatId !== null) await graphql(`mutation($id: ID!) { deleteChat(id: $id) }`, { id: chatId }).catch(() => undefined);
}

await finish(browser);
