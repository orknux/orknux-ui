/**
 * Workspace settings > Members: Remove keeps somebody out of this workspace
 * only, asks first, and leaves the row drawn excluded with Allow on it.
 *
 * Driven as an installation administrator, whose own row offers no Remove -
 * they see every workspace by definition. The check brings its own member, as
 * workspace-members-check does: a role made here, put on the workspace and on
 * a user who is not an administrator, all taken back at the end. What is
 * measured is what is drawn - the dialog open, the row marked and dimmed by
 * its computed opacity, the button the row offers - and the server is asked
 * each time whether it agrees, because a dimmed row is not evidence of a save.
 */
import { BASE, WORKSPACE, USER, open, drawn, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 1000 } });

const memberOf = async (username) => (await graphql(
  `query($w: ID!) { workspaceMembers(workspaceId: $w) { username excluded } }`,
  { w: WORKSPACE },
)).workspaceMembers.find((one) => one.username === username);

/* ---- the fixture: a role that opens the workspace, on somebody who is not an administrator ---- */

/*
 * A user of its own rather than the first ordinary one, because the suite runs
 * two checks at a time and workspace-members-check changes that one's roles.
 */
const { users } = await graphql('query { users { id username roles { id } } }');
let guinea = users.find((one) => one.username === 'zz-member-remove-check');
if (guinea === undefined) {
  // Users cannot be removed, so one made here is kept and found again next time.
  const made = await graphql(
    `mutation { createUser(input: { username: "zz-member-remove-check", displayName: "Remove check" }) { id username roles { id } } }`,
  );
  guinea = made.createUser;
}
const { createRole: role } = await graphql(
  `mutation($name: String!) { createRole(input: { name: $name, scopes: [USER] }) { id } }`,
  { name: `zz-member-remove-check-${Date.now()}` },
);
const { workspace } = await graphql(
  `query($w: ID!) { workspace(id: $w) { name description roles { id } } }`,
  { w: WORKSPACE },
);
const setWorkspaceRoles = (ids) => graphql(
  `mutation($w: ID!, $name: String!, $description: String, $ids: [ID!]) {
     updateWorkspace(id: $w, input: { name: $name, description: $description, roleIds: $ids }) { id }
   }`,
  { w: WORKSPACE, name: workspace.name, description: workspace.description, ids },
);
const setUserRoles = (ids) => graphql(
  `mutation($id: ID!, $ids: [ID!]) { updateUser(id: $id, input: { roleIds: $ids }) { id } }`,
  { id: guinea.id, ids },
);
const allowBack = () => graphql(
  `mutation($w: ID!, $u: String!) { allowWorkspaceMember(workspaceId: $w, username: $u) { excluded } }`,
  { w: WORKSPACE, u: guinea.username },
);
const workspaceRoles = workspace.roles.map((one) => one.id);
const guineaRoles = guinea.roles.map((one) => one.id);

try {
  await setWorkspaceRoles([...workspaceRoles, role.id]);
  await setUserRoles([...guineaRoles, role.id]);

  await page.goto(`${BASE}/workspace/${WORKSPACE}/settings`, { waitUntil: 'domcontentloaded' });
  await drawn(page, 'Members');
  const section = page.getByTestId('workspace-members');
  const row = section.locator(`[data-username="${guinea.username}"]`);
  await row.waitFor({ timeout: 10_000 }).catch(() => undefined);
  record((await row.count()) === 1, `${guinea.username} has a row`);
  record(
    (await section.locator(`[data-username="${USER}"] [data-member-action]`).count()) === 0,
    'the installation administrator is offered no Remove',
  );

  const removeButton = row.locator('[data-member-action="remove"]');
  record((await removeButton.count()) === 1, 'the member is offered Remove');
  await removeButton.click({ timeout: 5_000 }).catch(() => undefined);

  // It asks first: a dialog is open and nothing has been written yet.
  const dialog = page.locator('dialog[open]').filter({ hasText: 'Exclude member' });
  await dialog.waitFor({ timeout: 5_000 }).catch(() => undefined);
  record((await dialog.count()) === 1, 'Remove opens a dialog asking first');
  const sentence = (await dialog.textContent().catch(() => '')) ?? '';
  record(/keep their roles and their other workspaces/.test(sentence), `the dialog says they keep their roles and other workspaces ("${sentence.trim().slice(0, 140)}")`);
  record((await memberOf(guinea.username))?.excluded === false, 'asking writes nothing');

  await dialog.getByRole('button', { name: 'Exclude', exact: true }).click({ timeout: 5_000 }).catch(() => undefined);
  await page.locator('dialog[open]').waitFor({ state: 'detached', timeout: 5_000 }).catch(() => undefined);
  await row.locator('[data-member-action="allow"]').waitFor({ timeout: 5_000 }).catch(() => undefined);

  record((await memberOf(guinea.username))?.excluded === true, 'confirming removes them (the server says excluded)');
  record((await row.getAttribute('data-member-excluded').catch(() => null)) === '', 'the row is marked excluded');
  const label = (await row.locator('[data-member-role="excluded"]').textContent().catch(() => '')) ?? '';
  record(label.trim() === 'Excluded', `the row is labelled Excluded ("${label.trim()}")`);
  const opacity = Number(await row.locator('td').first().evaluate((cell) => getComputedStyle(cell).opacity).catch(() => '1'));
  record(opacity < 1, `the row is drawn dimmed (opacity ${opacity})`);
  record((await row.locator('[data-member-action="allow"]').count()) === 1, 'the row offers Allow in place of Remove');
  record((await row.locator('[data-select]').count()) === 0, 'and no role picker');

  // Still there after a reload: the row is the server's, not the page's memory.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await drawn(page, 'Members');
  await row.waitFor({ timeout: 10_000 }).catch(() => undefined);
  record((await row.getAttribute('data-member-excluded').catch(() => null)) === '', 'a reload still draws it excluded');

  await row.locator('[data-member-action="allow"]').click({ timeout: 5_000 }).catch(() => undefined);
  await row.locator('[data-member-action="remove"]').waitFor({ timeout: 5_000 }).catch(() => undefined);
  record((await memberOf(guinea.username))?.excluded === false, 'Allow lets them back (the server says not excluded)');
  record((await row.getAttribute('data-member-excluded').catch(() => null)) === null, 'the row is no longer marked excluded');
  const after = Number(await row.locator('td').first().evaluate((cell) => getComputedStyle(cell).opacity).catch(() => '0'));
  record(after === 1, `and is drawn at full strength again (opacity ${after})`);
  record((await row.locator('[data-member-action="remove"]').count()) === 1, 'and offers Remove again');
} finally {
  await allowBack().catch(() => undefined);
  await setUserRoles(guineaRoles).catch(() => undefined);
  await setWorkspaceRoles(workspaceRoles).catch(() => undefined);
  await graphql(`mutation($id: ID!) { deleteRole(id: $id) }`, { id: role.id }).catch(() => undefined);
}

await finish(browser);
