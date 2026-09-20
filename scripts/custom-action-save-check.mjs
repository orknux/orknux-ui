/**
 * A Custom action in a node's panel is saved, and saved again.
 *
 * The panel has no Create button - a Custom definition is part of the node, so
 * it writes itself as the node is filled in - and that made one failure very
 * easy to miss: the first write landed and every one after it was dropped in
 * silence. Two causes, both fixed, both pinned here.
 *
 * `submitting` was switched on before a write and only switched off again when
 * one failed. A form that is pressed goes away when it succeeds so that cost
 * nothing; this form stays open, and the watcher checks `submitting` before
 * writing - so one successful save turned the panel off for good.
 *
 * And the form was keyed by the definition's id, which arrives *with* the first
 * save: the key changed, React rebuilt the form, and whatever was typed while
 * that save was in flight went with it.
 *
 * So what is measured is the second write. Choose Function, let it save, then
 * choose a function and reload the page: the function has to still be there.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });

const PREFIX = 'zzCustomActionSave';
const STAMP = Date.now();

/** Anything this left behind before, so a rerun starts clean. */
const sweep = async () => {
  const { workspaceWorkflows } = await graphql(
    `query($w: ID!) { workspaceWorkflows(workspaceId: $w, size: 200) { content { id name } } }`,
    { w: WORKSPACE },
  );
  for (const old of workspaceWorkflows.content.filter((one) => one.name.startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { removeWorkflow(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
};
await sweep();

const made = await graphql(`mutation($input: CreateWorkflowInput!) { createWorkflow(input: $input) { workflowId } }`, {
  input: { workspaceId: WORKSPACE, name: `${PREFIX} ${STAMP}`, description: 'Made by custom-action-save-check.' },
});
const WORKFLOW = made.createWorkflow.workflowId;

await graphql(
  `mutation($w: ID!, $f: ID!, $input: WorkflowGraphInput!) {
     saveWorkflowGraph(workspaceId: $w, workflowId: $f, input: $input) { nodes { key } }
   }`,
  {
    w: WORKSPACE,
    f: WORKFLOW,
    input: { nodes: [{ key: 'act', kind: 'ACTION', name: `${PREFIX} step`, x: 160, y: 160 }], edges: [] },
  },
);

const done = async () => {
  await sweep();
  await finish(browser);
};

/** What this workflow owns, asked of the server rather than the screen. */
const owned = async () => {
  const { workflowOwnedActions } = await graphql(
    `query($w: ID!, $f: ID!) {
       workflowOwnedActions(workspaceId: $w, workflowId: $f) { id name subtype functionId }
     }`,
    { w: WORKSPACE, f: WORKFLOW },
  );
  return workflowOwnedActions;
};

/** A function to point the action at; any of the workspace's will do. */
const { workspaceFunctions } = await graphql(
  `query($w: ID!) { workspaceFunctions(workspaceId: $w, page: 0, size: 5) { content { id name } } }`,
  { w: WORKSPACE },
);
const fn = workspaceFunctions.content[0];
if (fn === undefined) {
  record(false, 'the workspace has a function to point an action at; the seed builds some');
  await done();
}

await page.goto(`${BASE}/workspace/${WORKSPACE}/workflows/${WORKFLOW}/editor`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.react-flow__node', { timeout: 20_000 });
await page.locator('.react-flow__node').first().click();
await page.waitForTimeout(800);

/*
 * The picker is a listbox rather than a `<select>`, so it is opened and then
 * read: its options carry the definitions plus Custom, which is the one that
 * puts the form in the panel.
 */
const picker = page.locator('button', { hasText: /Choose an action/ }).first();
record((await picker.count()) > 0, 'the node offers an action picker');
await picker.click();
await page.waitForTimeout(400);

const custom = page.getByRole('option', { name: /^Custom/ }).first();
const asButton = page.locator('[role="option"], li button, button').filter({ hasText: /^Custom$/ }).first();
const choice = (await custom.count()) > 0 ? custom : asButton;
record((await choice.count()) > 0, 'and Custom is one of the things it offers');
await choice.click();
await page.waitForTimeout(400);

// Function, which is the subtype the report was about: it is the one whose
// settings are filled in *after* the form first becomes valid.
const subtype = page.locator('select').filter({ has: page.locator('option', { hasText: 'Function' }) }).first();
record((await subtype.count()) > 0, 'the Custom form offers a settings picker');
await subtype.selectOption({ label: 'Function' });

// Long enough for the panel's own debounce, and then some.
await page.waitForTimeout(1600);

/*
 * Nothing yet, and that is right: a Function action with no function chosen is
 * not a thing to save. The panel writes when what it holds is valid, which is
 * the line between "saves itself" and "writes half-made rows".
 */
const first = await owned();
record(first.length === 0, `nothing is written while the form is incomplete (${first.length} owned)`);

/*
 * The second write, which is the whole point. The function is chosen after the
 * definition already exists, which is exactly when the panel used to stop
 * listening.
 */
/*
 * The function, chosen through the same picker the node's own action uses:
 * a button that opens a listbox with a search in it, not a `<select>`.
 */
const functionPicker = page.locator('#action-function');
record((await functionPicker.count()) > 0, 'the Function settings offer a function picker');
await functionPicker.click();
await page.waitForTimeout(300);
await page.locator('[role="listbox"] input').fill(fn.name);
await page.waitForTimeout(300);
await page.locator(`[role="option"]`).filter({ hasText: fn.name }).first().click();
await page.waitForTimeout(1600);

const second = await owned();
record(second.length === 1, `still one definition, updated rather than duplicated (${second.length})`);
record(
  second[0]?.functionId === fn.id,
  `the function chosen after the first save was written too (${second[0]?.functionId} vs ${fn.id})`,
);

/*
 * And then change it again, which is the failure that was reported.
 *
 * The first write is the easy one. What broke was every write after it: the
 * form switched `submitting` on before saving and only off again when a save
 * failed, so one success left the panel unable to write for the rest of its
 * life - and the form was rebuilt from scratch the moment the first save gave
 * it an id, taking whatever was on screen with it.
 */
const other = workspaceFunctions.content.find((one) => one.id !== fn.id);
record(other !== undefined, 'the workspace has a second function to switch to');
await functionPicker.click();
await page.waitForTimeout(300);
await page.locator('[role="listbox"] input').fill(other.name);
await page.waitForTimeout(300);
await page.locator('[role="option"]').filter({ hasText: other.name }).first().click();
await page.waitForTimeout(1600);

const third = await owned();
record(third.length === 1, `still one definition after the second edit (${third.length})`);
record(
  third[0]?.functionId === other.id,
  `the second edit was written too (${third[0]?.functionId} vs ${other.id} for ${other?.name})`,
);

/*
 * The graph is saved the ordinary way before reloading. The definition writes
 * itself, but the node pointing at it is part of the graph, and a graph is
 * saved when somebody saves it - so this is the gesture a person makes, not a
 * shortcut around one.
 */
await page.getByRole('button', { name: /^Save/ }).first().click();
await page.waitForTimeout(1500);

// And it is there on the way back, which is what somebody actually notices.
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.react-flow__node', { timeout: 20_000 });
await page.locator('.react-flow__node').first().click();
await page.waitForTimeout(1200);

const shown = await page.evaluate(() => {
  const picker = document.querySelector('#action-function');
  const type = [...document.querySelectorAll('select')].find(
    (one) => (one.getAttribute('aria-label') ?? one.id) === 'Execute Type' || one.id === 'action-subtype',
  );
  return {
    function: picker?.textContent?.replace(/\s+/g, ' ').trim() ?? 'no picker',
    subtype: type?.selectedOptions[0]?.textContent?.trim() ?? '',
  };
});
record(
  shown.function.includes(other.name),
  `and the reloaded panel shows the last thing chosen (${JSON.stringify(shown)})`,
);

await done();
