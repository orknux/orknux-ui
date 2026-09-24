/**
 * A variable refused for its name says so under the row that asked.
 *
 * The server has always refused a second variable of the same name in one
 * catalog. The page drew the refusal too - as one red line at the top of the
 * panel, above the catalog's name, five hundred pixels from the add row at the
 * foot of the table and off the screen on a list of any length. Michal added a
 * duplicate and saw nothing happen. So the refusal now sits directly under the
 * row it is about, with what was typed still in the row to be corrected.
 *
 * Makes two attempts at one variable and removes the one that took.
 */
import { BASE, WORKSPACE, open, drawn, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const NAME = `zzDuplicate${Date.now()}`;
const { variableCatalogs } = await graphql(`query($w: ID!) { variableCatalogs(workspaceId: $w) { id name } }`, {
  w: WORKSPACE,
});
const catalog = variableCatalogs[0];

const sweep = async () => {
  const { workspaceVariables } = await graphql(
    `query($w: ID!, $c: ID) { workspaceVariables(workspaceId: $w, catalogId: $c, page: 0, size: 200) { content { id name } } }`,
    { w: WORKSPACE, c: catalog.id },
  );
  for (const held of workspaceVariables.content.filter((one) => one.name === NAME)) {
    await graphql(`mutation($id: ID!) { deleteVariable(id: $id) }`, { id: held.id }).catch(() => undefined);
  }
};
const clean = async () => {
  await sweep();
  await finish(browser);
};

await page.goto(`${BASE}/workspace/${WORKSPACE}/variables`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the variables page'), 'the variables page is on screen');
await page.getByRole('button', { name: catalog.name }).first().click();
await page.waitForTimeout(600);

/* The Values table is the first of the two; every locator below is scoped to it. */
const values = page.locator('section').filter({ has: page.getByRole('button', { name: '+ Add Value' }) }).first();

const addOnce = async () => {
  await values.getByRole('button', { name: '+ Add Value' }).click();
  await values.getByLabel('New value name').fill(NAME);
  await values.getByLabel('New value', { exact: true }).fill('once');
  await values.getByRole('button', { name: 'Add this one' }).click();
  await page.waitForTimeout(1500);
};

await addOnce();
record(await values.getByLabel('New value name').count().then((many) => many === 0), 'the first attempt takes, and the add row closes');

await addOnce();
const note = values.locator('[data-row-error="new"]');
const said = await note
  .waitFor({ timeout: 10_000 })
  .then(() => true)
  .catch(() => false);
record(said, 'the second is refused, and the refusal is drawn in the table');
if (!said) await clean();

record(
  await note.innerText().then((text) => text.includes('already holds') && text.includes(NAME)),
  `it names the clash (${JSON.stringify(await note.innerText())})`,
);
record(await note.getAttribute('role').then((role) => role === 'alert'), 'and is announced');

/* Directly under the add row: within one row's height of it, and below it. */
const row = await values.getByLabel('New value name').boundingBox();
const where = await note.boundingBox();
console.log(`add row at y=${row?.y}, refusal at y=${where?.y}`);
record(
  row !== null && where !== null && where.y > row.y && where.y - row.y < 80,
  'drawn directly under the row that was refused, not at the top of the page',
);
record(
  await values.getByLabel('New value name').inputValue().then((held) => held === NAME),
  'with what was typed still in the row, to be corrected rather than retyped',
);

/* Discarding the row takes the refusal with it. */
await values.getByRole('button', { name: 'Discard this row' }).click();
await page.waitForTimeout(400);
record(await note.count().then((many) => many === 0), 'discarding the row takes its refusal with it');

await clean();
