/**
 * How a wireframe element looks: the panel's Style section gives the
 * selection a background - a colour, or a linear gradient of stops at an
 * angle - the colour of its words, a border and a shadow, to every element
 * selected at once. Each is measured off what the canvas draws
 * (getComputedStyle on the shape, the gradient's own stops), dragging a colour
 * is one step undo goes back over, and the style is kept by Save, drawn on the
 * list's thumbnail, in the exported SVG opened with no stylesheet of ours, and
 * as CSS in the HTML export.
 *
 * Makes its own wireframe and removes it at the end.
 */
import { saveEditor } from './suite/harness.mjs';
import { readFileSync } from 'node:fs';

import { BASE, WORKSPACE, open, record, finish, shot } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 }, context: { acceptDownloads: true } });

const name = `Style check ${Date.now()}`;
const made = await graphql(
  `mutation ($w: ID!, $n: String!, $d: String) { createWireframe(workspaceId: $w, name: $n, document: $d) { id } }`,
  {
    w: WORKSPACE,
    n: name,
    d: JSON.stringify({
      elements: [
        { id: 'card', type: 'rect', x: 0, y: 0, w: 240, h: 120, text: 'Card' },
        { id: 'go', type: 'button', x: 0, y: 160, w: 160, h: 44, text: 'Continue' },
      ],
    }),
  },
);
const id = made.createWireframe.id;

await page.goto(`${BASE}/workspace/${WORKSPACE}/design/wireframes/${id}`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('wireframe-svg').waitFor({ timeout: 20_000 }).catch(() => undefined);
await page.locator('[data-element-id="card"]').waitFor({ timeout: 10_000 }).catch(() => undefined);
await page.waitForTimeout(300);

/** What the canvas draws for one element: its box's paint, and the colour of its words. */
async function looks(element) {
  return page.locator(`[data-testid="wireframe-svg"] [data-element-id="${element}"]`).evaluate((one) => {
    const box = one.querySelector(':scope > rect');
    const words = one.querySelector('foreignObject div');
    const style = getComputedStyle(box);
    const paint = style.fill.match(/url\("?#([^")]+)"?\)/)?.[1] ?? null;
    const gradient = paint === null ? null : document.getElementById(paint);
    return {
      fill: style.fill,
      stops: gradient === null ? null : [...gradient.querySelectorAll('stop')].map((stop) => ({ at: stop.getAttribute('offset'), colour: getComputedStyle(stop).stopColor })),
      stroke: style.stroke,
      strokeWidth: style.strokeWidth,
      dashes: style.strokeDasharray,
      filter: style.filter,
      rx: box.getAttribute('rx'),
      colour: words === null ? null : getComputedStyle(words).color,
    };
  });
}

const card = (await page.locator('[data-element-id="card"] rect').first().boundingBox({ timeout: 5_000 }).catch(() => null)) ?? { x: 0, y: 0, width: 0, height: 0 };
await page.mouse.click(card.x + card.width / 2, card.y + 20);
await page.getByTestId('wireframe-style').waitFor({ timeout: 5_000 }).catch(() => undefined);
const before = await looks('card');
record((await page.getByTestId('wireframe-style').count()) === 1 && before.stops === null, `selecting a box shows its Style, and it is drawn plain (${JSON.stringify(before)})`);

