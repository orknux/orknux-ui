/**
 * A document link is read by the grammar check as the name the reader sees.
 *
 * It was read as one space, so "See [link] here" reached the check as "See   here"
 * and every link was underlined for repeated whitespace. The check is answered
 * here as LanguageTool answers: a run of spaces is a finding.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });
const stamp = Date.now();
const target = (await graphql('mutation ($w: ID!, $n: String!) { createDocument(workspaceId: $w, name: $n) { id } }', { w: WORKSPACE, n: `zzGrammarTarget ${stamp}` })).createDocument.id;
const content = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [
  { type: 'text', text: 'See ' },
  { type: 'documentLink', attrs: { document: Number(target), name: `zzGrammarTarget ${stamp}` } },
  { type: 'text', text: ' for the rest of it.' },
] }] });
const linker = (await graphql('mutation ($w: ID!, $n: String!, $d: String) { createDocument(workspaceId: $w, name: $n, content: $d) { id } }', { w: WORKSPACE, n: `zzGrammarLinker ${stamp}`, d: content })).createDocument.id;

const checked = [];
await page.route('**/graphql', async (route) => {
  const body = route.request().postData() ?? '';
  if (body.includes('query GrammarCheck(')) {
    const { text } = JSON.parse(body).variables;
    checked.push(text);
    const at = text.search(/ {2,}/);
    const found = at < 0 ? [] : [{ offset: at, length: 2, message: 'Possible typo: you repeated a whitespace', shortMessage: null, replacements: [' '], rule: 'WHITESPACE_RULE', spelling: false }];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { grammarCheck: found } }) });
    return;
  }
  if (body.includes('grammarSettings')) {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { grammarSettings: { pauseMillis: 300, textMost: 20000, languages: ['en', 'pl'], server: null, serverConfigured: null } } }) });
    return;
  }
  await route.continue();
});

await page.goto(`${BASE}/workspace/${WORKSPACE}/design/documents/${linker}`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('document-doc-link').first().waitFor({ timeout: 20_000 });
await page.waitForFunction(() => true);
await page.waitForTimeout(2500);
const sent = checked.find((one) => one.startsWith('See ')) ?? null;
record(sent !== null && sent.includes(`See zzGrammarTarget ${stamp} for`), `the check reads the link as its name (${JSON.stringify(sent)})`);
const marks = await page.getByTestId('document-grammar-mark').count();
record(marks === 0, `and nothing around the link is underlined (${marks})`);

await graphql('mutation ($id: ID!) { deleteDocument(id: $id) }', { id: linker }).catch(() => {});
await graphql('mutation ($id: ID!) { deleteDocument(id: $id) }', { id: target }).catch(() => {});
await finish(browser);
