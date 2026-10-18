/**
 * An agent asks for tools, and the person sees exactly which.
 *
 * An agent missing a tool could only say it could not do the thing. It can now
 * list what it could be given and ask for some; the question in the chat names
 * every tool asked for - its name, what sort of tool it is, what it does - over
 * Accept and Refuse, so the person knows what saying yes gives away. And the
 * agent page has the switch that lets an agent ask at all, on for a new one.
 *
 * The question is canned on its way to the chat page, so no model has to ask;
 * the agent is made for the check and removed again.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });
const NAME = `zz grant request ${Date.now()}`;

const REQUEST = {
  id: '999001',
  kind: 'agent.tools',
  askedBy: 'Helper',
  question: 'Helper asks to be given these 2 tools for good: to look up order 42',
  options: [
    { id: 'accept', label: 'Accept', style: 'primary' },
    { id: 'refuse', label: 'Refuse', style: 'danger' },
  ],
  items: [
    { name: 'lookupOrder', kind: 'workspace tool', description: 'Finds an order by its number.' },
    { name: 'http_get', kind: 'built-in tool', description: 'Fetches a page.' },
  ],
  chosen: null,
  chosenBy: null,
  chosenAt: null,
  outcome: null,
  createdAt: new Date().toISOString(),
};

let agentId = null;
let chatId = null;
try {
  agentId = (await graphql(
    `mutation ($w: ID!, $n: String!) { createAgent(input: { workspaceId: $w, name: $n, type: LLM }) { id } }`,
    { w: WORKSPACE, n: NAME },
  )).createAgent.id;

  // The switch: on for a new agent, beside the Orknux grant.
  await page.goto(`${BASE}/workspace/${WORKSPACE}/agents/${agentId}/settings`, { waitUntil: 'domcontentloaded' });
  const toggle = page.getByTestId('agent-may-ask-for-tools');
  const shown = await toggle.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
  record(shown && (await toggle.isChecked()), 'a new agent may ask for more tools, ticked on its page');

  // The question, as the chat draws it.
  chatId = (await graphql(`mutation($input: StartChatInput!) { startChat(input: $input) { id } }`, {
    input: { workspaceId: WORKSPACE, title: NAME },
  })).startChat.id;
  await page.route('**/graphql', async (route) => {
    const body = route.request().postDataJSON() ?? {};
    const query = body.query ?? '';
    if (query.includes('sessionRequests')) return route.fulfill({ json: { data: { sessionRequests: [REQUEST] } } });
    if (!query.includes('llmSessionId')) return route.continue();
    // A chat has a conversation only once something is said in it; this one is given one, so the page asks for its questions.
    const answered = await route.fetch();
    const json = await answered.json();
    const give = (node) => {
      if (Array.isArray(node)) return node.forEach(give);
      if (node === null || typeof node !== 'object') return;
      if (String(node.id) === String(chatId) && 'llmSessionId' in node) node.llmSessionId = '999000';
      Object.values(node).forEach(give);
    };
    give(json);
    return route.fulfill({ response: answered, json });
  });
  await page.goto(`${BASE}/chat/${chatId}`, { waitUntil: 'domcontentloaded' });
  const card = page.locator('[data-interaction-kind="agent.tools"]');
  await card.waitFor({ timeout: 20_000 }).catch(() => undefined);
  const items = card.locator('[data-interaction-item]');
  record((await items.count()) === 2, `the question lists every tool asked for (${await items.count()})`);
  const first = (await items.first().innerText().catch(() => '')).replace(/\s+/g, ' ');
  record(
    /lookupOrder/.test(first) && /workspace tool/.test(first) && /Finds an order by its number/.test(first),
    `each with its kind and what it does (${first})`,
  );
  record(
    (await card.locator('[data-interaction-option="accept"]').count()) === 1 &&
      (await card.locator('[data-interaction-option="refuse"]').count()) === 1,
    'under Accept and Refuse',
  );
} finally {
  if (chatId !== null) await graphql(`mutation($id: ID!) { deleteChat(id: $id) }`, { id: chatId }).catch(() => undefined);
  if (agentId !== null) await graphql(`mutation ($id: ID!) { deleteAgent(id: $id) }`, { id: agentId }).catch(() => undefined);
}

await finish(browser);
