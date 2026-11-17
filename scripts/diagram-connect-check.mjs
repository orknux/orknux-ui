/**
 * A line drawn onto a handle is made, ending on that handle.
 *
 * A handle sits on its shape's outline and is taken hold of from a little way
 * outside it. A line dragged there snapped to the handle and was shown
 * reaching it, and when it was let go the editor looked for a shape under the
 * pointer - just outside the outline, where there is none - and made nothing.
 * Every shape, every side. This draws the line it was reported on, a diamond's
 * bottom to an ellipse's bottom, let go on the handle itself, and then a box's
 * side let go a few pixels outside it.
 */
import { WORKSPACE, BASE, open, record, finish } from './suite/harness.mjs';

const NAME = `zzConnect ${Date.now()}`;

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 950 } });

const id = (
  await graphql('mutation ($w: ID!, $n: String!, $d: String) { createDiagram(workspaceId: $w, name: $n, document: $d) { id } }', {
    w: WORKSPACE,
    n: NAME,
    d: JSON.stringify({
      nodes: [
        { id: 'd', kind: 'diamond', label: 'which', x: 320, y: 0, w: 160, h: 100 },
        { id: 'e', kind: 'ellipse', label: 'round', x: 0, y: 220, w: 180, h: 80 },
        { id: 'p', kind: 'box', label: 'plain', x: 560, y: 220, w: 160, h: 60 },
      ],
      edges: [],
    }),
  })
).createDiagram.id;

const stored = async () => JSON.parse((await graphql('query ($id: ID!) { diagram(id: $id) { document } }', { id })).diagram.document);
const handle = (node, side) => page.locator(`.react-flow__handle[data-nodeid="${node}"][data-handleid="${side}"]`);
const middle = (box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

/** Draws a line from a handle to a point, as a hand does: pressed, moved in steps, let go. */
async function draw(from, to) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let step = 1; step <= 12; step++) await page.mouse.move(from.x + ((to.x - from.x) * step) / 12, from.y + ((to.y - from.y) * step) / 12);
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(400);
}

try {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/diagrams/${id}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.react-flow__node[data-id="d"]').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
  if ((await page.getByTestId('diagram-mode-edit').getAttribute('aria-checked')) !== 'true') await page.getByTestId('diagram-mode-edit').click();

  // The diamond's bottom to the ellipse's bottom, let go on the ellipse's handle.
  await page.locator('.react-flow__node[data-id="d"]').hover();
  const start = middle(await handle('d', 'bottom').boundingBox());
  await page.locator('.react-flow__node[data-id="e"]').hover();
  const end = middle(await handle('e', 'bottom').boundingBox());
  await page.locator('.react-flow__node[data-id="d"]').hover();
  // Let go a hair below the handle's middle, as a hand does: on the handle, and just outside the ellipse.
  await draw(start, { x: end.x, y: end.y + 4 });
  record((await page.locator('.react-flow__edge').count()) === 1, 'a line let go on the bottom handle of an ellipse is made');

  // A box's left side, let go six pixels outside it: in the handle's reach, over no shape.
  await page.locator('.react-flow__node[data-id="p"]').hover();
  const left = middle(await handle('p', 'left').boundingBox());
  await page.locator('.react-flow__node[data-id="d"]').hover();
  const right = middle(await handle('d', 'right').boundingBox());
  await page.locator('.react-flow__node[data-id="d"]').hover();
  await draw(right, { x: left.x - 6, y: left.y });
  record((await page.locator('.react-flow__edge').count()) === 2, 'and so is one let go just outside the side of a box, where its handle is still within reach');

  await page.waitForTimeout(3000);
  const edges = (await stored()).edges;
  const low = edges.find((edge) => edge.from === 'd' && edge.to === 'e');
  record(low?.fromSide === 'bottom' && low?.toSide === 'bottom', `the server keeps the first from bottom to bottom, as it was drawn (${low?.fromSide} to ${low?.toSide})`);
  const side = edges.find((edge) => edge.from === 'd' && edge.to === 'p');
  record(side?.fromSide === 'right' && side?.toSide === 'left', `and the second from right to left (${side?.fromSide} to ${side?.toSide})`);
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
