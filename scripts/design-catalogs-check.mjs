/**
 * Catalogs on Design's Images, Wireframes and Videos pages, the same column on
 * each: the default catalog is there without anybody making it and offers no
 * delete; a catalog made through the column is selected and named above the
 * list; what is made or imported while it is selected is filed in it and listed
 * under it, and under the default no more; a catalog holding something refuses
 * to be deleted, in the server's words, and one moved empty again is deleted.
 *
 * Images and wireframes are filed through the page itself - Import, New - and
 * moved through a card's menu. Videos are made by a video model, which CI has
 * none of, so the videos page is checked for the column alone: its default,
 * and making and deleting an empty catalog.
 *
 * Read off the DOM - the rows of the column, the heading, the cards - and the
 * server for which catalog a thing landed in. Makes its own catalogs and things
 * and removes them.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAAEElEQVR4nGM4IScHQQxwFgBBAAYZPEVBlgAAAABJRU5ErkJggg==';
const stamp = Date.now().toString(36);

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });

const PAGES = [
  { kind: 'IMAGE', path: 'images', card: '[data-testid="design-gallery"] figure:not([data-job-status])' },
  { kind: 'WIREFRAME', path: 'wireframes', card: '[data-testid="wireframe-card"]' },
  { kind: 'VIDEO', path: 'videos', card: '[data-testid="video-card"]' },
];

const row = (name) => page.locator(`[data-testid="design-catalog-row"][data-catalog="${name}"]`);
const heading = () => page.getByTestId('design-catalog-heading').innerText().then((text) => text.trim()).catch(() => null);
const catalogsOf = async (kind) =>
  (await graphql('query ($w: ID!, $k: DesignCatalogKind!) { designCatalogs(workspaceId: $w, kind: $k) { id name isDefault count } }', { w: WORKSPACE, k: kind }))
    .designCatalogs;

async function visit(path, catalog) {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/design/${path}${catalog === undefined ? '' : `?catalog=${catalog}`}`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('design-catalogs').waitFor({ timeout: 20_000 });
  await page.locator('[data-testid="design-catalog-row"][data-default="true"]').waitFor({ timeout: 15_000 }).catch(() => undefined);
}

async function cardsUnder(path, catalog, selector) {
  await visit(path, catalog);
  await page.waitForTimeout(1200);
  return page.locator(selector).count();
}

/** Deletes the catalog being looked at through its own button; the refusal's words, or null where it went. */
async function deleteSelected() {
  await page.getByTestId('delete-design-catalog').click();
  await page.locator('dialog[open] button', { hasText: /^Delete$/ }).click();
  const refusal = page.locator('dialog[open] [role="alert"]');
  await refusal.waitFor({ timeout: 4_000 }).catch(() => undefined);
  if ((await refusal.count()) > 0) {
    const said = ((await refusal.textContent()) ?? '').trim();
    await page.locator('dialog[open] button', { hasText: /^Cancel$/ }).click();
    return said;
  }
  return null;
}

const made = { images: [], wireframes: [] };

