/**
 * A document's History: every save keeps the version it replaced, whichever
 * door it came through. History in the editor's bar lists them down the right,
 * the live one on top, each with who saved it and through which door; a row
 * opens the version over the desk with what its save added and took out
 * marked, block by block and word by word; and Restore - asked about in the
 * application's own dialog, never the browser's - saves what is on screen
 * first, puts the version back as a save of its own and leaves the history
 * one row longer, with nothing deleted.
 *
 * Makes its own document and removes it.
 */
import { BASE, WORKSPACE, open, record, finish, shot } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 900 } });
const stamp = Date.now().toString(36);
const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const doc = (...blocks) => JSON.stringify({ type: 'doc', content: blocks });
let browserAsked = false;
page.on('dialog', async (asked) => {
  browserAsked = true;
  await asked.dismiss();
});

const made = (await graphql(
  'mutation ($w: ID!, $n: String!, $d: String) { createDocument(workspaceId: $w, name: $n, content: $d) { id revision } }',
  { w: WORKSPACE, n: `History ${stamp}`, d: doc(para('Alpha beta gamma.')) },
)).createDocument;
const id = made.id;
// Two more saves: one adds a word, one a paragraph.
const second = (await graphql(
  'mutation ($id: ID!, $d: String!, $r: Int) { saveDocument(id: $id, content: $d, revision: $r) { revision } }',
  { id, d: doc(para('Alpha beta gamma delta.')), r: made.revision },
)).saveDocument;
await graphql(
  'mutation ($id: ID!, $d: String!, $r: Int) { saveDocument(id: $id, content: $d, revision: $r) { revision } }',
  { id, d: doc(para('Alpha beta gamma delta.'), para('A new paragraph.')), r: second.revision },
);

await page.goto(`${BASE}/workspace/${WORKSPACE}/design/documents/${id}`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('document-prose').waitFor({ timeout: 20_000 });
await page.waitForTimeout(600);

await page.getByTestId('document-history').click();
const rows = page.getByTestId('document-version');
await rows.first().waitFor({ timeout: 8_000 }).catch(() => undefined);
record(await page.getByTestId('document-history-panel').count() === 1, 'History puts the versions down the right');
record(await rows.count() === 3, `the live one and the two it replaced (${await rows.count()})`);
record(await rows.first().getAttribute('data-version') === 'current', 'the live one on top');
record((await rows.nth(1).innerText()).includes('alice') && await rows.nth(1).getAttribute('data-door') === 'EDITOR', `each says who and which door (${await rows.nth(1).innerText()})`);

// The live version: a paragraph added.
await rows.first().click();
const view = page.getByTestId('document-version-view');
await view.waitFor({ timeout: 5_000 }).catch(() => undefined);
await page.getByTestId('document-diff-block').first().waitFor({ timeout: 5_000 }).catch(() => undefined);
const added = page.locator('[data-testid="document-diff-block"][data-diff="added"]');
record(await added.count() === 1 && (await added.first().innerText()).trim() === 'A new paragraph.', 'the live version shows the paragraph its save added');
record(await page.getByTestId('document-version-restore').count() === 0, 'and offers no Restore: it is what the document says');
const box = await view.boundingBox();
const desk = await page.getByTestId('document-canvas').boundingBox();
record(box !== null && desk !== null && box.width > 600 && box.height > 400, `the version lies over the desk (${JSON.stringify(box)})`);
await page.screenshot({ path: shot('document-history-current.png') });

// The middle one: a word added inside a paragraph, marked word by word.
await rows.nth(1).click();
await page.waitForTimeout(400);
const changed = page.locator('[data-testid="document-diff-block"][data-diff="changed"]');
record(await changed.count() === 1, 'a paragraph edited in place is one changed block');
record(
  (await changed.first().locator('[data-testid="document-diff-added"]').allInnerTexts()).join('').trim() === 'delta' &&
    (await changed.first().innerText()).replace(/\s+/g, ' ').trim() === 'Alpha beta gamma delta.',
  `with the word that came marked in the paragraph around it (${await changed.first().innerHTML()})`,
);
await page.screenshot({ path: shot('document-history-words.png') });

// The oldest: nothing older to compare with.
await rows.nth(2).click();
await page.waitForTimeout(400);
record((await page.getByTestId('document-version-counts').innerText()).length > 0 && await page.locator('[data-testid="document-diff-block"][data-diff="same"]').count() === 1, 'the oldest version is shown as it was');

// Something typed and not saved, then Restore the oldest.
await page.getByTestId('document-version-close').click();
await page.getByTestId('document-prose').click();
await page.keyboard.press('Control+End');
await page.keyboard.type(' Unsaved words.');
await page.getByTestId('document-unsaved').waitFor({ timeout: 3_000 }).catch(() => undefined);
await rows.nth(2).click();
await page.getByTestId('document-version-restore').waitFor({ timeout: 5_000 });
await page.getByTestId('document-version-restore').click();
const asking = page.locator('dialog[open]');
await asking.waitFor({ timeout: 3_000 }).catch(() => undefined);
record(await asking.count() === 1, 'Restore asks first, in the application\'s dialog');
await page.screenshot({ path: shot('document-history-restore.png') });
await asking.locator('button').last().click();
await page.waitForFunction(() => document.querySelector('[data-testid="document-version-view"]') === null, null, { timeout: 8_000 }).catch(() => undefined);
await page.waitForTimeout(800);
record((await page.getByTestId('document-prose').innerText()).trim() === 'Alpha beta gamma.', `the oldest version is on the page (${await page.getByTestId('document-prose').innerText()})`);
record(await page.getByTestId('document-unsaved').count() === 0, 'and it is saved');

const kept = (await graphql('query ($id: ID!) { componentRevisions(kind: DOCUMENT, componentId: $id, limit: 50) { door } }', { id })).componentRevisions;
const live = (await graphql('query ($id: ID!) { document(id: $id) { updatedVia plainText: excerpt } }', { id })).document;
record(kept.length === 4 && live.updatedVia === 'RESTORE', `the restore is a version of its own and nothing is deleted (${JSON.stringify({ kept, live })})`);
const newest = (await graphql('query ($id: ID!) { componentRevisions(kind: DOCUMENT, componentId: $id, limit: 1) { id } }', { id })).componentRevisions[0];
const typed = (await graphql('query ($id: ID!) { componentRevision(id: $id) { readable } }', { id: newest.id })).componentRevision.readable;
record(typed.includes('Unsaved words.'), `what was typed and not saved is kept as the version the restore replaced (${typed})`);
await page.waitForTimeout(500);
record(await rows.count() === 5 && await rows.first().getAttribute('data-door') === 'RESTORE', `the list is read again, one row longer, the live one restored (${await rows.count()})`);
await rows.first().click();
await page.getByTestId('document-diff-block').first().waitFor({ timeout: 5_000 }).catch(() => undefined);
const removed = page.locator('[data-testid="document-diff-block"][data-diff="removed"]');
record(await removed.count() === 1 && (await removed.first().innerText()).includes('A new paragraph.'), 'the restore shows the paragraph it took out');
record((await page.locator('[data-testid="document-diff-removed"]').allInnerTexts()).join('').includes('Unsaved'), 'and the words it took out of the one it kept');
await page.screenshot({ path: shot('document-history-restored.png') });
record(!browserAsked, 'the browser was never asked to confirm anything');

await graphql('mutation ($id: ID!) { deleteDocument(id: $id) }', { id });
await finish(browser);
