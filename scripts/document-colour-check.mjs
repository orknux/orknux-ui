/**
 * Words in a document can be coloured from the format bar, and the colour is
 * the document's: drawn on the sheet, kept by Save and drawn again after a
 * reload, and carried into the PDF and ODT exports.
 *
 * The editor had no way to colour text at all. A swatch is pressed with a word
 * selected and the colour is read off the drawn span, the stored content and
 * the ODT's content.xml; the PDF has to download.
 *
 * Makes its own document and removes it.
 */
import { inflateRawSync } from 'node:zlib';

import { BASE, WORKSPACE, open, record, finish, shot } from './suite/harness.mjs';

/** One file out of a zip, as text, read through its central directory - a deflated entry's local header may not say its size. */
function entry(zip, wanted) {
  let end = zip.length - 22;
  while (end >= 0 && zip.readUInt32LE(end) !== 0x06054b50) end -= 1;
  if (end < 0) return null;
  let at = zip.readUInt32LE(end + 16);
  for (let left = zip.readUInt16LE(end + 10); left > 0; left -= 1) {
    const method = zip.readUInt16LE(at + 10);
    const size = zip.readUInt32LE(at + 20);
    const nameLength = zip.readUInt16LE(at + 28);
    const skip = zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32);
    const local = zip.readUInt32LE(at + 42);
    if (zip.toString('utf8', at + 46, at + 46 + nameLength) === wanted) {
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const body = zip.subarray(start, start + size);
      return (method === 0 ? body : inflateRawSync(body)).toString('utf8');
    }
    at += 46 + nameLength + skip;
  }
  return null;
}

const { browser, context, page, graphql } = await open({ viewport: { width: 1500, height: 900 } });
const stamp = Date.now().toString(36);
const content = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Paint the warning word red.' }] }] };
const id = (await graphql(
  'mutation ($w: ID!, $n: String!, $d: String) { createDocument(workspaceId: $w, name: $n, content: $d) { id } }',
  { w: WORKSPACE, n: `Colour ${stamp}`, d: JSON.stringify(content) },
)).createDocument.id;

const openIt = async () => {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/design/documents/${id}`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('document-prose').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(600);
};
/** Selects [word] in the first paragraph by its characters, as a drag would. */
const select = (word) => page.getByTestId('document-prose').evaluate((prose, wanted) => {
  // The run holding the word: once coloured, the paragraph is several runs.
  const walker = document.createTreeWalker(prose.querySelector('p'), NodeFilter.SHOW_TEXT);
  let text = walker.nextNode();
  while (text !== null && !text.textContent.includes(wanted)) text = walker.nextNode();
  const at = text.textContent.indexOf(wanted);
  const range = document.createRange();
  range.setStart(text, at);
  range.setEnd(text, at + wanted.length);
  prose.focus();
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}, word);
const colourOf = (word) => page.getByTestId('document-prose').evaluate((prose, wanted) => {
  const span = [...prose.querySelectorAll('span[style]')].find((one) => one.textContent === wanted);
  return span === undefined ? null : getComputedStyle(span).color;
}, word);

await openIt();
record(await page.getByTestId('document-colour').isVisible(), 'the format bar has a text colour control');
await select('warning');
await page.waitForTimeout(200);
await page.getByTestId('document-colour').click();
await page.getByTestId('document-colour-menu').waitFor({ timeout: 3_000 });
await page.locator('[data-testid="document-colour-swatch"][data-colour="#c00000"]').click();
await page.waitForTimeout(300);
record(await colourOf('warning') === 'rgb(192, 0, 0)', `the selected word is drawn red on the sheet (${await colourOf('warning')})`);
record(await colourOf('Paint') === null, 'and the words around it are not');
await page.screenshot({ path: shot('document-colour.png') });

await page.getByTestId('document-save').click();
await page.getByTestId('document-unsaved').waitFor({ state: 'detached', timeout: 8_000 }).catch(() => undefined);
const stored = JSON.parse((await graphql('query ($id: ID!) { document(id: $id) { content } }', { id })).document.content);
const run = stored.content[0].content.find((one) => one.text === 'warning');
record(run?.marks?.some((mark) => mark.type === 'textStyle' && mark.attrs?.color === '#c00000'), `Save keeps the colour in the document (${JSON.stringify(run)})`);

await openIt();
record(await colourOf('warning') === 'rgb(192, 0, 0)', `after a reload the word is still red (${await colourOf('warning')})`);

// The palette's Default takes the colour off again.
await select('warning');
await page.getByTestId('document-colour').click();
await page.getByTestId('document-colour-default').click();
await page.waitForTimeout(300);
record(await colourOf('warning') === null, 'Default colour takes it off');
await page.keyboard.press('Control+z');
await page.waitForTimeout(300);

// The exports carry it.
const pdf = await context.request.get(`${BASE}/api/documents/${id}/export/pdf`);
record(pdf.ok() && (await pdf.body()).subarray(0, 4).toString() === '%PDF', `the PDF export is written (${pdf.status()})`);
const odt = await context.request.get(`${BASE}/api/documents/${id}/export/odt`);
const odtBytes = await odt.body();
const odtColour = entry(odtBytes, 'content.xml')?.includes('fo:color="#c00000"') ?? false;
record(odt.ok() && odtColour, `the ODT's content.xml holds the colour (${odt.status()})`);

await graphql('mutation ($id: ID!) { deleteDocument(id: $id) }', { id });
await finish(browser);
