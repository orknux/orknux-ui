/**
 * `/goal` in a chat: completed by Tab, started by the line, and followed to the
 * end by the line under the conversation.
 *
 * Three things only a browser can answer. That `/go` and Tab completes to
 * `/goal ` - the slash menu offers the chat's own command beside the server's -
 * and that inside it Tab completes the keywords. That the whole line starts a
 * goal on the server rather than being said to the model. And that the line
 * under the conversation follows the goal - a turn, a review that is not met
 * with its feedback, a second turn, a review that is - to "Goal met", without
 * anything reloading.
 *
 * The model is `scripts/suite/goal-stub.py`, which answers the agent and its
 * reviewer apart; see its note. Run it by hand:
 *
 *   python scripts/suite/goal-stub.py 8193
 *   node scripts/suite/run.mjs --only chat-goal-check
 *
 * Where the stub is, as the *server* reaches it, goes in ORKNUX_GOAL_STUB.
 * Makes a provider, a model, an agent and a chat, and sweeps them.
 */
import { BASE, WORKSPACE, open, drawn, record, finish } from './suite/harness.mjs';

const STUB = process.env.ORKNUX_GOAL_STUB ?? 'http://localhost:8193';
const stamp = Date.now();
const PREFIX = 'zzGoal';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const sweep = async () => {
  const held = await graphql(
    `query($w: ID!) {
       workspaceAgents(workspaceId: $w, size: 200) { content { id name } }
       modelProviders(workspaceId: $w) { id name }
     }`,
    { w: WORKSPACE },
  );
  for (const old of held.workspaceAgents.content.filter((one) => one.name.startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { deleteAgent(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
  for (const old of held.modelProviders.filter((one) => one.name.startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { removeModelProvider(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
};
await sweep();

const provider = (await graphql(`mutation($input: CreateModelProviderInput!) { createModelProvider(input: $input) { id } }`, {
  input: { workspaceId: WORKSPACE, name: `${PREFIX} Provider ${stamp}`, endpoint: STUB, secret: 'sk-test' },
})).createModelProvider;
const model = (await graphql(`mutation($input: CreateModelInput!) { createModel(input: $input) { id name } }`, {
  input: { providerId: provider.id, name: `${PREFIX}Haiku${stamp}`, modelId: 'stub', kind: 'CHAT' },
})).createModel;
const agent = (await graphql(`mutation($input: CreateAgentInput!) { createAgent(input: $input) { id name } }`, {
  input: { workspaceId: WORKSPACE, name: `${PREFIX} Poet ${stamp}`, type: 'LLM' },
})).createAgent;
await graphql(`mutation($id: ID!, $input: UpdateAgentInput!) { updateAgent(id: $id, input: $input) { id } }`, {
  id: agent.id,
  input: { name: agent.name, modelId: model.id },
});
const CHAT = (await graphql('mutation($input: StartChatInput!) { startChat(input: $input) { id } }', {
  input: { workspaceId: WORKSPACE, title: `${PREFIX} ${stamp}` },
})).startChat.id;
await graphql('mutation($id: ID!, $agent: ID!) { chooseChatAgent(id: $id, agentId: $agent) { id } }', { id: CHAT, agent: agent.id });

try {
  await page.goto(`${BASE}/chat/${CHAT}`, { waitUntil: 'domcontentloaded' });
  record(await drawn(page, 'the chat'), 'the chat is on screen');
  const box = page.locator('#chat-composer');
  await box.waitFor({ timeout: 20_000 });

  // /go and Tab completes the command.
  await box.click();
  await box.fill('/go');
  await page.locator('[role="listbox"][aria-label="Commands"]').waitFor({ timeout: 10_000 }).catch(() => undefined);
  await box.press('Tab');
  record((await box.inputValue()) === '/goal ', `"/go" and Tab completes to "/goal " (${JSON.stringify(await box.inputValue())})`);

  // Inside it, Tab completes the keywords, and after reviewer a model's name.
  await box.fill('/goal Write a haiku unt');
  await box.press('Tab');
  record((await box.inputValue()) === '/goal Write a haiku until ', 'Tab completes until');
  await box.fill('/goal Write a haiku until it has three lines rev');
  await box.press('Tab');
  record((await box.inputValue()).endsWith('reviewer '), 'and reviewer once until is there');
  await box.fill(`/goal Write a haiku until it has three lines reviewer ${PREFIX}Hai`);
  await box.press('Tab');
  record((await box.inputValue()).endsWith(model.name), `and after reviewer, the model's name (${model.name})`);

  // An unknown command is said to be one, and nothing is sent.
  await box.fill('/gaol something');
  await box.press('Enter');
  await page.waitForTimeout(800);
  const said = await page.locator('main').textContent();
  record((said ?? '').includes('There is no /gaol'), 'an unknown command is said to be none');

  // The whole line starts a goal, and the line under the conversation follows it to the end.
  await box.fill('/goal Write a haiku until it has three lines max 3');
  await box.press('Enter');
  const line = page.locator('[data-goal-line]');
  const started = await line.waitFor({ timeout: 15_000 }).then(() => true).catch(() => false);
  record(started, 'a goal line is drawn under the conversation');
  const met = await page
    .waitForFunction(() => document.querySelector('[data-goal-line]')?.getAttribute('data-goal-line') === 'MET', null, { timeout: 60_000 })
    .then(() => true)
    .catch(() => false);
  record(met, 'it follows the goal to met without a reload');
  const text = (await line.textContent()) ?? '';
  record(text.startsWith('Goal met after 2 of 3 turns'), `and says so (${text})`);

  const { chatGoal } = await graphql(`query($id: ID!) { chatGoal(chatId: $id) { status iteration } }`, { id: CHAT });
  record(chatGoal?.status === 'MET' && chatGoal.iteration === 2, `the server agrees: ${JSON.stringify(chatGoal)}`);
} finally {
  await graphql('mutation($id: ID!) { deleteChat(id: $id) }', { id: CHAT }).catch(() => undefined);
  await sweep();
}

await finish(browser);
