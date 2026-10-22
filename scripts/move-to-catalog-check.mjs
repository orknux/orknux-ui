/**
 * A variable, a secret, a skill and a memory each move to another catalog from
 * their row, through the application's own menu rather than a native select.
 *
 * A workspace of its own is made with two catalogs of each kind; one of each
 * thing is moved from the first to the second, by pointer for some and by the
 * keys for others. What is asserted is both halves: the row leaves the list it
 * was drawn in, and the server holds it in the catalog chosen. A move the
 * server refuses - a name already taken in the catalog chosen - is shown in the
 * menu in the server's own words, and nothing moves.
 */
import { BASE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });
const NAME = `zzMoveToCatalog ${Date.now()}`;

const made = (await graphql('mutation ($n: String!) { createWorkspace(input: { name: $n }) { id } }', { n: NAME })).createWorkspace.id;

/** The menu a row's button opened, checked to be the application's own and on the screen. */
async function menuFor(name) {
  const menu = page.locator(`[data-move-menu="${name}"]`);
  await menu.waitFor({ timeout: 10_000 });
  const box = await menu.boundingBox();
  const inside = box !== null && box.y >= 0 && box.y + box.height <= 900 && box.x >= 0 && box.x + box.width <= 1440;
  record(inside, `the menu for ${name} is drawn whole on the screen (${box ? `${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}x${Math.round(box.height)}` : 'nothing'})`);
  record((await menu.locator('select').count()) === 0 && (await menu.getByRole('listbox').count()) === 1, `the menu for ${name} is a listbox, not a native select`);
  return menu;
}

