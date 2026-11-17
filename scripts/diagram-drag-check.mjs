/**
 * A dragged shape follows the pointer, shows what it has come level with, and
 * settles on the grid when it is let go.
 *
 * A shape was held to the grid while it moved, so it stood still until the
 * pointer had gone four pixels and then jumped eight: a drag that stuttered
 * the whole way. And lining one shape up with another was done by eye. Now a
 * shape moves with the pointer; coming level with another shape's edge or
 * middle it is pulled onto it and a line is drawn through both; and the grid
 * is where it lands. This drags by an amount the grid has no place for and
 * measures the shape mid-drag, then drags near another shape's top and reads
 * the guide and where the shape was kept.
 */
import { WORKSPACE, BASE, open, record, finish } from './suite/harness.mjs';

const NAME = `zzDrag ${Date.now()}`;

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 950 } });

const id = (
  await graphql('mutation ($w: ID!, $n: String!, $d: String) { createDiagram(workspaceId: $w, name: $n, document: $d) { id } }', {
    w: WORKSPACE,
    n: NAME,
    d: JSON.stringify({
      nodes: [
        { id: 'a', kind: 'box', label: 'still', x: 0, y: 0, w: 160, h: 64 },
        { id: 'b', kind: 'box', label: 'moved', x: 400, y: 304, w: 120, h: 48 },
      ],
      edges: [],
    }),
  })
).createDiagram.id;

const stored = async () => JSON.parse((await graphql('query ($id: ID!) { diagram(id: $id) { document } }', { id })).diagram.document);
const boxOf = (node) => page.locator(`.react-flow__node[data-id="${node}"]`).boundingBox();
const guides = page.getByTestId('diagram-guide');

try {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/diagrams/${id}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.react-flow__node[data-id="a"]').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
  if ((await page.getByTestId('diagram-mode-edit').getAttribute('aria-checked')) !== 'true') {
    await page.getByTestId('diagram-mode-edit').click();
  }
  const zoom = await page.locator('.react-flow__viewport').evaluate((one) => new DOMMatrix(getComputedStyle(one).transform).a);

  /**
   * A shape taken hold of: pressed, and moved the pixel or two a press has to
   * travel before it counts as a drag. Answers where the pointer is and where
   * the shape is at that moment, which is what the rest is measured from.
   */
  const takeHold = async (node) => {
    const box = await boxOf(node);
    const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    for (let step = 1; step <= 3; step++) await page.mouse.move(at.x + step, at.y);
    await page.waitForTimeout(120);
    return { pointer: { x: at.x + 3, y: at.y }, box: await boxOf(node) };
  };

  // Thirteen across and four down: nowhere the grid has a place for.
  const taken = await takeHold('b');
  const start = taken.box;
  const hold = taken.pointer;
  await page.mouse.move(hold.x + 6, hold.y + 2, { steps: 3 });
  await page.mouse.move(hold.x + 13, hold.y + 4, { steps: 3 });
  await page.waitForTimeout(200);
  const held = await boxOf('b');
  const wentX = held.x - start.x;
  const wentY = held.y - start.y;
  record(Math.abs(wentX - 13) <= 1.5 && Math.abs(wentY - 4) <= 1.5, `a shape dragged 13 across and 4 down has moved that far, not to the nearest grid line (${wentX.toFixed(1)}, ${wentY.toFixed(1)})`);
  record((await guides.count()) === 0, 'level with nothing, no guide is drawn');
  await page.mouse.up();
  await page.waitForTimeout(3000);
  const settled = (await stored()).nodes.find((node) => node.id === 'b');
  record(settled !== undefined && settled.x % 8 === 0 && settled.y % 8 === 0, `let go, it settles on the grid (${settled?.x}, ${settled?.y})`);
  record(settled !== undefined && Math.abs(settled.x - (400 + 16 / zoom)) <= 6 && Math.abs(settled.y - (304 + 4 / zoom)) <= 5, 'the nearest place on it to where it was dropped');

  // Up to within three pixels of the other shape's top.
  const still = await boxOf('a');
  const again = await takeHold('b');
  const from = again.box;
  const grip = again.pointer;
  const rise = still.y - from.y + 3;
  await page.mouse.move(grip.x + 5, grip.y + rise / 2, { steps: 8 });
  await page.mouse.move(grip.x + 10, grip.y + rise, { steps: 8 });
  await page.waitForTimeout(250);
  const near = await boxOf('b');
  const shown = await guides.count();
  record(shown >= 1, `coming level with another shape draws a guide (${shown})`);
  record(Math.abs(near.y - still.y) <= 0.6, `and pulls the shape onto the line: its top is ${Math.abs(near.y - still.y).toFixed(1)}px from the other's, where the pointer left it 3 away`);
  const guide = shown === 0 ? null : await guides.first().boundingBox();
  record(guide !== null && Math.abs(guide.y - still.y) <= 1.5 && guide.width >= near.x - still.x, 'the guide runs along that top, from the one shape to the other');
  // Purple: nothing on a diagram is drawn in it by default, and the selection is blue.
  const ink = shown === 0 ? null : await guides.first().evaluate((one) => {
    const css = getComputedStyle(one);
    return [css.borderTopColor, css.borderLeftColor].find((colour) => colour !== 'rgba(0, 0, 0, 0)' && colour !== 'rgb(0, 0, 0)') ?? css.borderTopColor;
  });
  record(ink === 'rgb(147, 51, 234)', `and it is purple (${ink})`);
  await page.mouse.up();
  await page.waitForTimeout(300);
  record((await guides.count()) === 0, 'let go, the guide is gone');
  await page.waitForTimeout(2700);
  const level = (await stored()).nodes.find((node) => node.id === 'b');
  record(level?.y === 0, `and the shape is kept level with the other (y ${level?.y})`);
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
