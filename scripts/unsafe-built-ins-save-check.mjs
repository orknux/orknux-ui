/**
 * The workspace's "Allow unsafe built-in tool visibility" switch is stored when
 * the page is saved, and reads back after a reload.
 *
 * Reported as not saving. Measured on what the server holds, not on the box:
 * a box can stay ticked on a page that never sent anything.
 *
 * Puts the switch back as it found it.
 */
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1400, height: 1000 } });

const held = async () =>
  (await graphql(`query ($w: ID!) { workspace(id: $w) { unsafeBuiltInTools } }`, { w: WORKSPACE })).workspace
    .unsafeBuiltInTools;
const was = await held();
const set = (allowed) =>
  graphql(`mutation ($w: ID!, $a: Boolean!) { setWorkspaceUnsafeBuiltInTools(workspaceId: $w, allowed: $a) { id } }`, {
    w: WORKSPACE,
    a: allowed,
  });
await set(false);

await page.goto(`${BASE}/workspace/${WORKSPACE}/settings`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the workspace settings'), 'the workspace settings are on screen');

const box = page.getByRole('checkbox', { name: 'Allow unsafe built-in tool visibility' });
await box.waitFor({ timeout: 20_000 });
record(!(await box.isChecked()), 'the switch opens off, as the server holds it');

await box.check();
const save = page.getByRole('button', { name: /^Save/ }).first();
await save.click();
await page.waitForTimeout(2000);
const after = await held();
record(after === true, `saving stores it on the server (${after})`);

await page.reload({ waitUntil: 'domcontentloaded' });
await box.waitFor({ timeout: 20_000 });
// The box is drawn before the workspace arrives, so it is read once the page has settled.
await drawn(page, 'the workspace settings, reloaded');
await page.waitForTimeout(1000);
record(await box.isChecked(), 'and a reload draws it on');

await set(was).catch(() => undefined);
await finish(browser);
