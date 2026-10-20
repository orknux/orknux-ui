/**
 * Publishing a template closes the dialog, and says nothing more.
 *
 * It used to turn into a second message - "is published, it is on the
 * Templates page" - with a Close of its own: one more thing to dismiss for
 * news the press itself had already given. Publishes one template from the
 * agents list and deletes it.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1400, height: 1000 } });
const name = `zzTemplate ${Date.now()}`;

await page.goto(`${BASE}/workspace/${WORKSPACE}/agents`, { waitUntil: 'domcontentloaded' });
const button = page.locator('button[aria-label^="Save "][aria-label$=" as a template"]').first();
await button.waitFor({ timeout: 20_000 });
await button.click();
const dialog = page.locator('dialog[open]');
await dialog.locator('input').first().fill(name);
await dialog.getByRole('button', { name: 'Publish template' }).click();
await page.waitForTimeout(2000);

record((await page.locator('dialog[open]').count()) === 0, 'the dialog is gone once it is published');
record((await page.getByText('is published').count()) === 0, 'and no message is left behind to close');

const { componentTemplates } = await graphql(`{ componentTemplates { id name } }`);
const made = componentTemplates.filter((one) => one.name === name);
record(made.length === 1, `the template was published (${made.length})`);
for (const one of made) await graphql(`mutation($id: ID!) { deleteComponentTemplate(id: $id) }`, { id: one.id });

await finish(browser);
