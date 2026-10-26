/**
 * How hard an agent node's model thinks, chosen on the node. Issue #674.
 *
 * The choice offers the words the node's model takes - read off its provider,
 * as the model page and the chat composer do - is saved as the node's own
 * reasoningEffort parameter rather than drawn as a raw parameter row, and
 * Default takes it away again. That the step sends it is
 * `AgentNodeRunnerTest` on the server; this is the screen.
 *
 * It makes its own provider, model, agent and workflow under stamped names and
 * removes them; what a killed run leaves behind is swept by prefix at the start.
 */
import { BASE, WORKSPACE, open, record, selectNode, finish, chooseOption, chosenOption } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });

const PREFIX = 'zzEffort';
const STAMP = Date.now();

const { workspaceWorkflows } = await graphql(
  `query ($workspaceId: ID!) { workspaceWorkflows(workspaceId: $workspaceId, page: 0, size: 100) {
     content { workflowId name } } }`,
  { workspaceId: WORKSPACE },
).catch(() => ({ workspaceWorkflows: { content: [] } }));
for (const old of (workspaceWorkflows?.content ?? []).filter((one) => one.name.startsWith(PREFIX))) {
  await graphql(`mutation ($id: ID!) { removeWorkflow(id: $id) }`, { id: old.workflowId }).catch(() => {});
  console.log(`NOTE: swept workflow ${old.name}`);
}
const { workspaceAgents } = await graphql(
  'query($w: ID!) { workspaceAgents(workspaceId: $w, page: 0, size: 500) { content { id name } } }',
  { w: WORKSPACE },
).catch(() => ({ workspaceAgents: { content: [] } }));
for (const old of (workspaceAgents?.content ?? []).filter((one) => one.name.startsWith(PREFIX))) {
  await graphql(`mutation ($id: ID!) { deleteAgent(id: $id) }`, { id: old.id }).catch(() => {});
  console.log(`NOTE: swept agent ${old.name}`);
}
const { modelProviders } = await graphql(
  'query($w: ID!) { modelProviders(workspaceId: $w) { id name } }',
  { w: WORKSPACE },
).catch(() => ({ modelProviders: [] }));
for (const old of (modelProviders ?? []).filter((one) => one.name.startsWith(PREFIX))) {
  await graphql(`mutation ($id: ID!) { removeModelProvider(id: $id) }`, { id: old.id }).catch(() => {});
  console.log(`NOTE: swept provider ${old.name}`);
}

// An OpenAI-shaped endpoint that is not OpenAI's own takes every word openai-java knows.
const provider = (await graphql(
  `mutation ($input: CreateModelProviderInput!) { createModelProvider(input: $input) { id } }`,
  { input: { workspaceId: WORKSPACE, name: `${PREFIX}${STAMP}`, type: 'OPENAI', endpoint: 'https://effort.invalid', secret: 'sk-check' } },
)).createModelProvider;
const model = (await graphql(
  `mutation ($input: CreateModelInput!) { createModel(input: $input) { id } }`,
  { input: { providerId: provider.id, name: `${PREFIX}Model${STAMP}`, modelId: 'thinker', kind: 'CHAT' } },
)).createModel;
const agent = (await graphql(
  `mutation ($input: CreateAgentInput!) { createAgent(input: $input) { id } }`,
  { input: { workspaceId: WORKSPACE, name: `${PREFIX}Agent${STAMP}`, type: 'LLM' } },
)).createAgent;
await graphql(
  `mutation ($id: ID!, $input: UpdateAgentInput!) { updateAgent(id: $id, input: $input) { id } }`,
  { id: agent.id, input: { name: `${PREFIX}Agent${STAMP}`, modelId: model.id } },
);
const { createWorkflow } = await graphql(
  `mutation ($input: CreateWorkflowInput!) { createWorkflow(input: $input) { workflowId } }`,
  { input: { workspaceId: WORKSPACE, name: `${PREFIX}${STAMP}` } },
);
const workflowId = createWorkflow.workflowId;
const nodes = async () => (await graphql(
  'query($w: ID!, $f: ID!) { workflowGraph(workspaceId: $w, workflowId: $f) { nodes { key mappings { name expression } } } }',
  { w: WORKSPACE, f: workflowId },
)).workflowGraph.nodes;

try {
  await graphql(
    `mutation ($workspaceId: ID!, $workflowId: ID!, $input: WorkflowGraphInput!) {
       saveWorkflowGraph(workspaceId: $workspaceId, workflowId: $workflowId, input: $input) { nodes { key } } }`,
    {
      workspaceId: WORKSPACE,
      workflowId,
      input: { nodes: [{ key: 'think', kind: 'AGENT', name: 'Think hard', agentId: agent.id, x: 100, y: 100 }], edges: [] },
    },
  );

  await page.goto(`${BASE}/workspace/${WORKSPACE}/workflows/${workflowId}/editor`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.react-flow__node', { timeout: 20_000 });
  await selectNode(page, page.locator('.react-flow__node').filter({ hasText: 'Think hard' }).first(), 'the agent');

  const choice = page.locator('[data-node-reasoning-effort]');
  await choice.first().waitFor({ timeout: 15_000 }).catch(() => undefined);
  const drawn = await page.evaluate(() => {
    const label = document.querySelector('label[for="node-reasoning-effort"]');
    const box = label?.getBoundingClientRect();
    return label && box ? { text: label.textContent, width: box.width, height: box.height } : null;
  });
  record(drawn !== null && drawn.width > 0 && drawn.height > 0, `the agent node offers how hard its model thinks (${JSON.stringify(drawn)})`);
  record((await chosenOption(page, choice).catch(() => null)) === '', 'and it starts at the model\'s own');
  record((await page.locator('[data-mapping-name="reasoningEffort"]').count()) === 0, 'not as a raw parameter row');

  await chooseOption(page, choice, 'high');
  await page.keyboard.press('Control+s');
  await page.waitForTimeout(2000);
  const saved = (await nodes()).find((one) => one.key === 'think');
  const held = saved?.mappings.find((one) => one.name === 'reasoningEffort')?.expression;
  record(held === 'high', `saved, the node holds it (${held})`);
  record((await page.locator('[data-mapping-name="reasoningEffort"]').count()) === 0, 'and once held, still not as a raw row');

  await chooseOption(page, choice, '');
  await page.keyboard.press('Control+s');
  await page.waitForTimeout(2000);
  const back = (await nodes()).find((one) => one.key === 'think');
  record(!back?.mappings.some((one) => one.name === 'reasoningEffort'), 'set back to Default, it holds none');
} finally {
  await graphql(`mutation ($id: ID!) { removeWorkflow(id: $id) }`, { id: workflowId }).catch(() => {});
  await graphql(`mutation ($id: ID!) { deleteAgent(id: $id) }`, { id: agent.id }).catch(() => {});
  await graphql(`mutation ($id: ID!) { removeModelProvider(id: $id) }`, { id: provider.id }).catch(() => {});
}

await finish(browser);
