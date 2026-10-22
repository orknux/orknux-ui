/**
 * A choice in a plugin parameter's picker waits for Save, like anything typed.
 *
 * The page stored a picked option, connection or variable the moment it was
 * chosen while the box beside it waited for Save - so whether a change needed
 * saving depended on which kind of control it was made in. Now a choice is a
 * draft: "1 unsaved" counts it, the server still holds the old value until Save,
 * and Save stores it.
 *
 * Loads a plugin of its own with a parameter that has options, and unloads it.
 */
import { BASE, WORKSPACE, open, drawn, record, finish, chooseOption, chosenOption } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1100 } });

const KEY = 'zzPickerSave';
const SOURCE = `
export default class Regional extends OrknuxPlugin {
  id() { return '${KEY}'; }
  apiVersion() { return 1; }
  parameters() {
    return [
      new OrknuxParameter({ name: 'region', type: 'string', description: 'Which region.', options: ['eu', 'us'] }),
    ];
  }
}
`;

const sweep = async () => {
  const { plugins } = await graphql(`query { plugins { id key } }`, {});
  for (const old of plugins.filter((one) => one.key === KEY)) {
    await graphql(`mutation($id: ID!) { unloadPlugin(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
};
await sweep();
const clean = async () => {
  await sweep();
  await finish(browser);
};

const loaded = await page.request.post(`${BASE}/api/plugins`, {
  multipart: { file: { name: `${KEY}.js`, mimeType: 'text/javascript', buffer: Buffer.from(SOURCE, 'utf8') } },
});
record(loaded.ok(), `a plugin with an options parameter loads (${loaded.status()})`);
if (!loaded.ok()) await clean();

const stored = async () => {
  const { workspacePlugins } = await graphql(
    `query($w: ID!) { workspacePlugins(workspaceId: $w) { plugin { id key } parameters { name literal options } } }`,
    { w: WORKSPACE },
  );
  return workspacePlugins.find((one) => one.plugin.key === KEY) ?? null;
};
const before = await stored();
record(before?.parameters[0]?.options?.length === 2, `the parameter offers its two options (${JSON.stringify(before?.parameters[0]?.options)})`);
if (before === null) await clean();

await page.goto(`${BASE}/workspace/${WORKSPACE}/plugins`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the plugins page'), 'the plugins page is on screen');
// Searched for, so a long list of plugins cannot leave it on another page.
await page.getByPlaceholder('Search plugins...').fill(KEY);
await page.waitForTimeout(600);
await page.locator(`button[aria-controls="plugin-parameters-${before.plugin.id}"]`).first().click();
await page.waitForTimeout(500);

const picker = page.locator(`#plugin-parameter-${before.plugin.id}-region`);
await chooseOption(page, picker, 'us');
await page.waitForTimeout(1000);

const unsavedNote = page.locator('[class*="_pageUnsaved_"]');
const save = page.locator('[class*="_pageSave_"]');
record((await unsavedNote.textContent().catch(() => '')) === '1 unsaved', 'a choice made counts as 1 unsaved');
record((await stored())?.parameters[0]?.literal === null, 'and the server has not been told yet');
record((await chosenOption(page, picker)) === 'us', 'while the picker shows the choice');

await save.click();
await page.waitForTimeout(1500);
record((await stored())?.parameters[0]?.literal === 'us', 'Save stores it');
record((await unsavedNote.count()) === 0, 'and nothing is unsaved any more');

await clean();
