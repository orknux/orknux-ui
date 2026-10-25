/**
 * Import in the wireframe editor, as the image editor's: a picture from a
 * file, one already in Orknux, and an SVG the editor exported.
 *
 * Each is placed as an image element that draws the picture - not the
 * placeholder's cross - inside the frame, made smaller to fit it with its
 * shape kept, as one step Undo takes back. Measured off what is drawn: the
 * picture's box against the frame's, and its width against its height.
 *
 * Makes its own wireframe and removes it; the pictures it brings in stay in
 * Design, as any imported picture does.
 */
import { BASE, WORKSPACE, open, record, finish, shot } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });
const stamp = Date.now().toString(36);
const frame = { id: 'screen', type: 'frame', x: 0, y: 0, w: 400, h: 300, text: 'Screen' };
const id = (await graphql(
  'mutation ($w: ID!, $n: String!, $d: String) { createWireframe(workspaceId: $w, name: $n, document: $d) { id } }',
  { w: WORKSPACE, n: `Import ${stamp}`, d: JSON.stringify({ elements: [frame] }) },
)).createWireframe.id;

await page.goto(`${BASE}/workspace/${WORKSPACE}/design/wireframes/${id}`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('wireframe-svg').waitFor({ timeout: 20_000 });
await page.waitForTimeout(800);

/** A PNG 800 by 400 - wider than the frame and twice as wide as it is tall - drawn by the browser. */
const png = Buffer.from(
  (await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 400;
    const pen = canvas.getContext('2d');
    pen.fillStyle = '#c0392b';
    pen.fillRect(0, 0, 800, 400);
    return canvas.toDataURL('image/png');
  })).split(',')[1],
  'base64',
);
const svg = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect width="200" height="200" fill="#2e86c1"/>' +
    '<foreignObject x="0" y="0" width="200" height="200"><div xmlns="http://www.w3.org/1999/xhtml">Words</div></foreignObject></svg>',
);

const pictures = page.getByTestId('wireframe-picture');
const frameBox = () => page.locator('[data-element-id="screen"] rect').last().boundingBox();

async function fromFile(file) {
  await page.getByTestId('wireframe-import').click();
  await page.getByTestId('wireframe-import-menu').waitFor({ timeout: 5_000 });
  const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 5_000 }), page.getByTestId('wireframe-import-from-file').click()]);
  await chooser.setFiles(file);
}

/** Inside the frame, and as wide for its height as the picture is. */
async function fits(at, ratio, what) {
  const box = await pictures.nth(at).boundingBox();
  const outer = await frameBox();
  const inside = box !== null && outer !== null && box.x >= outer.x - 1 && box.y >= outer.y - 1 &&
    box.x + box.width <= outer.x + outer.width + 1 && box.y + box.height <= outer.y + outer.height + 1;
  record(inside, `${what} is placed inside the frame (${JSON.stringify(box)} in ${JSON.stringify(outer)})`);
  const drawn = box === null ? 0 : box.width / box.height;
  record(Math.abs(drawn - ratio) < 0.05, `and keeps its shape (${drawn.toFixed(3)}, ${ratio} wanted)`);
}

const hasImport = (await page.getByTestId('wireframe-import').count()) === 1;
record(hasImport, 'the toolbar has an Import menu beside Export');
if (hasImport) {
  await fromFile({ name: 'banner.png', mimeType: 'image/png', buffer: png });
  await pictures.first().waitFor({ timeout: 20_000 }).catch(() => undefined);
  record((await pictures.count()) === 1, `a picture from a file is drawn on the wireframe (${await pictures.count()})`);
  if ((await pictures.count()) === 1) await fits(0, 2, 'it');
  const href = await pictures.first().getAttribute('href').catch(() => null);
  const loaded = href === null ? false : await page.evaluate(async (address) => {
    const answer = await fetch(address);
    return answer.ok && (answer.headers.get('content-type') ?? '').startsWith('image/');
  }, href);
  record(loaded, `drawn from the workspace's pictures (${href})`);
  record(await page.getByTestId('wireframe-save').isEnabled(), 'an unsaved change: Save is offered');
  await page.screenshot({ path: shot('wireframe-import-file.png') });

  await page.getByTestId('wireframe-undo').click();
  await page.waitForTimeout(300);
  record((await pictures.count()) === 0, 'one Undo takes it off');

  // One already in Orknux, chosen off Artifacts.
  await page.getByTestId('wireframe-import').click();
  await page.getByTestId('wireframe-import-from-orknux').click();
  await page.getByTestId('picture-picker-item').first().waitFor({ timeout: 20_000 });
  await page.getByTestId('picture-picker-item').first().click();
  await pictures.first().waitFor({ timeout: 20_000 }).catch(() => undefined);
  record((await pictures.count()) === 1, `a picture from Orknux is drawn on the wireframe (${await pictures.count()})`);

  // An SVG, drawn as a picture.
  await fromFile({ name: 'drawing.svg', mimeType: 'image/svg+xml', buffer: svg });
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="wireframe-picture"]').length === 2, null, { timeout: 20_000 }).catch(() => undefined);
  record((await pictures.count()) === 2, `an SVG is placed as a picture (${await pictures.count()} pictures)`);
  if ((await pictures.count()) === 2) await fits(1, 1, 'the SVG');
  const error = await page.getByTestId('wireframe-import-error').count();
  record(error === 0, 'and nothing was refused');
  await page.screenshot({ path: shot('wireframe-import-svg.png') });
}

await graphql('mutation ($id: ID!) { deleteWireframe(id: $id) }', { id });
await finish(browser);
