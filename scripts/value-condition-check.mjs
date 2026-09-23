/**
 * A condition about a value from the run, picked on the node. Issue #378.
 *
 * The typed conditions know where their subject is; a VALUE condition is told
 * by the node it sits on, with the same reference picker every node's
 * parameters use. So two things are measured: that the settings form makes
 * one without asking for a property, and that the node draws a `value` row
 * whose reference is saved on the node rather than on the condition.
 *
 * Makes a condition and a workflow, and removes them.
 */
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const PREFIX = 'zzValueCond';
const STAMP = Date.now();

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 1100 } });

/* ----------------------------------------------------------------- sweep */

const sweep = async () => {
  for (const [query, remove, field] of [
    ['workspaceWorkflows(workspaceId: $w, page: 0, size: 200)', 'removeWorkflow', 'workspaceWorkflows'],
    ['workspaceConditions(workspaceId: $w, page: 0, size: 200)', 'deleteCondition', 'workspaceConditions'],
  ]) {
    const held = await graphql(`query($w: ID!) { ${query} { content { id name } } }`, { w: WORKSPACE });
    for (const old of held[field].content.filter((one) => one.name.startsWith(PREFIX))) {
      await graphql(`mutation($id: ID!) { ${remove}(id: $id) }`, { id: old.id }).catch(() => undefined);
      console.log(`swept ${old.name}`);
    }
  }
};

await sweep();

const clean = async () => {
  await sweep();
  await finish(browser);
};

/* ------------------------------------------ made on the settings page --- */

await page.goto(`${BASE}/workspace/${WORKSPACE}/conditions/new`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the condition form'), 'the condition form is on screen');

await page.locator('#condition-type').selectOption('VALUE');
record(
  await page.locator('#condition-property').count().then((many) => many === 0),
  'a value condition asks for no property - the node picks the value',
);
record(
  await page.locator('[data-value-note]').count().then((many) => many === 1),
  'and says so where the property would have been',
);
const checks = await page.locator('#condition-check option').evaluateAll((all) => all.map((one) => one.value));
console.log(`checks: ${JSON.stringify(checks)}`);
record(
  JSON.stringify(checks) === JSON.stringify(['IN_LIST', 'EQUALS', 'CONTAINS', 'MATCHES']),
  'it offers the checks a value can take, and not the time-of-day one',
);

await page.locator('#condition-name').fill(`${PREFIX} is ours ${STAMP}`);
await page.getByPlaceholder('Add a value…').fill('U01');
await page.keyboard.press('Enter');
await page.getByPlaceholder('Add a value…').fill('U02');
await page.keyboard.press('Enter');
await page.getByRole('button', { name: /Create Condition|Save/ }).first().click();
await page.waitForTimeout(1500);

const { workspaceConditions } = await graphql(
  `query($w: ID!) { workspaceConditions(workspaceId: $w, page: 0, size: 200) { content { id name type check property values description } } }`,
  { w: WORKSPACE },
);
const made = workspaceConditions.content.find((one) => one.name === `${PREFIX} is ours ${STAMP}`) ?? null;
console.log(`stored: ${JSON.stringify(made)}`);
record(made !== null && made.type === 'VALUE' && made.check === 'IN_LIST', 'it is stored as a value condition');
record(made !== null && made.property === null && JSON.stringify(made.values) === '["U01","U02"]', 'with no property and the two values');
if (made === null) await clean();

/* ---------------------------------------------- picked on the node ------ */

const flow = await graphql(`mutation($input: CreateWorkflowInput!) { createWorkflow(input: $input) { workflowId } }`, {
  input: { workspaceId: WORKSPACE, name: `${PREFIX} ${STAMP}`, description: 'Made by value-condition-check.' },
});
const WORKFLOW = flow.createWorkflow.workflowId;
await graphql(
  `mutation($w: ID!, $f: ID!, $input: WorkflowGraphInput!) {
     saveWorkflowGraph(workspaceId: $w, workflowId: $f, input: $input) { nodes { key } }
   }`,
  {
    w: WORKSPACE,
    f: WORKFLOW,
    input: {
      nodes: [{ key: 'asks', kind: 'CONDITION', name: `${PREFIX} asks`, x: 140, y: 140, conditionId: made.id, mappings: [] }],
      edges: [],
    },
  },
);

const openNode = async () => {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/workflows/${WORKFLOW}/editor`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.react-flow__node', { timeout: 30_000 });
  await page.waitForTimeout(1200);
  await page.locator('.react-flow__node').first().click();
  await page.waitForSelector('#node-condition', { timeout: 15_000 });
  await page.waitForTimeout(600);
};
await openNode();

const rows = await page
  .locator('[role="group"][aria-label$=" source"]')
  .evaluateAll((groups) => groups.map((one) => one.getAttribute('aria-label').replace(/ source$/, '')));
record(JSON.stringify(rows) === JSON.stringify(['value']), `the node draws one row, for the value (${JSON.stringify(rows)})`);

const row = page.locator('[role="group"][aria-label="value source"]');
const modes = await row.locator('button').evaluateAll((bs) => bs.map((b) => b.textContent.trim()));
record(
  JSON.stringify(modes) === JSON.stringify(['Value', 'Reference']),
  `with the ordinary Value/Reference switch (${JSON.stringify(modes)})`,
);

/*
 * What the node passes lands on the node. Filled as a value here, because a
 * graph of one node has nothing upstream for the field picker to offer; that
 * a reference is read at run time is ValueConditionTest's business.
 */
await page.locator('#node-mapping-value').fill('U01');
await page.waitForTimeout(300);
await page.keyboard.press('Control+s');
await page.waitForTimeout(2000);

const stored = await graphql(
  `query($w: ID!, $f: ID!) { workflowGraph(workspaceId: $w, workflowId: $f) { nodes { kind mappings { name expression mode } } } }`,
  { w: WORKSPACE, f: WORKFLOW },
);
const held = stored.workflowGraph.nodes.find((one) => one.kind === 'CONDITION')?.mappings ?? [];
console.log(`mappings: ${JSON.stringify(held)}`);
record(
  held.some((one) => one.name === 'value' && one.expression === 'U01'),
  'what the node passes is saved on the node, not on the condition',
);

/* And the other half of the switch is the field picker every reference row gets. */
await openNode();
await page.locator('[role="group"][aria-label="value source"]').getByRole('button', { name: 'Reference' }).click();
await page.waitForTimeout(500);
record(
  await page.locator('button[aria-label="value reference"]').count().then((many) => many === 1),
  'switched to Reference, the row offers the field picker the graph draws for every reference',
);

await clean();
