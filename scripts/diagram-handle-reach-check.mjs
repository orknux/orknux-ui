/**
 * A shape's handles are taken hold of from a little way off.
 *
 * The ring a line is drawn from, and the corner a shape is resized by, were
 * their own targets: a few pixels across, half of them outside the shape -
 * where the pointer has left the shape and the rings have gone. Aiming at one
 * was aiming at a full stop. Each now has room round it that is its own, more
 * of it on the outside. This comes at a side from outside without touching the
 * shape, draws a line from there, and resizes from just off a corner.
 */
import { WORKSPACE, BASE, open, record, finish } from './suite/harness.mjs';

const NAME = `zzReach ${Date.now()}`;

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 950 } });

const id = (
  await graphql('mutation ($w: ID!, $n: String!, $d: String) { createDiagram(workspaceId: $w, name: $n, document: $d) { id } }', {
    w: WORKSPACE,
    n: NAME,
    d: JSON.stringify({
      nodes: [
        { id: 'a', kind: 'box', label: 'first', x: 0, y: 0, w: 160, h: 64 },
        { id: 'b', kind: 'box', label: 'second', x: 400, y: 0, w: 160, h: 64 },
      ],
      edges: [],
    }),
  })
).createDiagram.id;

const stored = async () => JSON.parse((await graphql('query ($id: ID!) { diagram(id: $id) { document } }', { id })).diagram.document);
const boxOf = (node) => page.locator(`.react-flow__node[data-id="${node}"]`).boundingBox();
/** Which handle of which shape the pointer would take hold of at a place, if any. */
const under = (x, y) =>
  page.evaluate(([px, py]) => {
    const handle = document.elementFromPoint(px, py)?.closest('.react-flow__handle');
    return handle === null || handle === undefined ? null : `${handle.getAttribute('data-nodeid')} ${handle.getAttribute('data-handleid') ?? ''}`.trim();
  }, [x, y]);

try {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/diagrams/${id}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.react-flow__node[data-id="a"]').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
  if ((await page.getByTestId('diagram-mode-edit').getAttribute('aria-checked')) !== 'true') {
    await page.getByTestId('diagram-mode-edit').click();
  }

  // Twelve pixels outside the middle of the right side, come at from further out still.
  const first = await boxOf('a');
  const off = { x: first.x + first.width + 12, y: first.y + first.height / 2 };
  await page.mouse.move(off.x + 80, off.y + 70);
  await page.mouse.move(off.x, off.y, { steps: 6 });
  await page.waitForTimeout(350);
  const found = await under(off.x, off.y);
  record(found !== null && found.startsWith('a'), `12px outside a side, the pointer is already on that side's handle (${found ?? 'on nothing'})`);
  const lit = await page.locator('.react-flow__node[data-id="a"] .react-flow__handle-right').evaluate((one) => getComputedStyle(one).opacity);
  record(lit === '1', `and the handles are lit, though the pointer never touched the shape (opacity ${lit})`);
  record((await under(first.x + first.width / 2, first.y + first.height / 2)) === null, 'the middle of the shape is still the shape: it is dragged and typed into');

  // A line drawn from out there.
  const second = await boxOf('b');
  await page.mouse.down();
  await page.mouse.move(off.x + 40, off.y + 10, { steps: 4 });
  await page.mouse.move(second.x + second.width / 2, second.y + second.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(3000);
  const line = (await stored()).edges.find((edge) => edge.from === 'a' && edge.to === 'b');
  record(line !== undefined, 'a drag from there to another shape draws a line between them');

  // A corner, taken from five pixels off it.
  await page.locator('.react-flow__pane').click({ position: { x: 30, y: 30 } });
  await page.locator('.react-flow__node[data-id="b"]').click();
  await page.waitForTimeout(300);
  const corner = await page.locator('.react-flow__node[data-id="b"] .react-flow__resize-control.handle.bottom.right').boundingBox();
  const grab = { x: corner.x + corner.width + 5, y: corner.y + corner.height + 5 };
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move(grab.x + 20, grab.y + 12, { steps: 4 });
  await page.mouse.move(grab.x + 48, grab.y + 32, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(3000);
  const sized = (await stored()).nodes.find((node) => node.id === 'b');
  record(sized !== undefined && sized.w > 160 && sized.h > 64, `a corner dragged from 5px off it resizes the shape (${sized?.w} by ${sized?.h}, from 160 by 64)`);
  record(sized?.x === 400 && sized?.y === 0, 'which stays where it was');
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
