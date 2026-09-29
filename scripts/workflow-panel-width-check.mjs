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
await page.evaluate(() => {
  try {
    localStorage.removeItem('orknux.workflow-editor.panel-width');
    localStorage.removeItem('orknux.workflow-editor.drawer-width');
    localStorage.removeItem('orknux.workflow-editor.panel-open');
  } catch {}
});
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

    /*
     * The drawer widens the same way, from its own left edge, and every drawer
     * shares the width. Asked for: the drawers were a fixed min(34vw, 520px).
     */
    const edge = page.getByRole('separator', { name: 'Width of the settings drawer' });
    const grip = await edge.waitFor({ timeout: 5_000 }).then(() => true).catch(() => false);
    record(grip, `the drawer has a handle on its left edge (it starts ${Math.round(d?.width ?? 0)}px wide)`);
    if (grip && d !== null) {
      const e = await edge.boundingBox();
      record(
        e !== null && Math.abs(e.x + e.width / 2 - d.x) < 4,
        `on the drawer's edge (handle centred at ${Math.round((e?.x ?? 0) + (e?.width ?? 0) / 2)}, drawer starts ${Math.round(d.x)})`,
      );
      await page.mouse.move(e.x + e.width / 2, e.y + e.height / 2);
      await page.mouse.down();
      await page.mouse.move(e.x + e.width / 2 - 150, e.y + e.height / 2, { steps: 10 });
      await page.mouse.up();
      const wide = (await drawer.boundingBox())?.width ?? 0;
      record(wide - d.width > 100, `dragging it left 150px widens the drawer (${Math.round(d.width)} -> ${Math.round(wide)})`);
      const p2 = await panel.boundingBox();
      const d2 = await drawer.boundingBox();
      record(
        d2 !== null && p2 !== null && d2.x + d2.width <= p2.x + 2,
        'and it still stands beside the panel',
      );

      await drawer.getByRole('button', { name: 'Close', exact: true }).click();
      await page.getByRole('link', { name: /^Open the .+'s definition$/ }).first().click({ timeout: 10_000 }).catch(() => undefined);
      await drawer.waitFor({ timeout: 10_000 }).catch(() => undefined);
      await page.waitForTimeout(300);
      const again = (await drawer.boundingBox())?.width ?? 0;
      record(Math.abs(again - wide) < 4, `closed and opened again, it keeps the width (${Math.round(again)})`);

      await edge.dblclick();
      const reset = (await drawer.boundingBox())?.width ?? 0;
      record(Math.abs(reset - d.width) < 4, `a double-click puts the drawer back (${Math.round(reset)})`);
    }

    /*
     * The panel can be put away with an × like the drawer's, and the canvas
     * takes the row; a drawer then stands at the window's edge.
     */
    const canvas = page.locator('.react-flow').first();
    const narrow = (await canvas.boundingBox())?.width ?? 0;
    const close = panel.getByRole('button', { name: 'Close', exact: true });
    const closable = await close.waitFor({ timeout: 5_000 }).then(() => true).catch(() => false);
    record(closable, 'the Node Properties panel has an × to close it');
    if (closable) {
      await close.click();
      await page.waitForTimeout(300);
      record((await panel.count()) === 0, 'the × puts the panel away');
      const full = (await canvas.boundingBox())?.width ?? 0;
      record(full - narrow > 300, `and the canvas takes its room (${Math.round(narrow)} -> ${Math.round(full)})`);
      const d3 = await drawer.boundingBox();
      const right = page.viewportSize()?.width ?? 1600;
      record(
        d3 !== null && Math.abs(d3.x + d3.width - right) < 3,
        `the open drawer moves to the window's edge (ends ${Math.round((d3?.x ?? 0) + (d3?.width ?? 0))} of ${right})`,
      );
      await drawer.getByRole('button', { name: 'Close', exact: true }).click().catch(() => undefined);

      const reopen = page.getByRole('button', { name: 'Properties', exact: true });
      const offered = await reopen.waitFor({ timeout: 5_000 }).then(() => true).catch(() => false);
      record(offered, `a Properties button offers the panel back (panel drawn: ${await panel.count()}, drawers open: ${await page.locator('dialog[open]').count()})`);
      if (offered) {
        await reopen.click();
        record(await panel.waitFor({ timeout: 5_000 }).then(() => true).catch(() => false), 'and pressing it shows the panel');
      }

      await close.click().catch(() => undefined);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator('.react-flow__node', { hasText: 'zz drawer agent' }).first().waitFor({ timeout: 20_000 });
      await page.waitForTimeout(500);
      record((await panel.count()) === 0, 'put away, the panel stays away across a reload');
      await page.locator('.react-flow__node', { hasText: 'zz drawer agent' }).first().click();
      record(await panel.waitFor({ timeout: 5_000 }).then(() => true).catch(() => false), 'selecting a node shows the panel again');
    }
  }
  await handle.dblclick().catch(() => undefined);
}

await graphql(`mutation($id: ID!) { removeWorkflow(id: $id) }`, { id: WORKFLOW }).catch(() => undefined);
await graphql(`mutation($id: ID!) { deleteAgent(id: $id) }`, { id: agent.id }).catch(() => undefined);
await finish(browser);
