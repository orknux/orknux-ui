/**
 * Summarise, twice: over a selection it asks the document's chat to summarise
 * the fragment, and in the editor's top bar it asks for the whole document.
 * Both go up read-only and the answer is in the chat; the document is as it
 * was. The whole-document one saves what is on screen first, since the model
 * reads what is saved - a selection travels in the turn itself.
 *
 * The model's answer is given by the page's own network, so no model is
 * needed. Makes its own document and removes it.
 */
import { BASE, WORKSPACE, open, record, finish, shot } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 900 } });
const stamp = Date.now().toString(36);
const content = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Revenue grew by a tenth in the third quarter.' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Hiring stayed flat while costs fell.' }] },
  ],
};
const FIELDS = 'id workspaceId catalogId catalogName name pageSize orientation margins language page { widthMm heightMm marginMm } revision words excerpt images createdBy createdAt updatedBy updatedAt content';
const id = (await graphql(
  'mutation ($w: ID!, $n: String!, $d: String) { createDocument(workspaceId: $w, name: $n, content: $d) { id } }',
  { w: WORKSPACE, n: `Summarise ${stamp}`, d: JSON.stringify(content) },
)).createDocument.id;
const read = async () => (await graphql('query ($id: ID!) { document(id: $id) { revision content } }', { id })).document;

const asked = [];
await page.route('**/graphql', async (route) => {
  const body = route.request().postDataJSON() ?? {};
  if (!String(body.query ?? '').includes('askDocument')) return route.fallback();
  asked.push(body.variables);
  const now = (await graphql(`query ($id: ID!) { document(id: $id) { ${FIELDS} } }`, { id })).document;
  return route.fulfill({ json: { data: { askDocument: { answer: `Summary number ${asked.length}.`, changed: false, document: now } } } });
});

await page.goto(`${BASE}/workspace/${WORKSPACE}/design/documents/${id}`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('document-prose').waitFor({ timeout: 20_000 });
await page.waitForTimeout(800);
const before = await read();

// A fragment: the first paragraph, selected.
await page.getByTestId('document-prose').evaluate((prose) => {
  const text = prose.querySelector('p').firstChild;
  const range = document.createRange();
  range.setStart(text, 0);
  range.setEnd(text, text.textContent.length);
  prose.focus();
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
});
await page.getByTestId('document-selection-summarise').click();
await page.getByText('Summary number 1.').waitFor({ timeout: 8_000 });
let turn = asked[0]?.messages?.at(-1)?.content ?? '';
record(asked[0]?.readOnly === true, `Summarise over a selection asks read-only (${JSON.stringify(asked[0]?.readOnly)})`);
record(turn.startsWith('Summarise') && turn.includes('“Revenue grew by a tenth in the third quarter.”') && !turn.includes('Hiring'),
  `and the turn holds the fragment and only it (${JSON.stringify(turn)})`);

// The whole document, from the top bar, with a change on screen not yet saved.
const bar = page.getByTestId('document-summarise');
const barBox = await bar.boundingBox();
const save = await page.getByTestId('document-save').boundingBox();
record(barBox !== null && Math.abs(barBox.y - save.y) < 8, `Summarise is in the editor's top bar, beside Save (${JSON.stringify({ barBox, save })})`);
await page.getByTestId('document-prose').locator('p').nth(1).click();
await page.keyboard.press('End');
await page.keyboard.type(' Typed before asking.');
await page.waitForTimeout(200);
await bar.click();
await page.getByText('Summary number 2.').waitFor({ timeout: 8_000 });
turn = asked[1]?.messages?.at(-1)?.content ?? '';
record(asked[1]?.readOnly === true && turn === 'Summarise the whole document.', `the top bar asks read-only for the whole document (${JSON.stringify(asked[1])})`);
const after = await read();
record(after.content.includes('Typed before asking.'), 'what was on screen was saved first, so the model reads it');
const messages = await page.getByTestId('document-chat-message').count();
record(messages === 4, `both questions and both answers are in the chat (${messages})`);
const onPage = await page.getByTestId('document-prose').innerText();
record(onPage.includes('Revenue grew by a tenth') && !onPage.includes('Summary number'), 'the document holds no summary');
record(after.revision === before.revision + 1, `the only save was the person's own (${before.revision} -> ${after.revision})`);
await page.screenshot({ path: shot('document-summarise.png') });

await page.unroute('**/graphql');
await graphql('mutation ($id: ID!) { deleteDocument(id: $id) }', { id });
await finish(browser);
