/**
 * "+ New function" opens a panel beside the form, and makes the function there.
 *
 * The picker used to turn into a name box, and the function was only made when
 * the whole form was saved - so it could not be opened until then, and a taken
 * name was refused under unrelated fields. Now choosing "+ New function" opens
 * the panel the workflow editor makes things in: Name and Description, Create
 * and Cancel. Create makes the function at once and chooses it in the picker;
 * Cancel leaves the picker as it was and makes nothing; a taken name is refused
 * in the panel, and the refusal goes once the name is changed.
 *
 * On the action page, which is a form of its own. Makes a function under a name
 * of its own and deletes it again.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });
const FUNCTION = `zzNewFnPanel${Date.now()}`;
const WORKFLOW_NAME = `zz new function panel ${Date.now()}`;

/** The functions called [name], searched for: a workspace may hold more than one page of them. */
const named = async (name) =>
  (await graphql(
    `query($w: ID!, $s: String) { workspaceFunctions(workspaceId: $w, size: 50, search: $s) { content { id name } } }`,
    { w: WORKSPACE, s: name },
  )).workspaceFunctions.content.filter((one) => one.name === name);

const panel = page.locator('dialog[open]').filter({ hasText: 'New Function' });
const picker = page.locator('#action-function');
const chooseNew = async () => {
  await picker.click();
  await page.waitForTimeout(300);
  await page.locator('[role="option"]').first().click();
  await page.waitForTimeout(300);
};

try {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/actions/new`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#action-name', { timeout: 20_000 });
  await page.waitForTimeout(1000);
  await page.selectOption('#action-subtype', 'FUNCTION');
  await page.waitForTimeout(300);
  const before = (await picker.innerText()).trim();

  // On a page of its own the form fills the width, so it is the dialog the list pages name things in.
  await chooseNew();
  record((await panel.count()) === 1, '"+ New function" opens the New Function panel');
  record((await page.locator('#action-new-function').count()) === 0, 'and the form grows no name box of its own');
  record(await panel.evaluate((dialog) => dialog.matches(':modal')), 'on the action page it is a dialog over the page');

  // Cancel: nothing made, the picker as it was.
  await panel.getByRole('button', { name: 'Cancel' }).click();
  await page.waitForTimeout(300);
  record((await panel.count()) === 0 && (await picker.innerText()).trim() === before, `Cancel closes it and leaves the picker on "${before}"`);

  // A taken name is refused in the panel, and the refusal goes with the name.
  const { workspaceFunctions: present } = await graphql(
    `query($w: ID!) { workspaceFunctions(workspaceId: $w, size: 1) { content { name } } }`,
    { w: WORKSPACE },
  );
  const taken = present.content[0]?.name;
  await chooseNew();
  if (taken !== undefined) {
    await panel.locator('#new-name').fill(taken);
    await panel.getByRole('button', { name: 'Create Function' }).click();
    const refusal = panel.locator('[role="alert"]');
    await refusal.waitFor({ timeout: 10_000 }).catch(() => undefined);
    record((await refusal.count()) === 1 && (await panel.count()) === 1, `a taken name is refused in the panel (${taken})`);
    await panel.locator('#new-name').fill(FUNCTION);
    await page.waitForTimeout(150);
    record((await refusal.count()) === 0, 'and the refusal goes once the name is changed');
  }

  // Create: made at once, chosen in the picker, the panel gone.
  await panel.locator('#new-name').fill(FUNCTION);
  await panel.locator('#new-description').fill('Made by the new-function panel check');
  await panel.getByRole('button', { name: 'Create Function' }).click();
  await panel.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => undefined);
  await page.waitForTimeout(500);
  const made = await named(FUNCTION);
  record(made.length === 1, `Create made the function, once, before the action was saved (${made.length})`);
  record((await picker.innerText()).includes(FUNCTION), `and the picker has it chosen (${(await picker.innerText()).trim()})`);
  record((await panel.count()) === 0, 'and the panel closed');
  record(
    made.length === 1 && (await page.locator(`a[href$="/functions/${made[0].id}"]`).count()) >= 1,
    'and it can be opened at once, from the picker\'s open icon',
  );

  // In the workflow editor it stands down the side, to the left of the node's own panel.
  const flow = (await graphql(`mutation($input: CreateWorkflowInput!) { createWorkflow(input: $input) { workflowId } }`, {
    input: { workspaceId: WORKSPACE, name: WORKFLOW_NAME },
  })).createWorkflow.workflowId;
  await graphql(
    `mutation($w: ID!, $f: ID!, $input: WorkflowGraphInput!) { saveWorkflowGraph(workspaceId: $w, workflowId: $f, input: $input) { workflowId } }`,
    { w: WORKSPACE, f: flow, input: { nodes: [{ key: 'act', kind: 'ACTION', name: 'Step', x: 160, y: 160 }], edges: [] } },
  );
  await page.goto(`${BASE}/workspace/${WORKSPACE}/workflows/${flow}/editor`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.react-flow__node', { timeout: 20_000 });
  await page.locator('.react-flow__node').first().click();
  await page.waitForTimeout(800);
  await page.locator('button', { hasText: /Choose an action/ }).first().click();
  await page.waitForTimeout(400);
  await page.getByRole('option', { name: /^Custom/ }).first().click();
  await page.waitForTimeout(400);
  await page.locator('select').filter({ has: page.locator('option', { hasText: 'Function' }) }).first().selectOption({ label: 'Function' });
  await page.waitForTimeout(400);
  await chooseNew();
  const drawn = await panel.boundingBox();
  const field = await picker.boundingBox();
  record(
    drawn !== null && field !== null && !(await panel.evaluate((dialog) => dialog.matches(':modal'))) && drawn.x + drawn.width <= field.x + 1,
    `in the editor it is a panel standing left of the node's panel (panel ends at ${Math.round((drawn?.x ?? 0) + (drawn?.width ?? 0))}, node panel's picker starts at ${Math.round(field?.x ?? 0)})`,
  );
  await panel.getByRole('button', { name: 'Cancel' }).click();
} finally {
  const { workspaceWorkflows } = await graphql(
    `query($w: ID!) { workspaceWorkflows(workspaceId: $w, size: 200) { content { id name } } }`,
    { w: WORKSPACE },
  ).catch(() => ({ workspaceWorkflows: { content: [] } }));
  for (const old of workspaceWorkflows.content.filter((one) => one.name === WORKFLOW_NAME)) {
    // The Custom definition the node's panel wrote belongs to the workflow, and goes first.
    const { workflowOwnedActions } = await graphql(
      `query($w: ID!, $f: ID!) { workflowOwnedActions(workspaceId: $w, workflowId: $f) { id } }`,
      { w: WORKSPACE, f: old.id },
    ).catch(() => ({ workflowOwnedActions: [] }));
    for (const owned of workflowOwnedActions) {
      await graphql(`mutation($id: ID!) { deleteAction(id: $id) }`, { id: owned.id }).catch(() => undefined);
    }
    await graphql(`mutation($id: ID!) { removeWorkflow(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
  for (const one of await named(FUNCTION).catch(() => [])) {
    await graphql(`mutation($id: ID!) { deleteFunction(id: $id) }`, { id: one.id }).catch(() => undefined);
  }
}

await finish(browser);
