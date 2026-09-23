/**
 * Giving somebody a role this installation decided on. Issue #376.
 *
 * The Users screen has always drawn these checkboxes and has always locked them
 * for anybody the directory vouches for - correctly, at the time: a role given
 * here decided nothing, because every access question was answered from the
 * provider's groups alone. The box would have saved a role, drawn it under the
 * name, and granted nothing.
 *
 * Now it counts, so the lock comes off, and this measures the half a screenshot
 * cannot: that a role ticked against an external user reaches the server and
 * comes back. Whether it then opens a workspace is AssignedRoleTest's business.
 *
 * Makes a role and an external user, and removes both.
 */
import { BASE, open, drawn, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1400, height: 1100 } });

const PREFIX = 'zzAssigned';

/*
 * The roles go; the user stays.
 *
 * There is no mutation that removes a user and there should not be: a person is
 * written down because they signed in, and a name that has been on an issue or
 * in an audit entry is not a row to drop. So this reuses its scratch user rather
 * than making a new one each time, and the installation keeps exactly one.
 */
const sweep = async () => {
  const { roles } = await graphql(`query { roles { id name } }`, {});
  for (const old of roles.filter((one) => one.name.startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { deleteRole(id: $id) }`, { id: old.id }).catch(() => undefined);
    console.log(`swept role ${old.name}`);
  }
};

await sweep();

const clean = async () => {
  await sweep();
  await finish(browser);
};

/* ------------------------------------------------------------------ fixture */

const { createRole } = await graphql(
  `mutation($input: RoleInput!) { createRole(input: $input) { id name } }`,
  { input: { name: `${PREFIX} role` } },
);
console.log(`made role ${createRole.name}`);

/*
 * Somebody to give it to, made once and reused.
 *
 * Not an external user, which is what the lock was about: there is no mutation
 * that makes one - a person is written down when the provider vouches for them -
 * and a check that stood a directory up to make one would be measuring the
 * directory. What is measured here is that the box saves and comes back; that a
 * role given this way actually opens a workspace, for a person whose groups
 * grant nothing, is AssignedRoleTest's business and it makes its own external
 * user to say so.
 */
const held = await graphql(`query { users { id username } }`, {});
const already = held.users.find((one) => one.username === `${PREFIX.toLowerCase()}person`) ?? null;
const createUser =
  already ??
  (
    await graphql(`mutation($input: UserInput!) { createUser(input: $input) { id username } }`, {
      input: { username: `${PREFIX.toLowerCase()}person` },
    })
  ).createUser;
console.log(`${already === null ? 'made' : 'reusing'} user ${createUser.username}`);

/* -------------------------------------------------------------------- drive */

await page.goto(`${BASE}/admin/users/${createUser.id}`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, "the user's page"), "somebody's page is on screen");

const box = page.locator(`text=${PREFIX} role`).locator('xpath=ancestor::label').locator('input[type="checkbox"]');
const there = await box
  .first()
  .waitFor({ timeout: 20_000 })
  .then(() => true)
  .catch(() => false);
record(there, 'the roles are listed against them');
if (!there) await clean();

record(await box.first().isDisabled().then((held) => held === false), 'and can be ticked');

await box.first().check();
await page.getByRole('button', { name: /^Save Changes/ }).first().click();
await page.waitForTimeout(2000);

/* What the server holds, which is the only thing that decides anything. */
const { user } = await graphql(`query($id: ID!) { user(id: $id) { roles { name } } }`, { id: createUser.id });
console.log(`stored: ${JSON.stringify(user.roles)}`);
record(
  user.roles.some((one) => one.name === `${PREFIX} role`),
  'the role reaches the server rather than only the screen',
);

/*
 * And comes back, which a save alone does not prove.
 *
 * Opened afresh rather than reloaded: saving returns to the list, so a reload
 * here would be reloading the list and finding no checkbox at all.
 */
await page.goto(`${BASE}/admin/users/${createUser.id}`, { waitUntil: 'domcontentloaded' });
await drawn(page, "the user's page");
await page.waitForTimeout(1200);
record(
  await page
    .locator(`text=${PREFIX} role`)
    .locator('xpath=ancestor::label')
    .locator('input[type="checkbox"]')
    .first()
    .isChecked()
    .catch(() => false),
  'and is still ticked when the page is opened again',
);

await clean();
