/**
 * The documents list sorts by its columns: Name and Catalog from A, Words and
 * Updated biggest and newest first, and a second press reverses.
 *
 * Read off the rows as drawn, among three documents this check makes, so the
 * workspace's own documents around them do not matter.
 *
 * Makes its own documents and removes them.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });
const stamp = Date.now().toString(36);
const paragraph = (words) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: Array.from({ length: words }, (_, at) => `w${at}`).join(' ') }] }] });
const made = [];
for (const [name, words] of [[`Sort B ${stamp}`, 30], [`Sort A ${stamp}`, 5], [`Sort C ${stamp}`, 12]]) {
  made.push((await graphql(
    'mutation ($w: ID!, $n: String!, $d: String) { createDocument(workspaceId: $w, name: $n, content: $d) { id } }',
    { w: WORKSPACE, n: name, d: JSON.stringify(paragraph(words)) },
  )).createDocument.id);
}

// Removed however the check ends: a build without the sorting times out on the first press.
try {
await page.goto(`${BASE}/workspace/${WORKSPACE}/design/documents`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('document-row').first().waitFor({ timeout: 20_000 });
await page.waitForTimeout(500);
const ours = async () => (await page.getByTestId('document-row').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-name'))))
  .filter((name) => name?.endsWith(stamp)).map((name) => name.split(' ')[1]);
const press = async (label) => {
  // The heading's own button, by its words: the headings are drawn in capitals, which is what a name by role reads.
  await page.locator('[aria-sort] button').filter({ hasText: new RegExp(`^${label}$`, 'i') }).click();
  await page.waitForTimeout(300);
};

await press('Name');
record((await ours()).join('') === 'ABC', `Name sorts from A (${(await ours()).join('')})`);
await press('Name');
record((await ours()).join('') === 'CBA', `pressed again it reverses (${(await ours()).join('')})`);
await press('Words');
record((await ours()).join('') === 'BCA', `Words sorts the longest first (${(await ours()).join('')})`);
const sortedBy = await page.locator('[aria-sort="descending"]').textContent().catch(() => '');
record(sortedBy?.includes('Words') === true, `and its heading says it is sorted, descending (${sortedBy})`);
await press('Updated');
record((await ours()).join('') === 'CAB', `Updated sorts the newest first (${(await ours()).join('')})`);

} finally {
  for (const id of made) await graphql('mutation ($id: ID!) { deleteDocument(id: $id) }', { id });
}
await finish(browser);
