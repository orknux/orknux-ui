/**
 * A diagram has a small map of itself in the corner of its canvas.
 *
 * A big drawing was found again by dragging the canvas about until something
 * familiar came by: nothing showed where the screen stood in the whole. Now a
 * map of every shape sits in the canvas's bottom-left corner, with the part on
 * screen marked, and a drag on it moves the canvas. The button above it puts
 * it away, and that is remembered. This counts what the map draws, moves the
 * canvas by it, and reads the choice back after a reload.
 */
import { WORKSPACE, BASE, open, record, finish } from './suite/harness.mjs';

const NAME = `zzMinimap ${Date.now()}`;

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 950 } });

const id = (
  await graphql('mutation ($w: ID!, $n: String!, $d: String) { createDiagram(workspaceId: $w, name: $n, document: $d) { id } }', {
    w: WORKSPACE,
    n: NAME,
    d: JSON.stringify({
      nodes: [
        { id: 'a', kind: 'box', label: 'first', x: 0, y: 0, w: 160, h: 60 },
        { id: 'b', kind: 'ellipse', label: 'second', x: 400, y: 200, w: 160, h: 60 },
        { id: 'c', kind: 'database', label: 'third', x: 900, y: 500, w: 120, h: 100 },
      ],
      edges: [{ id: 'e', from: 'a', to: 'b', kind: 'arrow' }],
    }),
  })
).createDiagram.id;

const address = `${BASE}/workspace/${WORKSPACE}/explore/diagrams/${id}`;
const map = page.locator('.react-flow__minimap');
const toggle = page.getByTestId('diagram-minimap-toggle');
const arrive = async () => {
  await page.goto(address, { waitUntil: 'domcontentloaded' });
  await page.locator('.react-flow__node[data-id="a"]').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
};
const viewport = () => page.locator('.react-flow__viewport').evaluate((one) => getComputedStyle(one).transform);

try {
  await arrive();
  record((await map.count()) === 1 && (await map.isVisible()), 'a map of the diagram is drawn on the canvas as it opens');
  const drawn = await page.locator('.react-flow__minimap-node').count();
  record(drawn === 3, `and holds every shape (${drawn} of 3)`);
  // None of them has a colour of its own; on the map each is coloured by its kind, not white like the rest.
  const fills = await page.locator('.react-flow__minimap-node').evaluateAll((all) => all.map((one) => getComputedStyle(one).fill));
  record(
    fills.length === 3 && fills.every((fill) => fill !== 'rgb(255, 255, 255)' && fill !== 'none') && new Set(fills).size === 3,
    `on the map, a shape with no colour is coloured by its kind (${fills.join(', ')})`,
  );

  const tools = await page.getByTestId('diagram-corner-tools').boundingBox();
  const mapBox = await map.boundingBox();
  record(tools !== null && mapBox !== null && tools.x + tools.width <= mapBox.x && Math.abs(tools.y + tools.height - (mapBox.y + mapBox.height)) <= 4, `its buttons stand left of it, foot to foot, not over it (${tools && Math.round(mapBox.x - tools.x - tools.width)}px apart)`);
  record((await toggle.getAttribute('aria-pressed')) === 'true', 'and reads as on');

  // In the canvas's bottom right corner, and small: it is for finding one's way, and the corner left is the canvas's.
  const room = await page.getByTestId('diagram-canvas').boundingBox();
  record(
    mapBox !== null && room.x + room.width - (mapBox.x + mapBox.width) <= 24 && room.y + room.height - (mapBox.y + mapBox.height) <= 24 && mapBox.x > room.x + room.width / 2,
    `it sits in the canvas's bottom right corner (${mapBox && Math.round(room.x + room.width - mapBox.x - mapBox.width)}px from its right, ${mapBox && Math.round(room.y + room.height - mapBox.y - mapBox.height)}px from its foot)`,
  );
  record(mapBox !== null && mapBox.width <= 160 && mapBox.height <= 110, `and small (${mapBox && Math.round(mapBox.width)} by ${mapBox && Math.round(mapBox.height)})`);
  // The layers moved out of that corner to the top right, beside View and Edit.
  const layers = await page.getByTestId('diagram-layers').boundingBox();
  record(layers !== null && layers.y < room.y + 80 && layers.x > room.x + room.width / 2, 'the layers sit at the top right, beside View and Edit');

  // A drag on the map moves the canvas.
  const before = await viewport();
  await page.mouse.move(mapBox.x + mapBox.width / 2, mapBox.y + mapBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(mapBox.x + mapBox.width / 2 + 30, mapBox.y + mapBox.height / 2 + 20, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  record((await viewport()) !== before, 'a drag on the map moves the canvas');

  // Viewing, the map is still there: it is for reading a drawing as much as for making one.
  await page.getByTestId('diagram-mode-view').click();
  await page.waitForTimeout(300);
  record(await map.isVisible(), 'viewing, the map is still drawn');

  await toggle.click();
  await page.waitForTimeout(300);
  record((await map.count()) === 0, 'the button puts the map away');
  record((await toggle.getAttribute('aria-pressed')) === 'false', 'and reads as off');

  await arrive();
  record((await map.count()) === 0, 'which is remembered after a reload');
  await toggle.click();
  await page.waitForTimeout(300);
  record(await map.isVisible(), 'and the button brings it back');
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
