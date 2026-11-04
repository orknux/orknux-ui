/**
 * A link to one box of a diagram opens the diagram on that box.
 *
 * `?node=<id>` is the address a tool, a search result or a person hands out
 * for "this box here". It selected the box and was meant to put it in the
 * middle of the canvas, but on a large diagram it selected it and left it
 * wherever the canvas happened to be, often off the screen: the jump ran
 * before the canvas knew how big it was. Measured off what is drawn: the
 * box's middle against the canvas's, for a box far from the rest, both from a
 * fresh load and from a reload.
 */
import { WORKSPACE, BASE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });

// A spread-out diagram: the box asked for sits far from where fitting it all would put the middle.
const nodes = [];
for (let row = 0; row < 6; row++) {
  for (let col = 0; col < 6; col++) nodes.push({ id: `n${row}${col}`, kind: 'box', label: `box ${row}.${col}`, x: col * 900, y: row * 700, w: 160, h: 60 });
}
nodes.push({ id: 'far', kind: 'box', label: 'the one asked for', x: 5200, y: 4000, w: 200, h: 80 });
const id = (await graphql('mutation ($w: ID!, $n: String!, $d: String) { createDiagram(workspaceId: $w, name: $n, document: $d) { id } }', {
  w: WORKSPACE,
  n: `zzNodeLink ${Date.now()}`,
  d: JSON.stringify({ nodes, edges: [] }),
})).createDiagram.id;

/** How far the box's middle is from the canvas's, in pixels, and whether it is selected. */
async function where() {
  const box = page.locator('.react-flow__node[data-id="far"]');
  await box.waitFor({ state: 'attached', timeout: 20_000 });
  await page.waitForTimeout(1200);
  const drawn = await box.boundingBox();
  const pane = await page.locator('.react-flow').boundingBox();
  const selected = await box.evaluate((element) => element.classList.contains('selected'));
  if (drawn === null || pane === null) return { off: Infinity, selected };
  const off = Math.hypot(drawn.x + drawn.width / 2 - (pane.x + pane.width / 2), drawn.y + drawn.height / 2 - (pane.y + pane.height / 2));
  return { off: Math.round(off), selected };
}

try {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/diagrams/${id}?node=far`, { waitUntil: 'domcontentloaded' });
  const first = await where();
  record(first.selected, 'the box the link names is selected');
  record(first.off < 40, `and drawn in the middle of the canvas (${first.off}px from it)`);

  await page.reload({ waitUntil: 'domcontentloaded' });
  const again = await where();
  record(again.selected && again.off < 40, `and again after a reload (${again.off}px from the middle)`);

  // Without a box named, and nothing kept from an earlier visit, the whole diagram is fitted, as before.
  await page.evaluate((key) => window.localStorage.removeItem(key), `orknux.diagram.view.${id}`);
  await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/diagrams/${id}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.react-flow__node[data-id="n00"]').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1200);
  const pane = await page.locator('.react-flow').boundingBox();
  const corners = await Promise.all(['n00', 'far'].map((key) => page.locator(`.react-flow__node[data-id="${key}"]`).boundingBox()));
  const inside = corners.every((box) => box !== null && box.x >= pane.x - 1 && box.y >= pane.y - 1 && box.x + box.width <= pane.x + pane.width + 1 && box.y + box.height <= pane.y + pane.height + 1);
  record(inside, 'with no box named, the whole diagram is fitted to the canvas');

  // Moved and zoomed by hand, a reload comes back to the same place rather than fitting it again.
  const canvas = page.locator('.react-flow__pane');
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(400);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 180, box.y + box.height / 2 + 90, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  const viewport = () => page.locator('.react-flow__viewport').evaluate((one) => one.style.transform);
  const left = await viewport();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.react-flow__node[data-id="n00"]').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1200);
  const back = await viewport();
  record(back === left, `a reload keeps where the canvas was and how far it was zoomed (${left} -> ${back})`);
} finally {
  await graphql('mutation ($id: ID!) { deleteDiagram(id: $id) }', { id }).catch(() => undefined);
}

await finish(browser);
