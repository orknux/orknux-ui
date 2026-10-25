/**
 * The column left of a document's sheets: its headings, indented by level, to
 * jump to - the caret put in the heading and the desk scrolled to it - with the
 * section in view marked as the desk scrolls; and its highlights, each with
 * its note, a press away. The column and each of its sections fold away, and
 * stay folded after a reload.
 *
 * The desk used to centre the sheets with nothing to its left, and a long
 * document had no way round it but scrolling.
 *
 * Makes its own document and removes it.
 */
import { BASE, WORKSPACE, open, record, finish, shot } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 900 } });
const stamp = Date.now().toString(36);
const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const heading = (level, text) => ({ type: 'heading', attrs: { level }, content: [{ type: 'text', text }] });
const filler = (name) => Array.from({ length: 8 }, (_, at) => para(`${name}, paragraph ${at + 1}, long enough to fill a line of the sheet and then some more.`));
const content = {
  type: 'doc',
  content: [
    heading(1, 'Plan'),
    ...filler('Plan'),
    heading(2, 'Goals'),
    ...filler('Goals'),
    heading(3, 'Stretch goals'),
    { type: 'paragraph', content: [{ type: 'text', text: 'Reach ' }, { type: 'text', text: 'ten customers', marks: [{ type: 'note', attrs: { note: 'Too many?', id: 'outline-n1' } }] }, { type: 'text', text: ' by June.' }] },
    ...filler('Stretch'),
    heading(2, 'Risks'),
    ...filler('Risks'),
    ...filler('More risks'),
  ],
};
const id = (await graphql(
  'mutation ($w: ID!, $n: String!, $d: String) { createDocument(workspaceId: $w, name: $n, content: $d) { id } }',
  { w: WORKSPACE, n: `Outline ${stamp}`, d: JSON.stringify(content) },
)).createDocument.id;

const openIt = async () => {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/design/documents/${id}`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('document-prose').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
};
// Starts from an unfolded column, whatever the last run left.
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => ['side', 'outline', 'highlights'].forEach((one) => localStorage.removeItem(`orknux.document-editor.${one}.sieve`)));
await openIt();

const side = await page.getByTestId('document-side').boundingBox();
const sheet = await page.getByTestId('document-page').first().boundingBox();
record(side !== null && side.x + side.width <= sheet.x, `the column is left of the sheets (${JSON.stringify({ side, sheet })})`);
const items = page.getByTestId('document-outline-item');
const texts = await items.allTextContents();
record(texts.join('|') === 'Plan|Goals|Stretch goals|Risks', `it lists the headings in order (${texts.join('|')})`);
const lefts = await items.evaluateAll((all) => all.map((one) => one.getBoundingClientRect().left + parseFloat(getComputedStyle(one).paddingLeft)));
record(lefts[0] < lefts[1] && lefts[1] < lefts[2] && Math.abs(lefts[1] - lefts[3]) < 1, `indented by level (${lefts.map(Math.round).join(', ')})`);
record(await items.nth(0).getAttribute('aria-current') === 'location', 'the first section is marked at the top');

// A press on Risks: the desk scrolls it to the top and the caret is in it.
await items.nth(3).click();
await page.waitForTimeout(400);
const canvas = await page.getByTestId('document-canvas').locator('[class*="canvas"]').first().boundingBox();
const risks = await page.getByTestId('document-prose').locator('h2', { hasText: 'Risks' }).boundingBox();
record(risks.y >= canvas.y && risks.y < canvas.y + 80, `Risks is scrolled to the top of the desk (${risks.y} against ${canvas.y})`);
const caretIn = await page.evaluate(() => window.getSelection()?.anchorNode?.parentElement?.closest('h1,h2,h3')?.textContent);
record(caretIn === 'Risks', `the caret is in the heading (${caretIn})`);
record(await items.nth(3).getAttribute('aria-current') === 'location', 'and Risks is the section marked');

// Scrolled back to the stretch goals, the mark follows.
await page.getByTestId('document-prose').locator('h3').evaluate((h) => h.scrollIntoView({ block: 'start' }));
await page.waitForTimeout(400);
record(await items.nth(2).getAttribute('aria-current') === 'location', `scrolling marks the section in view (${await items.evaluateAll((all) => all.map((one) => one.getAttribute('aria-current')).join(','))})`);
await page.screenshot({ path: shot('document-outline.png') });

// The highlights, with their notes; a press selects the words.
const highlight = page.getByTestId('document-highlight-item');
record(await highlight.count() === 1 && (await highlight.first().innerText()).includes('ten customers') && (await highlight.first().innerText()).includes('Too many?'), `the highlights list the words and the note (${await highlight.first().innerText()})`);
await page.getByTestId('document-prose').evaluate((prose) => prose.closest('[class*="canvas"]').scrollTo(0, 0));
await highlight.first().click();
await page.waitForTimeout(300);
record(await page.evaluate(() => window.getSelection()?.toString()) === 'ten customers', 'a press on one selects its words');

// No nested scrollbar on the column itself.
const scrolls = await page.getByTestId('document-side').evaluate((one) => one.scrollHeight > one.clientHeight + 1 && getComputedStyle(one).overflowY !== 'visible');
record(!scrolls, 'the column does not scroll by itself');

// Folding: a section, then the column, both remembered.
await page.getByTestId('document-outline-toggle').click();
record(await page.getByTestId('document-outline').count() === 0, 'the outline folds');
await page.getByTestId('document-side-toggle').click();
const folded = await page.getByTestId('document-side').boundingBox();
record(await page.getByTestId('document-side').getAttribute('data-folded') === '' && folded.width < 60, `the column folds to a strip (${folded.width})`);
await openIt();
record(await page.getByTestId('document-side').getAttribute('data-folded') === '', 'and stays folded after a reload');
await page.getByTestId('document-side-toggle').click();
record(await page.getByTestId('document-outline').count() === 0 && await page.getByTestId('document-highlights').count() === 1, 'unfolded, the outline is still folded and the highlights open');
await page.getByTestId('document-outline-toggle').click();

await graphql('mutation ($id: ID!) { deleteDocument(id: $id) }', { id });
await finish(browser);
