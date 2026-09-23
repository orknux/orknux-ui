/**
 * Naming the directory groups that grant a role, on the Roles screen. Issue #375.
 *
 * A role is matched to a group by name already - `Backend` is granted to whoever
 * holds ROLE_BACKEND, which is what the directory sends - and that carries most
 * installations until the first group called `dev.TL` or `BoarCMS Group`. For
 * those, the only way to grant the role was `orknux.security.role-mapping` in
 * the configuration file: something the person administering the installation
 * can neither see nor change without a redeployment.
 *
 * What is measured is the round trip rather than the box: typed, saved, and read
 * back off the server. A textarea that holds what was typed and sends nothing is
 * the failure this is for, and it looks perfect on screen.
 *
 * Makes a role and removes it.
 */
import { BASE, open, drawn, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1400, height: 1000 } });

const PREFIX = 'zzRoleNames';
const NAMES = ['ROLE_ZZDEV.TL', 'CN=zzBoarCMS Group,OU=Grupy,DC=example,DC=invalid'];

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

/* -------------------------------------------------------------------- drive */

await page.goto(`${BASE}/admin/roles`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the roles page'), 'the roles screen is on screen');

await page.getByRole('button', { name: /New Role|Add Role|Create/i }).first().click();

const box = page.locator('#role-matches');
const there = await box
  .waitFor({ timeout: 20_000 })
  .then(() => true)
  .catch(() => false);
record(there, 'a role has a box for the directory groups that grant it');
if (!there) await clean();

await page.locator('#role-name').fill(`${PREFIX} developers`);
await box.fill(NAMES.join('\n'));

await page.getByRole('button', { name: /^(Create Role|Save Changes)/ }).first().click();
await page.waitForTimeout(2000);

/* ------------------------------------------------ what reached the server - */

const { roles } = await graphql(`query { roles { id name matches } }`, {});
const stored = roles.find((one) => one.name === `${PREFIX} developers`) ?? null;
console.log(`stored: ${JSON.stringify(stored)}`);

record(stored !== null, 'the role was made');
if (stored === null) await clean();

record(
  NAMES.every((one) => stored.matches.includes(one)),
  `both names reached the server, the DN among them (${JSON.stringify(stored.matches)})`,
);

/* Read back into the form, which is the half a save alone does not prove. */
await page.reload({ waitUntil: 'domcontentloaded' });
await drawn(page, 'the roles page');
await page.getByText(`${PREFIX} developers`).first().click();
await page.waitForTimeout(1200);

const shown = await page.locator('#role-matches').inputValue().catch(() => '');
console.log(`shown: ${JSON.stringify(shown)}`);
record(
  NAMES.every((one) => shown.includes(one)),
  'and come back into the box, one per line, when the role is opened again',
);

/*
 * Blank lines are not rules. Somebody typing a list leaves them behind, and a
 * stored empty string is a rule that grants nothing and reads like one that does.
 */
await page.locator('#role-matches').fill(`${NAMES[0]}\n\n   \n`);
await page.getByRole('button', { name: /^Save Changes/ }).first().click();
await page.waitForTimeout(2000);

const after = await graphql(`query { roles { name matches } }`, {});
const tidied = after.roles.find((one) => one.name === `${PREFIX} developers`)?.matches ?? [];
console.log(`tidied: ${JSON.stringify(tidied)}`);
record(tidied.length === 1 && tidied[0] === NAMES[0], 'blank lines are dropped rather than stored as rules');

await clean();
