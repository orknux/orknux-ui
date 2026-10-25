/**
 * Explore -> Diagrams: the list by catalog.
 *
 * What is pinned: Explore's menu holds Research and then Diagrams; New catalog
 * makes one and lists it on the left; New diagram opens the editor on one made
 * in the catalog chosen; back on the list the diagram is a row of that catalog,
 * with no Agents column, a read-only one carrying a small mark; Move sends it
 * to another catalog; the search finds a node on it by a word in its notes; and Remove asks
 * first, then takes the row away. A catalog holding diagrams is refused.
 *
 * Makes its own catalogs and diagram, with a stamp in their names, and removes them.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });
const stamp = Date.now();
const FIRST = `zzMaps ${stamp}`;
const SECOND = `zzOther ${stamp}`;

/** What the next New catalog is called: asked in the browser's own box, as the memory page asks it. */
let naming = FIRST;
page.on('dialog', (dialog) => void dialog.accept(naming));

await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/diagrams`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('diagram-search').waitFor({ timeout: 20_000 });

// The menu down the side: Research, then Diagrams.
const menu = (await page.locator('nav a, aside a').allInnerTexts().catch(() => [])).map((one) => one.trim());
record(menu.includes('Research') && menu.includes('Diagrams') && menu.indexOf('Research') < menu.indexOf('Diagrams'),
  `Explore's menu runs Research, Diagrams (${menu.join(', ')})`);

// New catalog, twice.
await page.getByTestId('diagram-new-catalog').click();
await page.locator(`[data-catalog-row="${FIRST}"]`).waitFor({ timeout: 10_000 }).catch(() => undefined);
naming = SECOND;
await page.getByTestId('diagram-new-catalog').click();
await page.locator(`[data-catalog-row="${SECOND}"]`).waitFor({ timeout: 10_000 }).catch(() => undefined);
record((await page.locator(`[data-catalog-row="${FIRST}"]`).count()) === 1 && (await page.locator(`[data-catalog-row="${SECOND}"]`).count()) === 1,
  'New catalog lists each catalog made on the left');

// New diagram, in the first catalog, opens the editor.
await page.locator(`[data-catalog-row="${FIRST}"]`).click();
await page.getByTestId('diagram-catalog-heading').filter({ hasText: FIRST }).waitFor({ timeout: 10_000 }).catch(() => undefined);
await page.getByTestId('new-diagram').click();
await page.waitForURL(/\/explore\/diagrams\/\d+$/, { timeout: 10_000 }).catch(() => undefined);
const id = page.url().match(/\/explore\/diagrams\/(\d+)$/)?.[1] ?? null;
record(id !== null, `New diagram opens the editor on the new diagram (${page.url()})`);
const made = id === null ? null : (await graphql('query ($id: ID!) { diagram(id: $id) { catalogName } }', { id })).diagram;
record(made?.catalogName === FIRST, `and makes it in the catalog chosen (${made?.catalogName})`);

// Notes on a node, for the search to find.
await graphql(
  'mutation ($id: ID!, $d: String!) { saveDiagram(id: $id, document: $d) { revision } }',
  { id, d: JSON.stringify({ nodes: [{ id: 'gw', kind: 'box', label: 'Gateway', x: 0, y: 0, w: 160, h: 60, notes: `Fronts the zzquokka${stamp} service.` }], edges: [] }) },
);

// Back on the list: the row, and no Agents control in the table - its details are a page of their own (diagram-settings-check).
await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/diagrams`, { waitUntil: 'domcontentloaded' });
await page.locator(`[data-catalog-row="${FIRST}"]`).click({ timeout: 20_000 });
const row = page.locator(`[data-testid="diagram-row"][data-diagram-id="${id}"]`);
await row.waitFor({ timeout: 10_000 }).catch(() => undefined);
record((await row.count()) === 1, 'the diagram is a row of its catalog');
const header = (await page.locator('section').filter({ has: row }).first().innerText().catch(() => '')).split('\n').slice(0, 6).join(' ');
record((await row.getByTestId('diagram-access').count()) === 0 && (await row.locator('button[aria-haspopup]:not([data-move-to]), select, [role="combobox"]').count()) === 0 && !/\bAgents\b/.test(header),
  `the table has no Agents column and no dropdown in its rows (${header})`);
// What agents may do is said only where it is not a new diagram's: Read only, as a small mark.
await graphql('mutation ($id: ID!) { setDiagramAgentAccess(id: $id, access: READ) { id } }', { id });
await page.reload({ waitUntil: 'domcontentloaded' });
await row.waitFor({ timeout: 10_000 }).catch(() => undefined);
record(((await row.getByTestId('diagram-read-only').textContent().catch(() => '')) ?? '') === 'Read only', 'a read-only diagram carries a small Read only mark');

// A catalog holding a diagram is not deleted.
await page.getByTestId('diagram-delete-catalog').click();
await page.locator('dialog[open]').getByRole('button', { name: /^Delete$/ }).click();
const refused = (await page.locator('dialog[open] [role="alert"]').textContent({ timeout: 5_000 }).catch(() => '')) ?? '';
record(refused.includes('move or delete'), `a catalog holding diagrams is refused, in words (${refused})`);
await page.locator('dialog[open]').getByRole('button', { name: /^Cancel$/ }).click();

// Move to the other catalog.
await row.locator('button[aria-label^="Move"]').first().click();
await page.locator('[role="listbox"] [role="option"]', { hasText: SECOND }).first().click();
await page.waitForTimeout(800);
const moved = (await graphql('query ($id: ID!) { diagram(id: $id) { catalogName } }', { id })).diagram.catalogName;
record(moved === SECOND, `Move sends it to the other catalog (${moved})`);

// The search finds the node by a word in its notes, and opens the editor on it.
await page.getByTestId('diagram-search').fill(`zzquokka${stamp}`);
const hit = page.getByTestId('diagram-hit').first();
await hit.waitFor({ timeout: 10_000 }).catch(() => undefined);
record(((await hit.textContent().catch(() => '')) ?? '').includes('Gateway'), 'the search finds the node by a word in its notes');
await hit.click().catch(() => undefined);
await page.waitForURL(/\?node=gw$/, { timeout: 10_000 }).catch(() => undefined);
record(page.url().endsWith(`/explore/diagrams/${id}?node=gw`), `and the hit opens the editor on the node (${page.url()})`);
const label = await page.getByTestId('diagram-node-label').inputValue({ timeout: 10_000 }).catch(() => '');
record(label === 'Gateway', `with that node selected (${label})`);

// Remove asks first, then the row goes.
await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/diagrams`, { waitUntil: 'domcontentloaded' });
await page.locator(`[data-catalog-row="${SECOND}"]`).click({ timeout: 20_000 });
const again = page.locator(`[data-testid="diagram-row"][data-diagram-id="${id}"]`);
await again.getByTestId('diagram-remove').click({ timeout: 10_000 });
const asked = await page.locator('dialog[open]').count();
await page.locator('dialog[open]').getByRole('button', { name: /^Remove$/ }).click();
await page.waitForTimeout(800);
record(asked === 1 && (await again.count()) === 0, `Remove asks first, then takes the row away (${asked})`);

// Left as found.
for (const catalog of (await graphql('query ($w: ID!) { diagramCatalogs(workspaceId: $w) { id name } }', { w: WORKSPACE })).diagramCatalogs) {
  if (catalog.name === FIRST || catalog.name === SECOND) {
    await graphql('mutation ($id: ID!) { deleteDiagramCatalog(id: $id) }', { id: catalog.id }).catch(() => undefined);
  }
}
await finish(browser);
