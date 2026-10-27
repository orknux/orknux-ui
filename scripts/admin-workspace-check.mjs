/**
 * Making a workspace an admin workspace, from Admin > Workspaces.
 *
 * The card on the workspace's admin settings page: off, it is one switch and
 * nothing else; on, it draws the reach, the seven things it may read - all
 * ticked - and the eight admin tools, of which the five about how the
 * installation runs start ticked and the three about people do not. A choice
 * of reach, a scope taken off and a tool put on go out with the page's one
 * Save, come back from the server as sent, and are drawn again after a reload.
 * The workspace list then says which one is an admin workspace, beside its
 * name and on its row - measured, not assumed.
 *
 * Makes two scratch workspaces and removes them.
 */
import { BASE, open, drawn, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1400, height: 1100 } });

const PREFIX = 'zzAdminWs';

/** Anything an earlier run left, so a failed run does not make the next one fail differently. */
const sweep = async () => {
  const { workspaces } = await graphql(`query { workspaces(page: 0, size: 500) { content { id name } } }`);
  for (const old of workspaces.content.filter((one) => one.name.startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { deleteWorkspace(id: $id) }`, { id: old.id }).catch(() => undefined);
    console.log(`swept workspace ${old.name}`);
  }
};

await sweep();

const clean = async () => {
  await sweep();
  await finish(browser);
};

/* ------------------------------------------------------------------ fixture */

const stamp = Date.now();
const made = async (name) =>
  (await graphql(`mutation($input: CreateWorkspaceInput!) { createWorkspace(input: $input) { id name } }`, { input: { name } }))
    .createWorkspace;
const ops = await made(`${PREFIX} ops ${stamp}`);
const target = await made(`${PREFIX} target ${stamp}`);
console.log(`made workspaces ${ops.name} and ${target.name}`);

/* -------------------------------------------------------------------- drive */

const settingsPath = `${BASE}/admin/workspaces/${ops.id}/settings`;
await page.goto(settingsPath, { waitUntil: 'domcontentloaded' });
const card = page.locator('[data-admin-workspace-settings]');
const toggle = page.locator('[data-admin-workspace-switch]');
const cardThere = await card
  .first()
  .waitFor({ timeout: 15_000 })
  .then(() => true)
  .catch(() => false);
if (!record(cardThere, 'the workspace settings page draws an Admin workspace card')) {
  await clean();
}
await toggle.waitFor({ timeout: 15_000 });

record(!(await toggle.isChecked()), 'a new workspace is not an admin workspace');
record((await page.locator('[data-admin-workspace-scope]').count()) === 0, 'off, the card is the one switch and nothing else');

await toggle.check();

const scopes = page.locator('[data-admin-workspace-scope]');
const tools = page.locator('[data-admin-workspace-tool]');
await scopes.first().waitFor({ timeout: 5_000 });
const scopeCount = await scopes.count();
let scopesTicked = 0;
for (let at = 0; at < scopeCount; at += 1) if (await scopes.nth(at).isChecked()) scopesTicked += 1;
record(scopeCount === 7 && scopesTicked === 7, `on, it may read all seven kinds, every one ticked (${scopesTicked} of ${scopeCount})`);

const tickedTools = [];
for (let at = 0; at < (await tools.count()); at += 1) {
  if (await tools.nth(at).isChecked()) tickedTools.push(await tools.nth(at).getAttribute('data-admin-workspace-tool'));
}
record(
  (await tools.count()) === 8 && tickedTools.sort().join(',') === 'DOCTOR,MONITORING,PLUGINS,REPORTS,TEMPLATES',
  `the admin tools start with the five about the installation ticked (${tickedTools.join(', ')})`,
);
record(await page.locator('[data-admin-workspace-reach="all"]').isChecked(), 'it reaches every workspace until told otherwise');

/*
 * Nothing on the card is wider than the card. Read off the page, because a row of
 * checkboxes that runs off its card is the kind of fault a type checker cannot see.
 */
const box = await card.boundingBox();
const widest = await page.$$eval('[data-admin-workspace-settings] label', (labels) =>
  Math.max(...labels.map((label) => label.getBoundingClientRect().right)),
);
record(box !== null && widest <= box.x + box.width + 0.5, `every choice sits inside the card (right edge ${Math.round(widest)} of ${box === null ? '?' : Math.round(box.x + box.width)})`);

await page.locator('[data-admin-workspace-reach="chosen"]').check();
/* Chosen workspaces are a list: none yet, then one picked in the select and added. */
record(
  (await page.locator('[data-admin-workspace-settings] [data-hint="Reach"]').count()) === 1 &&
    (await page.locator('[data-admin-workspace-settings] [data-hint="May read"]').count()) === 1,
  'Reach and May read each have a help hint',
);
record((await page.locator('[data-admin-workspace-reach-empty]').count()) === 1, 'an empty list says no workspace is chosen');
const add = page.locator('[data-admin-workspace-reach-add]');
record(await add.isDisabled(), 'Add waits for a workspace to be picked');
await page.locator('[data-admin-workspace-reach-list] [data-select]').click();
await page.getByRole('option', { name: target.name, exact: true }).click();
await add.click();
record((await page.locator(`[data-admin-workspace-reaches="${target.name}"]`).count()) === 1, 'Add puts the picked workspace in the list');
const removeBox = await page.locator(`[data-admin-workspace-reaches="${target.name}"] button`).boundingBox();
record(removeBox !== null && removeBox.width >= 30 && removeBox.height >= 30, 'each row has a 32px remove button');
await page.locator('[data-admin-workspace-scope="CHATS"]').uncheck();
await page.locator('[data-admin-workspace-tool="USERS"]').check();

await page.getByRole('button', { name: 'Save Changes' }).click();
const saved = await page
  .getByText('Saved.', { exact: true })
  .waitFor({ timeout: 10_000 })
  .then(() => true)
  .catch(() => false);
record(saved, 'the page says it saved');

const { adminWorkspace } = await graphql(
  `query($id: ID!) { adminWorkspace(workspaceId: $id) { enabled reachAll reach scopes tools } }`,
  { id: ops.id },
);
record(adminWorkspace.enabled === true, 'the server holds it as an admin workspace');
record(
  adminWorkspace.reachAll === false && adminWorkspace.reach.length === 1 && String(adminWorkspace.reach[0]) === String(target.id),
  `its reach is the one workspace chosen (${JSON.stringify(adminWorkspace.reach)})`,
);
record(!adminWorkspace.scopes.includes('CHATS') && adminWorkspace.scopes.length === 6, `chats are off and the other six on (${adminWorkspace.scopes.join(', ')})`);
record(adminWorkspace.tools.includes('USERS'), 'the users tool is on');

/* What was saved is what is drawn after a reload. */
await page.goto(settingsPath, { waitUntil: 'domcontentloaded' });
await page.locator('[data-admin-workspace-scope]').first().waitFor({ timeout: 15_000 });
record(await page.locator('[data-admin-workspace-reach="chosen"]').isChecked(), 'after a reload, the reach is still the chosen list');
record((await page.locator(`[data-admin-workspace-reaches="${target.name}"]`).count()) === 1, 'and the chosen workspace is still in the list');
record(!(await page.locator('[data-admin-workspace-scope="CHATS"]').isChecked()), 'and chats are still off');

/* The workspace list says which it is, beside the name, on its own row. */
await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
if (await drawn(page, 'the workspace list')) {
  const badge = page.locator(`[data-admin-workspace-badge="${ops.name}"]`);
  const there = await badge
    .waitFor({ timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  record(there, 'the workspace list marks the admin workspace');
  if (there) {
    const name = page.getByRole('link', { name: ops.name, exact: true });
    const [badgeBox, nameBox] = [await badge.boundingBox(), await name.boundingBox()];
    record(
      badgeBox !== null && nameBox !== null && badgeBox.width > 0 && Math.abs((badgeBox.y + badgeBox.height / 2) - (nameBox.y + nameBox.height / 2)) < 8,
      'on the same row as its name',
    );
  }
  record((await page.locator(`[data-admin-workspace-badge="${target.name}"]`).count()) === 0, 'and only the admin workspace');
}

await clean();
