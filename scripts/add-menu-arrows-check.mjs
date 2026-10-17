/**
 * The editor's Add menu can be walked with the arrow keys: Down from the
 * button steps onto the first entry, Down and Up move between entries and wrap
 * at the ends, and Enter adds the entry under focus.
 *
 * Opened with the mouse, the menu had no keyboard in it at all - the arrows
 * scrolled the page behind it. Makes a workflow under a name of its own and
 * removes it again.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });

const PREFIX = 'zzAddMenuArrows';

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

const focused = () => page.evaluate(() => {
  const active = document.activeElement;
  return active instanceof HTMLElement && active.getAttribute('role') === 'menuitem' ? active.textContent?.trim() ?? '' : null;
});

try {
  const { createWorkflow } = await graphql(
    `mutation($input: CreateWorkflowInput!) { createWorkflow(input: $input) { workflowId } }`,
    { input: { workspaceId: WORKSPACE, name: `${PREFIX} flow`, description: 'Made by add-menu-arrows-check, and removed again.' } },
  );
  await page.goto(`${BASE}/workspace/${WORKSPACE}/workflows/${createWorkflow.workflowId}/editor`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /^Add node/ }).waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);

  await page.getByRole('button', { name: /^Add node/ }).click();
  await page.getByRole('menu').waitFor({ timeout: 5_000 });
  const entries = await page.getByRole('menuitem').allTextContents();
  const first = entries[0]?.trim();
  const last = entries[entries.length - 1]?.trim();

  await page.keyboard.press('ArrowDown');
  record((await focused()) === first, `Down from the button steps onto the first entry (${await focused()})`);
  await page.keyboard.press('ArrowDown');
  record((await focused()) === entries[1]?.trim(), `Down again moves to the second (${await focused()})`);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  record((await focused()) === last, `Up past the first wraps to the last (${await focused()})`);
  await page.keyboard.press('ArrowDown');
  record((await focused()) === first, `Down past the last wraps to the first (${await focused()})`);
  await page.keyboard.press('End');
  record((await focused()) === last, `End goes to the last (${await focused()})`);

  // Enter on an entry adds that node, as a click would.
  await page.keyboard.press('Home');
  const before = await page.locator('.react-flow__node').count();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  const after = await page.locator('.react-flow__node').count();
  record(after === before + 1 && (await page.getByRole('menu').count()) === 0, `Enter adds the entry under focus and closes the menu (${before} then ${after})`);
} finally {
  await sweep();
}

await finish(browser);
