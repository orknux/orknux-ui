/**
 * What marks a command in a message is a box on the workspace's settings.
 * Issue #381.
 *
 * Orknux's own syntax rather than Slack's `/`, which Slack intercepts; so the
 * marker is the workspace's to choose. What the parse does with it is pinned
 * in CommandsTest and the trigger test; this is the box - it opens on what the
 * server holds, a change saves, a letter is refused in words, and the page is
 * left as found.
 */
import { BASE, WORKSPACE, open, drawn, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const held = async () =>
  (await graphql(`query($id: ID!) { workspace(id: $id) { commandMarker } }`, { id: WORKSPACE })).workspace.commandMarker;

const was = await held();
console.log(`marker was ${JSON.stringify(was)}`);
const WANTED = was === '::' ? '>>' : '::';

await page.goto(`${BASE}/workspace/${WORKSPACE}/settings`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the workspace settings page'), 'the workspace settings page is on screen');

const box = page.locator('#workspace-command-marker');
const there = await box
  .waitFor({ timeout: 20_000 })
  .then(() => true)
  .catch(() => false);
record(there, 'the workspace has a box for its command marker');
if (!there) await finish(browser);

record((await box.inputValue()) === was, `it opens on what the server holds (${JSON.stringify(await box.inputValue())})`);

await box.fill(WANTED);
await page.getByRole('button', { name: /^Save/ }).first().click();
await page.waitForTimeout(2500);
record((await held()) === WANTED, `a marker typed is the marker stored (${JSON.stringify(await held())})`);

/* A letter would turn ordinary words into commands, so the server refuses it. */
await box.fill('x');
await page.getByRole('button', { name: /^Save/ }).first().click();
await page.waitForTimeout(2000);
const refused = await page.locator('[role="alert"]').allInnerTexts();
record(
  refused.some((said) => said.includes('cannot mark a command')),
  `a letter is refused in words (${JSON.stringify(refused)})`,
);
record((await held()) === WANTED, 'and nothing was stored for it');

await graphql(`mutation($id: ID!, $m: String!) { setWorkspaceCommandMarker(workspaceId: $id, marker: $m) { id } }`, {
  id: WORKSPACE,
  m: was,
});
await finish(browser);
