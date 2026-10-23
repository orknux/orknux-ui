/**
 * A long workflow name in a narrow editor is cut on its one line, not wrapped
 * a word a line down the toolbar: the bar keeps its height and the buttons
 * beside the name keep their size, and the whole name is on its title.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1100, height: 800 } });
const name = `zz Azure Agent reply for Slack with a name long enough that the toolbar has to cut it somewhere ${Date.now()}`;
const { createWorkflow } = await graphql(
  'mutation($w: ID!, $n: String!) { createWorkflow(input: { workspaceId: $w, name: $n }) { workflowId } }',
  { w: WORKSPACE, n: name },
);
try {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/workflows/${createWorkflow.workflowId}/editor`, { waitUntil: 'domcontentloaded' });
  const title = page.getByTestId('workflow-name');
  await title.waitFor({ state: 'attached', timeout: 20_000 });
  await page.waitForTimeout(800);
  const box = await title.boundingBox();
  const cut = await title.evaluate((el) => el.scrollWidth > el.clientWidth);
  record(box.height <= 24, `the name stays on one line (${Math.round(box.height)}px tall)`);
  record(box.width >= 40, `and still shows some of itself (${Math.round(box.width)}px wide)`);
  record(cut, 'and is cut with an ellipsis where it does not fit');
  record((await title.getAttribute('title')) === name, 'with the whole name on its title');
  // The name sits in the bar's left half, which sits in the bar.
  const bar = await title.evaluate((el) => el.parentElement.parentElement.getBoundingClientRect().height);
  record(bar <= 41, `the toolbar keeps its height (${Math.round(bar)}px)`);
  // Nothing on the left is drawn over the buttons on the right.
  const halves = await title.evaluate((el) => {
    const left = el.parentElement;
    const right = left.nextElementSibling;
    const reach = Math.max(...[...left.children].map((one) => Math.min(one.getBoundingClientRect().right, left.getBoundingClientRect().right)));
    return { reach, right: right.getBoundingClientRect().left };
  });
  record(halves.reach <= halves.right, `nothing on the left runs into the buttons on the right (${Math.round(halves.reach)} <= ${Math.round(halves.right)})`);
  await page.screenshot({ path: '/tmp/workflow-title.png' });
} finally {
  const held = await graphql('query($w: ID!, $f: ID!) { workflowGraph(workspaceId: $w, workflowId: $f) { assignmentId } }', { w: WORKSPACE, f: createWorkflow.workflowId }).catch(() => null);
  if (held?.workflowGraph?.assignmentId) await graphql('mutation($id: ID!) { removeWorkflow(id: $id) }', { id: held.workflowGraph.assignmentId }).catch(() => undefined);
}
await finish(browser);
