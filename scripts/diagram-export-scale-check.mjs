/**
 * A diagram's PNG from the editor's Export menu is drawn at a scale - 1×, 2× or
 * 3× its drawn size, 2× unless another is picked - and is that many pixels
 * wide. It used to be held to the chat picture's 1600 pixels, so a wide
 * diagram came out smaller than it was drawn. The SVG beside it is vector: the
 * shapes and words themselves, no picture inside it.
 *
 * The diagram is wider than 800 pixels on purpose: below that, twice its size
 * was under the old ceiling and the check could not tell the two apart.
 *
 * Makes its own diagram and removes it.
 */
import { BASE, WORKSPACE, open, record, finish, shot } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 900 } });
const stamp = Date.now().toString(36);
const nodes = Array.from({ length: 8 }, (_, at) => ({ id: `n${at}`, label: `Part ${at}`, x: at * 160, y: 0, w: 140, h: 60 }));
const id = (await graphql('mutation ($w: ID!, $n: String!, $d: String) { createDiagram(workspaceId: $w, name: $n, document: $d) { id } }', {
  w: WORKSPACE,
  n: `Export scale ${stamp}`,
  d: JSON.stringify({ nodes, edges: [{ from: 'n0', to: 'n1' }] }),
})).createDiagram.id;

const svg = await (await page.request.get(`${BASE}/api/diagrams/${id}/export/svg`)).text();
const drawn = Number(/<svg[^>]*?\swidth="([0-9]+)"/.exec(svg)?.[1] ?? 0);
record(drawn > 800, `the diagram is drawn wider than 800 pixels (${drawn})`);
record(!/<image|data:image|<foreignObject/.test(svg) && /<rect/.test(svg) && /<text/.test(svg), 'the SVG is vector: shapes and words, no picture inside it');

await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/diagrams/${id}`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('diagram-export').waitFor({ timeout: 20_000 });
await page.waitForTimeout(800);

/** Width and height of a PNG, read off its header. */
const size = (bytes) => ({ width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) });

/** Opens Export unless it is open: picking a scale leaves it open. */
async function openMenu() {
  if (await page.getByTestId('diagram-export-png').isVisible().catch(() => false)) return;
  await page.getByTestId('diagram-export').click();
  await page.getByTestId('diagram-export-png').waitFor({ timeout: 5_000 });
}

async function download() {
  await openMenu();
  const [file] = await Promise.all([page.waitForEvent('download', { timeout: 20_000 }), page.getByTestId('diagram-export-png').click()]);
  const path = await file.path();
  const { readFileSync } = await import('node:fs');
  return { url: file.url(), ...size(readFileSync(path)) };
}

await openMenu();
const scales = await page.getByTestId('diagram-export-scale').locator('[role="radio"]').evaluateAll((all) => all.map((one) => ({ said: one.textContent, on: one.getAttribute('aria-checked') })));
record(JSON.stringify(scales.map((one) => one.said)) === JSON.stringify(['1×', '2×', '3×']), `the menu offers 1×, 2× and 3× beside PNG (${JSON.stringify(scales)})`);
record(scales.find((one) => one.on === 'true')?.said === '2×', '2× is chosen unless another is picked');
const row = await page.getByTestId('diagram-export-png').evaluate((one) => {
  const holder = one.parentElement.getBoundingClientRect();
  const scale = document.querySelector('[data-testid="diagram-export-scale"]').getBoundingClientRect();
  return { rowHeight: Math.round(holder.height), itemHeight: Math.round(one.getBoundingClientRect().height), sameLine: Math.abs((scale.top + scale.bottom) / 2 - (holder.top + holder.bottom) / 2) <= 2 };
});
record(row.sameLine && row.rowHeight === row.itemHeight, `PNG and its scales are one row of the menu (${JSON.stringify(row)})`);
await page.screenshot({ path: shot('diagram-export-scale.png'), clip: { x: 900, y: 60, width: 600, height: 320 } });

const twice = await download();
record(twice.width === drawn * 2, `the PNG is twice the drawn width (${twice.width} for ${drawn}, from ${twice.url})`);

await openMenu();
await page.getByTestId('diagram-export-scale-3').click();
record((await page.getByTestId('diagram-export-scale-3').getAttribute('aria-checked')) === 'true', 'picking 3× leaves the menu open with 3× chosen');
const thrice = await download();
record(thrice.width === Math.min(drawn * 3, 4096), `at 3× it is three times (${thrice.width} for ${drawn})`);

await openMenu();
await page.getByTestId('diagram-export-scale-1').click();
const once = await download();
record(once.width === drawn, `and at 1× it is the drawn size (${once.width})`);

await graphql('mutation ($id: ID!) { deleteDiagram(id: $id) }', { id });
await finish(browser);
