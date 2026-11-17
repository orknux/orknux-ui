/**
 * A big diagram keeps up with the pointer.
 *
 * Six hundred shapes and over a thousand lines between them: a shape dragged
 * across that redrew every shape and every line for each pixel, and the canvas
 * looked every line's label layer up again in the whole page each time, so the
 * page was busy for nine tenths of a drag and the shape trailed the pointer by
 * a quarter of a second. Panning was the same. This drags a shape in the middle
 * and pans the canvas, and asks how much of each the page spent in tasks long
 * enough to be felt (over fifty milliseconds, the browser's own measure).
 *
 * The bar is set far from both sides - the old editor spent 0.9 of a drag that
 * way, this one about 0.01 in a development build - so a slower machine does
 * not make it fail and a return of the old cost does.
 */
import { WORKSPACE, BASE, open, record, finish } from './suite/harness.mjs';

const NAME = `zzBig ${Date.now()}`;

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });

const COLS = 30;
const ROWS = 20;
const nodes = [];
const edges = [];
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    nodes.push({ id: `n${r}_${c}`, kind: (r + c) % 5 === 0 ? 'database' : 'box', label: `service ${r}.${c}`, x: c * 220, y: r * 130, w: 160, h: 60 });
    if (c + 1 < COLS) edges.push({ id: `h${r}_${c}`, from: `n${r}_${c}`, to: `n${r}_${c + 1}`, kind: 'arrow', routing: 'curved' });
    if (r + 1 < ROWS) edges.push({ id: `v${r}_${c}`, from: `n${r}_${c}`, to: `n${r + 1}_${c}`, kind: 'arrow', ...(c % 3 === 0 ? { label: 'calls' } : {}) });
  }
}

const id = (
  await graphql('mutation ($w: ID!, $n: String!, $d: String) { createDiagram(workspaceId: $w, name: $n, document: $d) { id } }', {
    w: WORKSPACE,
    n: NAME,
    d: JSON.stringify({ nodes, edges }),
  })
).createDiagram.id;

/** Starts counting the long tasks the page runs. */
const watch = () =>
  page.evaluate(() => {
    window.__long = [];
    window.__watching?.disconnect();
    window.__watching = new PerformanceObserver((list) => {
      for (const one of list.getEntries()) window.__long.push(one.duration);
    });
    window.__watching.observe({ entryTypes: ['longtask'] });
  });
/** How much of the time since [watch] the page spent in long tasks. */
const busy = async (took) => {
  const long = await page.evaluate(() => window.__long);
  return long.reduce((a, b) => a + b, 0) / took;
};

try {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/diagrams/${id}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.react-flow__node[data-id="n0_0"]').waitFor({ timeout: 120_000 });
  await page.waitForTimeout(3000);
  const edit = page.getByTestId('diagram-mode-edit');
  if ((await edit.getAttribute('aria-checked')) !== 'true') await edit.click();
  await page.waitForTimeout(500);

  // A shape in the middle, taken hold of and then moved about for sixty steps.
  const target = page.locator('.react-flow__node[data-id="n10_15"]');
  const box = await target.boundingBox();
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 3, from.y + 2);
  await page.waitForTimeout(300);
  await watch();
  let started = Date.now();
  for (let step = 1; step <= 60; step++) await page.mouse.move(from.x + 3 + Math.sin(step / 10) * 60 + step, from.y + 2 + Math.cos(step / 10) * 30);
  const dragging = await busy(Date.now() - started);
  await page.mouse.up();
  const moved = await target.boundingBox();
  record(Math.abs(moved.x - box.x) > 20, `the shape went with the pointer (${Math.round(moved.x - box.x)}px across)`);
  record(dragging < 0.3, `a shape dragged across six hundred keeps up: the page was busy for ${dragging.toFixed(2)} of the drag (under 0.3)`);
  await page.waitForTimeout(1500);

  // The canvas moved by a drag on an empty strip at its top.
  const canvas = await page.getByTestId('diagram-canvas').boundingBox();
  await page.mouse.move(canvas.x + 300, canvas.y + 20);
  await page.mouse.down();
  await page.mouse.move(canvas.x + 303, canvas.y + 22);
  await watch();
  started = Date.now();
  for (let step = 1; step <= 60; step++) await page.mouse.move(canvas.x + 303 + step * 4, canvas.y + 22 + step * 2);
  const panning = await busy(Date.now() - started);
  await page.mouse.up();
  record(panning < 0.3, `and so does moving the canvas: busy for ${panning.toFixed(2)} of it (under 0.3)`);
} catch (error) {
  // A step that throws is a failure, said as one: the clean-up below must not let the run end as a pass.
  record(false, `stopped part-way: ${String(error?.message ?? error).split('\n')[0]}`);
} finally {
  await graphql('mutation ($id: ID!) { deleteDiagram(id: $id) }', { id }).catch(() => undefined);
  // A deleted diagram is kept in the workspace's bin, and a check's own is nobody's to restore.
  const kept = await graphql('query ($w: ID!) { recycleBin(workspaceId: $w, size: 200) { content { id kind name } } }', { w: WORKSPACE })
    .then((data) => data.recycleBin.content)
    .catch(() => []);
  for (const entry of kept.filter((one) => one.kind === 'DIAGRAM' && one.name === NAME)) {
    await graphql('mutation ($id: ID!) { purgeRecycleBinEntry(id: $id) }', { id: entry.id }).catch(() => undefined);
  }
}

await finish(browser);
