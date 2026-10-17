/**
 * Workspace settings > Members: who is in the workspace, and which of them
 * administer it, chosen from a picker per row.
 *
 * Driven as an installation administrator, who is listed fixed and offered no
 * picker. The suite's workspace is administrators-only, so the check brings
 * its own member: a role made here, put on the workspace and on a user who is
 * not an administrator, all taken back at the end. That member is made a
 * workspace admin from the picker and put back, and the server is asked each
 * time whether it agrees - the picker's own colour is not evidence of a save.
 */
import { BASE, WORKSPACE, USER, open, drawn, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 1000 } });

const members = async () => (await graphql(
  `query($w: ID!) { workspaceMembers(workspaceId: $w) { username role fixed } }`,
  { w: WORKSPACE },
)).workspaceMembers;

/* ---- the fixture: a role that opens the workspace, on somebody who is not an administrator ---- */

const { users, roles } = await graphql('query { users { id username roles { id } } roles { id scopes } }');
const adminRoles = new Set(roles.filter((one) => one.scopes.includes('ADMIN')).map((one) => one.id));
const administers = (one) => one.roles.some((role) => adminRoles.has(role.id));
let guinea = users.find((one) => one.username !== USER && !administers(one));
if (guinea === undefined) {
  // Users cannot be removed, so one made here is kept and found again next time.
  const made = await graphql(
    `mutation { createUser(input: { username: "zz-members-check", displayName: "Members check" }) { id username roles { id } } }`,
  );
  guinea = made.createUser;
}
const { createRole: role } = await graphql(
  `mutation($name: String!) { createRole(input: { name: $name, scopes: [USER] }) { id } }`,
  { name: `zz-members-check-${Date.now()}` },
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
const workspaceRoles = workspace.roles.map((one) => one.id);
const guineaRoles = guinea.roles.map((one) => one.id);

try {
  await setWorkspaceRoles([...workspaceRoles, role.id]);
  await setUserRoles([...guineaRoles, role.id]);

  const before = await members();
  const me = before.find((one) => one.username === USER);
  record(me !== undefined && me.fixed, `the signed-in administrator is listed, fixed (${JSON.stringify(me)})`);
  const other = before.find((one) => one.username === guinea.username);
  record(other !== undefined && !other.fixed, `the member the role lets in is listed, not fixed (${JSON.stringify(other)})`);
  const was = other?.role ?? 'USER';
  const flipped = was === 'ADMIN' ? 'USER' : 'ADMIN';

  await page.goto(`${BASE}/workspace/${WORKSPACE}/settings`, { waitUntil: 'domcontentloaded' });
  await drawn(page, 'Members');
  const section = page.getByTestId('workspace-members');
  await section.waitFor({ timeout: 10_000 }).catch(() => undefined);
  record((await section.count()) === 1, 'the settings page has a Members section');
  await section.getByTestId('workspace-member').first().waitFor({ timeout: 10_000 }).catch(() => undefined);
  const rows = await section.getByTestId('workspace-member').count();
  record(rows === before.length, `a row per member (${rows} of ${before.length})`);
  record(
    (await section.locator(`[data-username="${USER}"] [data-member-role="fixed"]`).count()) === 1,
    'the installation administrator wears a tag, not a picker',
  );

  const pickerOf = () => section.locator(`[data-username="${guinea.username}"] select`);
  const saveButton = page.getByRole('button', { name: 'Save Changes' });
  record((await pickerOf().inputValue()) === was, `${guinea.username}'s picker says what the server has (${was})`);
  // A choice is a draft until the page's Save Changes, like every other field on the page.
  await pickerOf().selectOption(flipped);
  await page.waitForTimeout(300);
  const drafted = (await members()).find((one) => one.username === guinea.username);
  record(drafted?.role === was, `choosing ${flipped} writes nothing yet (server says ${drafted?.role})`);
  record(await saveButton.isEnabled(), "and the page's Save Changes wakes up");
  await saveButton.click();
  await page.getByText('Saved.').waitFor({ timeout: 10_000 });
  const after = (await members()).find((one) => one.username === guinea.username);
  record(after?.role === flipped, `Save Changes writes it (server says ${after?.role})`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await drawn(page, 'Members');
  await pickerOf().waitFor({ timeout: 10_000 });
  record((await pickerOf().inputValue()) === flipped, 'and a reload still shows it');
  await pickerOf().selectOption(was);
  await saveButton.click();
  await page.getByText('Saved.').waitFor({ timeout: 10_000 });
  const restored = (await members()).find((one) => one.username === guinea.username);
  record(restored?.role === was, `and put back to ${was} the same way`);
} finally {
  await setUserRoles(guineaRoles).catch(() => undefined);
  await setWorkspaceRoles(workspaceRoles).catch(() => undefined);
  await graphql(`mutation($id: ID!) { deleteRole(id: $id) }`, { id: role.id }).catch(() => undefined);
}

await finish(browser);
