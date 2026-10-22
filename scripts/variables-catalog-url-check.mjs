/**
 * The variables page keeps its catalog in the address, and a row's actions
 * line up.
 *
 * The address: `?catalog=<id>`, as the skills and memory pages are opened by.
 * Opening the page writes the catalog it settled on into it; choosing another
 * replaces it, so Back leaves the page rather than walking through every
 * catalog looked at; a reload and a link open the catalog named; an id this
 * workspace has no catalog of opens the first, with no refusal on the page.
 *
 * The actions: the move icon and the bin were drawn at two sizes, the move
 * glyph smaller and higher than the bin. Measured on a value's row and on a
 * secret's - both buttons the same box, their centres level within a pixel,
 * the pair centred under the Actions heading - and on a skill's card and a
 * memory's, where the same move control sits among other icons.
 */
import { BASE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });
const NAME = `zzVariablesCatalogUrl ${Date.now()}`;
const made = (await graphql('mutation ($n: String!) { createWorkspace(input: { name: $n }) { id } }', { n: NAME })).createWorkspace.id;
const mk = (q, v) => graphql(q, { w: made, ...v });

/** The box of each element, rounded to a tenth of a pixel. */
async function boxOf(locator) {
  const box = await locator.evaluate((one) => {
    const r = one.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  return { ...box, cx: box.x + box.w / 2, cy: box.y + box.h / 2 };
}

const fmt = (box) => `${box.w.toFixed(1)}x${box.h.toFixed(1)} centred at ${box.cx.toFixed(1)},${box.cy.toFixed(1)}`;

/** The move button and the bin of one row: same box, same icon box, level centres. */
async function pairLevel(where, move, bin) {
  const [m, b] = [await boxOf(move), await boxOf(bin)];
  const [mi, bi] = [await boxOf(move.locator('img')), await boxOf(bin.locator('img'))];
  record(Math.abs(m.w - b.w) < 0.5 && Math.abs(m.h - b.h) < 0.5, `${where}: move and bin buttons are one size (move ${fmt(m)}, bin ${fmt(b)})`);
  record(Math.abs(mi.w - bi.w) < 0.5 && Math.abs(mi.h - bi.h) < 0.5, `${where}: move and bin icons are one size (move ${fmt(mi)}, bin ${fmt(bi)})`);
  record(Math.abs(mi.cy - bi.cy) < 0.5, `${where}: move and bin icons are level, within half a pixel (${(mi.cy - bi.cy).toFixed(1)}px apart)`);
  return { m, b };
}

const selectedCatalog = () => page.locator('[aria-current="true"]').first().innerText();
const urlCatalog = () => new URL(page.url()).searchParams.get('catalog');

try {
  const alpha = (await mk('mutation ($w: ID!) { createVariableCatalog(workspaceId: $w, name: "Alpha") { id } }')).createVariableCatalog.id;
  const beta = (await mk('mutation ($w: ID!) { createVariableCatalog(workspaceId: $w, name: "Beta") { id } }')).createVariableCatalog.id;
  for (const [name, kind, catalog] of [['region', 'VALUE', alpha], ['api_key', 'SECRET', alpha], ['zone', 'VALUE', beta]]) {
    await mk(
      `mutation ($w: ID!, $c: ID!) { createVariable(input: { workspaceId: $w, catalogId: $c, name: "${name}", type: STRING, kind: ${kind}, value: "x" }) { id } }`,
      { c: catalog },
    );
  }

  /* ------------------------------------------------------------- the address --- */
  await page.goto(`${BASE}/workspace/${made}/variables`, { waitUntil: 'domcontentloaded' });
  await drawn(page, 'the variables');
  await page.getByLabel('Name of region', { exact: true }).waitFor({ timeout: 10_000 });
  await page.waitForTimeout(300);
  const opened = urlCatalog();
  record(opened !== null && opened !== '', `opening the page writes the catalog it opened into the address (${page.url()})`);

  const historyBefore = await page.evaluate(() => history.length);
  await page.getByRole('button', { name: /^Beta/ }).click();
  await page.getByLabel('Name of zone', { exact: true }).waitFor({ timeout: 10_000 });
  await page.waitForTimeout(300);
  record(urlCatalog() === beta, `choosing Beta puts it in the address (${page.url()})`);
  record((await page.evaluate(() => history.length)) === historyBefore, 'choosing a catalog replaces the address rather than adding a step to Back');

  await page.reload({ waitUntil: 'domcontentloaded' });
  // Not awaited to the end: a page that forgot opens Alpha, and that is the failure recorded below.
  await page.getByLabel('Name of zone', { exact: true }).waitFor({ timeout: 10_000 }).catch(() => undefined);
  record((await selectedCatalog()).startsWith('Beta'), `a reload opens the catalog in the address (${(await selectedCatalog()).split('\n')[0]})`);

  await page.goto(`${BASE}/workspace/${made}/variables`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Name of region', { exact: true }).waitFor({ timeout: 10_000 });
  await page.goto(`${BASE}/workspace/${made}/variables?catalog=${beta}`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Name of zone', { exact: true }).waitFor({ timeout: 10_000 }).catch(() => undefined);
  record((await selectedCatalog()).startsWith('Beta'), 'a link naming Beta opens Beta');
  record(urlCatalog() === beta, `and the address still names it (${page.url()})`);

  await page.goto(`${BASE}/workspace/${made}/variables?catalog=999999999`, { waitUntil: 'domcontentloaded' });
  await drawn(page, 'the variables, asked for a catalog that is not there');
  await page.locator('[aria-current="true"]').first().waitFor({ timeout: 10_000 });
  await page.waitForTimeout(300);
  const fellBack = (await selectedCatalog()).split('\n')[0];
  record((await page.locator('[role="alert"]').count()) === 0, 'an unknown catalog id draws no refusal');
  record(fellBack.length > 0 && urlCatalog() !== '999999999', `an unknown catalog id opens the first one, and the address says which (${fellBack}, ${page.url()})`);

  /* ------------------------------------------------------- the row's actions --- */
  await page.goto(`${BASE}/workspace/${made}/variables?catalog=${alpha}`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Name of api_key', { exact: true }).waitFor({ timeout: 10_000 });
  const value = await pairLevel('a value', page.locator('[data-move-to="region"]'), page.getByRole('button', { name: 'Delete region', exact: true }));
  const secret = await pairLevel('a secret', page.locator('[data-move-to="api_key"]'), page.getByRole('button', { name: 'Delete api_key', exact: true }));
  record(Math.abs(value.m.cx - secret.m.cx) < 0.5 && Math.abs(value.b.cx - secret.b.cx) < 0.5, 'the value and the secret draw their actions in the same place across');
  const gapOf = (pair) => pair.b.x - (pair.m.x + pair.m.w);
  record(Math.abs(gapOf(value) - gapOf(secret)) < 0.5 && gapOf(value) > 0, `the space between the two is the same on both (${gapOf(value).toFixed(1)}px, ${gapOf(secret).toFixed(1)}px)`);
  for (const [where, pair, heading] of [['a value', value, 0], ['a secret', secret, 1]]) {
    const head = await boxOf(page.getByText('Actions', { exact: true }).nth(heading));
    const middle = (pair.m.x + pair.b.x + pair.b.w) / 2;
    record(Math.abs(middle - head.cx) <= 1, `${where}: the pair is centred under the Actions heading (${(middle - head.cx).toFixed(1)}px off)`);
  }

  /* ------------------------------------------------------ skills and memory --- */
  const skillsA = (await mk('mutation ($w: ID!) { createSkillCatalog(workspaceId: $w, name: "Guides") { id } }')).createSkillCatalog.id;
  await mk('mutation ($w: ID!) { createSkillCatalog(workspaceId: $w, name: "Archive") { id } }');
  await graphql('mutation ($input: CreateSkillInput!) { createSkill(input: $input) { id } }', {
    input: { workspaceId: made, name: 'reviewNotes', description: 'How to review', catalogId: skillsA },
  });
  await page.goto(`${BASE}/workspace/${made}/skills?catalog=${skillsA}`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-move-to="reviewNotes"]').waitFor({ timeout: 10_000 });
  await pairLevel('a skill', page.locator('[data-move-to="reviewNotes"]'), page.getByRole('button', { name: 'Delete reviewNotes', exact: true }));

  const memoryA = (await mk('mutation ($w: ID!) { createMemoryCatalog(workspaceId: $w, name: "Now") { id } }')).createMemoryCatalog.id;
  await mk('mutation ($w: ID!) { createMemoryCatalog(workspaceId: $w, name: "Later") { id } }');
  await graphql('mutation ($input: CreateMemoryInput!) { createMemory(input: $input) { id } }', {
    input: { catalogId: memoryA, title: 'Deploys on Friday', content: 'Nobody deploys on a Friday.' },
  });
  await page.goto(`${BASE}/workspace/${made}/memory?catalog=${memoryA}`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-move-to="Deploys on Friday"]').waitFor({ timeout: 10_000 });
  await pairLevel('a memory', page.locator('[data-move-to="Deploys on Friday"]'), page.getByRole('button', { name: 'Delete Deploys on Friday', exact: true }));
} finally {
  await graphql('mutation ($id: ID!) { deleteWorkspace(id: $id) }', { id: made }).catch(() => undefined);
}

await finish(browser);
