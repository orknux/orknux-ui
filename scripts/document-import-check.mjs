/**
 * Import in the document editor: a file read on the server and put on the page
 * by the editor, in place of the document or at the caret.
 *
 * Replace takes a Markdown file over the whole document - its heading drawn as
 * a heading, its bold as bold, the old words gone - and leaves it an unsaved
 * change: Save lights up, the stored document is untouched, and Undo brings
 * the old words back in one step. Insert puts a text file's words where the
 * caret is and keeps what was there. A file the server cannot read says so
 * under the button.
 *
 * Makes its own document and removes it.
 */
import { BASE, WORKSPACE, open, record, finish, shot } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });
const stamp = Date.now().toString(36);
const id = (await graphql(
  'mutation ($w: ID!, $n: String!, $d: String) { createDocument(workspaceId: $w, name: $n, content: $d) { id } }',
  {
    w: WORKSPACE,
    n: `Import ${stamp}`,
    d: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Original words' }] }] }),
  },
)).createDocument.id;

await page.goto(`${BASE}/workspace/${WORKSPACE}/design/documents/${id}`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('document-prose').waitFor({ timeout: 20_000 });
await page.waitForTimeout(800);
const prose = page.getByTestId('document-prose');
const words = () => prose.evaluate((one) => one.textContent ?? '');

/** Opens Import, chooses an item and hands the file chooser it opens a file. */
async function importing(item, file) {
  await page.getByTestId('document-import').click();
  await page.getByTestId('document-import-menu').waitFor({ timeout: 5_000 });
  const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 5_000 }), page.getByTestId(item).click()]);
  await chooser.setFiles(file);
  await page.waitForTimeout(300);
  await page.waitForFunction(() => !document.querySelector('[data-testid="document-import"]')?.textContent?.includes('…'), null, { timeout: 20_000 });
  await page.waitForTimeout(400);
}

const hasImport = (await page.getByTestId('document-import').count()) === 1;
record(hasImport, 'the toolbar has an Import menu beside Export');
if (hasImport) {
  const items = await (async () => {
    await page.getByTestId('document-import').click();
    const shown = await page.getByTestId('document-import-menu').locator('[role="menuitem"]').allTextContents();
    await page.keyboard.press('Escape');
    return shown;
  })();
  record(items.length === 2 && items.every((one) => one.length <= 30), `it offers two short items (${JSON.stringify(items)})`);

  // Replace: a Markdown file over the whole document.
  await importing('document-import-replace', {
    name: 'notes.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# Imported heading\n\nImported paragraph with **bold words**.\n\n- one\n- two\n'),
  });
  const heading = await prose.locator('h1').allTextContents();
  record(heading.join('|') === 'Imported heading', `the file's heading is drawn as a heading (${JSON.stringify(heading)})`);
  const bold = await prose.locator('strong').allTextContents();
  record(bold.join('|') === 'bold words', `its bold is bold (${JSON.stringify(bold)})`);
  record((await prose.locator('li').count()) === 2, `its list is a list (${await prose.locator('li').count()} items)`);
  record(!(await words()).includes('Original words'), 'and what the document held is gone');
  record(await page.getByTestId('document-save').isEnabled(), 'the import is an unsaved change: Save is offered');
  const stored = (await graphql('query ($id: ID!) { document(id: $id) { revision content } }', { id })).document;
  record(stored.revision === 1 && stored.content.includes('Original words'), `nothing was written to the stored document (revision ${stored.revision})`);
  await page.screenshot({ path: shot('document-import-replaced.png') });

  await page.getByTestId('document-undo').click();
  await page.waitForTimeout(400);
  const undone = await words();
  record(undone.includes('Original words') && !undone.includes('Imported heading'), `one Undo takes the import back (${JSON.stringify(undone)})`);

  // Insert: a text file's words where the caret is, after the words already there.
  const line = await prose.locator('p').first().boundingBox();
  await page.mouse.click(line.x + line.width - 4, line.y + line.height / 2);
  await page.keyboard.press('End');
  await importing('document-import-insert', { name: 'more.txt', mimeType: 'text/plain', buffer: Buffer.from('Inserted line') });
  const both = await words();
  record(both.includes('Original words') && both.includes('Inserted line'), `Insert keeps the document and adds the file at the caret (${JSON.stringify(both)})`);
  record(both.indexOf('Original words') < both.indexOf('Inserted line'), 'after the words the caret was behind');

  // A file the server cannot read is refused, under the button.
  await importing('document-import-insert', { name: 'broken.docx', mimeType: 'application/octet-stream', buffer: Buffer.from('not a word document') });
  const said = await page.getByTestId('document-import-error').textContent().catch(() => null);
  record(said !== null && said.includes('broken.docx'), `a file that cannot be read says so (${JSON.stringify(said)})`);
}

await graphql('mutation ($id: ID!) { deleteDocument(id: $id) }', { id });
await finish(browser);
