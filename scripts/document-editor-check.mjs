/**
 * The document editor: the document drawn on sheets of paper, measured.
 *
 * Asserted off what is drawn - getBoundingClientRect - rather than off the
 * DOM's say-so: a sheet is as tall for its width as its paper is; a long
 * document runs onto more sheets, and no paragraph is left lying in the gap
 * between two of them; the paragraph after a page break starts at the top of
 * a new sheet; the page's settings turn and resize the sheets at once and are
 * still so after a save and a reload; a picture uploaded is drawn inside the
 * page; the chat sits where the wireframe editor's does; and Export downloads
 * the files the server writes.
 *
 * Makes its own document and wireframe and removes them.
 */
import { BASE, WORKSPACE, open, record, finish, shot } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });
const stamp = Date.now().toString(36);

const words = (at) => `Paragraph ${at} of the page check, written long enough to take a couple of lines on the sheet so that the pages fill up as a report's would.`;
const content = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: `Pages ${stamp}` }] },
    ...Array.from({ length: 40 }, (_, at) => ({ type: 'paragraph', content: [{ type: 'text', text: words(at + 1) }] })),
    { type: 'pageBreak' },
    { type: 'paragraph', content: [{ type: 'text', text: 'After the break.' }] },
  ],
};
const made = await graphql(
  'mutation ($w: ID!, $n: String!, $d: String) { createDocument(workspaceId: $w, name: $n, content: $d) { id } }',
  { w: WORKSPACE, n: `Pages ${stamp}`, d: JSON.stringify(content) },
);
const id = made.createDocument.id;
const editorAt = `${BASE}/workspace/${WORKSPACE}/design/documents/${id}`;

async function sheets() {
  return page.getByTestId('document-page').evaluateAll((all) => all.map((one) => {
    const box = one.getBoundingClientRect();
    return { top: box.top, bottom: box.bottom, width: box.width, height: box.height, left: box.left };
  }));
}

await page.goto(editorAt, { waitUntil: 'domcontentloaded' });
await page.getByTestId('document-page').first().waitFor({ timeout: 20_000 });
await page.waitForTimeout(800);

// A4: a sheet as tall for its width as the paper is.
let drawn = await sheets();
const ratio = (sheet) => sheet.height / sheet.width;
record(drawn.length > 0 && Math.abs(ratio(drawn[0]) - 297 / 210) < 0.01, `an A4 sheet is 297 by 210 (${drawn[0]?.width} x ${drawn[0]?.height})`);
record(drawn.length >= 3, `forty paragraphs and a page break take three sheets or more (${drawn.length})`);

// No paragraph lies in the gap between two sheets: each one is inside a sheet's text area.
const margin = 25 * 96 / 25.4;
const placed = await page.locator('[data-testid="document-prose"] > p').evaluateAll((all) => all.map((one) => {
  const box = one.getBoundingClientRect();
  return { top: box.top, bottom: box.bottom, text: one.textContent };
}));
const stray = placed.filter((one) => !drawn.some((sheet) => one.top >= sheet.top + margin - 2 && one.bottom <= sheet.bottom - margin + 2));
record(placed.length === 41 && stray.length === 0, `every paragraph is inside a sheet's margins (${placed.length} paragraphs, ${stray.length} astray: ${stray.slice(0, 2).map((one) => one.text?.slice(0, 20)).join(' | ')})`);

// The paragraph after the break starts at the top of a sheet of its own.
const after = placed.find((one) => one.text === 'After the break.');
const holding = after === undefined ? null : drawn.find((sheet) => after.top >= sheet.top && after.top < sheet.bottom);
record(holding !== null && holding !== undefined && Math.abs(after.top - (holding.top + margin)) < 3 && holding !== drawn[0],
  `the paragraph after a page break starts at the top of a later sheet (${JSON.stringify({ after: after?.top, sheet: holding?.top })})`);
await page.screenshot({ path: shot('document-pages.png') });

// The page's settings: landscape turns the sheets, A5 shrinks them, and both are kept.
await page.getByTestId('document-page-settings').click();
await page.getByTestId('document-orientation').selectOption('LANDSCAPE');
await page.waitForTimeout(500);
drawn = await sheets();
record(drawn.length > 0 && Math.abs(ratio(drawn[0]) - 210 / 297) < 0.01, `landscape turns the sheet on its side (${drawn[0]?.width} x ${drawn[0]?.height})`);
const wide = drawn[0]?.width ?? 0;
await page.getByTestId('document-page-size').selectOption('A5');
await page.waitForTimeout(500);
drawn = await sheets();
record(drawn.length > 0 && Math.abs(drawn[0].width / wide - 210 / 297) < 0.01 && Math.abs(ratio(drawn[0]) - 148 / 210) < 0.01,
  `A5 landscape is 210 by 148 (${drawn[0]?.width} x ${drawn[0]?.height})`);
