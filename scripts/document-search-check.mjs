/**
 * Documents in Quick actions: found by a word that is only in their text, with
 * the catalog they are in and the words around where it was found, and opened
 * in the editor by choosing the row. Found by name too, as anything else is.
 *
 * Makes its own catalog and document and removes them.
 */
import { BASE, WORKSPACE, open, record, finish, shot } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });
const stamp = Date.now().toString(36);
const word = `quillwort${stamp}`;

const catalog = (await graphql('mutation ($w: ID!, $n: String!) { createDocumentCatalog(workspaceId: $w, name: $n) { id } }', { w: WORKSPACE, n: `Search ${stamp}` })).createDocumentCatalog.id;
const content = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `The survey found ${word} growing by the northern pond, and nowhere else.` }] }] };
const id = (await graphql(
  'mutation ($w: ID!, $c: ID, $n: String!, $d: String) { createDocument(workspaceId: $w, catalogId: $c, name: $n, content: $d) { id } }',
  { w: WORKSPACE, c: catalog, n: `Field notes ${stamp}`, d: JSON.stringify(content) },
)).createDocument.id;

await page.goto(`${BASE}/workspace/${WORKSPACE}/design/documents`, { waitUntil: 'domcontentloaded' });
const box = page.getByRole('combobox', { name: 'Quick actions' }).or(page.locator('input[aria-label="Quick actions"]')).first();
await box.waitFor({ timeout: 20_000 });

// By a word in the text: the row says the document, its catalog, and the words around the match.
await box.click();
await box.fill(word);
const row = page.locator('[role="option"]', { hasText: `Field notes ${stamp}` }).first();
await row.waitFor({ timeout: 8_000 }).catch(() => undefined);
const said = ((await row.textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ');
const snippet = ((await row.getByTestId('palette-snippet').textContent().catch(() => '')) ?? '').trim();
record(said.includes(`Document in Search ${stamp}`), `a word only in the text finds the document, in its catalog (${said})`);
record(snippet.includes(word) && snippet.includes('northern pond'), `with the words around where it was found (${snippet})`);
await page.screenshot({ path: shot('document-search.png') });

// Choosing it opens the document.
await row.dispatchEvent('mousedown').catch(() => undefined);
await page.waitForURL(new RegExp(`/design/documents/${id}$`), { timeout: 10_000 }).catch(() => undefined);
record(page.url().endsWith(`/design/documents/${id}`), `choosing it opens the editor (${page.url()})`);

// By name, as anything else in the workspace is.
await page.goto(`${BASE}/workspace/${WORKSPACE}/design/documents`, { waitUntil: 'domcontentloaded' });
await box.waitFor({ timeout: 20_000 });
await box.click();
await box.fill(`Field notes ${stamp}`);
const named = page.locator('[role="option"]', { hasText: `Field notes ${stamp}` });
await named.first().waitFor({ timeout: 8_000 }).catch(() => undefined);
record((await named.count()) === 1, `and by its name, once (${await named.count()})`);

await graphql('mutation ($id: ID!) { deleteDocument(id: $id) }', { id });
await graphql('mutation ($id: ID!) { deleteDocumentCatalog(id: $id) }', { id: catalog });
await finish(browser);
