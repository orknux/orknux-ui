/**
 * While a model writes in a document: the Writing pill sits in the middle of
 * the sheet in view, and the text it may change is outlined - the whole text
 * until a save of its own shows what it changed, and then only that.
 *
 * The pill used to sit at the top of the editor's canvas, centred on the canvas
 * rather than the sheet, and scrolled away with it; nothing marked the text.
 * The model's answer is held back by the page's own network so no model is
 * needed, and its save is made through the API as the model's tool makes it.
 *
 * Makes its own document and removes it.
 */
import { BASE, WORKSPACE, open, record, finish, shot } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 900 } });
const stamp = Date.now().toString(36);
const words = (at) => `Paragraph ${at} of the writing check, long enough to fill a line or two of the sheet.`;
const content = { type: 'doc', content: Array.from({ length: 30 }, (_, at) => ({ type: 'paragraph', content: [{ type: 'text', text: words(at + 1) }] })) };
const made = await graphql(
  'mutation ($w: ID!, $n: String!, $d: String) { createDocument(workspaceId: $w, name: $n, content: $d) { id revision } }',
  { w: WORKSPACE, n: `Writing ${stamp}`, d: JSON.stringify(content) },
);
const id = made.createDocument.id;

let release = null;
await page.route('**/graphql', async (route) => {
  if (!(route.request().postData() ?? '').includes('askDocument')) return route.fallback();
  await new Promise((resolve) => (release = resolve));
  const now = (await graphql('query ($id: ID!) { document(id: $id) { id } }', { id })).document;
  return route.fallback().catch(() => undefined) ?? now;
});

await page.goto(`${BASE}/workspace/${WORKSPACE}/design/documents/${id}`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('document-prose').waitFor({ timeout: 20_000 });
await page.waitForTimeout(800);
// A model must be chosen for Send; the check only needs the request to leave.
await page.getByTestId('document-chat-input').fill('Change the fifth paragraph');
await page.getByTestId('document-chat-send').click();
await page.getByTestId('document-writing').waitFor({ timeout: 10_000 });
await page.waitForTimeout(400);

const measure = () => page.evaluate(() => {
  const box = (selector) => document.querySelector(selector)?.getBoundingClientRect();
  const pill = box('[data-testid="document-writing"]');
  const canvas = document.querySelector('[data-testid="document-paper"]')?.closest('[class*="canvas"]')?.getBoundingClientRect();
  const sheet = box('[data-testid="document-page"]');
  const area = box('[data-testid="document-writing-area"]');
  const prose = box('[data-testid="document-prose"]');
  return {
    pillX: pill && pill.left + pill.width / 2, pillY: pill && pill.top + pill.height / 2,
    sheetX: sheet && sheet.left + sheet.width / 2,
    canvasTop: canvas?.top, canvasBottom: canvas?.bottom,
    area: area && { top: area.top, bottom: area.bottom }, prose: prose && { top: prose.top, bottom: prose.bottom },
    changed: document.querySelector('[data-testid="document-writing-area"]')?.hasAttribute('data-changed'),
  };
});

let drawn = await measure();
const middle = (one) => (one.canvasTop + one.canvasBottom) / 2;
record(Math.abs(drawn.pillX - drawn.sheetX) < 2, `the Writing pill is centred on the sheet (${drawn.pillX} against ${drawn.sheetX})`);
record(Math.abs(drawn.pillY - middle(drawn)) < 4, `and in the middle of the canvas in view (${drawn.pillY} against ${middle(drawn)})`);
record(drawn.area !== undefined && drawn.area.top <= drawn.prose.top && drawn.area.bottom >= drawn.prose.bottom && !drawn.changed,
  `the whole text is outlined while nothing has changed yet (${JSON.stringify({ area: drawn.area, prose: drawn.prose })})`);
await page.screenshot({ path: shot('document-writing-whole.png') });

// Scrolled down, the pill is still in the middle of what is in view.
await page.mouse.move(700, 500);
await page.mouse.wheel(0, 600);
await page.waitForTimeout(400);
drawn = await measure();
record(Math.abs(drawn.pillY - middle(drawn)) < 4, `scrolled, the pill stays in the middle of the canvas (${drawn.pillY} against ${middle(drawn)})`);
await page.mouse.wheel(0, -600);
await page.waitForTimeout(300);

// The model saves a change to the fifth paragraph: only that is outlined.
const now = (await graphql('query ($id: ID!) { document(id: $id) { revision } }', { id })).document;
const edited = structuredClone(content);
edited.content[4] = { type: 'paragraph', content: [{ type: 'text', text: 'The fifth paragraph, as the model rewrote it.' }] };
await graphql('mutation ($id: ID!, $c: String!, $r: Int) { saveDocument(id: $id, content: $c, revision: $r) { revision } }', { id, c: JSON.stringify(edited), r: now.revision });
await page.getByTestId('document-writing-area').and(page.locator('[data-changed]')).waitFor({ timeout: 8_000 }).catch(() => undefined);
await page.waitForTimeout(500);
drawn = await measure();
const fifth = await page.getByTestId('document-prose').locator('p').nth(4).boundingBox();
record(drawn.changed === true && drawn.area.top <= fifth.y && drawn.area.bottom >= fifth.y + fifth.height && drawn.area.bottom - drawn.area.top < fifth.height + 40,
  `once the model's save arrives only the paragraph it changed is outlined (${JSON.stringify({ area: drawn.area, fifth })})`);
await page.screenshot({ path: shot('document-writing-changed.png') });

release?.();
await page.unroute('**/graphql');
await graphql('mutation ($id: ID!) { deleteDocument(id: $id) }', { id });
await finish(browser);
