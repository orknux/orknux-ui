/**
 * How many times a node does its work in one run, set on the node. Issue #661.
 *
 * An action and an agent offer it beside their other settings, it is saved
 * with the node, and one is saved as nothing. The run half - each time handed
 * what the last produced - is `NodeRepeatTest` on the server; this is the
 * screen.
 *
 * It makes its own workflow under a stamped name and removes it; what a killed
 * run leaves behind is swept by prefix at the start.
 */
import { BASE, WORKSPACE, open, record, selectNode, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });

const PREFIX = 'zzRepeat';
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

const { createWorkflow } = await graphql(
  `mutation ($input: CreateWorkflowInput!) { createWorkflow(input: $input) { workflowId } }`,
  { input: { workspaceId: WORKSPACE, name: `${PREFIX}${STAMP}` } },
);
const workflowId = createWorkflow.workflowId;
const nodes = async () => (await graphql(
  'query($w: ID!, $f: ID!) { workflowGraph(workspaceId: $w, workflowId: $f) { nodes { key repeatTimes } } }',
  { w: WORKSPACE, f: workflowId },
)).workflowGraph.nodes;

try {
  await graphql(
    `mutation ($workspaceId: ID!, $workflowId: ID!, $input: WorkflowGraphInput!) {
       saveWorkflowGraph(workspaceId: $workspaceId, workflowId: $workflowId, input: $input) { nodes { key } } }`,
    {
      workspaceId: WORKSPACE,
      workflowId,
      input: {
        nodes: [
          { key: 'call', kind: 'ACTION', name: 'Post the summary', x: 100, y: 100 },
          { key: 'think', kind: 'AGENT', name: 'Summarise it', x: 500, y: 100 },
        ],
        edges: [],
      },
    },
  );

  await page.goto(`${BASE}/workspace/${WORKSPACE}/workflows/${workflowId}/editor`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.react-flow__node', { timeout: 20_000 });
  await selectNode(page, page.locator('.react-flow__node').filter({ hasText: 'Post the summary' }).first(), 'the action');

  const field = page.locator('[data-node-repeat]');
  await field.waitFor({ timeout: 10_000 }).catch(() => undefined);
  const drawn = await field.evaluate((input) => {
    const box = input.getBoundingClientRect();
    const label = document.querySelector('label[for="node-repeat"]');
    return { width: box.width, height: box.height, value: input.value, label: label?.textContent ?? null };
  }).catch(() => null);
  record(drawn !== null && drawn.width > 0 && drawn.height > 0, `the action offers how many times it runs (${JSON.stringify(drawn)})`);
  record(drawn?.value === '1' && drawn?.label === 'Times it runs', 'and it reads once until told otherwise');

  await field.fill('3');
  await page.keyboard.press('Control+s');
  await page.waitForTimeout(2000);
  const saved = (await nodes()).find((one) => one.key === 'call');
  record(saved?.repeatTimes === 3, `saved, the node holds it (${saved?.repeatTimes})`);

  await selectNode(page, page.locator('.react-flow__node').filter({ hasText: 'Summarise it' }).first(), 'the agent');
  await field.waitFor({ timeout: 10_000 }).catch(() => undefined);
  record((await field.count()) === 1 && (await field.inputValue()) === '1', 'an agent offers it too, at once');

  await selectNode(page, page.locator('.react-flow__node').filter({ hasText: 'Post the summary' }).first(), 'the action');
  await field.waitFor({ timeout: 10_000 }).catch(() => undefined);
  record((await field.inputValue()) === '3', 'back on the action, it reads what was saved');
  await field.fill('1');
  await page.keyboard.press('Control+s');
  await page.waitForTimeout(2000);
  const back = (await nodes()).find((one) => one.key === 'call');
  record(back?.repeatTimes === null, `set back to one, it is saved as nothing (${back?.repeatTimes})`);
} finally {
  await graphql(`mutation ($id: ID!) { removeWorkflow(id: $id) }`, { id: workflowId }).catch(() => {});
}

await finish(browser);
