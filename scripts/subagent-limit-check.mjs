/**
 * How many other agents one agent may ask: a number in Admin -> Settings, and
 * a workspace's own over it. Issue #380.
 *
 * Each ask is a conversation of its own, started on the asking model's
 * say-so, so this is the bound on what one question fans out into. What the
 * count does to an ask is pinned in SubagentLimitTest; this is the two doors -
 * that the installation's box saves, that the workspace's box opens on the
 * installation's number as a placeholder and saves its own, and that clearing
 * it puts the workspace back.
 *
 * Leaves both on the numbers it found.
 */
import { BASE, WORKSPACE, open, drawn, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const installation = async () => {
  const { installationSettings } = await graphql(
    `{ installationSettings { agentMaxSubagents agentMaxSubagentsConfigured } }`,
  );
  return installationSettings;
};
const workspace = async () => {
  const { workspace: held } = await graphql(
    `query ($id: ID!) { workspace(id: $id) { agentMaxSubagents agentMaxSubagentsDefault } }`,
    { id: WORKSPACE },
  );
  return held;
};

const wasInstallation = await installation();
const wasWorkspace = await workspace();
console.log(`installation: ${JSON.stringify(wasInstallation)}, workspace: ${JSON.stringify(wasWorkspace)}`);

/* A number that is not the one there, so the save is a change. */
const COUNT = wasInstallation.agentMaxSubagents === 6 ? 7 : 6;
const OWN = COUNT === 3 ? 4 : 3;

/* ------------------------------------------------- the installation's box */

await page.goto(`${BASE}/admin/settings`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the settings page'), 'the admin settings page is on screen');

const box = page.locator('#agent-max-subagents');
const hasBox = await box
  .waitFor({ timeout: 20_000 })
  .then(() => true)
  .catch(() => false);
record(hasBox, 'the installation has a box for how many other agents an agent may ask');

if (hasBox) {
  record(Number(await box.inputValue()) === wasInstallation.agentMaxSubagents, 'it opens on what the server holds');
  await box.fill(String(COUNT));
  await page.getByRole('button', { name: /^Save/ }).first().click();
  await page.waitForTimeout(2500);

  const stored = await installation();
  record(stored.agentMaxSubagents === COUNT, `the number typed is the number stored (${stored.agentMaxSubagents})`);
  record(
    stored.agentMaxSubagentsConfigured === wasInstallation.agentMaxSubagentsConfigured,
    'and what the configuration file says is left alone',
  );
}

/* ---------------------------------------------------- the workspace's box */

await graphql(`mutation ($id: ID!) { setWorkspaceAgentMaxSubagents(workspaceId: $id, count: null) { id } }`, {
  id: WORKSPACE,
});

await page.goto(`${BASE}/workspace/${WORKSPACE}/settings`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the workspace settings page'), 'the workspace settings page is on screen');

const own = page.locator('#workspace-max-subagents');
const hasOwn = await own
  .waitFor({ timeout: 20_000 })
  .then(() => true)
  .catch(() => false);
record(hasOwn, 'the workspace has a box of its own for it');

if (hasOwn) {
  record((await own.inputValue()) === '', 'a workspace that has decided nothing shows an empty box');
  /*
   * The empty box has to say what empty means: the installation's number, as a
   * placeholder, so the person can see what they are overriding.
   */
  const placeholder = (await own.getAttribute('placeholder')) ?? '';
  record(
    Number(placeholder) === COUNT,
    `and the installation's number as its placeholder (${JSON.stringify(placeholder)}, expected ${COUNT})`,
  );

  await own.fill(String(OWN));
  await page.getByRole('button', { name: /^Save/ }).first().click();
  await page.waitForTimeout(2500);

  const stored = await workspace();
  record(stored.agentMaxSubagents === OWN, `the workspace's own number is stored (${stored.agentMaxSubagents})`);
  record(stored.agentMaxSubagentsDefault === COUNT, 'beside the installation\'s, which it did not touch');

  await own.fill('');
  await page.getByRole('button', { name: /^Save/ }).first().click();
  await page.waitForTimeout(2500);
  record((await workspace()).agentMaxSubagents === null, 'and cleared, the workspace is on the installation\'s number again');
}

/* ------------------------------------ a number outside the bounds is refused */

const refused = await graphql(`mutation { setAgentMaxSubagents(count: 101) { agentMaxSubagents } }`).then(
  () => null,
  (cause) => String(cause?.message ?? cause),
);
console.log(`refusal: ${refused}`);
record(refused !== null && refused.includes('between 0 and 100'), 'more than a hundred is refused in words, not stored');

/* --------------------------------------------- leave it as it was found ---- */

await graphql(`mutation ($count: Int!) { setAgentMaxSubagents(count: $count) { agentMaxSubagents } }`, {
  count: wasInstallation.agentMaxSubagents,
});
await graphql(`mutation ($id: ID!, $count: Int) { setWorkspaceAgentMaxSubagents(workspaceId: $id, count: $count) { id } }`, {
  id: WORKSPACE,
  count: wasWorkspace.agentMaxSubagents,
});

await finish(browser);
