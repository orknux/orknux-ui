/**
 * The Create Object panel offers From JSON Schema… as a button on a line of
 * its own above Cancel and Create Object, which stand side by side. The panel is
 * narrow: three buttons in one row wrapped the first word by word, and let
 * wrap they split Cancel from Create.
 *
 * Makes a workflow under a name of its own and removes it again.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });
const NAME = `zz object dialog actions ${Date.now()}`;

try {
  const workflowId = (await graphql(
    `mutation($input: CreateWorkflowInput!) { createWorkflow(input: $input) { workflowId } }`,
    { input: { workspaceId: WORKSPACE, name: NAME } },
  )).createWorkflow.workflowId;
  await graphql(
    `mutation($w: ID!, $f: ID!, $input: WorkflowGraphInput!) { saveWorkflowGraph(workspaceId: $w, workflowId: $f, input: $input) { workflowId } }`,
    { w: WORKSPACE, f: workflowId, input: { nodes: [{ key: 'held', kind: 'OBJECT', name: 'Held', x: 120, y: 120 }], edges: [] } },
  );

  await page.goto(`${BASE}/workspace/${WORKSPACE}/workflows/${workflowId}/editor`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.react-flow__node', { timeout: 20_000 });
  await page.waitForTimeout(800);
  await page.click('.react-flow__node');
  await page.waitForSelector('#node-object', { timeout: 15_000 });

  // New, beside the Shape label, opens the Create Object panel.
  await page.locator('label[for="node-object"]').locator('xpath=ancestor::*[2]').getByRole('button', { name: 'New' }).click();
  const from = page.getByTestId('node-object-from-schema');
  await from.waitFor({ timeout: 10_000 });

  const boxes = await Promise.all([
    from.boundingBox(),
    page.getByRole('button', { name: 'Cancel' }).last().boundingBox(),
    page.getByRole('button', { name: 'Create Object' }).boundingBox(),
  ]);
  const [a, b, c] = boxes;
  record(a !== null && b !== null && c !== null && Math.abs(a.height - b.height) < 2 && Math.abs(b.height - c.height) < 2 && b.height <= 48, `each is a button of the same height, on one line (${boxes.map((box) => Math.round(box?.height ?? 0)).join(', ')} px tall)`);
  record(a !== null && b !== null && c !== null && a.y + a.height <= b.y && Math.abs(b.y - c.y) < 2 && b.x + b.width <= c.x, 'From JSON Schema… stands above Cancel and Create Object, which stand side by side');
  record(a !== null && c !== null && Math.abs(a.x + a.width - (c.x + c.width)) < 2, `and flush with their right edge (${a && c ? Math.round(a.x + a.width - (c.x + c.width)) : '?'}px off)`);
} finally {
  const { workspaceWorkflows } = await graphql(
    `query($w: ID!) { workspaceWorkflows(workspaceId: $w, size: 200) { content { id name } } }`,
    { w: WORKSPACE },
  );
  for (const old of workspaceWorkflows.content.filter((one) => one.name === NAME)) {
    await graphql(`mutation($id: ID!) { removeWorkflow(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
}

await finish(browser);
