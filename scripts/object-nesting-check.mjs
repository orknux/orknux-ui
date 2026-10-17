/**
 * An object defined inside a property, drawn in the editor as rows under the
 * row that is it; an object made from a pasted JSON Schema; and the depth
 * both are held to, which is a number in Admin > Settings.
 *
 * The editor is asked what it draws - the nested blocks and the inputs in
 * them - and the server is asked what it holds after a save, because rows on
 * screen prove nothing about what was stored. Makes two objects under names
 * of its own and removes them.
 */
import { BASE, WORKSPACE, open, drawn, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 1000 } });

const stamp = Date.now();
const made = [];

try {
  /* ---- an object with an object inside it, drawn as rows inside the row ---- */

  const { createObject } = await graphql(
    `mutation($w: ID!, $name: String!) { createObject(input: { workspaceId: $w, name: $name, properties: [
       { name: "id", kind: STRING },
       { name: "customer", kind: OBJECT, properties: [
         { name: "name", kind: STRING },
         { name: "address", kind: OBJECT, properties: [ { name: "city", kind: STRING } ] }
       ] },
       { name: "lines", kind: ARRAY, properties: [ { name: "sku", kind: STRING } ] }
     ] }) { id } }`,
    { w: WORKSPACE, name: `zzNest${stamp}` },
  );
  made.push(createObject.id);

  await page.goto(`${BASE}/workspace/${WORKSPACE}/objects/${createObject.id}`, { waitUntil: 'domcontentloaded' });
  await drawn(page, 'Object Schema Definition');
  const blocks = await page.getByTestId('inline-object').count();
  record(blocks === 3, `the three objects defined in place are drawn as blocks of rows (${blocks})`);
  record((await page.locator('#property-1-name-0').inputValue()) === 'name', "customer's first field is a row inside customer's row");
  record((await page.locator('#property-1-1-name-0').inputValue()) === 'city', "and address's field is a row inside address's row, inside customer's");
  const indent = await page.evaluate(() => {
    const outer = document.getElementById('property-name-1')?.getBoundingClientRect().left ?? 0;
    const inner = document.getElementById('property-1-name-0')?.getBoundingClientRect().left ?? 0;
    const deeper = document.getElementById('property-1-1-name-0')?.getBoundingClientRect().left ?? 0;
    return { outer, inner, deeper };
  });
  record(indent.inner > indent.outer + 8 && indent.deeper > indent.inner + 8, `each level is set in from the one above (${indent.outer} < ${indent.inner} < ${indent.deeper})`);

  // A field added inside customer, from the nested block's own button, is saved under customer.
  const customerBlock = page.getByTestId('inline-object').first();
  // The last one: the address block inside customer has a button of its own, and it comes first in the DOM.
  await customerBlock.getByRole('button', { name: '+ Add Property' }).last().click();
  const added = page.locator('#property-1-name-2');
  await added.waitFor({ timeout: 5_000 });
  await added.fill('email');
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await page.getByText('Saved.').waitFor({ timeout: 10_000 });
  const { workflowObject: object } = await graphql(
    `query($id: ID!) { workflowObject(id: $id) { properties { name properties { name properties { name } } } } }`,
    { id: createObject.id },
  );
  const customer = object.properties.find((one) => one.name === 'customer');
  record(
    customer?.properties.map((one) => one.name).join(',') === 'name,address,email',
    `the field added inside customer is stored inside customer (${customer?.properties.map((one) => one.name).join(',')})`,
  );
  record(customer?.properties[1]?.properties?.[0]?.name === 'city', 'and what was deeper still is');

  /* ---- an object from a JSON Schema ---- */

  await page.goto(`${BASE}/workspace/${WORKSPACE}/objects`, { waitUntil: 'domcontentloaded' });
  await drawn(page, 'Objects');
  await page.getByTestId('from-schema').click();
  const dialog = page.getByTestId('schema-dialog');
  await dialog.waitFor({ timeout: 5_000 });
  // The schema box stays inside its frame and the dialog; it ran out of both once.
  const fit = await dialog.evaluate((one) => {
    const frame = one.querySelector('[data-testid="schema-box"]');
    const box = frame?.firstElementChild;
    if (!box || !frame) return null;
    const b = box.getBoundingClientRect(); const f = frame.getBoundingClientRect(); const d = one.getBoundingClientRect();
    return { inFrame: b.bottom <= f.bottom + 1 && b.right <= f.right + 1, inDialog: b.bottom <= d.bottom + 1, height: Math.round(b.height) };
  });
  record(fit !== null && fit.inFrame && fit.inDialog && fit.height >= 200, `the schema box fits its frame and the dialog (${JSON.stringify(fit)})`);
  await dialog.locator('#schema-object-name').fill(`zzSchema${stamp}`);
  // Read as it is typed, on the label's line over the box: what is wrong is said there, and Create waits.
  const typeSchema = async (text) => {
    await dialog.getByTestId('schema-box').click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Delete');
    // Typed into the editor rather than set: an editor that completes brackets gets the text one key at a time.
    await page.keyboard.insertText(text);
  };
  const createButton = dialog.getByRole('button', { name: 'Create Object' });
  const readingOf = async () => (await dialog.getByTestId('schema-reading').textContent()) ?? '';
  await typeSchema('{ "type": "string" }');
  await dialog.getByTestId('schema-reading').waitFor({ timeout: 5_000 });
  record(/not an object/.test(await readingOf()), 'a schema of a string is said not to be an object');
  record(await createButton.isDisabled(), 'and Create waits');
  const above = await dialog.evaluate((one) => {
    const note = one.querySelector('[data-testid="schema-reading"]');
    const box = one.querySelector('[data-testid="schema-box"]');
    return note && box ? note.getBoundingClientRect().bottom <= box.getBoundingClientRect().top : false;
  });
  record(above, 'and it is said above the box, not under it');
  await typeSchema('{ "type": "object", "properties": { "a": ');
  await page.waitForTimeout(150);
  record(/Not JSON/.test(await readingOf()), 'half-typed JSON is said not to be JSON');
  await typeSchema(JSON.stringify({
    type: 'object',
    properties: {
      id: { type: 'integer', description: 'The order number' },
      customer: { $ref: '#/definitions/Customer' },
      lines: { type: 'array', items: { type: 'object', properties: { sku: { type: 'string' }, qty: { type: 'number' } } } },
    },
    definitions: { Customer: { type: 'object', properties: { name: { type: 'string' } } } },
  }));
  await page.waitForTimeout(150);
  record(/3 properties .*2 defined in place .*1 arrays/.test(await readingOf()), `a readable schema is counted (${await readingOf()})`);
  await createButton.click();
  await page.waitForURL(/\/objects\/\d+$/, { timeout: 10_000 });
  const schemaId = page.url().split('/').pop();
  made.push(schemaId);
  await drawn(page, 'Object Schema Definition');
  record((await page.locator('#property-name-0').inputValue()) === 'id', 'the schema’s first property is the object’s first row');
  record((await page.getByTestId('inline-object').count()) === 2, 'the referenced definition and the array’s items are objects defined in place');
  const { workflowObject: fromSchema } = await graphql(
    `query($id: ID!) { workflowObject(id: $id) { properties { name kind display description properties { name kind } } } }`,
    { id: schemaId },
  );
  record(fromSchema.properties[0].kind === 'NUMBER' && fromSchema.properties[0].description === 'The order number', 'an integer is a number, and its description came with it');
  record(fromSchema.properties[2].display === 'array<object>' && fromSchema.properties[2].properties.length === 2, 'the array of objects holds its items’ fields');

  /* ---- the depth is the administrator's number ---- */

  const { installationSettings } = await graphql('query { installationSettings { objectMaxDepth } }');
  await page.goto(`${BASE}/admin/settings`, { waitUntil: 'domcontentloaded' });
  await drawn(page, 'Object Depth');
  record(
    (await page.locator('#object-max-depth').inputValue()) === String(installationSettings.objectMaxDepth),
    `Admin > Settings shows the depth objects are held to (${installationSettings.objectMaxDepth})`,
  );
} finally {
  for (const id of made) {
    await graphql(`mutation($id: ID!) { deleteObject(id: $id) }`, { id }).catch(() => undefined);
  }
}

await finish(browser);