await page.getByTestId('document-save').click();
await page.waitForTimeout(800);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.getByTestId('document-page').first().waitFor({ timeout: 20_000 });
await page.waitForTimeout(600);
drawn = await sheets();
const kept = (await graphql('query ($id: ID!) { document(id: $id) { pageSize orientation } }', { id })).document;
record(kept.pageSize === 'A5' && kept.orientation === 'LANDSCAPE' && Math.abs(ratio(drawn[0]) - 148 / 210) < 0.01,
  `the page's settings are saved, and drawn after a reload (${JSON.stringify(kept)})`);

// A picture uploaded is kept, drawn, and inside the page.
const png = await page.evaluate(() => {
  const canvas = document.createElement('canvas');
  canvas.width = 120;
  canvas.height = 80;
  const pen = canvas.getContext('2d');
  pen.fillStyle = '#c0392b';
  pen.fillRect(0, 0, 120, 80);
  return canvas.toDataURL('image/png').split(',')[1];
});
await page.locator('[data-testid="document-prose"] > h1').click();
await page.getByTestId('document-image-file').setInputFiles({ name: `red-${stamp}.png`, mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
const picture = page.locator('[data-testid="document-image"] img').first();
await picture.waitFor({ timeout: 15_000 }).catch(() => undefined);
await page.waitForFunction(() => {
  const img = document.querySelector('[data-testid="document-image"] img');
  return img !== null && img.complete && img.naturalWidth > 0;
}, null, { timeout: 15_000 }).catch(() => undefined);
const shown = await picture.evaluate((img) => ({ natural: img.naturalWidth, width: img.getBoundingClientRect().width, top: img.getBoundingClientRect().top, left: img.getBoundingClientRect().left })).catch(() => null);
drawn = await sheets();
record(shown !== null && shown.natural === 120 && shown.width > 50 && drawn.some((sheet) => shown.top >= sheet.top && shown.left >= sheet.left && shown.left < sheet.left + sheet.width),
  `an uploaded picture is drawn, from its stored bytes, on a sheet (${JSON.stringify(shown)})`);
await page.getByTestId('document-image-caption').fill('A red field');
await page.getByTestId('document-save').click();
await page.waitForTimeout(800);
const stored = JSON.parse((await graphql('query ($id: ID!) { document(id: $id) { content images } }', { id })).document.content);
const image = stored.content.find((block) => block.type === 'image');
record(image?.attrs?.caption === 'A red field' && /^DESIGN-\d+$/.test(image?.attrs?.artifact ?? '') && !String(image?.attrs?.src ?? '').startsWith('data:'),
  `the picture is saved by its artifact id, with its caption (${JSON.stringify(image?.attrs)})`);

// Export: the files the server writes, downloaded.
for (const format of ['pdf', 'odt']) {
  await page.getByTestId('document-export').click();
  const download = page.waitForEvent('download', { timeout: 20_000 }).catch(() => null);
  await page.getByTestId(`document-export-${format}`).click();
  const got = await download;
  const named = got?.suggestedFilename() ?? '';
  const failed = got === null ? 'no download' : await got.failure();
  record(named.endsWith(`.${format}`) && failed === null, `Export ${format.toUpperCase()} downloads ${named} from the server (${failed})`);
}

// The chat sits where the wireframe editor's does: the same frame, and the same panel.
async function frame(canvasId, panelId) {
  const canvas = await page.getByTestId(canvasId).boundingBox().catch(() => null);
  const panel = await page.getByTestId(panelId).boundingBox().catch(() => null);
  if (canvas === null || panel === null) return null;
  return { left: Math.round(canvas.x), right: Math.round(panel.x + panel.width), top: Math.round(Math.min(canvas.y, panel.y)), bottom: Math.round(panel.y + panel.height), panel: Math.round(panel.width), panelX: Math.round(panel.x) };
}
const writing = await frame('document-canvas', 'document-panel');
const welcome = await page.getByTestId('document-welcome').isVisible().catch(() => false);
const ideas = await page.getByTestId('document-idea').count();
const pill = await page.getByTestId('document-chat-model').isVisible().catch(() => false);
const wireframe = (await graphql('mutation ($w: ID!, $n: String!) { createWireframe(workspaceId: $w, name: $n) { id } }', { w: WORKSPACE, n: `Frame ${stamp}` })).createWireframe.id;
await page.goto(`${BASE}/workspace/${WORKSPACE}/design/wireframes/${wireframe}`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('wireframe-panel').waitFor({ timeout: 15_000 }).catch(() => undefined);
await page.waitForTimeout(400);
const sketch = await frame('wireframe-canvas', 'wireframe-panel');
const near = (a, b) => Math.abs(a - b) <= 2;
record(writing !== null && sketch !== null && ['left', 'right', 'top', 'bottom', 'panel', 'panelX'].every((side) => near(writing[side], sketch[side])),
  `the document editor's chat takes the wireframe editor's place (${JSON.stringify({ writing, sketch })})`);
record(welcome && ideas === 4 && pill, `and greets with four ideas and the model pill, as the wireframe editor's does (${JSON.stringify({ welcome, ideas, pill })})`);

await graphql('mutation ($id: ID!) { deleteWireframe(id: $id) }', { id: wireframe });
await graphql('mutation ($id: ID!) { deleteDocument(id: $id) }', { id });
await finish(browser);
