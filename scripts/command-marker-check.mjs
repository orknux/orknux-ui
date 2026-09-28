/**
 * What marks a command in a message: an installation default in Admin, and a
 * per-workspace override. Issues #381, #402.
 *
 * Orknux's own syntax rather than Slack's `/`, which Slack intercepts. The
 * installation carries the default; a workspace's box overrides it, and an
 * empty box follows the installation. What the parse does with a marker is
 * pinned in CommandsTest; this is the two boxes - both save, a letter is
 * refused, the workspace box opens empty on the installation's as a
 * placeholder, and clearing it follows the installation again. Left as found.
 */
import { BASE, WORKSPACE, open, drawn, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const workspaceMarker = async () =>
  (await graphql(`query($id: ID!) { workspace(id: $id) { commandMarker commandMarkerDefault } }`, { id: WORKSPACE }))
    .workspace;
const installationMarker = async () =>
  (await graphql(`query { installationSettings { commandMarker commandMarkerConfigured } }`, {})).installationSettings;

const wasWorkspace = (await workspaceMarker()).commandMarker;
const wasInstallation = (await installationMarker()).commandMarker;
console.log(`workspace was ${JSON.stringify(wasWorkspace)}, installation was ${JSON.stringify(wasInstallation)}`);
const INST = wasInstallation === '::' ? '>>' : '::';
const OWN = wasWorkspace === '!!' ? '##' : '!!';

/* ---------------------------------------------- the installation's box --- */

await page.goto(`${BASE}/admin/settings`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the admin settings page'), 'the admin settings page is on screen');

const adminBox = page.locator('#command-marker');
const hasAdmin = await adminBox.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
record(hasAdmin, 'the installation has a command-marker box in Admin');
if (hasAdmin) {
  record((await adminBox.inputValue()) === wasInstallation, `it opens on what the server holds (${JSON.stringify(await adminBox.inputValue())})`);
  await adminBox.fill(INST);
  // The page's one Save since the marker lost its own; named for what it saves.
  await page.getByRole('button', { name: 'Save the settings on this page' }).click();
  await page.waitForTimeout(2000);
  record((await installationMarker()).commandMarker === INST, `the installation marker saves (${JSON.stringify((await installationMarker()).commandMarker)})`);
}

/* --------------------------------------------------- the workspace box --- */

/* Cleared, so the workspace follows the installation. */
await graphql(`mutation($id: ID!) { setWorkspaceCommandMarker(workspaceId: $id, marker: null) { id } }`, { id: WORKSPACE });

await page.goto(`${BASE}/workspace/${WORKSPACE}/settings`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the workspace settings page'), 'the workspace settings page is on screen');

const box = page.locator('#workspace-command-marker');
const there = await box.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
record(there, 'the workspace has a box for its command marker');
if (!there) await finish(browser);

record((await box.inputValue()) === '', 'a workspace that follows the installation shows an empty box');
record(
  (await box.getAttribute('placeholder')) === INST,
  `and the installation's marker as its placeholder (${JSON.stringify(await box.getAttribute('placeholder'))}, expected ${INST})`,
);

await box.fill(OWN);
await page.getByRole('button', { name: /^Save/ }).first().click();
await page.waitForTimeout(2500);
record((await workspaceMarker()).commandMarker === OWN, `the workspace's own marker overrides (${JSON.stringify((await workspaceMarker()).commandMarker)})`);

/* A letter would turn ordinary words into commands, so the server refuses it. */
await box.fill('x');
await page.getByRole('button', { name: /^Save/ }).first().click();
await page.waitForTimeout(2000);
const refused = await page.locator('[role="alert"]').allInnerTexts();
record(refused.some((said) => said.includes('cannot mark a command')), `a letter is refused in words (${JSON.stringify(refused)})`);
record((await workspaceMarker()).commandMarker === OWN, 'and nothing was stored for it');

/* -------------------------------------------------- left as it was found - */

await graphql(`mutation($m: String!) { setCommandMarker(marker: $m) { commandMarker } }`, { m: wasInstallation });
await graphql(`mutation($id: ID!, $m: String) { setWorkspaceCommandMarker(workspaceId: $id, marker: $m) { id } }`, {
  id: WORKSPACE,
  m: wasWorkspace,
});
await finish(browser);
