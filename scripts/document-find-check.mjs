/**
 * Find in a document, and the document's view.
 *
 * In the editor: the find keystroke opens Find instead of the browser's, every
 * match is marked across every page and counted, Enter steps to the next one
 * and scrolls it into view, Whole word leaves out the longer word, and Replace
 * all replaces. The view - reached from the editor's View - has no formatting
 * bar, no chat and nothing editable, is its own address, and finds too.
 *
 * Makes its own document and removes it.
 */
import { BASE, WORKSPACE, open, record, finish, shot } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });
const stamp = Date.now().toString(36);

const paragraph = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const content = {
  type: 'doc',
  content: [
    paragraph('An apple on the first page.'),
    paragraph('Two apples are not one apple.'),
    { type: 'pageBreak' },
    paragraph('The last apple is on the second page.'),
  ],
};
const id = (await graphql(
  'mutation ($w: ID!, $n: String!, $d: String) { createDocument(workspaceId: $w, name: $n, content: $d) { id } }',
  { w: WORKSPACE, n: `Find ${stamp}`, d: JSON.stringify(content) },
)).createDocument.id;

await page.goto(`${BASE}/workspace/${WORKSPACE}/design/documents/${id}`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('document-prose').waitFor({ timeout: 20_000 });
await page.waitForTimeout(600);

const marks = () => page.locator('.ProseMirror-search-match, .ProseMirror-active-search-match').count();
const counted = async () => ((await page.getByTestId('document-find-count').textContent().catch(() => '')) ?? '').trim();
const active = () => page.locator('.ProseMirror-active-search-match').first().boundingBox().catch(() => null);

// The keystroke opens Find, not the browser's.
await page.locator('[data-testid="document-prose"] > p').first().click();
// Find steps on from the caret, as a word processor's does: from the very start, the first match is the first.
await page.keyboard.press('Control+Home');
await page.keyboard.press('Control+f');
await page.getByTestId('document-find').waitFor({ timeout: 3_000 }).catch(() => undefined);
record(await page.getByTestId('document-find-input').evaluate((one) => one === document.activeElement).catch(() => false), 'Ctrl+F opens Find, with the box ready to type in');
await page.getByTestId('document-find-input').fill('apple');
await page.waitForTimeout(200);
record((await marks()) === 4 && (await counted()) === '4 matches', `every match is marked and counted, across both pages (${await marks()}, ${await counted()})`);
await page.getByTestId('document-find-input').press('Enter');
await page.waitForTimeout(200);
const first = await active();
record((await counted()) === '1 of 4', `Enter steps to the first (${await counted()})`);
await page.getByTestId('document-find-input').press('Enter');
await page.getByTestId('document-find-input').press('Enter');
await page.getByTestId('document-find-input').press('Enter');
await page.waitForTimeout(300);
const last = await active();
const sheets = await page.getByTestId('document-page').evaluateAll((all) => all.map((one) => { const box = one.getBoundingClientRect(); return { top: box.top, bottom: box.bottom }; }));
const viewport = page.viewportSize();
record((await counted()) === '4 of 4' && first !== null && last !== null && last.y > first.y - 1 && last.y >= 0 && last.y < (viewport?.height ?? 1000)
  && sheets.length >= 2 && last.y >= sheets[1].top,
  `and on through them to the last, on the second page, scrolled into view (${JSON.stringify({ first, last, sheets: sheets.slice(0, 2) })})`);
await page.getByTestId('document-find-input').press('Shift+Enter');
await page.waitForTimeout(200);
record((await counted()) === '3 of 4', `Shift+Enter steps back (${await counted()})`);

await page.getByTestId('document-find-whole').check();
await page.waitForTimeout(200);
record((await marks()) === 3, `Whole word leaves out "apples" (${await marks()})`);
await page.screenshot({ path: shot('document-find.png') });

await page.getByTestId('document-replace-input').fill('pear');
await page.getByTestId('document-replace-all').click();
await page.waitForTimeout(300);
const text = await page.getByTestId('document-prose').textContent();
record(text.includes('An pear on the first page.') && text.includes('Two apples are not one pear.') && !/\bapple\b/.test(text),
  `Replace all replaces every whole word, and leaves "apples" (${text})`);
await page.getByTestId('document-find-input').press('Escape');
record((await page.getByTestId('document-find').count()) === 0 && (await marks()) === 0, 'Escape closes Find and takes the marks away');

// The view: from the editor's View, at its own address, with nothing that changes the document.
await page.getByTestId('document-save').click();
await page.waitForTimeout(800);
await page.getByTestId('document-to-view').click();
await page.waitForURL(/\/design\/documents\/\d+\/view$/, { timeout: 10_000 }).catch(() => undefined);
await page.getByTestId('document-prose').waitFor({ timeout: 20_000 });
await page.waitForTimeout(500);
record(page.url().endsWith(`/design/documents/${id}/view`), `View opens the document at an address of its own (${page.url()})`);
const furniture = {
  toolbar: await page.getByTestId('document-toolbar').count(),
  panel: await page.getByTestId('document-panel').count(),
  chat: await page.getByTestId('document-chat').count(),
  save: await page.getByTestId('document-save').count(),
  editable: await page.getByTestId('document-prose').getAttribute('contenteditable'),
  pages: await page.getByTestId('document-page').count(),
};
record(furniture.toolbar === 0 && furniture.panel === 0 && furniture.chat === 0 && furniture.save === 0 && furniture.editable === 'false' && furniture.pages >= 2,
  `the view is its pages and nothing that changes them (${JSON.stringify(furniture)})`);
await page.getByTestId('document-find-open').click();
await page.getByTestId('document-find-input').fill('apple');
await page.waitForTimeout(200);
record((await marks()) === 1 && (await page.getByTestId('document-replace-input').count()) === 0, `the view finds, and does not replace (${await marks()})`);
await page.screenshot({ path: shot('document-view.png') });

// Reached from the list too.
await page.goto(`${BASE}/workspace/${WORKSPACE}/design/documents`, { waitUntil: 'domcontentloaded' });
await page.locator(`[data-testid="document-row"][data-document-id="${id}"] [data-testid="document-view"]`).click({ timeout: 15_000 }).catch(() => undefined);
await page.waitForURL(/\/view$/, { timeout: 10_000 }).catch(() => undefined);
record(page.url().endsWith(`/design/documents/${id}/view`), `the list's eye opens the view (${page.url()})`);

await graphql('mutation ($id: ID!) { deleteDocument(id: $id) }', { id });
await finish(browser);
