/**
 * Words selected in a document offer Explain, and Explain asks the document's
 * chat about them: the turn names the words, goes up read-only - the model is
 * offered only the tools that read the document - and the answer is drawn in
 * the chat while the document stays exactly as it was, editable throughout.
 *
 * The model's answer is held by the page's own network, so no model is
 * needed; what is asserted is what the editor sent and what it drew.
 *
 * Makes its own document and removes it.
 */
import { BASE, WORKSPACE, open, record, finish, shot } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 900 } });
const stamp = Date.now().toString(36);
const words = 'The idempotent retry policy keeps the queue honest.';
const content = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: words }] }] };
const FIELDS = 'id workspaceId catalogId catalogName name pageSize orientation margins language page { widthMm heightMm marginMm } revision words excerpt images createdBy createdAt updatedBy updatedAt content';
const id = (await graphql(
  'mutation ($w: ID!, $n: String!, $d: String) { createDocument(workspaceId: $w, name: $n, content: $d) { id } }',
  { w: WORKSPACE, n: `Explain ${stamp}`, d: JSON.stringify(content) },
)).createDocument.id;
const before = (await graphql('query ($id: ID!) { document(id: $id) { revision content } }', { id })).document;

const asked = [];
let release = null;
await page.route('**/graphql', async (route) => {
  const body = route.request().postDataJSON() ?? {};
  if (!String(body.query ?? '').includes('askDocument')) return route.fallback();
  asked.push(body.variables);
  await new Promise((resolve) => (release = resolve));
  const now = (await graphql(`query ($id: ID!) { document(id: $id) { ${FIELDS} } }`, { id })).document;
  return route.fulfill({ json: { data: { askDocument: { answer: 'Idempotent means doing it twice changes nothing.', changed: false, document: now } } } });
});

await page.goto(`${BASE}/workspace/${WORKSPACE}/design/documents/${id}`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('document-prose').waitFor({ timeout: 20_000 });
await page.waitForTimeout(800);

record(await page.getByTestId('document-selection-menu').count() === 0, 'with nothing selected there is no selection menu');
await page.getByTestId('document-prose').evaluate((prose) => {
  const text = prose.querySelector('p').firstChild;
  const at = text.textContent.indexOf('idempotent');
  const range = document.createRange();
  range.setStart(text, at);
  range.setEnd(text, at + 'idempotent'.length);
  prose.focus();
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
});
await page.getByTestId('document-selection-menu').waitFor({ timeout: 3_000 });
const menu = await page.getByTestId('document-selection-menu').boundingBox();
const line = await page.getByTestId('document-prose').locator('p').first().boundingBox();
record(menu !== null && menu.y + menu.height <= line.y + 2, `selected, a menu is drawn above the line (${JSON.stringify({ menu, line })})`);
const offered = await page.getByTestId('document-selection-menu').locator('button').allTextContents();
record(['Explain', 'Summarise', 'Translate', 'Highlight'].every((one) => offered.includes(one)), `it offers Explain, Summarise, Translate and Highlight (${offered.join(', ')})`);
await page.screenshot({ path: shot('document-explain-menu.png') });

await page.getByTestId('document-selection-explain').click();
await page.waitForTimeout(400);
const sent = asked[0];
const turn = sent?.messages?.at(-1)?.content ?? '';
record(sent?.readOnly === true, `Explain asks read-only (${JSON.stringify(sent?.readOnly)})`);
record(turn.includes('“idempotent”') && turn.startsWith('Explain'), `and the turn names the words (${JSON.stringify(turn)})`);
record(await page.getByTestId('document-writing').count() === 0, 'no Writing pill is drawn over the document while it answers');
record(await page.getByTestId('document-prose').getAttribute('contenteditable') === 'true', 'and the document stays editable');

release?.();
await page.getByText('Idempotent means doing it twice changes nothing.').waitFor({ timeout: 8_000 });
const messages = await page.getByTestId('document-chat-message').evaluateAll((all) => all.map((one) => ({ role: one.getAttribute('data-role'), text: one.textContent })));
record(messages.length === 2 && messages[0].role === 'user' && messages[1].role === 'assistant', `the question and the answer are in the chat (${JSON.stringify(messages)})`);
const after = (await graphql('query ($id: ID!) { document(id: $id) { revision content } }', { id })).document;
const onPage = await page.getByTestId('document-prose').innerText();
record(after.revision === before.revision && after.content === before.content && onPage.trim() === words, `the document is unchanged (${before.revision} -> ${after.revision}, ${JSON.stringify(onPage)})`);
record(await page.getByTestId('document-unsaved').count() === 0, 'and nothing is waiting to be saved');
await page.screenshot({ path: shot('document-explain-answer.png') });

await page.unroute('**/graphql');
await graphql('mutation ($id: ID!) { deleteDocument(id: $id) }', { id });
await finish(browser);