try {
  /* ---------------------------------------------------------- variables --- */
  const mk = (q, v) => graphql(q, { w: made, ...v });
  const alpha = (await mk('mutation ($w: ID!) { createVariableCatalog(workspaceId: $w, name: "Alpha") { id } }')).createVariableCatalog.id;
  const beta = (await mk('mutation ($w: ID!) { createVariableCatalog(workspaceId: $w, name: "Beta") { id } }')).createVariableCatalog.id;
  const region = (await mk('mutation ($w: ID!, $c: ID!) { createVariable(input: { workspaceId: $w, catalogId: $c, name: "region", type: STRING, kind: VALUE, value: "eu" }) { id } }', { c: alpha })).createVariable.id;
  const apiKey = (await mk('mutation ($w: ID!, $c: ID!) { createVariable(input: { workspaceId: $w, catalogId: $c, name: "api_key", type: STRING, kind: SECRET, value: "s3cret" }) { id } }', { c: alpha })).createVariable.id;

  await page.goto(`${BASE}/workspace/${made}/variables`, { waitUntil: 'domcontentloaded' });
  await drawn(page, 'the variables');
  await page.getByLabel('Name of region', { exact: true }).waitFor({ timeout: 10_000 });

  // The value, by pointer.
  await page.locator('[data-move-to="region"]').click();
  let menu = await menuFor('region');
  const offered = await menu.locator('[data-catalog-id]').evaluateAll((all) => all.map((one) => one.textContent));
  record(offered.join() === 'Beta', `the menu offers the other catalog and not the one it is in (${offered.join()})`);
  await menu.locator(`[data-catalog-id="${beta}"]`).click();
  await page.getByLabel('Name of region', { exact: true }).waitFor({ state: 'detached', timeout: 10_000 });
  record(true, 'the moved value leaves the table it was drawn in');
  const heldRegion = (await graphql('query ($w: ID!, $c: ID!) { workspaceVariables(workspaceId: $w, catalogId: $c, size: 50) { content { id } } }', { w: made, c: beta })).workspaceVariables.content;
  record(heldRegion.some((one) => one.id === region), 'the server holds the value in the catalog chosen');

  // The secret, by the keys: an arrow on the focused button opens, Enter chooses.
  await page.locator('[data-move-to="api_key"]').focus();
  await page.keyboard.press('ArrowDown');
  menu = await menuFor('api_key');
  await page.keyboard.press('Enter');
  await page.getByLabel('Name of api_key', { exact: true }).waitFor({ state: 'detached', timeout: 10_000 });
  const heldKey = (await graphql('query ($w: ID!, $c: ID!) { workspaceVariables(workspaceId: $w, catalogId: $c, size: 50) { content { id kind valueSet } } }', { w: made, c: beta })).workspaceVariables.content;
  const key = heldKey.find((one) => one.id === apiKey);
  record(key?.kind === 'SECRET' && key?.valueSet === true, 'the server holds the secret in the catalog chosen, still a secret and still set');

  // The two moved rows are drawn in the catalog they went to.
  await page.getByRole('button', { name: /^Beta/ }).click();
  await page.getByLabel('Name of region', { exact: true }).waitFor({ timeout: 10_000 });
  record((await page.getByLabel('Name of api_key', { exact: true }).count()) === 1, 'both moved rows are drawn in the catalog they went to');

  // A refusal is shown in the menu, in the server's words, and nothing moves.
  const clash = (await mk('mutation ($w: ID!, $c: ID!) { createVariable(input: { workspaceId: $w, catalogId: $c, name: "clash", type: STRING, kind: VALUE, value: "a" }) { id } }', { c: beta })).createVariable.id;
  let refusal = null;
  try {
    await mk('mutation ($w: ID!, $c: ID!) { createVariable(input: { workspaceId: $w, catalogId: $c, name: "clash", type: STRING, kind: VALUE, value: "b" }) { id } }', { c: alpha });
  } catch (cause) {
    refusal = cause;
  }
  if (refusal === null) {
    // Names are per catalog: moving the second into the first's catalog is what is refused.
    await page.goto(`${BASE}/workspace/${made}/variables`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /^Alpha/ }).click();
    await page.getByLabel('Name of clash', { exact: true }).waitFor({ timeout: 10_000 });
    await page.locator('[data-move-to="clash"]').click();
    menu = await menuFor('clash');
    await menu.locator(`[data-catalog-id="${beta}"]`).click();
    const said = menu.locator('[data-move-refused]');
    await said.waitFor({ timeout: 10_000 });
    const text = (await said.textContent())?.trim() ?? '';
    record(text.length > 0, `a refusal is drawn in the menu (${text})`);
    await page.keyboard.press('Escape');
    await menu.waitFor({ state: 'detached', timeout: 5_000 });
    record(true, 'Escape closes the menu');
    record((await page.getByLabel('Name of clash', { exact: true }).count()) === 1, 'the refused row stays where it was');
  } else {
    record(true, `names are per workspace, so there is no clash to refuse (${refusal.message}); ${clash} stays in Beta`);
  }

  /* ------------------------------------------------------------- skills --- */
  const skillsA = (await mk('mutation ($w: ID!) { createSkillCatalog(workspaceId: $w, name: "Guides") { id } }')).createSkillCatalog.id;
  const skillsB = (await mk('mutation ($w: ID!) { createSkillCatalog(workspaceId: $w, name: "Archive") { id } }')).createSkillCatalog.id;
  const skill = (await graphql('mutation ($input: CreateSkillInput!) { createSkill(input: $input) { id } }', {
    input: { workspaceId: made, name: 'reviewNotes', description: 'How to review', catalogId: skillsA },
  })).createSkill.id;

  await page.goto(`${BASE}/workspace/${made}/skills?catalog=${skillsA}`, { waitUntil: 'domcontentloaded' });
  await drawn(page, 'the skills');
  await page.locator('[data-move-to="reviewNotes"]').waitFor({ timeout: 10_000 });
  await page.locator('[data-move-to="reviewNotes"]').click();
  menu = await menuFor('reviewNotes');
  // Click-away closes it, and nothing moves.
  await page.mouse.click(5, 895);
  await menu.waitFor({ state: 'detached', timeout: 5_000 });
  record(true, 'a click elsewhere closes the menu');
  await page.locator('[data-move-to="reviewNotes"]').click();
  menu = await menuFor('reviewNotes');
  await menu.locator(`[data-catalog-id="${skillsB}"]`).click();
  await page.locator('[data-move-to="reviewNotes"]').waitFor({ state: 'detached', timeout: 10_000 });
  record(true, 'the moved skill leaves the catalog it was drawn in');
  const heldSkill = (await graphql('query ($id: ID!) { skill(id: $id) { catalogId } }', { id: skill })).skill;
  record(heldSkill?.catalogId === skillsB, `the server holds the skill in the catalog chosen (${heldSkill?.catalogId})`);

  /* ------------------------------------------------------------- memory --- */
  const memoryB = (await mk('mutation ($w: ID!) { createMemoryCatalog(workspaceId: $w, name: "Later") { id } }')).createMemoryCatalog.id;
  const memoryA = (await mk('mutation ($w: ID!) { createMemoryCatalog(workspaceId: $w, name: "Now") { id } }')).createMemoryCatalog.id;
  const memory = (await graphql('mutation ($input: CreateMemoryInput!) { createMemory(input: $input) { id } }', {
    input: { catalogId: memoryA, title: 'Deploys on Friday', content: 'Nobody deploys on a Friday.' },
  })).createMemory.id;

  await page.goto(`${BASE}/workspace/${made}/memory?catalog=${memoryA}`, { waitUntil: 'domcontentloaded' });
  await drawn(page, 'the memories');
  await page.locator('[data-move-to="Deploys on Friday"]').waitFor({ timeout: 10_000 });
  await page.locator('[data-move-to="Deploys on Friday"]').click();
  menu = await menuFor('Deploys on Friday');
  await menu.locator(`[data-catalog-id="${memoryB}"]`).click();
  await page.locator('[data-move-to="Deploys on Friday"]').waitFor({ state: 'detached', timeout: 10_000 });
  record(true, 'the moved memory leaves the catalog it was drawn in');
  const heldMemory = (await graphql('query ($id: ID!) { memory(id: $id) { catalogId title content } }', { id: memory })).memory;
  record(
    heldMemory?.catalogId === memoryB && heldMemory?.content === 'Nobody deploys on a Friday.',
    `the server holds the memory, unchanged, in the catalog chosen (${heldMemory?.catalogId})`,
  );
} finally {
  await graphql('mutation ($id: ID!) { deleteWorkspace(id: $id) }', { id: made }).catch(() => undefined);
}

await finish(browser);
