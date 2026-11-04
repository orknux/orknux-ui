/**
 * Looking at a diagram rather than changing it, and reading its lines.
 *
 * View, at the top right or by Ctrl+Alt+E, lets nothing be dragged, typed into
 * or deleted, greys the tools rather than taking them away, and is remembered
 * for the diagram in this browser. A selected box lights every line to and
 * from it with dots running the way it points, and leaves the rest unlit. Where
 * two lines cross, the one drawn later hops over the earlier one, and the hop
 * follows a box being moved.
 *
 * Measured off what is drawn and what the server stores.
 */
import { WORKSPACE, BASE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });

const drawing = {
  nodes: [
    { id: 'a', kind: 'box', label: 'west', x: 0, y: 0, w: 160, h: 60 },
    { id: 'b', kind: 'box', label: 'east', x: 480, y: 0, w: 160, h: 60 },
    { id: 'c', kind: 'box', label: 'north', x: 240, y: -220, w: 160, h: 60 },
    { id: 'd', kind: 'box', label: 'south', x: 240, y: 220, w: 160, h: 60 },
  ],
  // e1 runs across, e2 down through it: e2 is drawn later, so e2 hops.
  edges: [
    { id: 'e1', from: 'a', to: 'b' },
    { id: 'e2', from: 'c', to: 'd' },
    { id: 'e3', from: 'a', to: 'd', routing: 'curved' },
  ],
};
const id = (await graphql('mutation ($w: ID!, $n: String!, $d: String) { createDiagram(workspaceId: $w, name: $n, document: $d) { id } }', {
  w: WORKSPACE,
  n: `zzViewing ${Date.now()}`,
  d: JSON.stringify(drawing),
})).createDiagram.id;
const stored = async () => JSON.parse((await graphql('query ($id: ID!) { diagram(id: $id) { document } }', { id })).diagram.document);
const node = (key) => page.locator(`.react-flow__node[data-id="${key}"]`);
const edgePath = (key) => page.locator(`.react-flow__edge[data-id="${key}"] path.react-flow__edge-path`).first();
const lit = (key) => page.locator(`.react-flow__edge[data-id="${key}"] [data-flow]`).count();
const mode = async () => ((await page.getByTestId('diagram-mode-view').getAttribute('aria-checked')) === 'true' ? 'view' : 'edit');

async function drag(key, dx, dy) {
  const box = await node(key).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx / 2, box.y + box.height / 2 + dy / 2, { steps: 4 });
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 4 });
  await page.mouse.up();
}

try {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/diagrams/${id}`, { waitUntil: 'domcontentloaded' });
  await node('a').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
  if ((await mode()) !== 'edit') await page.getByTestId('diagram-mode-edit').click();
  // Out a little: fitted, the top box sits under the find box over the canvas, which takes its clicks.
  const zoomOut = async () => {
    const pane = await page.locator('.react-flow__pane').boundingBox();
    await page.mouse.move(pane.x + pane.width / 2, pane.y + pane.height / 2);
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(400);
  };
  await zoomOut();

  // Lines that cross: the later one hops, the earlier one does not, and curves never do.
  const hop = await edgePath('e2').getAttribute('d');
  record(hop.includes(' A '), `the line drawn later hops where it crosses the earlier one (${hop.slice(0, 90)})`);
  record(!(await edgePath('e1').getAttribute('d')).includes(' A '), 'and the earlier one is drawn straight through');
  record(!(await edgePath('e3').getAttribute('d')).includes(' A '), 'and a curved line neither hops nor is hopped over');

  // The hop follows a box being moved.
  await drag('d', 60, 0);
  await drag('c', 60, 0);
  await page.waitForTimeout(500);
  const moved = await edgePath('e2').getAttribute('d');
  record(moved.includes(' A ') && moved !== hop, `dragging the boxes moves the hop with them (${moved.slice(0, 90)})`);

  // A selected box lights its lines and only its lines.
  await node('a').click();
  await page.waitForTimeout(300);
  const [one, two, three] = [await lit('e1'), await lit('e2'), await lit('e3')];
  record(one > 0 && three > 0, `a selected box lights both of its lines (${one}, ${three})`);
  record(two === 0, `and leaves the line that only passes by unlit (${two})`);
  await page.keyboard.down('Shift');
  await node('c').click();
  await page.keyboard.up('Shift');
  await page.waitForTimeout(300);
  record((await lit('e2')) > 0 && (await lit('e1')) > 0, 'with a second box selected, the lines of both are lit');
  await page.locator('.react-flow__pane').click({ position: { x: 30, y: 30 } });
  await page.waitForTimeout(300);
  record((await lit('e1')) + (await lit('e2')) + (await lit('e3')) === 0, 'and nothing is lit with nothing selected');
  await page.waitForTimeout(2500);

  // View: the tools are greyed, not gone, and nothing changes.
  await page.getByTestId('diagram-mode-view').click();
  await page.waitForTimeout(300);
  record((await mode()) === 'view', 'View is on');
  const tools = page.getByTestId('diagram-edit-tools');
  const greyed = await tools.evaluate((one) => one.disabled === true);
  record((await tools.isVisible()) && greyed, `the shape tools stay on the bar, greyed (shown ${await tools.isVisible()}, disabled ${greyed})`);
  const before = await stored();
  // Measured against its neighbour: a drag on a box that cannot move pans the whole canvas instead.
  const apart = async () => { const one = await node('a').boundingBox(); const two = await node('b').boundingBox(); return { x: two.x - one.x, y: two.y - one.y, at: one }; };
  const where = await apart();
  await drag('a', 200, 120);
  const after = await apart();
  // And back: the drag panned the canvas instead, which can carry a box out of the window for the clicks below.
  await drag('a', -200, -120);
  record(Math.abs(after.x - where.x) < 2 && Math.abs(after.y - where.y) < 2, `a box cannot be dragged (${where.x},${where.y} apart before, ${after.x},${after.y} after)`);
  await node('a').click();
  await page.keyboard.press('Delete');
  await node('a').dblclick();
  await page.waitForTimeout(400);
  record((await node('a').count()) === 1, 'Delete leaves a selected box where it is');
  record((await page.locator('.react-flow__node[data-id="a"] textarea, .react-flow__node[data-id="a"] [contenteditable="true"]').count()) === 0, 'and a double click does not open its label for typing');
  await page.waitForTimeout(2500);
  const held = await stored();
  record(JSON.stringify(held.nodes) === JSON.stringify(before.nodes), 'and the server holds the boxes as they were');

  // Remembered in this browser, for this diagram.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await node('a').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(500);
  record((await mode()) === 'view', 'after a reload the editor is still in View');
  await zoomOut();

  // Ctrl+Alt+E turns it back.
  await page.locator('.react-flow__pane').click({ position: { x: 30, y: 30 } });
  await page.keyboard.press('Control+Alt+e');
  await page.waitForTimeout(300);
  record((await mode()) === 'edit', 'Ctrl+Alt+E switches back to Edit');
  record(await tools.evaluate((one) => one.disabled === false), 'and the tools work again');
  const was = await apart();
  await drag('a', 120, 0);
  const back = await apart();
  record(back.x < was.x - 50, 'and a box can be dragged again');
} finally {
  await graphql('mutation ($id: ID!) { deleteDiagram(id: $id) }', { id }).catch(() => undefined);
}

await finish(browser);
