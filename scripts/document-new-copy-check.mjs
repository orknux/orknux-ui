/**
 * New and Save as copy in the document editor's bar, each asked about first in
 * the application's own dialog. Cancel does nothing; Continue on Save as copy
 * makes a document of what is on screen - unsaved words included - opens it,
 * and leaves the one it was made from as it was last saved; Continue on New
 * makes an empty document in the same catalog and opens it.
 *
 * Makes its own document; removes it, the copy and the new one.
 */
import { BASE, WORKSPACE, open, record, finish, shot } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 900 } });
let browserAsked = false;
page.on('dialog', async (asked) => {
  browserAsked = true;
  await asked.dismiss();
});
const stamp = Date.now().toString(36);
const name = `Copy source ${stamp}`;
const content = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Saved words.' }] }] };
const made = (await graphql(
  'mutation ($w: ID!, $n: String!, $d: String) { createDocument(workspaceId: $w, name: $n, content: $d) { id catalogId } }',
  { w: WORKSPACE, n: name, d: JSON.stringify(content) },
)).createDocument;
const kept = [made.id];
const documentOf = async (id) => (await graphql('query ($id: ID!) { document(id: $id) { id name catalogId content } }', { id })).document;
const idInAddress = () => new URL(page.url()).pathname.match(/\/design\/documents\/([^/]+)$/)?.[1] ?? null;
const asking = page.locator('dialog[open]');

/*
 * The documents whose saves are refused, so words typed into them stay unsaved.
 * Since #683 the editor saves as it goes, and the dialogs this checks are the
 * ones that guard words not yet saved: a save that fails leaves them so, as a
 * dropped connection would. Only the editor's saves of these ids are refused -
 * the copy Save as copy writes is another document, and goes through.
 */
const frozen = new Set();
await page.route('**/graphql', async (route) => {
  const asked = (() => {
    try {
      return JSON.parse(route.request().postData() ?? '{}');
    } catch {
      return {};
    }
  })();
  if (String(asked.query ?? '').includes('saveDocument(') && frozen.has(String(asked.variables?.id))) return route.abort();
  return route.continue();
});

