/**
 * The wireframe editor's Export menu: HTML, SVG and PNG, each a download named
 * after the wireframe, each holding what is on the screen - saved or not.
 *
 * HTML is the server's page (`WireframeHtml`), so it has to carry the box drawn
 * here and not yet saved, and the words of the drawing escaped. SVG and PNG are
 * drawn in the browser, so what is measured is that they look like the canvas
 * once the stylesheet is gone: the SVG opened bare, with no CSS of this
 * application, still fills the primary button with the button's own colour,
 * and the PNG has that colour at that button's middle.
 *
 * Makes its own wireframe and removes it at the end.
 */
import { readFileSync } from 'node:fs';

import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 }, context: { acceptDownloads: true } });

const name = `Export check ${Date.now()}`;
const drawing = {
  elements: [
    { id: 'screen', type: 'frame', x: 0, y: 0, w: 390, h: 640, text: 'Sign in' },
    { id: 'cta', type: 'button', x: 24, y: 560, w: 342, h: 48, text: 'Continue <now> & then', props: { variant: 'primary' } },
    { id: 'mail', type: 'input', x: 24, y: 120, w: 342, h: 40, text: 'Email' },
    { id: 'go', type: 'arrow', x: 420, y: 300, w: 120, h: 0 },
  ],
};
const made = await graphql(
  `mutation ($w: ID!, $n: String!, $d: String) { createWireframe(workspaceId: $w, name: $n, document: $d) { id } }`,
  { w: WORKSPACE, n: name, d: JSON.stringify(drawing) },
);
const id = made.createWireframe.id;

await page.goto(`${BASE}/workspace/${WORKSPACE}/design/wireframes/${id}`, { waitUntil: 'domcontentloaded' });
const svg = page.getByTestId('wireframe-svg');
await svg.waitFor({ timeout: 20_000 }).catch(() => undefined);
await page.locator('[data-element-type="button"]').waitFor({ timeout: 10_000 }).catch(() => undefined);

// A box drawn and not saved: an export is what is on the screen.
const box = await svg.boundingBox();
await page.getByTestId('wireframe-tool-rect').click();
await page.mouse.move(box.x + box.width - 300, box.y + 120);
await page.mouse.down();
await page.mouse.move(box.x + box.width - 200, box.y + 180, { steps: 5 });
await page.mouse.up();
record((await page.getByTestId('wireframe-unsaved').count()) === 1, 'a box is drawn and left unsaved');

// The menu offers the three formats, one line each.
await page.getByTestId('wireframe-export').click({ timeout: 10_000 }).catch(() => undefined);
const offered = await page.getByTestId('wireframe-export-menu').getByRole('menuitem').allInnerTexts().catch(() => []);
record(JSON.stringify(offered.map((one) => one.trim())) === JSON.stringify(['HTML', 'SVG', 'PNG']), `Export offers HTML, SVG and PNG (${JSON.stringify(offered)})`);

/** Clicks one format and answers the download it caused, or null. */
async function take(format) {
  if ((await page.getByTestId('wireframe-export-menu').count()) === 0) await page.getByTestId('wireframe-export').click().catch(() => undefined);
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15_000 }).catch(() => null),
    page.getByTestId(`wireframe-export-${format}`).click({ timeout: 5_000 }).catch(() => undefined),
  ]);
  if (download === null) return null;
  const path = await download.path().catch(() => null);
  return { file: download.suggestedFilename(), bytes: path === null ? Buffer.alloc(0) : readFileSync(path) };
}

const html = await take('html');
const page_ = html?.bytes.toString('utf8') ?? '';
record(html?.file === `${name}.html`, `HTML downloads as ${name}.html (${html?.file})`);
record(page_.startsWith('<!doctype html>') && page_.includes(`<title>${name}</title>`) && !page_.includes('<script'),
  `and is a page of its own, titled after the wireframe, with no script (${page_.slice(0, 60)})`);
record(page_.includes('<button type="button" class="el button primary" data-id="cta"') && page_.includes('>Continue &lt;now&gt; &amp; then</button>'),
  'with the primary button a real button, its words escaped');
record(page_.includes('<input type="text" class="el input" data-id="mail"') && page_.includes('placeholder="Email"'), 'and the field a real input');
record(page_.includes('class="el rect"'), 'and the box drawn and not saved, since an export is what is on the screen');

const vector = await take('svg');
const picture = vector?.bytes.toString('utf8') ?? '';
record(vector?.file === `${name}.svg`, `SVG downloads as ${name}.svg (${vector?.file})`);
record(picture.includes('<svg') && picture.includes('xmlns="http://www.w3.org/2000/svg"') && !/\sclass="/.test(picture),
  'and is a standalone SVG, with nothing left pointing at this application\'s stylesheet');

// Opened bare - no stylesheet of ours - the primary button keeps its fill and the words their colour.
const bare = await browser.newPage();
await bare.setContent(`<!doctype html><body style="margin:0">${picture.replace(/^<\?xml[^>]*>\s*/, '')}</body>`);
const looks = await bare.evaluate(() => {
  const button = document.querySelector('[data-element-id="cta"] rect');
  const words = document.querySelector('[data-element-id="cta"] foreignObject div');
  return {
    fill: button === null ? null : getComputedStyle(button).fill,
    colour: words === null ? null : getComputedStyle(words).color,
    centred: words === null ? null : getComputedStyle(words).justifyContent,
  };
});
const shown = await page.evaluate(() => {
  const button = document.querySelector('[data-testid="wireframe-svg"] [data-element-id="cta"] rect');
  const words = document.querySelector('[data-testid="wireframe-svg"] [data-element-id="cta"] foreignObject div');
  return { fill: button === null ? null : getComputedStyle(button).fill, colour: words === null ? null : getComputedStyle(words).color };
});
record(looks.fill !== null && looks.fill === shown.fill && looks.colour === shown.colour && looks.centred === 'center',
  `opened bare, the SVG draws the button as the canvas does (${JSON.stringify({ looks, shown })})`);
await bare.close();

const raster = await take('png');
const bytes = raster?.bytes ?? Buffer.alloc(0);
const signature = bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
const width = signature ? bytes.readUInt32BE(16) : 0;
const height = signature ? bytes.readUInt32BE(20) : 0;
record(raster?.file === `${name}.png` && signature, `PNG downloads as ${name}.png, and is one (${raster?.file})`);
// The drawing runs from the frame's title above (0, -20) to the box drawn on the right; 24 around it, twice over.
const viewer = await browser.newPage();
const sampled = await viewer.evaluate(async (data) => {
  const image = new Image();
  image.src = `data:image/png;base64,${data}`;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  // Inside the button, left of its centred words: (40, 572) in the drawing, offset by the padding and the title above.
  const x = (40 + 24) * 2;
  const y = (572 + 20 + 24) * 2;
  return [...context.getImageData(x, y, 1, 1).data];
}, bytes.toString('base64')).catch((cause) => String(cause));
await viewer.close();
const strong = shown.fill?.match(/\d+/g)?.map(Number) ?? [];
record(width >= 2 * (390 + 48) && height >= 2 * (640 + 20 + 48),
  `the PNG is the drawing at twice its size, padding and all (${width} x ${height})`);
record(Array.isArray(sampled) && strong.length >= 3 && strong.every((one, at) => at > 2 || Math.abs(one - sampled[at]) <= 12),
  `and the primary button is the button's own colour (${JSON.stringify({ sampled, strong })})`);

await graphql(`mutation ($id: ID!) { deleteWireframe(id: $id) }`, { id });
await finish(browser);
