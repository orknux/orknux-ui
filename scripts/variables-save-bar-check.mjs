/**
 * The variables page saves from the strip at the foot of the window, as every
 * other page does.
 *
 * Each row used to carry a tick of its own, beside the bin, appearing only on
 * the row being edited, and the add row had another - so saving was a control
 * found by somebody already looking at the right row, and two edits were two
 * presses. Now one Save in the floating strip writes every changed row in both
 * tables and the row being added, and Discard puts them all back.
 *
 * Works in a catalog of its own, with one value and one secret made over the
 * API, and deletes the catalog at the end.
 */
import { BASE, WORKSPACE, open, drawn, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const STAMP = Date.now();
const CATALOG = `zzSaveBar${STAMP}`;
const VALUE = `zz_value_${STAMP}`;
const SECRET = `zz_secret_${STAMP}`;
const ADDED = `zz_added_${STAMP}`;

// A run that died before its end left its catalog; take any such away first.
const { variableCatalogs: before } = await graphql(`query ($w: ID!) { variableCatalogs(workspaceId: $w) { id name } }`, { w: WORKSPACE });
// A catalog is deleted only once it is empty, so its variables go first.
const empty = async (id) => {
  const { workspaceVariables } = await graphql(
    `query ($w: ID!, $c: ID) { workspaceVariables(workspaceId: $w, catalogId: $c, page: 0, size: 200) { content { id } } }`,
    { w: WORKSPACE, c: id },
  );
  for (const held of workspaceVariables.content) {
    await graphql(`mutation ($id: ID!) { deleteVariable(id: $id) }`, { id: held.id }).catch(() => undefined);
  }
  await graphql(`mutation ($id: ID!) { deleteVariableCatalog(id: $id) }`, { id }).catch(() => undefined);
};
for (const left of before.filter((one) => one.name.startsWith('zzSaveBar'))) await empty(left.id);

const catalogId = (
  await graphql(`mutation ($w: ID!, $n: String!) { createVariableCatalog(workspaceId: $w, name: $n) { id } }`, {
    w: WORKSPACE,
    n: CATALOG,
  })
).createVariableCatalog.id;
const make = (name, kind, value) =>
  graphql(`mutation ($input: CreateVariableInput!) { createVariable(input: $input) { id } }`, {
    input: { workspaceId: WORKSPACE, catalogId, name, kind, type: 'STRING', value },
  });
await make(VALUE, 'VALUE', 'one');
await make(SECRET, 'SECRET', 'hush');

const stored = async () => {
  const { workspaceVariables } = await graphql(
    `query ($w: ID!, $c: ID) { workspaceVariables(workspaceId: $w, catalogId: $c, page: 0, size: 50) { content { name description value } } }`,
    { w: WORKSPACE, c: catalogId },
  );
  return Object.fromEntries(workspaceVariables.content.map((one) => [one.name, one]));
};
const clean = async () => {
  await empty(catalogId);
  await finish(browser);
};

await page.goto(`${BASE}/workspace/${WORKSPACE}/variables?catalog=${catalogId}`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the variables page'), 'the variables page is on screen');
await page.getByLabel(`Description of ${VALUE}`).waitFor({ timeout: 15_000 });

const save = page.getByTestId('variables-save');
const discard = page.getByTestId('save-bar-discard');
const unsaved = page.getByTestId('variables-unsaved');

/* ---------------------------------------------------- the strip ------ */

record((await save.count()) === 1, 'Save is in the strip at the foot of the window');
const strip = await page.getByTestId('save-bar').boundingBox({ timeout: 5_000 }).catch(() => null);
record(strip !== null && strip.y + strip.height > 900, `and floats at the window's foot (${JSON.stringify(strip)})`);
// Where every other page puts Save: 40px from the window's right edge, with the content above ending there too.
const gaps = await page.evaluate(() => ({
  save: Math.round(innerWidth - document.querySelector('[data-testid="variables-save"]').getBoundingClientRect().right),
  content: Math.round(innerWidth - document.querySelector('h1').parentElement.getBoundingClientRect().right),
}));
record(gaps.save === 40, `Save sits 40px from the window's edge, as on every other page (${gaps.save})`);
record(gaps.content === 40, `and so does the content above it (${gaps.content})`);
const fill = await page.getByRole('button', { name: '+ Add Value' }).evaluate((one) => getComputedStyle(one).backgroundColor);
const saveFill = await save.evaluate((one) => getComputedStyle(one).backgroundColor);
record(fill === saveFill, `+ Add Value wears the primary fill Save does (${fill})`);
record(
  (await page.getByRole('button', { name: '+ Add Secret' }).evaluate((one) => getComputedStyle(one).backgroundColor)) === saveFill,
  'and so does + Add Secret',
);
record(await save.isDisabled(), 'Save is off while nothing is changed');
record(await discard.isDisabled(), 'and so is Discard');
record((await page.getByRole('button', { name: `Save ${VALUE}` }).count()) === 0, 'no row carries a save tick of its own');

/* ------------------------------------- one Save for both tables ------ */

await page.getByLabel(`Description of ${VALUE}`).fill('the value, described');
record(await save.isEnabled(), 'an edit wakes Save');
record((await unsaved.innerText().catch(() => '')).includes('1'), `and the strip counts it (${await unsaved.innerText().catch(() => 'none')})`);
await page.getByLabel(`Description of ${SECRET}`).fill('the secret, described');
await page.getByRole('button', { name: '+ Add Value' }).click();
await page.getByLabel('New value name').fill(ADDED);
await page.getByLabel('New value', { exact: true }).fill('fresh');
record((await page.getByRole('button', { name: 'Add this one' }).count()) === 0, 'the add row has no tick of its own either');
record((await unsaved.innerText().catch(() => '')).includes('3'), `two edits and a new row are three unsaved (${await unsaved.innerText().catch(() => 'none')})`);

await save.click();
await page.waitForFunction(() => document.querySelector('[data-testid="variables-unsaved"]') === null, null, { timeout: 15_000 }).catch(() => undefined);
let held = await stored();
record(held[VALUE]?.description === 'the value, described', 'one press writes the value');
record(held[SECRET]?.description === 'the secret, described', 'and the secret, in the other table');
record(held[ADDED]?.value === 'fresh', 'and the new row');
record(await save.isDisabled(), 'and Save is off again');
record((await page.getByLabel('New value name').count()) === 0, 'the add row closes once it is written');

/* ------------------------------------------------------ Discard ------ */

await page.getByLabel(`Description of ${VALUE}`).fill('thrown away');
await page.getByRole('button', { name: '+ Add Secret' }).click();
await page.getByLabel('New secret name').fill('zz_never');
await discard.click();
record(
  (await page.getByLabel(`Description of ${VALUE}`).inputValue()) === 'the value, described',
  'Discard puts the edited row back',
);
record((await page.getByLabel('New secret name').count()) === 0, 'and drops the row being added');
// The count is told up from each table after it renders, so it settles a frame after the fields do.
await page.waitForFunction(() => document.querySelector('[data-testid="variables-save"]')?.disabled === true, null, { timeout: 3_000 }).catch(() => undefined);
record(await save.isDisabled(), `leaving nothing to save (${await unsaved.innerText().catch(() => 'no count')})`);
held = await stored();
record(held[VALUE]?.description === 'the value, described' && !('zz_never' in held), 'and nothing was written');

/* --------------------------------------- Enter is the strip's Save --- */

await page.getByLabel(`Description of ${VALUE}`).fill('by the keyboard');
await page.getByLabel(`Description of ${VALUE}`).press('Enter');
await page.waitForTimeout(1500);
held = await stored();
record(held[VALUE]?.description === 'by the keyboard', 'Enter in a row saves, as the strip does');

await clean();
