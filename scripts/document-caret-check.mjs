/**
 * A press anywhere on a document's sheet puts the caret in the text.
 *
 * The editable flow is only as tall as its words, so on an empty document it
 * was one line at the top of the sheet and a press anywhere else on the paper
 * focused nothing: typing went nowhere. Pressed on the middle of an empty
 * sheet, and below and beside the lines of a written one, and what is typed is
 * read back off the editor.
 *
 * Makes its own documents and removes them.
 */
import { BASE, WORKSPACE, open, record, finish, shot } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });
const stamp = Date.now().toString(36);
const make = async (name, content) =>
  (await graphql(
    'mutation ($w: ID!, $n: String!, $d: String) { createDocument(workspaceId: $w, name: $n, content: $d) { id } }',
    { w: WORKSPACE, n: name, d: content === undefined ? null : JSON.stringify(content) },
  )).createDocument.id;

async function openAt(id) {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/design/documents/${id}`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('document-prose').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
  return page.getByTestId('document-page').first().boundingBox();
}
const typed = () => page.getByTestId('document-prose').evaluate((prose) => [...prose.querySelectorAll('p')].map((one) => one.textContent));
const focused = () => page.evaluate(() => document.activeElement?.getAttribute('data-testid'));

// An empty document: the middle of the sheet takes the press, and the typing.
const empty = await make(`Caret empty ${stamp}`);
let sheet = await openAt(empty);
await page.mouse.click(sheet.x + sheet.width / 2, sheet.y + sheet.height / 2);
await page.keyboard.type('Typed mid-sheet');
await page.waitForTimeout(300);
record(await focused() === 'document-prose', `a press in the middle of an empty sheet focuses the editor (${await focused()})`);
let lines = await typed();
record(lines.join('|') === 'Typed mid-sheet', `and what is typed lands in the document (${JSON.stringify(lines)})`);
await page.screenshot({ path: shot('document-caret-empty.png') });

// A written one: below the last line types after it, beside a line types on that line.
const written = await make(`Caret written ${stamp}`, {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'First' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Last' }] },
  ],
});
sheet = await openAt(written);
await page.mouse.click(sheet.x + sheet.width / 2, sheet.y + 600);
await page.keyboard.type(' after');
await page.waitForTimeout(300);
lines = await typed();
record(lines.join('|') === 'First|Last after', `a press below the text types after its last line (${JSON.stringify(lines)})`);

const first = await page.getByTestId('document-prose').locator('p').first().boundingBox();
await page.mouse.click(sheet.x + sheet.width - 20, first.y + first.height / 2);
await page.keyboard.type(' beside');
await page.waitForTimeout(300);
lines = await typed();
record(lines[0] === 'First beside', `a press in the margin beside a line types at that line's end (${JSON.stringify(lines)})`);

for (const id of [empty, written]) await graphql('mutation ($id: ID!) { deleteDocument(id: $id) }', { id });
await finish(browser);
