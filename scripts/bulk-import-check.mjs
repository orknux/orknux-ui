/**
 * Bulk import into a workspace: several exported files picked at once, or
 * several templates ticked at once, land as one import - one plan, one press.
 *
 * Builds a workspace to export from and one to import into, and two templates,
 * and removes all of them after.
 */
import { BASE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const stamp = Date.now();
const made = async (name) =>
  (await graphql('mutation ($n: String!) { createWorkspace(input: { name: $n }) { id } }', { n: name })).createWorkspace.id;
const source = await made(`zzBulkFrom ${stamp}`);
const target = await made(`zzBulkInto ${stamp}`);
const templateIds = [];

const exported = async (name) => {
  const { createObject } = await graphql(
    'mutation ($w: ID!, $n: String!) { createObject(input: { workspaceId: $w, name: $n, properties: [{ name: "reference", kind: STRING }] }) { id } }',
    { w: source, n: name },
  );
  const { exportComponent } = await graphql(
    'query ($w: ID!, $id: ID!) { exportComponent(workspaceId: $w, kind: OBJECT, id: $id, depth: DEEP) { json } }',
    { w: source, id: createObject.id },
  );
  return exportComponent.json;
};
const objectsIn = async () =>
  (await graphql('query ($w: ID!) { workspaceObjects(workspaceId: $w) { content { name } } }', { w: target }))
    .workspaceObjects.content.map((one) => one.name);

try {
  const files = [['Alpha', await exported('Alpha')], ['Beta', await exported('Beta')]];

  /* ---- two files, picked at once ---- */

  await page.goto(`${BASE}/workspace/${target}/objects`, { waitUntil: 'domcontentloaded' });
  await drawn(page, 'Objects');
  await page.getByTestId('import-files').setInputFiles(
    files.map(([name, json]) => ({ name: `${name}.orkx.json`, mimeType: 'application/json', buffer: Buffer.from(json) })),
  );
  const dialog = page.locator('dialog[open]');
  await dialog.waitFor({ timeout: 10_000 });
  const title = (await dialog.locator('h2').first().innerText()).trim();
  record(title === 'Import 2 files', `two files open one dialog (${title})`);
  await dialog.getByRole('button', { name: 'Import', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('dialog[open]') === null, null, { timeout: 15_000 }).catch(() => {});
  const afterFiles = await objectsIn();
  record(afterFiles.includes('Alpha') && afterFiles.includes('Beta'), `and one press imports both (${afterFiles.join(', ')})`);

  /* ---- two templates, ticked at once ---- */

  for (const [name, json] of [['Gamma', await exported('Gamma')], ['Delta', await exported('Delta')]]) {
    const { createComponentTemplate } = await graphql(
      'mutation ($i: ComponentTemplateInput!) { createComponentTemplate(input: $i) { id } }',
      { i: { name: `zz ${name} ${stamp}`, envelope: json } },
    );
    templateIds.push(createComponentTemplate.id);
  }

  await page.goto(`${BASE}/workspace/${target}/objects`, { waitUntil: 'domcontentloaded' });
  await drawn(page, 'Objects');
  await page.getByRole('button', { name: 'Use template' }).first().click();
  const picker = page.locator('dialog[open]');
  await picker.getByTestId('template-choice').first().waitFor({ timeout: 10_000 });
  for (const name of ['Gamma', 'Delta']) {
    await picker.getByTestId('template-choice').filter({ hasText: `zz ${name} ${stamp}` }).click();
  }
  const go = picker.getByRole('button', { name: 'Use 2 templates' });
  record((await go.count()) === 1, 'ticking two templates offers Use 2 templates');
  await go.click();

  const plan = page.locator('dialog[open]');
  await plan.locator('h2', { hasText: 'Use 2 templates' }).waitFor({ timeout: 10_000 }).catch(() => {});
  record((await plan.locator('h2', { hasText: 'Use 2 templates' }).count()) === 1, 'and opens one plan for both');
  await plan.getByRole('button', { name: 'Use templates', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('dialog[open]') === null, null, { timeout: 15_000 }).catch(() => {});
  const afterTemplates = await objectsIn();
  record(afterTemplates.includes('Gamma') && afterTemplates.includes('Delta'), `one press uses both (${afterTemplates.join(', ')})`);
} finally {
  for (const id of templateIds) await graphql('mutation ($id: ID!) { deleteComponentTemplate(id: $id) }', { id }).catch(() => {});
  for (const id of [target, source]) await graphql('mutation ($id: ID!) { deleteWorkspace(id: $id) }', { id }).catch(() => {});
}

await finish(browser);
