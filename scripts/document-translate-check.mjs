/**
 * Translate, from the menu over a selection: a card asks the chat's model for
 * the words in the language picked - with the words around them as context -
 * shows the translation, and Replace puts it in place of the selection as one
 * step: one undo brings the original back.
 *
 * The translation is answered by the page's own network, so no model is
 * needed. Makes its own document and removes it.
 */
import { BASE, WORKSPACE, open, record, finish, shot } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 900 } });
const stamp = Date.now().toString(36);
const content = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'We ship the editor in May.' }] }] };
const id = (await graphql(
  'mutation ($w: ID!, $n: String!, $d: String) { createDocument(workspaceId: $w, name: $n, content: $d) { id } }',
  { w: WORKSPACE, n: `Translate ${stamp}`, d: JSON.stringify(content) },
)).createDocument.id;

const asked = [];
await page.route('**/graphql', async (route) => {
  const body = route.request().postDataJSON() ?? {};
  if (!String(body.query ?? '').includes('translateDocumentText')) return route.fallback();
  asked.push(body.variables);
  const answer = body.variables.language === 'de' ? 'den Editor' : 'edytor';
  return route.fulfill({ json: { data: { translateDocumentText: answer } } });
});

await page.goto(`${BASE}/workspace/${WORKSPACE}/design/documents/${id}`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('document-prose').waitFor({ timeout: 20_000 });
await page.waitForTimeout(800);
// Whatever was picked last is offered first; this check starts from the document's own default.
await page.evaluate(() => localStorage.removeItem('orknux.document-editor.translate.sieve'));

await page.getByTestId('document-prose').evaluate((prose) => {
  const text = prose.querySelector('p').firstChild;
  const at = text.textContent.indexOf('editor');
  const range = document.createRange();
  range.setStart(text, at);
  range.setEnd(text, at + 'editor'.length);
  prose.focus();
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
});
await page.getByTestId('document-selection-translate').click();
await page.getByTestId('document-translate-result').waitFor({ timeout: 8_000 });
const first = asked[0] ?? {};
record(first.text === 'editor' && first.before === 'We ship the ' && first.after === ' in May.', `the words are sent with the text around them (${JSON.stringify(first)})`);
record(first.language === 'pl', `an English document is offered Polish first (${first.language})`);
record(await page.getByTestId('document-translate-result').inputValue() === 'edytor', 'the card shows the translation');
record(await page.getByTestId('document-prose').innerText() === 'We ship the editor in May.', 'the document is not changed until Replace');
await page.screenshot({ path: shot('document-translate-card.png') });

// Another language asks again.
await page.getByTestId('document-translate-language').click();
await page.getByRole('option', { name: 'German' }).click();
await page.waitForFunction(() => document.querySelector('[data-testid="document-translate-result"]')?.value === 'den Editor', null, { timeout: 8_000 });
record(asked.at(-1)?.language === 'de', `picking German asks for German (${asked.at(-1)?.language})`);

await page.getByTestId('document-translate-replace').click();
await page.waitForTimeout(300);
record(await page.getByTestId('document-translate').count() === 0, 'Replace closes the card');
record(await page.getByTestId('document-prose').innerText() === 'We ship the den Editor in May.', `and puts the translation in place (${await page.getByTestId('document-prose').innerText()})`);
await page.keyboard.press('Control+z');
await page.waitForTimeout(300);
record(await page.getByTestId('document-prose').innerText() === 'We ship the editor in May.', `one undo brings the original back (${await page.getByTestId('document-prose').innerText()})`);

await page.unroute('**/graphql');
await page.evaluate(() => localStorage.removeItem('orknux.document-editor.translate.sieve'));
await graphql('mutation ($id: ID!) { deleteDocument(id: $id) }', { id });
await finish(browser);
