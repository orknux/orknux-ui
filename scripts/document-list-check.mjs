/**
 * Design -> Documents: the list and its catalogs. Design's menu has Documents
 * after Wireframes; a catalog is made in its dialog and chosen; New files a
 * document in the catalog being looked at; a row is renamed in place, moved to
 * another catalog, found by the words in it rather than its name, and deleted
 * after a confirm; and a catalog that still holds a document is refused,
 * saying so, until it is empty.
 *
 * Makes its own catalogs and documents and removes them at the end.
 */
import { BASE, WORKSPACE, open, record, finish, shot } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 900 } });
const stamp = Date.now().toString(36);

async function gql(query, variables) {
  return page.evaluate(
    async ({ query, variables }) => {
      const answer = await fetch('/graphql', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query, variables }) });
      return answer.json();
    },
    { query, variables },
  );
}

const list = `${BASE}/workspace/${WORKSPACE}/design/documents`;
await page.goto(list, { waitUntil: 'domcontentloaded' });
await page.getByTestId('new-document').waitFor({ timeout: 20_000 });

// Design's menu: Wireframes, Documents, Images, Videos.
const menu = (await page.locator('nav a, aside a').allInnerTexts().catch(() => [])).map((one) => one.trim());
const at = (name) => menu.indexOf(name);
record(at('Wireframes') >= 0 && at('Wireframes') < at('Documents') && at('Documents') < at('Images') && at('Images') < at('Videos'),
  `Design's menu runs Wireframes, Documents, Images, Videos (${menu.join(', ')})`);

// A catalog made in its dialog is in the rail, chosen, and headed.
async function newCatalog(name) {
  await page.getByTestId('new-document-catalog').click();
  const dialog = page.locator('dialog[open]');
  await dialog.locator('input').fill(name);
  await dialog.locator('button[type="submit"]').click();
  await page.locator(`[data-testid="document-catalog-row"][data-catalog="${name}"]`).waitFor({ timeout: 10_000 }).catch(() => undefined);
}
const first = `Check notes ${stamp}`;
const second = `Check plans ${stamp}`;
await newCatalog(second);
await newCatalog(first);
const firstRow = page.locator(`[data-testid="document-catalog-row"][data-catalog="${first}"]`);
record((await firstRow.count()) === 1 && (await firstRow.getAttribute('aria-current')) === 'true',
  'a new catalog is in the rail, and chosen');
record(((await page.getByTestId('document-catalog-heading').textContent()) ?? '').trim() === first, 'and the panel is headed with its name');

// New files a document in the chosen catalog and opens it.
await page.getByTestId('new-document').click();
await page.waitForURL(/\/design\/documents\/\d+$/, { timeout: 10_000 }).catch(() => undefined);
const made = page.url().match(/\/design\/documents\/(\d+)$/)?.[1] ?? null;
record(made !== null, `New opens the new document (${page.url()})`);
const stored = made === null ? null : (await gql(`query ($id: ID!) { document(id: $id) { catalogName name } }`, { id: made })).data?.document;
record(stored?.catalogName === first, `and files it in the catalog being looked at (${JSON.stringify(stored)})`);

// A second document, with words in it, made through the API.
const words = `zephyrine-${stamp}`;
const content = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `The plan mentions ${words} once.` }] }] });
const catalogs = (await gql(`query ($w: ID!) { documentCatalogs(workspaceId: $w) { id name } }`, { w: WORKSPACE })).data.documentCatalogs;
const firstId = catalogs.find((one) => one.name === first)?.id;
const secondId = catalogs.find((one) => one.name === second)?.id;
const other = (await gql(`mutation ($w: ID!, $c: ID, $n: String!, $d: String) { createDocument(workspaceId: $w, catalogId: $c, name: $n, content: $d) { id } }`,
  { w: WORKSPACE, c: firstId, n: `Roadmap ${stamp}`, d: content })).data.createDocument.id;

