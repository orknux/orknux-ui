/**
 * Publishing under a template's name warns before anything is pressed, and one
 * press replaces it.
 *
 * Publishing again from the thing a template was made from is how somebody
 * brings it up to date. It was refused outright ("already has a template
 * called ..."); then it warned only after a first press and wanted a second -
 * which nobody expects of a dialog. Now the dialog reads the names templates
 * already have as it opens: a name that would replace one shows the warning
 * and Replace template at once, a new name shows neither, and one press of
 * Replace template keeps one template - the same row - with the new
 * description.
 *
 * Measured: a fresh name draws no warning and Publish template; the taken name
 * draws the warning and Replace template before any press; nothing is replaced
 * until it is pressed; one press closes the dialog; the server holds one
 * template of that name carrying the second description. Publishes from the
 * agents list and deletes what it made.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1400, height: 1000 } });
const name = `zzReplace ${Date.now()}`;
const named = async () => (await graphql(`{ componentTemplates { id name description } }`)).componentTemplates.filter((one) => one.name === name);

/** Opens the first row's dialog and types the name and description, pressing nothing. */
async function fill(description) {
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
  await page.waitForTimeout(800);
  await field.fill(name);
  await dialog.locator('[data-template-description]').fill(description);
  if ((await field.inputValue()) !== name) throw new Error(`the name field holds "${await field.inputValue()}", not ${name}`);
  await page.waitForTimeout(300);
  return dialog;
}
const press = (dialog) => dialog.getByRole('button', { name: /^(Publish|Replace) template$/ });

await page.goto(`${BASE}/workspace/${WORKSPACE}/agents`, { waitUntil: 'domcontentloaded' });

let dialog = await fill('First');
record((await dialog.locator('[data-template-taken]').count()) === 0, 'a name no template has draws no warning');
record((await press(dialog).innerText()).trim() === 'Publish template', 'and the button reads Publish template');
await press(dialog).click();
await page.waitForTimeout(1500);
const first = await named();
record(first.length === 1, `one press published it (${first.length})`);

dialog = await fill('Second');
const warned = (await dialog.locator('[data-template-taken]').count()) === 1;
record(warned, 'the taken name is warned about before anything is pressed');
/* In amber, as a caution: red is for what went wrong, and nothing has. */
const colour = await dialog.locator('[data-template-taken]').evaluate((one) => getComputedStyle(one).color);
const amber = await page.evaluate(() => {
  const probe = document.createElement('span');
  probe.style.color = 'var(--color-amber)';
  document.body.append(probe);
  const said = getComputedStyle(probe).color;
  probe.remove();
  return said;
});
record(colour === amber, `the warning is amber (${colour})`);
const label = (await press(dialog).innerText()).trim();
record(label === 'Replace template', `and the button says what it will do ("${label}")`);
record((await named())[0]?.description === 'First', 'nothing is replaced by being warned');

await press(dialog).click();
await page.waitForTimeout(1500);
record((await page.locator('dialog[open]').count()) === 0, 'one press of Replace template closes the dialog');
const after = await named();
record(after.length === 1 && after[0].id === first[0]?.id, `one template still, the same one (${after.length})`);
record(after[0]?.description === 'Second', `carrying the new description (${after[0]?.description})`);

for (const one of after) await graphql(`mutation($id: ID!) { deleteComponentTemplate(id: $id) }`, { id: one.id });
await finish(browser);
