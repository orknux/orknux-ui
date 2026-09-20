/**
 * A node added from the menu lands where somebody is looking.
 *
 * It used to be placed at a staircase from the origin - eighty pixels in,
 * forty more for every node already on the canvas - which is somewhere else
 * entirely once anybody has panned, zoomed, or has a graph bigger than a
 * window. The node was made, the canvas did not move, and it read as the
 * button having done nothing.
 *
 * So what is measured is the middle of the *visible* canvas, with the existing
 * node deliberately far away: the old rule would put the new one near the
 * origin, which is off-screen from there.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });

const PREFIX = 'zzNewNodeCentre';
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

const made = await graphql(`mutation($input: CreateWorkflowInput!) { createWorkflow(input: $input) { workflowId } }`, {
  input: { workspaceId: WORKSPACE, name: `${PREFIX} ${Date.now()}`, description: 'Made by new-node-centre-check.' },
});
const WORKFLOW = made.createWorkflow.workflowId;

// Far from the origin, so "the middle of the screen" and "near 0,0" are not
// the same answer.
await graphql(
  `mutation($w: ID!, $f: ID!, $input: WorkflowGraphInput!) {
     saveWorkflowGraph(workspaceId: $w, workflowId: $f, input: $input) { nodes { key } }
   }`,
  {
    w: WORKSPACE,
    f: WORKFLOW,
    input: { nodes: [{ key: 'far', kind: 'ACTION', name: `${PREFIX} far`, x: 2400, y: 1600 }], edges: [] },
  },
);

await page.goto(`${BASE}/workspace/${WORKSPACE}/workflows/${WORKFLOW}/editor`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.react-flow__node', { timeout: 20_000 });
await page.waitForTimeout(1500);

/** Every node on the canvas, and whether the canvas is showing it. */
const drawn = () =>
  page.evaluate(() => {
    const canvas = document.querySelector('.react-flow').getBoundingClientRect();
    return [...document.querySelectorAll('.react-flow__node')].map((node) => {
      const box = node.getBoundingClientRect();
      return {
        id: node.getAttribute('data-id'),
        inView:
          box.left >= canvas.left - 5 &&
          box.right <= canvas.right + 5 &&
          box.top >= canvas.top - 5 &&
          box.bottom <= canvas.bottom + 5,
        fromMiddle: Math.round(
          Math.hypot(
            box.left + box.width / 2 - (canvas.left + canvas.width / 2),
            box.top + box.height / 2 - (canvas.top + canvas.height / 2),
          ),
        ),
      };
    });
  });

for (const kind of ['Action', 'Condition', 'Object']) {
  await page.getByRole('button', { name: /^Add node/ }).click();
  await page.getByRole('menuitem', { name: kind, exact: true }).click();
  await page.waitForTimeout(700);
}

const all = await drawn();
const added = all.filter((one) => one.id !== 'far');
record(added.length === 3, `three nodes were added (${added.length})`);
record(
  added.every((one) => one.inView),
  `each of them is on the screen (${JSON.stringify(added)})`,
);

/*
 * Near the middle rather than exactly on it: the middle is taken - by the far
 * node, which the page framed there, and then by each new one - so they step
 * aside rather than stack. What matters is that stepping aside keeps them on
 * the canvas.
 */
const nearest = Math.min(...added.map((one) => one.fromMiddle));
record(nearest < 300, `the first one lands near the middle of the view (${nearest}px from it)`);

await sweep();
await finish(browser);
