/**
 * The workflow editor's newer tools, as drawn:
 *
 *   wiggle      a node being dragged wiggles - an animation runs on its card -
 *               and so do the lines joined to it, and nothing else
 *   shape       the panel's Shape picks the card's outline, it is saved, and
 *               the card is drawn with it
 *   joint tool  a toolbox button and its keystroke switch it; while on, one
 *               click on a line puts a joint there, on a flow line and on a
 *               dependency line alike
 *   drag hint   dragging a point shows move and joint by the pointer, move lit;
 *               with Shift held joint is lit, and dropping leaves the point
 *               held where it was and puts a new joint where it dropped
 *   Add help    pointing at an Add menu entry, or giving it focus, says what
 *               that node does
 *   hints       the node panel's Name, Trigger, Icon and Description each have
 *               a help hint
 *
 * Makes its own workflow and removes it.
 */
import { BASE, WORKSPACE, open, record, drawn, finish, selectNode } from './suite/harness.mjs';

const PREFIX = 'zzEditorTools';
const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 1000 } });

const sweep = async () => {
  const { workspaceWorkflows } = await graphql(
    `query($w: ID!) { workspaceWorkflows(workspaceId: $w, page: 0, size: 200) { content { id name } } }`,
    { w: WORKSPACE },
  );
  for (const old of workspaceWorkflows.content.filter((one) => one.name.startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { removeWorkflow(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
};
await sweep();

const WORKFLOW = (
  await graphql(`mutation($input: CreateWorkflowInput!) { createWorkflow(input: $input) { workflowId } }`, {
    input: { workspaceId: WORKSPACE, name: `${PREFIX} ${Date.now()}` },
  })
).createWorkflow.workflowId;
await graphql(
  `mutation($w: ID!, $f: ID!, $input: WorkflowGraphInput!) { saveWorkflowGraph(workspaceId: $w, workflowId: $f, input: $input) { workflowId } }`,
  {
    w: WORKSPACE,
    f: WORKFLOW,
    input: {
      nodes: [
        { key: 'start', kind: 'TRIGGER', name: 'Start', x: 0, y: 0 },
        { key: 'make', kind: 'OBJECT', name: 'Make', x: 400, y: 0, outputName: 'made', mappings: [{ name: 'a', expression: 'x', mode: 'VALUE' }] },
        { key: 'read', kind: 'OBJECT', name: 'Read', x: 800, y: 300, mappings: [{ name: 'b', expression: 'made', mode: 'REFERENCE', sourceNodeKey: 'make' }] },
        { key: 'aside', kind: 'OBJECT', name: 'Aside', x: 0, y: 400, mappings: [] },
      ],
      edges: [{ source: 'start', target: 'make' }],
    },
  },
);

const FLOW = 'start-plain->make';
const DEPENDENCY = 'reads:make->read';
/** The joints a line holds, as the editor keeps them. */
const pointsOn = (edge) =>
  page.evaluate(
    ([key, id]) => {
      try {
        // Stored as the first point with the rest under `more`.
        const bend = JSON.parse(window.localStorage.getItem(key) ?? '{}')[id];
        return bend === undefined ? 0 : 1 + (bend.more?.length ?? 0);
      } catch {
        return -1;
      }
    },
    [`orknux.edge-labels.${WORKFLOW}`, edge],
  );
const centre = async (locator) => {
  const box = await locator.boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

try {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/workflows/${WORKFLOW}/editor`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.react-flow__node', { timeout: 30_000 });
  await drawn(page, 'the editor', { within: 30_000, still: 0 });
  /*
   * The dev server runs React in StrictMode, which loads the graph twice; an
   * edit made before the second answer lands is put back by it. Settled first.
   */
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1000);

  /* ---- wiggle ---- */

  const make = page.locator('.react-flow__node', { hasText: 'Make' }).first();
  const from = await centre(make.locator('[class*="nodeContent"]').first());
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 30, from.y + 20, { steps: 5 });
  await page.waitForTimeout(150);
  const wiggling = await page.evaluate(() => {
    const card = document.querySelector('.react-flow__node.dragging > *');
    const lines = [...document.querySelectorAll('.react-flow__edge.edgeWiggling')].map((one) => one.getAttribute('data-id'));
    const label = document.querySelector('ul[data-edge="reads:make->read"]');
    return { card: card === null ? null : getComputedStyle(card).animationName, lines, label: label === null ? null : getComputedStyle(label).animationName };
  });
  await page.mouse.up();
  record(wiggling.card !== null && wiggling.card !== 'none', `a dragged node wiggles (${wiggling.card})`);
  record(
    wiggling.lines.includes(FLOW) && wiggling.lines.includes(DEPENDENCY) && wiggling.lines.length === 2,
    `and so do its lines, and only they (${wiggling.lines.join(', ')})`,
  );
  record(wiggling.label !== null && wiggling.label !== 'none', `and so does the dependency line's label (${wiggling.label})`);
  const after = await page.locator('.react-flow__edge.edgeWiggling').count();
  record(after === 0, 'and it stops when dropped');

  /* ---- Add help ---- */

  await page.getByRole('button', { name: /add node/i }).click();
  await page.locator('[data-add-kind="WORKFLOW"]').hover();
  const helped = (await page.locator('[data-add-help]').textContent().catch(() => '')) ?? '';
  record(/runs another workflow/i.test(helped), `pointing at Workflow says what it does (${helped})`);
  await page.locator('[data-add-kind="CONDITION"]').focus();
  const focused = (await page.locator('[data-add-help]').textContent().catch(() => '')) ?? '';
  record(/yes or no/i.test(focused), `and so does focus on Condition (${focused})`);
  await page.keyboard.press('Escape');

  /* ---- hints and shape ---- */

  await selectNode(page, page.locator('.react-flow__node', { hasText: 'Start' }).first(), 'Start');
  await page.locator('#node-name').waitFor({ timeout: 10_000 });
  const hints = await page.evaluate(() =>
    ['Node Name', 'Trigger', 'Icon', 'Description', 'Shape'].map((label) => ({
      label,
      hinted: [...document.querySelectorAll('button')].some((one) => (one.getAttribute('aria-label') ?? '').includes(label)),
    })),
  );
  record(hints.every((one) => one.hinted), `the panel's fields have help hints (${JSON.stringify(hints.filter((one) => !one.hinted))})`);

  await page.locator('#node-shape').click();
  const menu = page.locator('[role="listbox"]');
  await menu.waitFor({ timeout: 5000 });
  await menu.locator('[role="option"]', { hasText: 'Hexagon' }).first().click();
  await page.getByRole('button', { name: /^save\b/i }).click();
  await page.waitForTimeout(2000);
  await page.locator('.react-flow__node [data-shape="HEXAGON"]').waitFor({ timeout: 8000 }).catch(() => {});
  const shaped = await page.locator('.react-flow__node [data-shape="HEXAGON"]').count();
  record(shaped === 1, 'Shape draws the card as a hexagon');
  const { workflowGraph } = await graphql(
    `query($w: ID!, $f: ID!) { workflowGraph(workspaceId: $w, workflowId: $f) { nodes { key shape } } }`,
    { w: WORKSPACE, f: WORKFLOW },
  );
  record(workflowGraph.nodes.find((one) => one.key === 'start')?.shape === 'HEXAGON', 'and it is saved');

  /* ---- the joint tool ---- */

  const tool = page.getByRole('button', { name: /^joint\b/i });
  record((await tool.count()) === 1, 'the toolbox has a Joint button');
  await page.locator('.react-flow__pane').click({ position: { x: 20, y: 20 } });
  await page.keyboard.press('j');
  record((await tool.getAttribute('aria-pressed')) === 'true', 'J switches the tool on');

  for (const [edge, what] of [[FLOW, 'a flow line'], [DEPENDENCY, 'a dependency line']]) {
    const before = await pointsOn(edge);
    const hit = page.locator(`path[data-edge-hit="${edge}"]`);
    // On the drawn path, not its box: a curved line does not run through its box's corners.
    const spot = await hit.evaluate((path) => {
      const at = path.getPointAtLength(path.getTotalLength() * 0.3);
      const matrix = path.getScreenCTM();
      return { x: at.x * matrix.a + at.y * matrix.c + matrix.e, y: at.x * matrix.b + at.y * matrix.d + matrix.f };
    });
    await page.mouse.click(spot.x, spot.y);
    await page.waitForTimeout(300);
    const later = await pointsOn(edge);
    record(later === before + 1, `one click on ${what} puts a joint there (${before} -> ${later})`);
  }
  await page.keyboard.press('j');
  record((await tool.getAttribute('aria-pressed')) === 'false', 'and J switches it off');

  /* ---- the drag hint, and a Shift drop ---- */

  const held = page.locator(`button[data-edge="${FLOW}"][data-point="0"]`);
  const at = await centre(held);
  const count = await pointsOn(FLOW);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x + 40, at.y + 60, { steps: 4 });
  const plain = await page.locator('[data-drag-hint]').getAttribute('data-drag-hint').catch(() => null);
  record(plain === 'move', `dragging a point says move, with joint beside it (${plain})`);
  await page.keyboard.down('Shift');
  await page.mouse.move(at.x + 50, at.y + 70, { steps: 2 });
  const shifted = await page.locator('[data-drag-hint]').getAttribute('data-drag-hint').catch(() => null);
  record(shifted === 'joint', `with Shift held it says joint (${shifted})`);
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await page.waitForTimeout(300);
  const still = await centre(held);
  record(Math.abs(still.x - at.x) < 2 && Math.abs(still.y - at.y) < 2, 'dropped with Shift, the point held stays where it was');
  record((await pointsOn(FLOW)) === count + 1, `and a new joint is put where it dropped (${count} -> ${await pointsOn(FLOW)})`);
  record((await page.locator('[data-drag-hint]').count()) === 0, 'and the hint goes');
} finally {
  await sweep();
}

await finish(browser);
