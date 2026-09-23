/**
 * A variable of a type a plugin defines, and a variable that is a list.
 * Issue #377.
 *
 * A Slack user id is a string only some values of are real, and a variable
 * holding one used to be a text box. Now a plugin may define a type, complete
 * values of it as they are typed, and refuse one at the save with its own
 * reason - and the variables screen draws the picker and shows the refusal.
 *
 * The plugin here is a palette rather than Slack, because what is measured is
 * the screen and the round trip: that the type is offered in the picker, that
 * typing brings the plugin's suggestions, that taking one stores what the
 * plugin said to store, that a refused value is refused on screen and not
 * saved, and that a list is edited one element at a time and stored as an
 * array. A type that needs no network says all of that without one.
 *
 * Makes a plugin, a catalog and two variables, and removes them.
 */
import { BASE, WORKSPACE, open, drawn, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 1000 } });

const KEY = 'zzpalette';
const CATALOG = 'zzTypes';

const SOURCE = `
export default class Palette extends OrknuxPlugin {
  id() { return '${KEY}'; }
  apiVersion() { return 1; }
  types() {
    return [
      new OrknuxType({
        name: 'Colour',
        description: 'One of the named colours.',
        base: 'string',
        parameters: [{ name: 'shade', description: 'Light or dark.', type: 'string', required: false }],
        suggest: (typed, args) =>
          ['red', 'green', 'blue']
            .filter((one) => one.startsWith(typed))
            .map((one) => ({ value: one, label: (args.shade ? args.shade + ' ' : '') + one, detail: 'a colour' })),
        validate: (value) =>
          ['red', 'green', 'blue'].includes(value) ? { ok: true } : { ok: false, reason: value + ' is not a colour' },
      }),
    ];
  }
}
`;

/* ------------------------------------------------------------------ sweep */

const sweep = async () => {
  const { variableCatalogs } = await graphql(
    `query($w: ID!) { variableCatalogs(workspaceId: $w) { id name } }`,
    { w: WORKSPACE },
  );
  for (const old of variableCatalogs.filter((one) => one.name === CATALOG)) {
    const { workspaceVariables } = await graphql(
      `query($w: ID!, $c: ID) { workspaceVariables(workspaceId: $w, catalogId: $c, page: 0, size: 50) { content { id } } }`,
      { w: WORKSPACE, c: old.id },
    );
    for (const held of workspaceVariables.content) {
      await graphql(`mutation($id: ID!) { deleteVariable(id: $id) }`, { id: held.id }).catch(() => undefined);
    }
    await graphql(`mutation($id: ID!) { deleteVariableCatalog(id: $id) }`, { id: old.id }).catch(() => undefined);
    console.log(`swept catalog ${old.name}`);
  }
  const { plugins } = await graphql(`query { plugins { id key } }`, {});
  for (const old of plugins.filter((one) => one.key === KEY)) {
    await graphql(`mutation($id: ID!) { unloadPlugin(id: $id) }`, { id: old.id }).catch(() => undefined);
    console.log(`swept plugin ${old.key}`);
  }
};

await sweep();

const clean = async () => {
  await sweep();
  await finish(browser);
};

/* ---------------------------------------------------------------- fixture */

const loaded = await page.request.post(`${BASE}/api/plugins`, {
  multipart: { file: { name: `${KEY}.js`, mimeType: 'text/javascript', buffer: Buffer.from(SOURCE, 'utf8') } },
});
record(loaded.ok(), `the palette plugin loads (${loaded.status()})`);
if (!loaded.ok()) await clean();

const { createVariableCatalog } = await graphql(
  `mutation($w: ID!, $name: String!) { createVariableCatalog(workspaceId: $w, name: $name) { id name } }`,
  { w: WORKSPACE, name: CATALOG },
);
console.log(`made catalog ${createVariableCatalog.name}`);

const variables = async () => {
  const { workspaceVariables } = await graphql(
    `query($w: ID!, $c: ID) {
       workspaceVariables(workspaceId: $w, catalogId: $c, page: 0, size: 50) {
         content { id name type elementType customType typeArguments value }
       }
     }`,
    { w: WORKSPACE, c: createVariableCatalog.id },
  );
  return workspaceVariables.content;
};

