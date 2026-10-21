/**
 * The Workflow node: one workflow running another as a step.
 *
 *   the menu      Add node offers it, called Workflow
 *   the picker    its Workflow picker offers the workspace's other workflows
 *                 and not the one being edited
 *   parameters    Add parameter puts a row with a name of its own to type
 *   it saves      the node goes to the server with the workflow it runs and
 *                 the parameter typed
 *   the run       the step on the run page links to the run it started, and
 *                 that run says which run called it
 *
 * Makes two workflows of its own and removes them.
 */
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const PREFIX = 'zzWorkflowNode';
const STAMP = Date.now();

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 1000 } });

const sweep = async () => {
  const { workspaceWorkflows } = await graphql(
    `query($w: ID!) { workspaceWorkflows(workspaceId: $w, page: 0, size: 200) { content { id name } } }`,
    { w: WORKSPACE },
  );
  for (const old of workspaceWorkflows.content.filter((one) => one.name.startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { removeWorkflow(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
};
await sweep();

const made = async (name) =>
  (
    await graphql(`mutation($input: CreateWorkflowInput!) { createWorkflow(input: $input) { workflowId } }`, {
      input: { workspaceId: WORKSPACE, name: `${PREFIX} ${name} ${STAMP}` },
    })
  ).createWorkflow.workflowId;
const save = (workflowId, input) =>
  graphql(
    `mutation($w: ID!, $f: ID!, $input: WorkflowGraphInput!) { saveWorkflowGraph(workspaceId: $w, workflowId: $f, input: $input) { workflowId } }`,
    { w: WORKSPACE, f: workflowId, input },
  );

const CALLEE = await made('callee');
const CALLER = await made('caller');
await save(CALLEE, {
  nodes: [
    { key: 'start', kind: 'TRIGGER', name: 'Start', x: 0, y: 0 },
    { key: 'say', kind: 'OBJECT', name: 'Say', x: 300, y: 0, mappings: [{ name: 'greeting', expression: 'hello', mode: 'VALUE' }] },
  ],
  edges: [{ source: 'start', target: 'say' }],
});
await save(CALLER, { nodes: [{ key: 'start', kind: 'TRIGGER', name: 'Start', x: 0, y: 0 }], edges: [] });

try {
  /* ---- the menu, the picker and a parameter ---- */

  await page.goto(`${BASE}/workspace/${WORKSPACE}/workflows/${CALLER}/editor`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.react-flow__node', { timeout: 30_000 });
  await drawn(page, 'the editor', { within: 30_000, still: 0 });
  await page.waitForTimeout(800);

  await page.getByRole('button', { name: /add node/i }).click();
  const entry = page.getByRole('menuitem', { name: /^workflow$/i });
  record((await entry.count()) === 1, 'Add node offers the Workflow node');
  await entry.click();
  await page.locator('#node-called-workflow').waitFor({ timeout: 10_000 });

  await page.locator('#node-called-workflow').click();
  const menu = page.locator('[role="listbox"]');
  await menu.waitFor({ timeout: 5000 });
  const offered = await menu.locator('[role="option"]').allTextContents();
  record(offered.some((one) => one.includes(`callee ${STAMP}`)), `the picker offers the other workflow (${offered.length} offered)`);
  record(!offered.some((one) => one.includes(`caller ${STAMP}`)), 'and not the workflow being edited');
  await menu.locator('[role="option"]', { hasText: `callee ${STAMP}` }).first().click();

  await page.locator('[data-add-parameter]').click();
  const row = page.locator('[data-mapping-name]').last();
  const name = row.locator('input[aria-label^="Name of field"]');
  record((await name.count()) === 1, 'Add parameter puts a row whose name is typed');
  await name.fill('who');
  await page.waitForTimeout(200);

  await page.getByRole('button', { name: /^save\b/i }).click();
  await page.waitForTimeout(2500);

  const { workflowGraph } = await graphql(
    `query($w: ID!, $f: ID!) { workflowGraph(workspaceId: $w, workflowId: $f) { nodes { key kind calledWorkflowId mappings { name } } } }`,
    { w: WORKSPACE, f: CALLER },
  );
  const saved = workflowGraph.nodes.find((one) => one.kind === 'WORKFLOW');
  record(
    saved !== undefined && saved.calledWorkflowId === CALLEE && saved.mappings.some((one) => one.name === 'who'),
    `the node saves with the workflow it runs and its parameter (${JSON.stringify(saved)})`,
  );

  /* ---- the run, both ways ---- */

  if (saved !== undefined) {
    await save(CALLER, {
      nodes: [
        { key: 'start', kind: 'TRIGGER', name: 'Start', x: 0, y: 0 },
        { key: saved.key, kind: 'WORKFLOW', name: 'Call callee', calledWorkflowId: CALLEE, outputName: 'called', x: 300, y: 0, mappings: [] },
      ],
      edges: [{ source: 'start', target: saved.key }],
    });
    const run = (
      await graphql(`mutation($w: ID!, $f: ID!) { startExecution(workspaceId: $w, workflowId: $f) { id } }`, { w: WORKSPACE, f: CALLER })
    ).startExecution.id;

    await page.goto(`${BASE}/workspace/${WORKSPACE}/executions/${run}`, { waitUntil: 'domcontentloaded' });
    await drawn(page, 'the run', { within: 30_000, still: 0 });
    await page.locator('.react-flow__node', { hasText: 'Call callee' }).first().click();
    const link = page.locator('[data-called-run]');
    await link.waitFor({ timeout: 10_000 }).catch(() => {});
    record((await link.count()) === 1, 'the step links to the run it started');
    await link.click();
    await page.locator('[data-called-by]').waitFor({ timeout: 15_000 }).catch(() => {});
    const back = (await page.locator('[data-called-by]').textContent().catch(() => '')) ?? '';
    record(back.trim() === `Run #${run}`, `and that run says which run called it (${back.trim()})`);
  }
} finally {
  await sweep();
}

await finish(browser);
