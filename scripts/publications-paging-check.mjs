/**
 * A workflow's publications are paged: a workflow published every day for a
 * month listed thirty rows down its settings page with nothing to page them.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });
const { createWorkflow } = await graphql(
  'mutation($w: ID!, $n: String!) { createWorkflow(input: { workspaceId: $w, name: $n }) { workflowId } }',
  { w: WORKSPACE, n: `zz Published often ${Date.now()}` },
);
const workflowId = createWorkflow.workflowId;
try {
  for (let at = 0; at < 12; at++) {
    await graphql(
      `mutation($w: ID!, $f: ID!) { saveWorkflowGraph(workspaceId: $w, workflowId: $f, input: {
         nodes: [{ key: "o", kind: OBJECT, name: "Step ${at}", x: ${at * 10}, y: 0 }], edges: [] }) { revision } }`,
      { w: WORKSPACE, f: workflowId },
    );
    await graphql('mutation($w: ID!, $f: ID!) { publishWorkflow(workspaceId: $w, workflowId: $f) { status } }', { w: WORKSPACE, f: workflowId });
  }
  await page.goto(`${BASE}/workspace/${WORKSPACE}/workflows/${workflowId}/settings`, { waitUntil: 'domcontentloaded' });
  const restores = page.getByRole('button', { name: 'Restore', exact: true });
  await page.getByText('Live', { exact: true }).waitFor({ timeout: 20_000 });
  const first = (await restores.count()) + 1;
  record(first === 10, `a page holds ten publications (${first})`);
  const next = page.getByRole('button', { name: /next/i });
  record((await next.count()) > 0, 'with a pager below them');
  await next.first().click();
  await page.waitForTimeout(300);
  const second = await restores.count();
  record(second === 2 && (await page.getByText('Live', { exact: true }).count()) === 0, `the next page holds the other two (${second})`);
} finally {
  const held = await graphql('query($w: ID!, $f: ID!) { workflowGraph(workspaceId: $w, workflowId: $f) { assignmentId } }', { w: WORKSPACE, f: workflowId }).catch(() => null);
  if (held?.workflowGraph?.assignmentId) await graphql('mutation($id: ID!) { removeWorkflow(id: $id) }', { id: held.workflowGraph.assignmentId }).catch(() => undefined);
}
await finish(browser);
