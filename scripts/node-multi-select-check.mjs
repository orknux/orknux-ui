/**
 * Shift+click selects several nodes in the workflow editor. Issue #630.
 *
 * One node at a time was the only selection there was, so moving or removing a
 * group meant doing it node by node. Shift+click adds a node to the selection
 * now (Ctrl and Cmd still do): the panel says how many are selected, dragging
 * one moves them together, and Delete removes them all - while a node left out
 * of the selection stays where it is.
 *
 * Makes a workflow of three object nodes and removes it.
 */
import { BASE, WORKSPACE, open, drawn, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });
const NAME = `zz multi select ${Date.now()}`;

try {
  const workflowId = (await graphql(
    `mutation($input: CreateWorkflowInput!) { createWorkflow(input: $input) { workflowId } }`,
    { input: { workspaceId: WORKSPACE, name: NAME } },
  )).createWorkflow.workflowId;
  await graphql(
    `mutation($w: ID!, $f: ID!, $input: WorkflowGraphInput!) { saveWorkflowGraph(workspaceId: $w, workflowId: $f, input: $input) { workflowId } }`,
    { w: WORKSPACE, f: workflowId, input: { nodes: [
      { key: 'a', kind: 'OBJECT', name: 'First', x: 0, y: 0 },
      { key: 'b', kind: 'OBJECT', name: 'Second', x: 450, y: 0 },
      { key: 'c', kind: 'OBJECT', name: 'Third', x: 900, y: 0 },
    ], edges: [] } },
  );

  await page.goto(`${BASE}/workspace/${WORKSPACE}/workflows/${workflowId}/editor`, { waitUntil: 'domcontentloaded' });
  record(await drawn(page, 'the workflow editor'), 'the editor opens');
  const node = (name) => page.locator('.react-flow__node', { hasText: name }).first();
  await node('Third').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
  const where = async (name) => node(name).boundingBox();

  await node('First').click();
  await page.keyboard.down('Shift');
  await node('Second').click();
  await page.keyboard.up('Shift');
  await page.waitForTimeout(400);
  const selected = await page.locator('.react-flow__node.selected').count();
  record(selected === 2, `Shift+click selects a second node (${selected} selected)`);
  const note = await page.locator('[data-selection-count]').getAttribute('data-selection-count').catch(() => null);
  record(note === '2', `the panel says how many are selected (${note})`);

  /* Drag one of them: both move, the third stays. */
  const before = { first: await where('First'), second: await where('Second'), third: await where('Third') };
  const grip = before.second;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + 30);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + 130, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const after = { first: await where('First'), second: await where('Second'), third: await where('Third') };
  const moved = (name) => Math.round(after[name].y - before[name].y);
  record(moved('first') > 50 && moved('second') > 50, `dragging one moves both (${moved('first')}, ${moved('second')})`);
  record(Math.abs(moved('third')) < 2, `and the one left out stays (${moved('third')})`);

  /* Delete removes both. */
  await page.keyboard.press('Delete');
  await page.waitForTimeout(500);
  const left = await page.locator('.react-flow__node').allInnerTexts();
  record(left.length === 1 && left[0].includes('Third'), `Delete removes the selection and nothing else (${left.length} left)`);
} finally {
  const { workspaceWorkflows } = await graphql(
    `query($w: ID!) { workspaceWorkflows(workspaceId: $w, size: 500) { content { id name } } }`,
    { w: WORKSPACE },
  ).catch(() => ({ workspaceWorkflows: { content: [] } }));
  for (const old of workspaceWorkflows.content.filter((one) => one.name.startsWith('zz multi select'))) {
    await graphql(`mutation($id: ID!) { removeWorkflow(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
}

await finish(browser);
