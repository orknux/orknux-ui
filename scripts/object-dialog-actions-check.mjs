/**
 * The Create Object panel's three buttons - From JSON Schema…, Cancel, Create
 * Object - each keep their words on one line. The panel is narrow, and the
 * three in one row wrapped every word of the first onto its own line.
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
  const tallest = Math.max(...boxes.map((box) => box?.height ?? 999));
  const shortest = Math.min(...boxes.map((box) => box?.height ?? 0));
  record(boxes.every((box) => box !== null) && tallest - shortest < 2 && tallest <= 48, `each button keeps to one line (${boxes.map((box) => Math.round(box?.height ?? 0)).join(', ')} px tall)`);
  const [a, b, c] = boxes;
  record(a !== null && b !== null && c !== null && a.x + a.width <= b.x && b.x + b.width <= c.x, 'From JSON Schema… stands left of Cancel and Create Object');
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
