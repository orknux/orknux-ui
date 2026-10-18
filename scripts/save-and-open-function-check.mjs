/**
 * "+ New function" opens from a link in its note, saving first.
 *
 * The note under a new function said to open it in Functions to write what it
 * does - but the function did not exist until the form was saved, so there was
 * nothing there to open, and in the desktop app, which has no tabs, a link
 * that loaded in place threw the unsaved form away. The note's link saves the
 * form, which makes the function, and opens that function in a new tab (a new
 * window in the desktop app).
 *
 * Makes an action and a function under names of its own and deletes both.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, context, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });
const STAMP = Date.now();
const ACTION = `zzSaveOpenAction${STAMP}`;
const FUNCTION = `zzSaveOpenFn${STAMP}`;

try {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/actions/new`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#action-name', { timeout: 20_000 });
  await page.waitForTimeout(1000);
  await page.fill('#action-name', ACTION);
  await page.selectOption('#action-subtype', 'FUNCTION');
  await page.locator('#action-function').click();
  await page.waitForTimeout(300);
  await page.locator('[role="option"]').first().click();
  await page.locator('#action-new-function').fill(FUNCTION);

  const button = page.getByTestId('open-new-function');
  record((await button.count()) === 1 && (await button.evaluate((el) => el.tagName)) === 'A', 'the note under a new function has a link to open it');

  const opened = context.waitForEvent('page', { timeout: 15_000 }).catch(() => null);
  await button.click();
  const tab = await opened;
  if (tab !== null) await tab.waitForLoadState('domcontentloaded').catch(() => undefined);

  const { workspaceFunctions } = await graphql(
    `query($w: ID!) { workspaceFunctions(workspaceId: $w, size: 200) { content { id name } } }`,
    { w: WORKSPACE },
  );
  const made = workspaceFunctions.content.filter((one) => one.name === FUNCTION);
  record(made.length === 1, `saving made the function, once (${made.length})`);
  record(
    tab !== null && made.length === 1 && tab.url().endsWith(`/workspace/${WORKSPACE}/functions/${made[0].id}`),
    `and opened it in a new tab (${tab?.url()})`,
  );
  // The action was saved too: the form is a page of its own here, which goes back to the list once saved.
  const { workspaceActions: saved } = await graphql(
    `query($w: ID!) { workspaceActions(workspaceId: $w, size: 200) { content { name } } }`,
    { w: WORKSPACE },
  );
  record(saved.content.some((one) => one.name === ACTION), 'and the action that calls it was saved with it');
} finally {
  const { workspaceActions } = await graphql(
    `query($w: ID!) { workspaceActions(workspaceId: $w, size: 200) { content { id name } } }`,
    { w: WORKSPACE },
  ).catch(() => ({ workspaceActions: { content: [] } }));
  for (const one of workspaceActions.content.filter((a) => a.name === ACTION)) {
    await graphql(`mutation($id: ID!) { deleteAction(id: $id) }`, { id: one.id }).catch(() => undefined);
  }
  const { workspaceFunctions } = await graphql(
    `query($w: ID!) { workspaceFunctions(workspaceId: $w, size: 200) { content { id name } } }`,
    { w: WORKSPACE },
  ).catch(() => ({ workspaceFunctions: { content: [] } }));
  for (const one of workspaceFunctions.content.filter((f) => f.name === FUNCTION)) {
    await graphql(`mutation($id: ID!) { deleteFunction(id: $id) }`, { id: one.id }).catch(() => undefined);
  }
}

await finish(browser);
