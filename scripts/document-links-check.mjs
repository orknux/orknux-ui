/**
 * Links between documents (#662): a link shows the linked document's name as
 * it is now, after a rename; a plain click on it in the editor stays put and a
 * Ctrl+click opens that document's editor; the editor of a mentioned document
 * lists who mentions it; a click on the link in View opens the other's view;
 * the editor's Documents button puts a new link in; and deleting a mentioned
 * document warns first, naming the documents that mention it.
 *
 * Makes its own two documents and removes them.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });
const stamp = Date.now();
const make = async (name, content) =>
  (await graphql('mutation ($w: ID!, $n: String!, $d: String) { createDocument(workspaceId: $w, name: $n, content: $d) { id } }', { w: WORKSPACE, n: name, d: content ?? null }))
    .createDocument.id;
const linking = (id, name) =>
  JSON.stringify({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'See ' }, { type: 'documentLink', attrs: { document: Number(id), name } }, { type: 'text', text: ' first.' }] }],
  });

const target = await make(`zzLinked ${stamp}`);
const linker = await make(`zzLinker ${stamp}`, linking(target, `zzLinked ${stamp}`));
const RENAMED = `zzRenamed ${stamp}`;
await graphql('mutation ($id: ID!, $n: String!) { renameDocument(id: $id, name: $n) { name } }', { id: target, n: RENAMED });

const editorOf = (id) => `${BASE}/workspace/${WORKSPACE}/design/documents/${id}`;
const link = page.getByTestId('document-doc-link');

try {
  await page.goto(editorOf(linker), { waitUntil: 'domcontentloaded' });
  const drawn = await link.first().waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
  record(drawn, 'the link is drawn in the editor');
  const shown = drawn ? ((await link.first().textContent()) ?? '').trim() : '';
  record(shown === RENAMED, `it shows the linked document's current name after a rename (${shown})`);

  // And the linking document lists what it mentions, the other half of Mentioned by.
  const mentioned = await page.getByTestId('document-mentions-item').allTextContents().catch(() => []);
  record(mentioned.length === 1 && mentioned[0].trim() === RENAMED, `its editor lists the documents it mentions (${JSON.stringify(mentioned)})`);

  // Resting on a link shows what it points at, as the quick-actions palette shows a document.
  if (drawn) await link.first().hover();
  const card = page.getByTestId('document-link-card');
  const carded = await card.waitFor({ timeout: 5_000 }).then(() => true).catch(() => false);
  const said = carded ? ((await card.textContent()) ?? '') : '';
  record(carded && said.includes(RENAMED) && said.includes('Document in'), `hovering a link shows its document's name and where it is (${JSON.stringify(said.slice(0, 120))})`);
  record(said.includes('Ctrl+click to open'), `and, while editing, how to follow it (${JSON.stringify(said.slice(-40))})`);
  // Compact, in the interface's type rather than the document's.
  const size = carded ? await card.evaluate((one) => ({
    width: Math.round(one.getBoundingClientRect().width),
    name: getComputedStyle(one.querySelector('[class*="_documentLinkCardName_"]')).fontSize,
  })) : null;
  record(size !== null && size.width <= 380 && size.name === '13px', `the card is compact (${JSON.stringify(size)})`);
  const native = drawn ? await link.first().getAttribute('title') : 'none drawn';
  record(native === null, `in place of the browser's own tooltip (${native})`);
  await page.mouse.move(0, 0);

  // A plain click puts the caret there, as on any link being edited; Ctrl+click follows it.
  if (drawn) await link.first().click();
  await page.waitForTimeout(500);
  record(page.url().endsWith(`/documents/${linker}`), `a plain click in the editor stays in this document (${page.url()})`);
  if (drawn) await link.first().click({ modifiers: ['Control'] });
  const followed = await page.waitForURL((url) => url.pathname.endsWith(`/documents/${target}`), { timeout: 10_000 }).then(() => true).catch(() => false);
  record(followed, `Ctrl+click opens the linked document's editor (${page.url()})`);

  // The linked document's editor names who mentions it.
  const mentions = page.getByTestId('document-mentioned-by-item');
  await mentions.first().waitFor({ timeout: 20_000 }).catch(() => undefined);
  const named = await mentions.allTextContents();
  record(named.length === 1 && named[0].trim() === `zzLinker ${stamp}`, `its editor lists who mentions it (${JSON.stringify(named)})`);

  // In View, a single click follows the link to the other document's view.
  await page.goto(`${editorOf(linker)}/view`, { waitUntil: 'domcontentloaded' });
  await link.first().waitFor({ timeout: 20_000 }).catch(() => undefined);
  await link.first().click().catch(() => undefined);
  const viewed = await page.waitForURL((url) => url.pathname.endsWith(`/documents/${target}/view`), { timeout: 10_000 }).then(() => true).catch(() => false);
  record(viewed, `a click in View opens the linked document's view (${page.url()})`);

  // Deleting a mentioned document warns first, naming who mentions it.
  await page.goto(`${BASE}/workspace/${WORKSPACE}/design/documents`, { waitUntil: 'domcontentloaded' });
  const row = page.locator(`[data-testid="document-row"][data-document-id="${target}"]`);
  await row.waitFor({ timeout: 20_000 }).catch(() => undefined);
  await row.getByTestId('document-delete').click().catch(() => undefined);
  const warning = page.getByTestId('document-delete-mentioned');
  const warned = await warning.waitFor({ timeout: 10_000 }).then(() => true).catch(() => false);
  const says = warned ? ((await warning.textContent()) ?? '') : '';
  record(warned && says.includes(`zzLinker ${stamp}`), `deleting it warns first, naming the document that mentions it (${says})`);
  // Each name a link to that document, to look at before its link breaks.
  const mentionHref = await page.getByTestId('document-delete-mention').first().getAttribute('href').catch(() => null);
  record(mentionHref !== null && mentionHref.endsWith(`/design/documents/${linker}`), `the name is a link to it (${mentionHref})`);
  await page.keyboard.press('Escape');

  // The editor deletes too, asking the same way.
  await page.goto(editorOf(target), { waitUntil: 'domcontentloaded' });
  await page.getByTestId('document-prose').waitFor({ timeout: 20_000 }).catch(() => undefined);
  await page.getByTestId('document-delete').click({ timeout: 10_000 }).catch(() => undefined);
  const fromEditor = await page.getByTestId('document-delete-mention').first().waitFor({ timeout: 10_000 }).then(() => true).catch(() => false);
  record(fromEditor, 'the editor offers Delete, and warns the same way');
  await page.keyboard.press('Escape');

  // The editor's Documents button puts a link in, named as the document is.
  await page.goto(editorOf(linker), { waitUntil: 'domcontentloaded' });
  await link.first().waitFor({ timeout: 20_000 }).catch(() => undefined);
  await page.getByTestId('document-prose').click({ timeout: 10_000 }).catch(() => undefined);
  await page.keyboard.press('Control+End');
  await page.getByTestId('document-link-document').click({ timeout: 10_000 }).catch(() => undefined);
  await page.getByTestId('document-link-picker-search').fill(RENAMED, { timeout: 10_000 }).catch(() => undefined);
  const item = page.locator(`[data-testid="document-link-picker-item"][data-id="${target}"]`);
  const offered = await item.waitFor({ timeout: 10_000 }).then(() => true).catch(() => false);
  record(offered, 'the Documents button offers the workspace\'s documents by name');
  if (offered) await item.click();
  await page.waitForTimeout(500);
  const texts = (await link.allTextContents()).map((one) => one.trim());
  record(texts.length === 2 && texts.every((one) => one === RENAMED), `picking one puts a link to it in (${JSON.stringify(texts)})`);
} finally {
  await graphql('mutation ($id: ID!) { deleteDocument(id: $id) }', { id: linker }).catch(() => undefined);
  await graphql('mutation ($id: ID!) { deleteDocument(id: $id) }', { id: target }).catch(() => undefined);
}

await finish(browser);