// A solid colour, then a gradient from it.
await page.getByTestId('wireframe-style-fill').selectOption('solid', { timeout: 5_000 }).catch(() => undefined);
await page.getByTestId('wireframe-style-fill-colour').fill('#ff8800', { timeout: 5_000 }).catch(() => undefined);
await page.waitForTimeout(100);
const solid = await looks('card');
record(solid.fill === 'rgb(255, 136, 0)', `a solid fill paints the box (${solid.fill})`);
await page.getByTestId('wireframe-style-fill').selectOption('gradient', { timeout: 5_000 }).catch(() => undefined);
await page.getByTestId('wireframe-style-stop-colour-1').fill('#0000ff', { timeout: 5_000 }).catch(() => undefined);
await page.getByTestId('wireframe-style-angle').fill('90', { timeout: 5_000 }).catch(() => undefined);
await page.getByTestId('wireframe-style-stop-add').click({ timeout: 5_000 }).catch(() => undefined);
await page.getByTestId('wireframe-style-stop-colour-2').fill('#00ff00', { timeout: 5_000 }).catch(() => undefined);
await page.getByTestId('wireframe-style-stop-at-1').fill('40', { timeout: 5_000 }).catch(() => undefined);
await page.waitForTimeout(100);
const gradient = await looks('card');
const line = await page.locator('[data-element-id="card"] linearGradient').evaluate((one) => ['x1', 'y1', 'x2', 'y2'].map((side) => Number(one.getAttribute(side)))).catch(() => null);
record(gradient.stops !== null && JSON.stringify(gradient.stops) === JSON.stringify([
  { at: '0%', colour: 'rgb(255, 136, 0)' }, { at: '40%', colour: 'rgb(0, 0, 255)' }, { at: '100%', colour: 'rgb(0, 255, 0)' },
]), `a gradient paints the box with its three stops, in order (${JSON.stringify(gradient)})`);
// At 90 degrees it runs left to right across the box, as CSS draws it.
const at = (value, want) => Math.abs(value - want) < 0.01;
record(line !== null && at(line[0], 0) && at(line[2], 240) && at(line[1], 60) && at(line[3], 60), `at 90 degrees it runs from the left edge to the right (${JSON.stringify(line)})`);

// A border and a shadow.
await page.getByTestId('wireframe-style-border-width').fill('3', { timeout: 5_000 }).catch(() => undefined);
await page.getByTestId('wireframe-style-border-style').selectOption('dashed', { timeout: 5_000 }).catch(() => undefined);
await page.getByTestId('wireframe-style-border-colour').fill('#112233', { timeout: 5_000 }).catch(() => undefined);
await page.getByTestId('wireframe-style-radius').fill('20', { timeout: 5_000 }).catch(() => undefined);
await page.getByTestId('wireframe-style-shadow').selectOption('medium', { timeout: 5_000 }).catch(() => undefined);
await page.waitForTimeout(100);
const bordered = await looks('card');
record(bordered.stroke === 'rgb(17, 34, 51)' && bordered.strokeWidth === '3px' && /^9(px)?,? 6(px)?$/.test(bordered.dashes) && bordered.rx === '20',
  `a dashed border three pixels wide in its colour, and rounder corners (${JSON.stringify(bordered)})`);
