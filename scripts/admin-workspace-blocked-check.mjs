/**
 * Switching a workspace to an admin workspace while an ordinary role opens it
 * is said in the Admin workspace card - before Save, and after it.
 *
 * The server refuses it (only installation administrators may open an admin
 * workspace), and the refusal used to appear at the foot of the page, under
 * the roles, far from the switch it was about - and only once Save had been
 * pressed. Now the card names the roles in the way as soon as the switch is
 * ticked, and a refusal the server still gives is drawn in the card, not at
 * the page's button. The role rows' remove button is a 32px target too.
 *
 * Makes a workspace and an ordinary role on it, and deletes both after.
 */
import { BASE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 1100 } });
const stamp = Date.now();
const role = (await graphql(`mutation($input: RoleInput!) { createRole(input: $input) { id name } }`, {
  input: { name: `zz blocked role ${stamp}` },
})).createRole;
const workspace = (await graphql(`mutation($input: CreateWorkspaceInput!) { createWorkspace(input: $input) { id name } }`, {
  input: { name: `zz blocked ${stamp}` },
})).createWorkspace;

async function clean() {
  await graphql(`mutation($id: ID!) { deleteWorkspace(id: $id) }`, { id: workspace.id }).catch(() => undefined);
  await graphql(`mutation($id: ID!) { deleteRole(id: $id) }`, { id: role.id }).catch(() => undefined);
}

try {
  await graphql(`mutation($id: ID!, $input: UpdateWorkspaceInput!) { updateWorkspace(id: $id, input: $input) { id } }`, {
    id: workspace.id,
    input: { name: workspace.name, roleIds: [role.id] },
  });

  await page.goto(`${BASE}/admin/workspaces/${workspace.id}/settings`, { waitUntil: 'domcontentloaded' });
  const card = page.locator('[data-admin-workspace-settings]');
  await page.locator('[data-admin-workspace-switch]').waitFor({ timeout: 20_000 });

  /* The role row's remove button: a target, not a speck. */
  const remove = await page.locator('[class*="_roleRemove_"]').first().boundingBox();
  record(remove !== null && remove.width >= 30 && remove.height >= 30, `the role's remove button is a 32px target (${Math.round(remove?.width ?? 0)}x${Math.round(remove?.height ?? 0)})`);

  record((await card.locator('[data-admin-workspace-blocked]').count()) === 0, 'nothing is said while the switch is off');
  await page.locator('[data-admin-workspace-switch]').check();
  await page.waitForTimeout(300);
  const before = card.locator('[data-admin-workspace-blocked]');
  record((await before.count()) === 1, 'ticking it says, in the card and before Save, what is in the way');
  record((await before.innerText()).includes(role.name), 'naming the role');

  await page.getByRole('button', { name: /^Save/ }).first().click();
  await page.waitForTimeout(1500);
  record((await card.locator('[data-admin-workspace-failure]').count()) === 1, 'the refusal on Save is drawn in the card');
  const foot = await page.locator('form [role="alert"]').evaluateAll((all) =>
    all.filter((one) => !one.closest('[data-admin-workspace-settings]')).map((one) => one.textContent ?? ''),
  );
  record(!foot.some((one) => one.includes('cannot be an admin workspace')), 'and not again at the foot of the page');
  const held = (await graphql(`query($id: ID!) { adminWorkspace(workspaceId: $id) { enabled } }`, { id: workspace.id })).adminWorkspace;
  record(held?.enabled !== true, 'and the workspace was not switched');
} finally {
  await clean();
}
await finish(browser);
