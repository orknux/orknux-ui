/**
 * Publishing under a template's name warns first, then replaces it.
 *
 * Publishing again from the thing a template was made from is how somebody
 * brings it up to date. It was refused outright ("already has a template
 * called ..."), so the only way was to publish under a new name or upload a
 * file on the Templates page. Now the dialog says the name is taken and that
 * publishing replaces it, the button reads Replace template, and pressing it
 * keeps one template - the same row - with the new description.
 *
 * Measured: the warning is drawn and the button relabelled, nothing was
 * published by the first press, the second press closes the dialog, and the
 * server holds one template of that name carrying the second description.
 * Publishes from the agents list and deletes what it made.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1400, height: 1000 } });
const name = `zzReplace ${Date.now()}`;
const named = async () => (await graphql(`{ componentTemplates { id name description } }`)).componentTemplates.filter((one) => one.name === name);

async function publish(description) {
  const button = page.locator('button[aria-label^="Save "][aria-label$=" as a template"]').first();
  await button.waitFor({ timeout: 20_000 });
  await button.click();
  const dialog = page.locator('dialog[open]');
  const field = dialog.locator('input').first();
  /*
   * The dialog writes the component's own name into the field as it opens;
   * typed before that lands, the name is overwritten and the publish goes out
   * under the component's name - replacing whatever template already has it.
   */
  await page.waitForTimeout(500);
  await field.fill(name);
  await dialog.locator('[data-template-description]').fill(description);
  if ((await field.inputValue()) !== name) throw new Error(`the name field holds "${await field.inputValue()}", not ${name}`);
  await dialog.getByRole('button', { name: /^(Publish|Replace) template$/ }).click();
  await page.waitForTimeout(1500);
  return dialog;
}

await page.goto(`${BASE}/workspace/${WORKSPACE}/agents`, { waitUntil: 'domcontentloaded' });

await publish('First');
const first = await named();
record(first.length === 1, `the first publish made one template (${first.length})`);

const dialog = await publish('Second');
const warned = (await dialog.locator('[data-template-taken]').count()) === 1;
record(warned, 'publishing under the same name warns, in the dialog');
const label = (await dialog.getByRole('button', { name: /^(Publish|Replace) template$/ }).innerText()).trim();
record(label === 'Replace template', `and the button says what it will do ("${label}")`);
record((await named())[0]?.description === 'First', 'nothing was replaced by the press that warned');

if (warned) {
  await dialog.getByRole('button', { name: /^(Publish|Replace) template$/ }).click();
  await page.waitForTimeout(1500);
}
record((await page.locator('dialog[open]').count()) === 0, 'pressing Replace template closes the dialog');
const after = await named();
record(after.length === 1 && after[0].id === first[0]?.id, `one template still, the same one (${after.length})`);
record(after[0]?.description === 'Second', `carrying the new description (${after[0]?.description})`);

for (const one of after) await graphql(`mutation($id: ID!) { deleteComponentTemplate(id: $id) }`, { id: one.id });
await finish(browser);