await page.goto(`${list}?catalog=${firstId}`, { waitUntil: 'domcontentloaded' });
await page.locator('[data-testid="document-row"]').first().waitFor({ timeout: 15_000 }).catch(() => undefined);
const names = await page.locator('[data-testid="document-row"]').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-name')));
record(names.length === 2 && names.includes(`Roadmap ${stamp}`), `the catalog lists its two documents (${names.join(', ')})`);
const count = ((await firstRow.textContent()) ?? '').trim();
record(count.endsWith('2'), `and the rail counts them (${count})`);

// Renamed in place.
const renamedName = `Renamed ${stamp}`;
await page.locator(`[data-testid="document-row"][data-document-id="${made}"] [data-testid="document-rename"]`).click();
await page.getByTestId('document-name-input').fill(renamedName);
await page.getByTestId('document-name-input').press('Enter');
await page.locator(`[data-testid="document-row"][data-name="${renamedName}"]`).waitFor({ timeout: 10_000 }).catch(() => undefined);
const renamed = (await gql(`query ($id: ID!) { document(id: $id) { name } }`, { id: made })).data.document.name;
record(renamed === renamedName, `a row is renamed in place (${renamed})`);

// Moved to the other catalog through the row's menu.
await page.locator(`[data-move-to="${renamedName}"]`).click();
await page.locator(`[data-move-menu="${renamedName}"] [data-catalog-id="${secondId}"]`).click();
await page.waitForTimeout(800);
const moved = (await gql(`query ($id: ID!) { document(id: $id) { catalogName } }`, { id: made })).data.document.catalogName;
const left = await page.locator('[data-testid="document-row"]').count();
record(moved === second && left === 1, `a document moves to another catalog, and leaves this one (${JSON.stringify({ moved, left })})`);

// Found by its words, not its name, from All documents.
await page.locator(`[data-testid="document-catalog-row"][data-catalog="all"]`).click();
await page.getByTestId('document-search').fill(words);
await page.waitForTimeout(900);
const found = await page.locator('[data-testid="document-row"]').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-name')));
const shownCatalog = await page.locator('[data-testid="document-row"] [data-testid="document-catalog"]').allInnerTexts();
record(found.length === 1 && found[0] === `Roadmap ${stamp}` && shownCatalog[0] === first,
  `the search finds a document by the words in it, and says its catalog (${JSON.stringify({ found, shownCatalog })})`);
await page.screenshot({ path: shot('document-list.png') });
await page.getByTestId('document-search').fill('');

// A catalog that still holds a document is refused, in the server's words.
await page.locator(`[data-testid="document-catalog-row"][data-catalog="${first}"]`).click();
await page.getByTestId('delete-document-catalog').click();
await page.locator('dialog[open] button', { hasText: /^Delete$/ }).click();
const refusal = page.locator('dialog[open] [role="alert"]');
await refusal.waitFor({ timeout: 5_000 }).catch(() => undefined);
record(((await refusal.textContent().catch(() => '')) ?? '').includes('move or delete them'), 'a catalog holding a document is refused, saying why');
await page.locator('dialog[open] button', { hasText: /^Cancel$/ }).click();

// Deleted after a confirm.
await page.locator(`[data-testid="document-row"][data-document-id="${other}"] [data-testid="document-delete"]`).click();
await page.locator('dialog[open] button', { hasText: /^Delete$/ }).click();
await page.waitForTimeout(800);
const gone = (await gql(`query ($id: ID!) { document(id: $id) { id } }`, { id: other })).data.document;
record(gone === null && (await page.locator(`[data-testid="document-row"][data-document-id="${other}"]`).count()) === 0,
  'a document is deleted after a confirm, and leaves the list');

// Now empty, the catalog goes.
await page.getByTestId('delete-document-catalog').click();
await page.locator('dialog[open] button', { hasText: /^Delete$/ }).click();
await page.waitForTimeout(800);
record((await page.locator(`[data-testid="document-catalog-row"][data-catalog="${first}"]`).count()) === 0, 'an empty catalog is deleted');

await gql(`mutation ($id: ID!) { deleteDocument(id: $id) }`, { id: made });
await gql(`mutation ($id: ID!) { deleteDocumentCatalog(id: $id) }`, { id: secondId });
await finish(browser);
