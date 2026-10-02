/**
 * A node with lines to two others, run: both paths, and the node where they meet.
 *
 * Issue #285. A node that is not a condition or a decision and has lines to
 * several others sends the run down all of them at the same time, and where the
 * lines meet again the node there waits for every one of them and runs once.
 * How many steps of one run may be working at once is a number on the Admin
 * page, under Workflow runs.
 *
 * What is measured:
 *
 *   the setting is on the page  - the box under Workflow runs is drawn, with a
 *                                 size, and shows what the server holds.
 *   it is kept                  - a number typed and saved is what the server
 *                                 holds afterwards, and what a reload shows; it
 *                                 is put back at the end.
 *   both paths ran, once each   - a fan-out of Object nodes is run: both paths
 *                                 and the meeting node are completed, and the
 *                                 meeting node was handed what both produced.
 *   the run page draws it       - the two paths' cards and the meeting node's
 *                                 are drawn, each marked as having run, and the
 *                                 two paths' cards do not lie on top of each
 *                                 other.
 *
 * That the paths really overlap on the clock is the server's to prove -
 * `ParallelBranchesTest` and `ExecutionWorkflowTest` time two one-second steps
 * finishing in under two - because an Object node finishes in no time at all.
 *
 * Makes a workflow of its own and removes it; changes an installation-wide
 * setting, so it runs alone.
 */
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });

/* ----------------------------------------------------------- the setting */

async function stored() {
  const { installationSettings } = await graphql(
    'query { installationSettings { workflowStepsAtOnce workflowStepsAtOnceConfigured } }',
  );
  return installationSettings;
}

const started = await stored();
record(
  Number.isInteger(started.workflowStepsAtOnce) && started.workflowStepsAtOnce >= 1,
  `the installation lets ${started.workflowStepsAtOnce} steps of a run work at once`,
);

const field = () => page.getByLabel('Steps running at once', { exact: true });
const save = () => page.getByRole('button', { name: 'Save the settings on this page', exact: true });

await page.goto(`${BASE}/admin/settings`, { waitUntil: 'domcontentloaded' });
if (await drawn(page, 'admin settings')) {
  await field().waitFor({ state: 'visible', timeout: 20_000 });

  const box = await field().boundingBox();
  record(box !== null && box.width > 20 && box.height > 10, `the box is drawn with a size (${JSON.stringify(box)})`);

  const section = await page.evaluate(() => {
    const heading = document.getElementById('workflow-runs');
    const input = document.getElementById('workflow-steps-at-once');
    if (heading === null || input === null) return null;
    return {
      heading: heading.textContent,
      below: input.getBoundingClientRect().top > heading.getBoundingClientRect().bottom,
    };
  });
  record(section !== null && section.below, `it sits under the Workflow runs heading (${JSON.stringify(section)})`);

  record(
    (await field().inputValue()) === String(started.workflowStepsAtOnce),
    `the box shows what is stored (${await field().inputValue()})`,
  );

  const wanted = started.workflowStepsAtOnce === 3 ? 5 : 3;
  await field().fill(String(wanted));
  await save().click();
  await page.getByText('Saved.', { exact: true }).waitFor({ timeout: 10_000 }).catch(() => {});
  record((await stored()).workflowStepsAtOnce === wanted, `the server holds ${wanted} after a save`);

  await page.reload({ waitUntil: 'domcontentloaded' });
  if (await drawn(page, 'admin settings after a reload')) {
    await field().waitFor({ state: 'visible', timeout: 20_000 });
    record((await field().inputValue()) === String(wanted), `and a reload shows ${await field().inputValue()}`);
  }
}

await graphql('mutation($count: Int!) { setWorkflowStepsAtOnce(count: $count) { workflowStepsAtOnce } }', {
  count: started.workflowStepsAtOnce,
});
record((await stored()).workflowStepsAtOnce === started.workflowStepsAtOnce, 'put back to what it was');

/* ----------------------------------------------------------- the fan-out */

const PREFIX = 'zzParallel';

