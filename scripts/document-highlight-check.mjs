/**
 * Highlight, from the menu over a selection: the words are marked, a card asks
 * for a note, and the highlight and its note are part of the document - kept
 * by Save and drawn again after a reload. Hovering a highlight shows its note;
 * a press on it opens the note to change, and Remove highlight takes the mark
 * off and leaves the words.
 *
 * Makes its own document and removes it.
 */
import { BASE, WORKSPACE, open, record, finish, shot } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 900 } });
const stamp = Date.now().toString(36);
const content = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Check the quarterly figure before sending.' }] }] };
const id = (await graphql(
  'mutation ($w: ID!, $n: String!, $d: String) { createDocument(workspaceId: $w, name: $n, content: $d) { id } }',
  { w: WORKSPACE, n: `Highlight ${stamp}`, d: JSON.stringify(content) },
)).createDocument.id;

const openIt = async () => {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/design/documents/${id}`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('document-prose').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(600);
};
const marks = () => page.getByTestId('document-prose').locator('mark[data-note-id]');

await openIt();
await page.getByTestId('document-prose').evaluate((prose) => {
  const text = prose.querySelector('p').firstChild;
  const at = text.textContent.indexOf('quarterly figure');
  const range = document.createRange();
  range.setStart(text, at);
  range.setEnd(text, at + 'quarterly figure'.length);
  prose.focus();
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
});
await page.getByTestId('document-selection-highlight').click();
await page.getByTestId('document-note-card').waitFor({ timeout: 3_000 });
record(await marks().count() === 1 && await marks().first().textContent() === 'quarterly figure', 'Highlight marks the selected words');
const fill = await marks().first().evaluate((mark) => getComputedStyle(mark).backgroundColor);
record(fill !== 'rgba(0, 0, 0, 0)' && fill !== 'transparent', `and draws them on a fill (${fill})`);
record(await page.evaluate(() => document.activeElement?.getAttribute('data-testid')) === 'document-note-text', 'the note card opens with its box focused');
await page.keyboard.type('Ask finance for the final number');
await page.getByTestId('document-note-done').click();
await page.waitForTimeout(300);
record(await page.getByTestId('document-note-card').count() === 0, 'Done closes the card');
record(await marks().first().getAttribute('data-note') === 'Ask finance for the final number', 'and writes the note on the highlight');
await page.screenshot({ path: shot('document-highlight.png') });

await page.getByTestId('document-save').click();
await page.getByTestId('document-unsaved').waitFor({ state: 'detached', timeout: 8_000 }).catch(() => undefined);
const stored = JSON.parse((await graphql('query ($id: ID!) { document(id: $id) { content } }', { id })).document.content);
const run = stored.content[0].content.find((one) => one.text === 'quarterly figure');
const note = run?.marks?.find((mark) => mark.type === 'note');
record(note?.attrs?.note === 'Ask finance for the final number' && typeof note?.attrs?.id === 'string', `Save keeps the highlight and its note (${JSON.stringify(run)})`);

// Reloaded: hovering shows the note, a press opens it to change.
await openIt();
record(await marks().count() === 1, 'after a reload the highlight is still drawn');
await page.mouse.move(10, 10);
await marks().first().hover();
await page.getByTestId('document-note-card').waitFor({ timeout: 3_000 });
record(await page.getByTestId('document-note-text').inputValue() === 'Ask finance for the final number', 'hovering the highlight shows its note');
const card = await page.getByTestId('document-note-card').boundingBox();
const mark = await marks().first().boundingBox();
record(card !== null && card.y >= mark.y + mark.height - 2 && card.y <= mark.y + mark.height + 8, `under the highlight (${JSON.stringify({ card, mark })})`);
await page.mouse.move(10, 10);
await page.waitForTimeout(300);
record(await page.getByTestId('document-note-card').count() === 0, 'moving away closes a card that was only hovered');

await marks().first().click();
await page.getByTestId('document-note-card').waitFor({ timeout: 3_000 });
await page.getByTestId('document-note-text').fill('Final number is in');
await page.mouse.move(10, 10);
await page.waitForTimeout(200);
record(await page.getByTestId('document-note-card').count() === 1, 'a pressed card stays open when the pointer leaves');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
record(await marks().first().getAttribute('data-note') === 'Final number is in', 'the changed note is written when the card closes');

await marks().first().click();
await page.getByTestId('document-note-remove').click();
await page.waitForTimeout(300);
record(await marks().count() === 0, 'Remove highlight takes the mark off');
record(await page.getByTestId('document-prose').innerText() === 'Check the quarterly figure before sending.', 'and leaves the words');

await graphql('mutation ($id: ID!) { deleteDocument(id: $id) }', { id });
await finish(browser);
