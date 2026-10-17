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
  // The name is labelled over its box, as the type and the values under it are - not beside it at the box's foot.
  const stacked = await page.evaluate(() => {
    const box = document.getElementById('node-shape-name-1');
    const label = box?.parentElement?.querySelector('label');
    if (!box || !label) return null;
    const b = box.getBoundingClientRect(); const l = label.getBoundingClientRect();
    return { left: Math.round(l.left - b.left), above: l.bottom <= b.top + 1 };
  });
  record(stacked !== null && Math.abs(stacked.left) <= 1 && stacked.above, `the name's label stands over its box, flush left (${JSON.stringify(stacked)})`);

  // The remove sits in the card's top corner on the label's line, not on a line of its own between the fields.
  const corner = await page.evaluate(() => {
    const box = document.getElementById('node-shape-name-1');
    const card = box?.closest('div[class*="shapeRow"]');
    const remove = card?.querySelector('button[aria-label], button[title]');
    if (!box || !card || !remove) return null;
    const b = box.getBoundingClientRect(); const r = remove.getBoundingClientRect(); const c = card.getBoundingClientRect();
    return { aboveBox: r.bottom <= b.top + 1, rightEdge: Math.round(c.right - r.right) };
  });
  record(corner !== null && corner.aboveBox && corner.rightEdge >= 0 && corner.rightEdge <= 16, `the remove is in the card's top corner (${JSON.stringify(corner)})`);
  // The description is boxed like the name, and stands as far below Values as Values stands below Type.
  const spaced = await page.evaluate(() => {
    const card = document.getElementById('node-shape-name-1')?.closest('div[class*="shapeRow"]');
    const description = document.getElementById('node-shape-description-1');
    if (!card || !description) return null;
    const values = document.getElementById('node-shape-values-1');
    const desc = card.querySelector('label[for="node-shape-description-1"]');
    const below = (label) => { const prev = label.parentElement?.previousElementSibling; return prev ? Math.round(label.getBoundingClientRect().top - prev.getBoundingClientRect().bottom) : null; };
    if (!values || !desc) return null;
    return { border: getComputedStyle(description).borderTopWidth, aboveValues: below(values), aboveDescription: below(desc) };
  });
  record(spaced !== null && spaced.border === '1px' && spaced.aboveValues !== null && spaced.aboveDescription === spaced.aboveValues, `the description is boxed and spaced like the fields above it (${JSON.stringify(spaced)})`);
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
