/**
 * The workflow editor's Node Properties panel is widened by dragging its edge.
 *
 * Asked for: the panel was a fixed 280px, too narrow for a node with several
 * questions or long mappings. Measured as the drawn width after a drag, after a
 * reload (it is remembered), and after a double-click (it goes back).
 *
 * The workflow is this check's own and removed afterwards.
 */
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });
const made = await graphql(`mutation($input: CreateWorkflowInput!) { createWorkflow(input: $input) { workflowId } }`, {
  input: { workspaceId: WORKSPACE, name: `zzPanelWidth ${Date.now()}` },
});
const WORKFLOW = made.createWorkflow.workflowId;
/* An agent node, whose settings open in a drawer beside the graph. */
const agent = (await graphql(
  `mutation($w: ID!, $n: String!) { createAgent(input: { workspaceId: $w, name: $n, type: LLM }) { id name } }`,
  { w: WORKSPACE, n: `zz panel drawer ${Date.now()}` },
)).createAgent;
await graphql(
  `mutation($w: ID!, $f: ID!, $input: WorkflowGraphInput!) { saveWorkflowGraph(workspaceId: $w, workflowId: $f, input: $input) { workflowId } }`,
  {
    w: WORKSPACE,
    f: WORKFLOW,
    input: { nodes: [{ key: 'ask', kind: 'AGENT', name: 'zz drawer agent', x: 100, y: 200, outputName: 'answer', agentId: agent.id }], edges: [] },
  },
);

await page.goto(`${BASE}/workspace/${WORKSPACE}/workflows/${WORKFLOW}/editor`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the editor'), 'the editor is on screen');
await page.evaluate(() => { try { localStorage.removeItem('orknux.workflow-editor.panel-width'); } catch {} });
await page.reload({ waitUntil: 'domcontentloaded' });

const panel = page.locator('#workflow-node-properties');
const handle = page.getByRole('separator', { name: 'Width of the node properties' });
await panel.waitFor({ timeout: 20_000 });
const before = (await panel.boundingBox())?.width ?? 0;
const there = await handle.waitFor({ timeout: 10_000 }).then(() => true).catch(() => false);
record(there, `the panel has a handle on its edge (it starts ${Math.round(before)}px wide)`);

if (there) {
  const box = await handle.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 200, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();
  const after = (await panel.boundingBox())?.width ?? 0;
  record(after - before > 150, `dragging it left 200px widens the panel (${Math.round(before)} -> ${Math.round(after)})`);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await panel.waitFor({ timeout: 20_000 });
  const kept = (await panel.boundingBox())?.width ?? 0;
  record(Math.abs(kept - after) < 4, `and the width is kept across a reload (${Math.round(kept)})`);

  await handle.dblclick();
  const back = (await panel.boundingBox())?.width ?? 0;
  record(Math.abs(back - before) < 4, `a double-click puts it back (${Math.round(back)})`);
}

/*
 * A drawer opens beside the panel, not over it. Reported: widened, the panel
 * was covered by the agent's settings drawer, pinned to the window's edge.
 */
if (there) {
  const box = await handle.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 200, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();
  await page.locator('.react-flow__node', { hasText: 'zz drawer agent' }).first().click();
  await page.getByRole('link', { name: /^Open the .+'s definition$/ }).first().click({ timeout: 10_000 }).catch(() => undefined);
  const drawer = page.locator('dialog[open]').first();
  const opened = await drawer.waitFor({ timeout: 10_000 }).then(() => true).catch(() => false);
  record(opened, "the agent's settings open in a drawer");
  if (opened) {
    await page.waitForTimeout(300);
    const d = await drawer.boundingBox();
    const p = await panel.boundingBox();
    record(
      d !== null && p !== null && d.x + d.width <= p.x + 2,
      `and it stands beside the widened panel, not over it (drawer ends ${Math.round((d?.x ?? 0) + (d?.width ?? 0))}, panel starts ${Math.round(p?.x ?? 0)})`,
    );
  }
  await handle.dblclick().catch(() => undefined);
}

await graphql(`mutation($id: ID!) { removeWorkflow(id: $id) }`, { id: WORKFLOW }).catch(() => undefined);
await graphql(`mutation($id: ID!) { deleteAgent(id: $id) }`, { id: agent.id }).catch(() => undefined);
await finish(browser);
