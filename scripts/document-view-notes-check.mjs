/**
 * A document's View draws its highlights' notes: hovering a highlight shows
 * its note under it, a press keeps the card open until a press elsewhere or
 * Escape, and the card only reads - no box to write in, no Remove highlight.
 * The column left of the sheets lists the highlights with their notes, and a
 * press there selects the highlighted words; nothing in the View changes the
 * document.
 *
 * The View drew the yellow and nothing else: a note written in the editor was
 * not to be read anywhere a document is sent to be read.
 *
 * Makes its own document and removes it; clears the column's remembered folds first.
 */
import { BASE, WORKSPACE, open, record, finish, shot } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 900 } });
const stamp = Date.now().toString(36);
const note = 'Ask finance for the final number';
const content = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Quarter' }] },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Check the ' },
        { type: 'text', text: 'quarterly figure', marks: [{ type: 'note', attrs: { note, id: 'view-n1' } }] },
        { type: 'text', text: ' before sending.' },
      ],
    },
  ],
};
const id = (await graphql(
  'mutation ($w: ID!, $n: String!, $d: String) { createDocument(workspaceId: $w, name: $n, content: $d) { id revision } }',
  { w: WORKSPACE, n: `View notes ${stamp}`, d: JSON.stringify(content) },
)).createDocument.id;

await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => ['side', 'outline', 'highlights'].forEach((one) => localStorage.removeItem(`orknux.document-editor.${one}.sieve`)));
await page.goto(`${BASE}/workspace/${WORKSPACE}/design/documents/${id}/view`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('document-prose').waitFor({ timeout: 20_000 });
await page.waitForTimeout(600);

const mark = page.getByTestId('document-prose').locator('mark[data-note-id]');
record(await mark.count() === 1, 'the View draws the highlight');

// Hovered: the note, under the words, read and not written.
await page.mouse.move(5, 5);
await mark.first().hover();
const card = page.getByTestId('document-note-card');
await card.waitFor({ timeout: 3_000 }).catch(() => undefined);
record(await card.count() === 1, 'hovering the highlight opens its note');
if (await card.count() === 1) {
  record((await page.getByTestId('document-note-text').textContent())?.trim() === note, `the card shows the note (${await page.getByTestId('document-note-text').textContent()})`);
  const box = await card.boundingBox();
  const under = await mark.first().boundingBox();
  record(box !== null && under !== null && box.y >= under.y + under.height - 2 && box.y <= under.y + under.height + 8, `under the highlight (${JSON.stringify({ box, under })})`);
  record(await card.locator('textarea').count() === 0, 'with no box to write in');
  record(await page.getByTestId('document-note-remove').count() === 0 && await page.getByTestId('document-note-done').count() === 0, 'and no Remove highlight or Done');
  await page.screenshot({ path: shot('document-view-note.png') });
}
await page.mouse.move(5, 5);
await page.waitForTimeout(300);
record(await card.count() === 0, 'moving away closes a card that was only hovered');

// Pressed: kept open when the pointer leaves, closed by Escape.
await mark.first().click();
await card.waitFor({ timeout: 3_000 }).catch(() => undefined);
await page.mouse.move(5, 5);
await page.waitForTimeout(300);
record(await card.count() === 1, 'a press keeps the note open when the pointer leaves');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
record(await card.count() === 0, 'Escape closes it');

// The column: the highlight with its note, a press away from its words.
const item = page.getByTestId('document-highlight-item');
record(await page.getByTestId('document-side').count() === 1 && await item.count() === 1, 'the View has the column of highlights');
if (await item.count() === 1) {
  record((await item.first().innerText()).includes(note), `the highlight lists its note (${await item.first().innerText()})`);
  await item.first().click();
  await page.waitForTimeout(200);
  // The editor's own selection: a read-only page draws none, but it is where the press took the reader.
  const selected = await page.getByTestId('document-prose').evaluate((prose) => {
    const { state } = prose.editor;
    return state.doc.textBetween(state.selection.from, state.selection.to);
  });
  record(selected === 'quarterly figure', `a press on it takes the reader to the highlighted words (${selected})`);
}
record(await page.getByTestId('document-outline-item').count() === 1, 'and the outline its heading');

// Nothing read in the View wrote anything.
const after = (await graphql('query ($id: ID!) { document(id: $id) { revision } }', { id })).document.revision;
record(after === 1, `the document is as it was (revision ${after})`);

await graphql('mutation ($id: ID!) { deleteDocument(id: $id) }', { id });
await finish(browser);