/* ------------------------------------------------------------------ drive */

await page.goto(`${BASE}/workspace/${WORKSPACE}/variables`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the variables page'), 'the variables page is on screen');

await page.getByRole('button', { name: CATALOG }).first().click();
await page.getByRole('button', { name: '+ Add Value' }).first().click();

/* -------------------------------------------- the type is on the picker - */

const typePicker = page.getByLabel('New type');
const offered = await typePicker.locator('option').evaluateAll((all) => all.map((one) => one.value));
console.log(`offered: ${JSON.stringify(offered)}`);
record(offered.includes(`${KEY}:Colour`), "the plugin's type is on the picker, under the plugin's key");
record(offered.includes('LIST:NUMBER'), 'and so is a list of numbers');
record(offered.includes(`LIST:${KEY}:Colour`), "and a list of the plugin's type");

await page.getByLabel('New value name').fill('favourite');
await typePicker.selectOption(`${KEY}:Colour`);

/* What the type is told, drawn under the value. */
const told = page.locator(`[data-type-arguments="${KEY}:Colour"]`);
record(await told.count().then((many) => many === 1), 'what the type asks to be told is drawn under the value');
await told.getByLabel('shade for the new one').fill('dark');

/* ------------------------------------------- the plugin completes it ---- */

const value = page.getByLabel('New value', { exact: true });
await value.fill('gr');
const suggestion = page.getByRole('option', { name: /dark green/ });
const suggested = await suggestion
  .first()
  .waitFor({ timeout: 10_000 })
  .then(() => true)
  .catch(() => false);
record(suggested, "typing brings the plugin's suggestions, told what the variable was told");
if (!suggested) await clean();

await suggestion.first().click();
record(await value.inputValue().then((held) => held === 'green'), 'taking one puts the value the plugin said to store');

await page.getByRole('button', { name: 'Add this one' }).click();
await page.waitForTimeout(1500);

let held = await variables();
const favourite = held.find((one) => one.name === 'favourite') ?? null;
console.log(`stored: ${JSON.stringify(favourite)}`);
record(favourite !== null && favourite.customType === `${KEY}:Colour`, "the variable is stored with the plugin's type");
record(favourite !== null && favourite.value === 'green', 'and the value the plugin offered');
record(favourite !== null && favourite.typeArguments === '{"shade":"dark"}', 'and what the type was told');

/* ------------------------------------------- the plugin refuses one ----- */

await page.getByLabel('Value of favourite').fill('mauve');
await page.getByRole('button', { name: 'Save favourite' }).click();
const refused = await page
  .getByText(/mauve is not a colour/)
  .first()
  .waitFor({ timeout: 10_000 })
  .then(() => true)
  .catch(() => false);
record(refused, "a value the plugin refuses is refused on screen, with the plugin's own reason");
held = await variables();
record(held.find((one) => one.name === 'favourite')?.value === 'green', 'and was not saved');

/* --------------------------------------------------------- a list ------ */

await page.getByRole('button', { name: '+ Add Value' }).first().click();
await page.getByLabel('New value name').fill('thresholds');
await page.getByLabel('New type').selectOption('LIST:NUMBER');

const list = page.locator('[data-list-of="number"]');
record(await list.count().then((many) => many === 1), 'a list is edited as a list');
await list.locator('[data-list-add]').click();
await page.getByLabel('New value 1', { exact: true }).fill('1');
await list.locator('[data-list-add]').click();
await page.getByLabel('New value 2', { exact: true }).fill('2.5');
await page.getByRole('button', { name: 'Add this one' }).click();
await page.waitForTimeout(1500);

held = await variables();
const thresholds = held.find((one) => one.name === 'thresholds') ?? null;
console.log(`stored: ${JSON.stringify(thresholds)}`);
record(
  thresholds !== null && thresholds.type === 'LIST' && thresholds.elementType === 'NUMBER',
  'a list of numbers is stored as one',
);
record(thresholds !== null && thresholds.value === '["1","2.5"]', 'holding its elements as an array');

await clean();