try {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/design/documents/${made.id}`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('document-prose').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(600);

  const copyButton = page.getByTestId('document-save-copy');
  const newButton = page.getByTestId('document-new');
  record(await copyButton.count() === 1 && await newButton.count() === 1, 'the bar has New and Save as copy');
  if (await copyButton.count() === 1 && await newButton.count() === 1) {
    const bar = await page.getByTestId('document-save').boundingBox();
    const copyBox = await copyButton.boundingBox();
    record(bar !== null && copyBox !== null && copyBox.x < bar.x && Math.abs(copyBox.y - bar.y) < 4, `beside Save, on its line (${JSON.stringify({ copyBox, bar })})`);

    // Nothing unsaved: New is not asked about - there is nothing to lose - and opens an empty document at once.
    await newButton.click();
    await page.waitForFunction((was) => !window.location.pathname.endsWith(`/${was}`), made.id, { timeout: 10_000 }).catch(() => undefined);
    const straight = idInAddress();
    if (straight !== null && straight !== made.id) kept.push(straight);
    record(browserAsked === false && straight !== null && straight !== made.id, `New on a saved document asks nothing and opens a new one (${page.url()})`);
    await page.goto(`${BASE}/workspace/${WORKSPACE}/design/documents/${made.id}`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('document-prose').waitFor({ timeout: 20_000 });
    await page.waitForTimeout(600);

    // Unsaved words, then Save as copy: asked first, and Cancel does nothing.
    frozen.add(String(made.id));
    await page.getByTestId('document-prose').click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type(' Unsaved words.');
    await page.getByTestId('document-unsaved').waitFor({ timeout: 3_000 }).catch(() => undefined);
    await copyButton.click();
    await asking.waitFor({ timeout: 3_000 }).catch(() => undefined);
    record(await asking.count() === 1, 'Save as copy asks first, in the application\'s dialog');
    const said = (await asking.innerText()).replace(/\s+/g, ' ');
    record(said.includes('last saved') && said.includes(name), `and says the copy is of what is on screen and this one stays as last saved (${said})`);
    await page.screenshot({ path: shot('document-copy-asked.png') });
    await asking.locator('button').first().click();
    await page.waitForTimeout(400);
    record(await asking.count() === 0 && idInAddress() === made.id, 'Cancel closes it and stays on the document');

    // Continue: the copy is made of what is on screen, and opened.
    await copyButton.click();
    await asking.waitFor({ timeout: 3_000 }).catch(() => undefined);
    await asking.locator('button').last().click();
    await page.waitForFunction((was) => !window.location.pathname.endsWith(`/${was}`), made.id, { timeout: 10_000 }).catch(() => undefined);
    const copyId = idInAddress();
    if (copyId !== null && copyId !== made.id) kept.push(copyId);
    record(copyId !== null && copyId !== made.id, `Continue opens another document (${page.url()})`);
    await page.getByTestId('document-prose').waitFor({ timeout: 20_000 });
    await page.waitForTimeout(800);
    const onScreen = (await page.getByTestId('document-prose').innerText()).trim();
    record(onScreen === 'Saved words. Unsaved words.', `the copy holds what was on screen, unsaved words included (${onScreen})`);
    record((await page.getByTestId('document-title').innerText()).trim() === `${name} (copy)`, `named after the original (${await page.getByTestId('document-title').innerText()})`);
    record(await page.getByTestId('document-unsaved').count() === 0, 'and is saved');
    await page.screenshot({ path: shot('document-copy-opened.png') });
    if (copyId !== null && copyId !== made.id) {
      const copy = await documentOf(copyId);
      record(copy.content.includes('Unsaved words.') && copy.catalogId === made.catalogId, 'the server holds the copy in the same catalog');
    }
    const original = await documentOf(made.id);
    record(!original.content.includes('Unsaved words.') && original.content.includes('Saved words.'), `the original stays as it was last saved (${original.content})`);

    // New, from the copy with words not saved: asked first, says they are lost, then an empty document opened.
    const before = idInAddress();
    frozen.add(String(before));
    await page.getByTestId('document-prose').click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type(' Not kept.');
    await page.getByTestId('document-unsaved').waitFor({ timeout: 3_000 }).catch(() => undefined);
    await newButton.click();
    await asking.waitFor({ timeout: 3_000 }).catch(() => undefined);
    record(await asking.count() === 1, 'New asks first, in the application\'s dialog');
    const newSaid = (await asking.innerText()).replace(/\s+/g, ' ');
    record(newSaid.includes('new empty document') && newSaid.includes('not saved'), `and says a new empty document opens and what is not saved is lost (${newSaid})`);
    await page.screenshot({ path: shot('document-new-asked.png') });
    await asking.locator('button').last().click();
    await page.waitForFunction((was) => !window.location.pathname.endsWith(`/${was}`), before, { timeout: 10_000 }).catch(() => undefined);
    const newId = idInAddress();
    if (newId !== null && newId !== before && !kept.includes(newId)) kept.push(newId);
    record(newId !== null && newId !== before, `Continue opens a new document (${page.url()})`);
    await page.getByTestId('document-prose').waitFor({ timeout: 20_000 });
    await page.waitForTimeout(800);
    record((await page.getByTestId('document-prose').innerText()).trim() === '', 'and it is empty');
    if (newId !== null && newId !== before) record((await documentOf(newId)).catalogId === made.catalogId, 'in the same catalog');
    await page.screenshot({ path: shot('document-new-opened.png') });
    record(!browserAsked, 'the browser was never asked to confirm anything');
  }
} finally {
  for (const id of kept) await graphql('mutation ($id: ID!) { deleteDocument(id: $id) }', { id }).catch(() => undefined);
}
await finish(browser);