const sweep = async () => {
  const { workspaceWorkflows } = await graphql(
    `query($w: ID!) { workspaceWorkflows(workspaceId: $w, size: 200) { content { id name } } }`,
    { w: WORKSPACE },
  );
  for (const old of workspaceWorkflows.content.filter((one) => one.name.startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { removeWorkflow(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
};
await sweep();

/*
 * A unique name: removing a workflow keeps its definition, so the name stays
 * taken and a second run of this check would collide with the first.
 */
const made = await graphql(`mutation($input: CreateWorkflowInput!) { createWorkflow(input: $input) { workflowId } }`, {
  input: {
    workspaceId: WORKSPACE,
    name: `${PREFIX} ${Date.now()}`,
    description: 'Made by workflow-parallel-check, and removed again.',
  },
});
const WORKFLOW = made.createWorkflow.workflowId;

/** One Object node holding one field, named after itself. */
const objectNode = (key, x, y) => ({
  key,
  kind: 'OBJECT',
  name: `${PREFIX} ${key}`,
  x,
  y,
  outputName: key,
  mappings: [{ name: 'value', expression: key, mode: 'VALUE' }],
});

await graphql(
  `mutation($w: ID!, $f: ID!, $input: WorkflowGraphInput!) {
     saveWorkflowGraph(workspaceId: $w, workflowId: $f, input: $input) { nodes { key } }
   }`,
  {
    w: WORKSPACE,
    f: WORKFLOW,
    input: {
      nodes: [
        objectNode('first', 40, 200),
        objectNode('left', 360, 60),
        objectNode('right', 360, 340),
        objectNode('join', 680, 200),
      ],
      edges: [
        { source: 'first', target: 'left' },
        { source: 'first', target: 'right' },
        { source: 'left', target: 'join' },
        { source: 'right', target: 'join' },
      ],
    },
  },
);

const ran = await graphql(
  `mutation($w: ID!, $id: ID!) { startExecution(workspaceId: $w, workflowId: $id) { id status } }`,
  { w: WORKSPACE, id: WORKFLOW },
);
const runId = ran.startExecution.id;

let run = null;
for (let waited = 0; waited < 30_000; waited += 1000) {
  const { execution } = await graphql(
    `query($id: ID!) { execution(id: $id) { id status steps { key status input } } }`,
    { id: runId },
  );
  run = execution;
  if (run.status !== 'RUNNING') break;
  await page.waitForTimeout(1000);
}
const step = (key) => run?.steps.find((one) => one.key === key) ?? null;
console.log(`run #${runId}: ${run?.status}, steps ${JSON.stringify(run?.steps.map((one) => [one.key, one.status]))}`);

record(run?.status === 'COMPLETED', `the run completes (${run?.status})`);
record(
  ['first', 'left', 'right', 'join'].every((key) => step(key)?.status === 'COMPLETED'),
  'both paths and the node where they meet ran',
);
const handed = step('join')?.input ?? '';
record(handed.includes('"left"') && handed.includes('"right"'), `the meeting node was handed both paths (${handed})`);

/* ------------------------------------------------------------ the run page */

await page.goto(`${BASE}/workspace/${WORKSPACE}/executions/${runId}`, { waitUntil: 'domcontentloaded' });
await page.locator('.react-flow__node').first().waitFor({ state: 'attached', timeout: 30_000 });
await page.waitForTimeout(1500);

const card = (key) => page.locator('.react-flow__node').filter({ hasText: `${PREFIX} ${key}` });
for (const key of ['left', 'right', 'join']) {
  record((await card(key).locator('[aria-label="Ran"]').count()) === 1, `the run page marks ${key} as having run`);
}
const [leftBox, rightBox] = [await card('left').boundingBox(), await card('right').boundingBox()];
record(
  leftBox !== null && rightBox !== null && (leftBox.y + leftBox.height <= rightBox.y || rightBox.y + rightBox.height <= leftBox.y),
  `the two paths are drawn apart (${JSON.stringify(leftBox)} / ${JSON.stringify(rightBox)})`,
);

await sweep();
await finish(browser);