try {
  for (const one of PAGES) {
    const name = `${one.path} ${stamp}`;
    await visit(one.path);

    // The default, made without anybody asking, and with no way to delete it.
    const general = page.locator('[data-testid="design-catalog-row"][data-default="true"]');
    const defaultName = (await general.getAttribute('data-catalog').catch(() => null)) ?? null;
    record(defaultName !== null, `${one.path}: the default catalog is in the column without anybody making it (${defaultName})`);
    await general.click();
    await page.waitForFunction(
      (wanted) => document.querySelector('[data-testid="design-catalog-heading"]')?.textContent?.trim() === wanted,
      defaultName,
      { timeout: 5_000 },
    ).catch(() => undefined);
    record((await heading()) === defaultName, `${one.path}: chosen, it is named above the list (${await heading()})`);
    record((await page.getByTestId('delete-design-catalog').count()) === 0 && (await page.getByTestId('rename-design-catalog').count()) === 1,
      `${one.path}: the default can be renamed and offers no delete`);

    // Made through the column, and selected at once.
    await page.getByTestId('new-design-catalog').click();
    await page.locator('dialog[open] input').fill(name);
    await page.locator('dialog[open] button[type="submit"]').click();
    await row(name).waitFor({ timeout: 10_000 }).catch(() => undefined);
    await page.waitForTimeout(500);
    const id = (await catalogsOf(one.kind)).find((catalog) => catalog.name === name)?.id ?? null;
    record(id !== null && (await heading()) === name && page.url().includes(`catalog=${id}`),
      `${one.path}: a catalog made in the column is selected and named above the list (${await heading()}, ${page.url()})`);
    if (id === null) continue;

    if (one.kind === 'VIDEO') {
      record((await deleteSelected()) === null, `${one.path}: an empty catalog is deleted`);
      await page.waitForTimeout(600);
      record((await row(name).count()) === 0 && !(await catalogsOf(one.kind)).some((catalog) => catalog.id === id),
        `${one.path}: and leaves the column`);
      continue;
    }

    // Something new, made or imported while the catalog is selected, is filed in it.
    if (one.kind === 'IMAGE') {
      await page.getByTestId('design-images-import-file').setInputFiles({ name: `filed ${stamp}.png`, mimeType: 'image/png', buffer: Buffer.from(PNG, 'base64') });
      await page.waitForURL(/\/design\/images\/DESIGN-\d+\/edit$/, { timeout: 20_000 }).catch(() => undefined);
      const picture = /\/(DESIGN-\d+)\/edit$/.exec(page.url())?.[1];
      if (picture !== undefined) made.images.push(picture);
    } else {
      await page.getByTestId('new-wireframe').click();
      await page.waitForURL(/\/design\/wireframes\/\d+$/, { timeout: 20_000 }).catch(() => undefined);
      const wireframe = /\/design\/wireframes\/(\d+)$/.exec(page.url())?.[1];
      if (wireframe !== undefined) made.wireframes.push(wireframe);
    }
    const under = await cardsUnder(one.path, id, one.card);
    const counted = ((await row(name).innerText().catch(() => '')) ?? '').trim();
    record(under === 1 && counted.endsWith('1'), `${one.path}: what was made with it selected is listed under it and counted (${under} cards, "${counted}")`);

    // A catalog holding something refuses to go, saying why.
    const refused = await deleteSelected();
    record(refused !== null && refused.includes('move or delete them'), `${one.path}: a catalog holding something is not deleted, and says why ("${refused}")`);

    // Moved out through the card's menu, it leaves this catalog for the default.
    const defaultId = (await catalogsOf(one.kind)).find((catalog) => catalog.isDefault)?.id;
    const item = page.locator(one.card).first();
    await item.hover().catch(() => undefined);
    if (one.kind === 'IMAGE') {
      // A picture is moved from where it is opened.
      await item.locator('button').first().click();
      await page.locator('[data-design-image]').waitFor({ timeout: 10_000 }).catch(() => undefined);
    }
    await page.locator('[data-move-to]').first().click();
    await page.locator(`[data-move-menu] [data-catalog-id="${defaultId}"]`).click();
    await page.waitForTimeout(900);
    const left = await cardsUnder(one.path, id, one.card);
    const intoDefault = await cardsUnder(one.path, defaultId, one.card);
    record(left === 0 && intoDefault >= 1, `${one.path}: moved through its menu, it leaves the catalog for the default (${left} left, ${intoDefault} in the default)`);

    // Empty again, it is deleted.
    await visit(one.path, id);
    record((await deleteSelected()) === null, `${one.path}: emptied, the catalog is deleted`);
    await page.waitForTimeout(600);
    record(!(await catalogsOf(one.kind)).some((catalog) => catalog.id === id), `${one.path}: and is gone`);
  }
} finally {
  for (const id of made.images) await graphql('mutation ($id: ID!) { deleteArtifact(id: $id) }', { id }).catch(() => undefined);
  for (const id of made.wireframes) await graphql('mutation ($id: ID!) { deleteWireframe(id: $id) }', { id }).catch(() => undefined);
}

await finish(browser);
