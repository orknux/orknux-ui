/**
 * Code blocks in a document: typed as a fence with its language, highlighted,
 * and still Kotlin after a save and a reload; and one from the toolbar takes
 * its language from the picker.
 *
 * Asserted off what is drawn: the keyword's span is a colour of its own, not
 * the ink of the text around it, and a long line scrolls the block sideways
 * rather than wrapping.
 *
 * Makes its own document and removes it.
 */
import { BASE, WORKSPACE, open, record, finish, shot } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });
const stamp = Date.now().toString(36);

const id = (await graphql('mutation ($w: ID!, $n: String!) { createDocument(workspaceId: $w, name: $n) { id } }', { w: WORKSPACE, n: `Code ${stamp}` })).createDocument.id;
const at = `${BASE}/workspace/${WORKSPACE}/design/documents/${id}`;
await page.goto(at, { waitUntil: 'domcontentloaded' });
await page.getByTestId('document-prose').waitFor({ timeout: 20_000 });
await page.waitForTimeout(500);

await page.locator('[data-testid="document-prose"] > p').first().click();
await page.keyboard.type('```kotlin ', { delay: 20 });
await page.keyboard.type('fun main() { val greeting = "hi"; println(greeting) } // a line long enough that it would have to wrap on any page this is drawn on', { delay: 2 });
await page.waitForTimeout(400);

async function highlighted() {
  return page.evaluate(() => {
    const block = document.querySelector('[data-testid="document-code-block"]');
    const code = block?.querySelector('code');
    const keyword = code?.querySelector('.hljs-keyword');
    const pre = block?.querySelector('pre');
    return {
      language: block?.getAttribute('data-language') ?? null,
      keyword: keyword?.textContent ?? null,
      keywordColour: keyword === null || keyword === undefined ? null : getComputedStyle(keyword).color,
      ink: code === null || code === undefined ? null : getComputedStyle(code).color,
      coloured: code?.querySelectorAll('span[class^="hljs-"]').length ?? 0,
      mono: code === null || code === undefined ? null : getComputedStyle(code).fontFamily,
      scrolls: pre === null || pre === undefined ? false : pre.scrollWidth > pre.clientWidth,
      lines: pre === null || pre === undefined ? 0 : Math.round(pre.getBoundingClientRect().height),
    };
  });
}

let drawn = await highlighted();
record(drawn.language === 'kotlin' && drawn.keyword === 'fun' && drawn.coloured >= 3 && drawn.keywordColour !== drawn.ink,
  `a fence with its language makes a Kotlin block whose tokens are coloured (${JSON.stringify(drawn)})`);
record(/mono/i.test(drawn.mono ?? '') && drawn.scrolls, `in monospace, scrolled sideways rather than wrapped (${JSON.stringify({ mono: drawn.mono, scrolls: drawn.scrolls })})`);
await page.screenshot({ path: shot('document-code.png') });

await page.getByTestId('document-save').click();
await page.waitForTimeout(800);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.getByTestId('document-code-block').waitFor({ timeout: 20_000 });
await page.waitForTimeout(500);
drawn = await highlighted();
record(drawn.language === 'kotlin' && drawn.coloured >= 3, `after a reload it is Kotlin and coloured still (${JSON.stringify(drawn)})`);
const stored = JSON.parse((await graphql('query ($id: ID!) { document(id: $id) { content } }', { id })).document.content);
record(stored.content[0]?.type === 'codeBlock' && stored.content[0]?.attrs?.language === 'kotlin', `and saved as a Kotlin block (${JSON.stringify(stored.content[0]?.attrs)})`);

// The picker: the language changes, and the colours with it.
await page.getByTestId('document-code-language').first().selectOption('python');
await page.waitForTimeout(300);
const after = await page.getByTestId('document-code-block').first().getAttribute('data-language');
record(after === 'python', `the picker changes the block's language (${after})`);

await graphql('mutation ($id: ID!) { deleteDocument(id: $id) }', { id });
await finish(browser);
