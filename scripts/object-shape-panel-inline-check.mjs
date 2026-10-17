/**
 * An object node's Shape panel draws an object defined inside a property the
 * way the object's own page does: the row's type reads `object`, and its
 * fields are rows set in under it.
 *
 * The panel edits the saved shape itself, with the same editor as the page,
 * but was handed the type list without `object` and not told to draw nested
 * rows - so a shape made from a JSON Schema showed "Choose a type…" on every
 * nested field, with its fields nowhere. Makes an object and a workflow under
 * names of its own, and removes them.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });

const PREFIX = 'zzObjectShapeInline';

const sweep = async () => {
  const { workspaceWorkflows } = await graphql(
    `query($w: ID!) { workspaceWorkflows(workspaceId: $w, size: 200) { content { id name } } }`,
    { w: WORKSPACE },
  );
  for (const old of workspaceWorkflows.content.filter((one) => one.name.startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { removeWorkflow(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
  const { workspaceObjects } = await graphql(
    `query($w: ID!) { workspaceObjects(workspaceId: $w, size: 200) { content { id name } } }`,
    { w: WORKSPACE },
  );
  for (const old of workspaceObjects.content.filter((one) => one.name.startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { deleteObject(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
};
await sweep();

try {
  const { createObject } = await graphql(
    `mutation($w: ID!, $name: String!) { createObject(input: { workspaceId: $w, name: $name, properties: [
       { name: "id", kind: STRING },
       { name: "customer", kind: OBJECT, properties: [ { name: "name", kind: STRING }, { name: "city", kind: STRING } ] }
     ] }) { id } }`,
    { w: WORKSPACE, name: `${PREFIX}Shape` },
  );
  const { createWorkflow } = await graphql(
    `mutation($input: CreateWorkflowInput!) { createWorkflow(input: $input) { workflowId } }`,
    { input: { workspaceId: WORKSPACE, name: `${PREFIX} flow`, description: 'Made by object-shape-panel-inline-check, and removed again.' } },
  );
  await graphql(
    `mutation($w: ID!, $f: ID!, $input: WorkflowGraphInput!) { saveWorkflowGraph(workspaceId: $w, workflowId: $f, input: $input) { nodes { key } } }`,
    { w: WORKSPACE, f: createWorkflow.workflowId, input: { nodes: [{ key: 'held', kind: 'OBJECT', name: `${PREFIX} holds`, x: 120, y: 120, objectId: createObject.id }], edges: [] } },
  );

  await page.goto(`${BASE}/workspace/${WORKSPACE}/workflows/${createWorkflow.workflowId}/editor`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  await page.click('.react-flow__node');
  await page.waitForSelector('#node-object', { timeout: 15_000 });
  const name = page.locator('#node-shape-name-1');
  await name.waitFor({ timeout: 20_000 });
  record((await name.inputValue()) === 'customer', 'the shape’s rows are drawn in the panel');

  const picked = (await page.locator('#node-shape-type-1').textContent())?.trim() ?? '';
  record(picked === 'object', `the row that is an object defined in place says so (${picked})`);
  const nested = page.locator('#node-shape-1-name-0');
  record((await nested.count()) === 1 && (await nested.inputValue()) === 'name', 'and its fields are rows set in under it');
  const panel = page.locator('#node-object').locator('xpath=ancestor::*[contains(@class, "panel")][1]');
  if ((await panel.count()) > 0) await panel.screenshot({ path: '/tmp/shape-panel.png' }).catch(() => undefined);
} finally {
  await sweep();
}

await finish(browser);