record(/url\(/.test(bordered.filter), `and a shadow under it (${bordered.filter})`);

// Undo goes back one style at a time; a dragged colour is one step.
await page.getByTestId('wireframe-undo').click({ timeout: 5_000 }).catch(() => undefined);
await page.waitForTimeout(100);
const unshadowed = await looks('card');
record(unshadowed.filter === 'none' && unshadowed.rx === '20', `undo takes the shadow back and leaves the rest (${JSON.stringify(unshadowed)})`);
await page.getByTestId('wireframe-redo').click({ timeout: 5_000 }).catch(() => undefined);
const colour = page.getByTestId('wireframe-style-border-colour');
for (const step of ['#223344', '#334455', '#445566']) await colour.fill(step, { timeout: 5_000 }).catch(() => undefined);
await page.getByTestId('wireframe-undo').click({ timeout: 5_000 }).catch(() => undefined);
await page.waitForTimeout(100);
record((await looks('card')).stroke === 'rgb(17, 34, 51)', 'three colours in a row are one step to undo');
await page.getByTestId('wireframe-redo').click({ timeout: 5_000 }).catch(() => undefined);
await page.waitForTimeout(100);
record((await looks('card')).stroke === 'rgb(68, 85, 102)', 'and redo brings back the last of them');

// Two selected: the text colour goes on both.
const button = (await page.locator('[data-element-id="go"] rect').first().boundingBox({ timeout: 5_000 }).catch(() => null)) ?? { x: 0, y: 0, width: 0, height: 0 };
await page.keyboard.down('Shift');
await page.mouse.click(button.x + 10, button.y + 10);
await page.keyboard.up('Shift');
await page.waitForTimeout(100);
await page.getByTestId('wireframe-style-color').fill('#cc0000', { timeout: 5_000 }).catch(() => undefined);
await page.waitForTimeout(100);
const both = [await looks('card'), await looks('go')];
record(both.every((one) => one.colour === 'rgb(204, 0, 0)'), `with two selected, the text colour goes on both (${both.map((one) => one.colour)})`);
record(both[1].stops === null, 'and nothing else is put on the second');
await page.screenshot({ path: shot('wireframe-style.png') });

// Saved and reloaded, it is drawn the same.
await saveEditor(page, 'wireframe-save');
await page.waitForTimeout(800);
const stored = JSON.parse((await graphql(`query ($id: ID!) { wireframe(id: $id) { document } }`, { id })).wireframe.document).elements;
const props = stored.find((one) => one.id === 'card')?.props ?? {};
record(props.fill === 'linear-gradient(90deg, #ff8800 0%, #0000ff 40%, #00ff00 100%)' && props.shadow === 'medium' && props.borderStyle === 'dashed' && props.borderColor === '#445566' && props.color === '#cc0000',
  `Save keeps the style in its one spelling (${JSON.stringify(props)})`);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.locator('[data-element-id="card"]').waitFor({ timeout: 15_000 }).catch(() => undefined);
await page.waitForTimeout(300);
const reloaded = await looks('card');
record(JSON.stringify(reloaded.stops) === JSON.stringify(gradient.stops) && reloaded.stroke === 'rgb(68, 85, 102)' && /url\(/.test(reloaded.filter),
  `after a reload it is drawn the same (${JSON.stringify(reloaded)})`);

// The HTML export says it as CSS.
const html = (await graphql(`mutation ($id: ID!) { exportWireframeHtml(id: $id) }`, { id })).exportWireframeHtml;
record(html.includes('background:linear-gradient(90deg, #ff8800 0%, #0000ff 40%, #00ff00 100%);color:#cc0000;border:3px dashed #445566;border-radius:20px;box-shadow:'),
  'the HTML export carries it as CSS');

// The SVG export, opened with no stylesheet of ours, still paints the gradient and the shadow.
await page.getByTestId('wireframe-export').click({ timeout: 5_000 }).catch(() => undefined);
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 15_000 }).catch(() => null),
  page.getByTestId('wireframe-export-svg').click({ timeout: 5_000 }).catch(() => undefined),
]);
const path = download === null ? null : await download.path().catch(() => null);
const picture = path === null ? '' : readFileSync(path, 'utf8');
const bare = await browser.newPage();
await bare.setContent(`<!doctype html><body style="margin:0">${picture.replace(/^<\?xml[^>]*>\s*/, '')}</body>`);
const exported = await bare.evaluate(() => {
  const box = document.querySelector('[data-element-id="card"] > rect');
  if (box === null) return null;
  const style = getComputedStyle(box);
  const paint = style.fill.match(/url\("?#([^")]+)"?\)/)?.[1] ?? null;
  return { stops: paint === null ? 0 : document.getElementById(paint)?.querySelectorAll('stop').length ?? 0, filter: style.filter, stroke: style.stroke };
});
await bare.close();
record(exported !== null && exported.stops === 3 && /url\(/.test(exported.filter) && exported.stroke === 'rgb(68, 85, 102)',
  `the SVG export draws the gradient, the shadow and the border with no stylesheet (${JSON.stringify(exported)})`);

// And the list's thumbnail.
await page.goto(`${BASE}/workspace/${WORKSPACE}/design/wireframes`, { waitUntil: 'domcontentloaded' });
const card_ = page.locator(`[data-testid="wireframe-card"][data-wireframe-id="${id}"]`);
await card_.waitFor({ timeout: 15_000 }).catch(() => undefined);
const thumb = await card_.evaluate((one) => {
  const box = one.querySelector('svg [data-element-id="card"] > rect');
  if (box === null) return null;
  const paint = getComputedStyle(box).fill.match(/url\("?#([^")]+)"?\)/)?.[1] ?? null;
  return paint === null ? 0 : document.getElementById(paint)?.querySelectorAll('stop').length ?? 0;
}).catch(() => null);
record(thumb === 3, `the list's thumbnail paints the gradient (${thumb})`);

await graphql(`mutation ($id: ID!) { deleteWireframe(id: $id) }`, { id });
await finish(browser);
