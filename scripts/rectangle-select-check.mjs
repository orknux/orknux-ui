/**
 * Rectangle select on the workflow canvas.
 *
 * A button on the toolbar, left of Add, switches a drag on empty canvas
 * between panning and drawing a selection rectangle; its keystroke (S unless
 * rebound) does the same, and Preferences has the row to rebind it. With the
 * mode on, a rectangle drawn over two of three nodes selects those two.
 *
 * Makes a workflow under a name of its own and removes it again.
 */
import { BASE, WORKSPACE, open, drawn, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });
const NAME = `zz rectangle select ${Date.now()}`;

const toggle = () => page.getByRole('button', { name: /^Rectangle select/ });
const pressed = async () => (await toggle().getAttribute('aria-pressed')) === 'true';
const selectedCount = () => page.locator('.react-flow__node.selected').count();

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
  await page.locator('.react-flow__node').nth(2).waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1000);

  // The button is on the toolbar, right before Joint and Add, off by default.
  const add = await page.getByRole('button', { name: /^Add node/ }).boundingBox();
  const joint = await page.getByRole('button', { name: /^Joint/ }).boundingBox();
  const button = await toggle().boundingBox();
  record(
    add !== null && joint !== null && button !== null && Math.abs(button.y - add.y) < 2 && button.x < joint.x && joint.x < add.x && joint.x - (button.x + button.width) < 16,
    `the switch is on the toolbar, before Joint and Add (${button && joint ? `${Math.round(joint.x - (button.x + button.width))}px before Joint` : 'missing'})`,
  );
  record(!(await pressed()), 'it starts off');

  const box = async (name) => page.locator('.react-flow__node').filter({ hasText: name }).first().boundingBox();
  const first = await box('First');
  const second = await box('Second');
  const rectangle = async () => {
    await page.mouse.move(first.x - 30, first.y - 30);
    await page.mouse.down();
    await page.mouse.move(second.x + second.width / 2, second.y + second.height + 30, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(300);
  };

  // Off: the same drag pans, and selects nothing.
  await rectangle();
  record((await selectedCount()) === 0, `off, a drag on the canvas selects nothing (${await selectedCount()})`);
  await page.waitForTimeout(300);
  // Pan back by the same amount, so the nodes are where they were measured.
  await page.mouse.move(second.x + second.width / 2, second.y + second.height + 30);
  await page.mouse.down();
  await page.mouse.move(first.x - 30, first.y - 30, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  // On, from the button: the rectangle selects what it touches - the half-covered Second too, and not Third.
  await toggle().click();
  record(await pressed(), 'the button switches it on');
  await rectangle();
  record((await selectedCount()) === 2, `on, a rectangle over First and half of Second selects both and not Third (${await selectedCount()})`);

  // Escape lets the selection go, and leaves the mode on.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  record((await selectedCount()) === 0 && (await pressed()), `Escape deselects and leaves the mode on (${await selectedCount()} selected)`);

  // The keystroke switches it off and on again.
  await page.mouse.click(first.x - 60, first.y + first.height + 120);
  await page.keyboard.press('s');
  await page.waitForTimeout(100);
  record(!(await pressed()), 'the keystroke switches it off');
  await page.keyboard.press('s');
  await page.waitForTimeout(100);
  record(await pressed(), 'and on again');

  // Preferences has the row.
  await page.goto(`${BASE}/preferences`, { waitUntil: 'domcontentloaded' });
  const row = page.locator('#select-shortcut');
  await row.waitFor({ timeout: 15_000 });
  const shown = (await row.locator('xpath=ancestor::div[contains(@class, "setting")][1]//div[contains(@class, "options")]/button[1]').textContent())?.trim();
  record(shown === 'S', `Preferences shows the keystroke to rebind (${shown})`);
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
