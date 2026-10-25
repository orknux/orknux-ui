/**
 * The document editor's Dark page switch draws the sheets dark - dark paper,
 * light ink, and code, quotes, links and Find's marks in colours chosen for
 * it - is remembered over a reload, and turns back. It changes only how the
 * page is shown: the editor has nothing unsaved and the stored document and
 * its export are as they were.
 *
 * Makes its own document and removes it.
 */
import { BASE, WORKSPACE, open, record, finish, shot } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 950 } });
const stamp = Date.now().toString(36);
const content = JSON.stringify({
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Dark page' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Read the ' }, { type: 'text', text: 'guide', marks: [{ type: 'link', attrs: { href: 'https://example.invalid/' } }] }, { type: 'text', text: ' first.' }] },
    { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A quoted line' }] }] },
    { type: 'codeBlock', attrs: { language: 'javascript' }, content: [{ type: 'text', text: 'const answer = 42; // the one' }] },
  ],
});
const id = (await graphql('mutation ($w: ID!, $n: String!, $d: String) { createDocument(workspaceId: $w, name: $n, content: $d) { id } }', { w: WORKSPACE, n: `Dark page ${stamp}`, d: content })).createDocument.id;
const exported = async () => (await page.request.get(`${BASE}/api/documents/${id}/export/md`)).text().catch(() => null);
const before = (await graphql('query ($id: ID!) { document(id: $id) { revision content } }', { id })).document;
const exportBefore = await exported();

await page.goto(`${BASE}/workspace/${WORKSPACE}/design/documents/${id}`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('document-prose').waitFor({ timeout: 20_000 });
await page.waitForTimeout(800);

/** What the sheet is drawn in, read off what is on the screen. */
const drawn = () => page.evaluate(() => {
  const prose = document.querySelector('[data-testid="document-prose"]');
  const sheet = document.querySelector('[data-testid="document-page"]') ?? prose.closest('[data-testid="document-paper"]');
  const look = (element, property) => (element === null ? null : getComputedStyle(element)[property]);
  const light = (colour) => {
    const [r, g, b] = (colour ?? '').match(/[0-9.]+/g)?.map(Number) ?? [0, 0, 0];
    return Math.round(((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255) * 100) / 100;
  };
  const code = prose.querySelector('pre') ?? prose.querySelector('code');
  const quote = prose.querySelector('blockquote');
  const link = prose.querySelector('a');
  const desk = document.querySelector('[data-testid="document-desk"]');
  const token = (name) => getComputedStyle(desk).getPropertyValue(name).trim();
  return {
    paper: light(look(sheet, 'backgroundColor')),
    ink: light(look(prose, 'color')),
    code: light(look(code.closest('[class*="codeBlock"]') ?? code, 'backgroundColor')),
    codeText: light(look(code, 'color')),
    quote: look(quote, 'borderLeftColor'),
    link: look(link, 'color'),
    linkLight: light(look(link, 'color')),
    find: token('--document-find'),
    findActive: token('--document-find-active'),
  };
});

const switchOf = page.getByTestId('document-dark-page');
record((await switchOf.count()) === 1, 'the toolbar has a Dark page switch');
record((await switchOf.getAttribute('aria-pressed')) === 'false', 'off unless it was turned on');
const savable = await page.getByTestId('document-save').isEnabled();
const white = await drawn();
record(white.paper > 0.9 && white.ink < 0.2, `the sheet is white with dark ink to begin with (${JSON.stringify(white)})`);

await switchOf.click();
await page.waitForTimeout(300);
const dark = await drawn();
console.log(JSON.stringify({ white, dark }));
record((await switchOf.getAttribute('aria-pressed')) === 'true', 'the switch says it is on');
record(dark.paper < 0.15, `the paper is dark (${dark.paper})`);
record(dark.ink > 0.8, `the ink is light (${dark.ink})`);
record(dark.code < 0.15 && dark.code !== white.code, `a code block stands on dark ground (${dark.code}, was ${white.code})`);
record(dark.linkLight > 0.4 && dark.link !== white.link, `a link is a colour that reads on it (${dark.link}, was ${white.link})`);
record(dark.quote !== white.quote, `a quote's rule changes with it (${dark.quote}, was ${white.quote})`);
record(dark.find !== white.find && dark.findActive !== white.findActive, `Find's marks have their own colours (${dark.find}, ${dark.findActive})`);
record((await page.getByTestId('document-save').isEnabled()) === savable, `it makes nothing unsaved: Save is as it was (${savable ? 'offered' : 'not offered'})`);
await page.screenshot({ path: shot('document-dark-page.png'), clip: { x: 240, y: 60, width: 920, height: 520 } });

await page.reload({ waitUntil: 'domcontentloaded' });
await page.getByTestId('document-prose').waitFor({ timeout: 20_000 });
await page.waitForTimeout(800);
record((await drawn()).paper < 0.15 && (await page.getByTestId('document-dark-page').getAttribute('aria-pressed')) === 'true', 'it is remembered over a reload');

await page.getByTestId('document-dark-page').click();
await page.waitForTimeout(300);
record((await drawn()).paper > 0.9, 'and turned off, the sheet is white again');

const after = (await graphql('query ($id: ID!) { document(id: $id) { revision content } }', { id })).document;
record(after.revision === before.revision && after.content === before.content, `the stored document is untouched (revision ${after.revision})`);
record(exportBefore === null || (await exported()) === exportBefore, 'and so is its export');

await graphql('mutation ($id: ID!) { deleteDocument(id: $id) }', { id });
await finish(browser);
