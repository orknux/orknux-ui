/**
 * Layers in the diagram editor, as draw.io has them.
 *
 * A diagram of a platform - services, Kafka topics, REST calls - is read one
 * kind of flow at a time. Each layer is shown or hidden and locked or not, for
 * everybody; a box on a hidden layer is not drawn, and one on a locked layer
 * is drawn and cannot be moved. New shapes go on the layer chosen in the menu,
 * and a layer taken away keeps what was on it, on the layer below.
 *
 * Measured off what is drawn - a box's element on the canvas and where it is -
 * and off what the server stores.
 */
import { WORKSPACE, BASE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });

const drawn = JSON.stringify({
  layers: [
    { id: 'base', name: 'Services', visible: true, locked: false },
    { id: 'kafka', name: 'Kafka', visible: false, locked: false },
    { id: 'rest', name: 'REST', visible: true, locked: true },
  ],
  nodes: [
    { id: 'orders', kind: 'rounded', label: 'order-service', x: 0, y: 0, w: 200, h: 80 },
    { id: 'topic', kind: 'database', label: 'orders_created', x: 400, y: 0, w: 200, h: 80, layer: 'kafka' },
    { id: 'gateway', kind: 'rounded', label: 'API gateway', x: 0, y: 240, w: 200, h: 80, layer: 'rest' },
  ],
  edges: [{ id: 'write', from: 'orders', to: 'topic', label: 'Kafka', kind: 'arrow', layer: 'kafka' }],
});
const { createDiagram } = await graphql(
  'mutation ($w: ID!, $n: String!, $d: String) { createDiagram(workspaceId: $w, name: $n, document: $d) { id } }',
  { w: WORKSPACE, n: `zzLayers ${Date.now()}`, d: drawn },
);
const id = createDiagram.id;
const stored = async () => JSON.parse((await graphql('query ($id: ID!) { diagram(id: $id) { document } }', { id })).diagram.document);
const shownOnCanvas = (key) =>
  page.evaluate((k) => {
    const one = document.querySelector(`.react-flow__node[data-id="${k}"]`);
    return one !== null && getComputedStyle(one).visibility !== 'hidden' && one.getBoundingClientRect().width > 0;
  }, key);
const menu = async () => {
  if (!(await page.getByTestId('diagram-layers-menu').isVisible().catch(() => false))) await page.getByTestId('diagram-layers').click();
};
const waitSaved = () => page.waitForTimeout(2500);

try {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/diagrams/${id}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.react-flow__node[data-id="orders"]').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
  // In Edit, whatever this browser last left the diagram in.
  if ((await page.getByTestId('diagram-mode-edit').getAttribute('aria-checked')) !== 'true') await page.getByTestId('diagram-mode-edit').click();

  record(await shownOnCanvas('orders'), 'a box on a shown layer is drawn');
  record(!(await shownOnCanvas('topic')), 'a box on a hidden layer is not');

  // The menu lists them top first, with what is on each.
  await menu();
  // The current layer goes with its row: the top one moved down stays lit, rather than the light staying at the top.
  {
    const lit = () => page.locator('[data-testid^="diagram-layer-"][data-current]').getAttribute('data-testid');
    const before = await lit();
    await page.locator(`[data-testid="${before}"]`).getByRole('button', { name: 'Move down' }).click();
    await page.waitForTimeout(300);
    const after = await lit();
    record(after === before, `the current layer stays lit as it moves down (${before} -> ${after})`);
    await page.locator(`[data-testid="${before}"]`).getByRole('button', { name: 'Move up' }).click();
    await page.waitForTimeout(300);
  }
  const rows = await page.locator('[data-testid^="diagram-layer-pick-"]').allTextContents();
  record(rows.length === 3 && rows[0].startsWith('REST') && rows[2].startsWith('Services'), `the menu lists the three, top first (${rows.join(' | ')})`);

  // Shown again, for everybody: drawn, and stored.
  await page.getByTestId('diagram-layer-shown-kafka').click();
  await page.waitForTimeout(400);
  record(await shownOnCanvas('topic'), 'showing the layer draws its box');
  await waitSaved();
  record((await stored()).layers.find((one) => one.id === 'kafka')?.visible === true, 'and the server stores it shown');

  // Locked: drawn, and not moved by a drag.
  await page.keyboard.press('Escape');
  const box = await page.locator('.react-flow__node[data-id="gateway"]').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 160, box.y + box.height / 2 + 40, { steps: 6 });
  await page.mouse.up();
  await waitSaved();
  const gateway = (await stored()).nodes.find((one) => one.id === 'gateway');
  record(gateway?.x === 0 && gateway?.y === 240, `a box on a locked layer does not move (${gateway?.x}, ${gateway?.y})`);

  // A new layer, and a new shape goes on it.
  await menu();
  await page.getByTestId('diagram-layer-add').click();
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await page.getByTestId('diagram-add-box').click().catch(async () => page.locator('[data-testid^="diagram-add-"]').first().click());
  await waitSaved();
  const after = await stored();
  const added = after.layers.at(-1);
  const newest = after.nodes.at(-1);
  record(after.layers.length === 4, `adding a layer stores a fourth (${after.layers.map((one) => one.name).join(', ')})`);
  record(newest !== undefined && newest.layer === added?.id, `a new shape goes on the layer just added (${newest?.layer} / ${added?.id})`);

  // Taken away, what was on it stays, on the layer below.
  await menu();
  await page.getByTestId(`diagram-layer-delete-${added.id}`).click();
  await waitSaved();
  const left = await stored();
  const kept = left.nodes.find((one) => one.id === newest.id);
  record(left.layers.length === 3 && kept !== undefined && kept.layer === 'rest', `deleting the layer keeps its box, on the one below (${kept?.layer})`);

  // In View, hiding a layer is this browser's alone and stores nothing.
  await page.keyboard.press('Escape');
  await page.getByTestId('diagram-mode-view').click();
  await menu();
  await page.getByTestId('diagram-layer-shown-base').click();
  await page.waitForTimeout(400);
  record(!(await shownOnCanvas('orders')), 'in View a layer can be hidden to read the rest');
  await page.waitForTimeout(1500);
  record((await stored()).layers.find((one) => one.id === 'base')?.visible === true, 'and nothing of it is saved');
  record(await page.getByTestId('diagram-layer-add').isDisabled(), 'while adding a layer is not offered');
  await page.getByTestId('diagram-mode-edit').click();
} finally {
  await graphql('mutation ($id: ID!) { deleteDiagram(id: $id) }', { id }).catch(() => undefined);
}

await finish(browser);
