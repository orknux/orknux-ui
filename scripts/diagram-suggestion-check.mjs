/**
 * Resting on a side of a shape offers the line somebody was about to draw.
 *
 * A diagram grows one box and one line at a time, and each took a trip to the
 * toolbar, a drag to place the box and a second drag to join it. Now a pointer
 * resting on a side's handle is shown what a click there would make, in
 * dashes: a line to the nearest shape that side faces, or - where there is
 * none - a copy of the shape a step away, already joined. A click takes it; a
 * drag still draws a line by hand. This rests on two sides, reads what is
 * offered, takes both and reads what the server kept.
 */
import { WORKSPACE, BASE, open, record, finish } from './suite/harness.mjs';

const NAME = `zzSuggest ${Date.now()}`;

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 950 } });

const id = (
  await graphql('mutation ($w: ID!, $n: String!, $d: String) { createDiagram(workspaceId: $w, name: $n, document: $d) { id } }', {
    w: WORKSPACE,
    n: NAME,
    d: JSON.stringify({
      nodes: [
        { id: 'a', kind: 'rounded', label: 'first', x: 0, y: 0, w: 160, h: 64, color: '#dbeafe' },
        { id: 'b', kind: 'box', label: 'second', x: 400, y: 0, w: 160, h: 64 },
      ],
      edges: [],
    }),
  })
).createDiagram.id;

const stored = async () => JSON.parse((await graphql('query ($id: ID!) { diagram(id: $id) { document } }', { id })).diagram.document);
const ghost = page.getByTestId('diagram-suggestion');
/** The pointer brought to rest on one side's handle of a shape. */
const restOn = async (node, side) => {
  const handle = await page.locator(`.react-flow__node[data-id="${node}"] .react-flow__handle-${side}`).boundingBox();
  await page.mouse.move(handle.x + handle.width / 2 + 40, handle.y + handle.height / 2 + 90);
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2, { steps: 4 });
  await page.waitForTimeout(500);
};
const click = async () => {
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(400);
};

try {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/diagrams/${id}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.react-flow__node[data-id="a"]').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
  if ((await page.getByTestId('diagram-mode-edit').getAttribute('aria-checked')) !== 'true') {
    await page.getByTestId('diagram-mode-edit').click();
  }
  record((await ghost.count()) === 0, 'nothing is offered until a side is rested on');

  // The right side faces the second shape: a line to it.
  await restOn('a', 'right');
  record((await ghost.count()) === 1, 'resting on a side of a shape offers something');
  record((await ghost.getAttribute('data-kind')) === 'line', `facing another shape, it is a line to it (${await ghost.getAttribute('data-kind')})`);
  record((await page.getByTestId('diagram-suggestion-box').count()) === 0, 'with no new shape');
  await click();
  record((await page.locator('.react-flow__edge').count()) === 1, 'a click on the handle draws that line');
  record((await ghost.count()) === 0, 'and the offer is gone');

  // The bottom side faces nothing: a copy of the shape, a step away, joined.
  await page.locator('.react-flow__pane').click({ position: { x: 20, y: 20 } });
  await restOn('a', 'bottom');
  record((await ghost.getAttribute('data-kind').catch(() => null)) === 'copy', 'facing nothing, it is a copy of the shape');
  const offered = await page.getByTestId('diagram-suggestion-box').boundingBox().catch(() => null);
  const from = await page.locator('.react-flow__node[data-id="a"]').boundingBox();
  record(
    offered !== null && Math.abs(offered.x - from.x) < 2 && Math.abs(offered.width - from.width) < 2 && offered.y - (from.y + from.height) >= 60 && offered.y - (from.y + from.height) <= 100,
    `drawn in dashes under it, the same size (${offered === null ? 'none' : `${Math.round(offered.y - (from.y + from.height))}px below`})`,
  );
  await click();
  record((await page.locator('.react-flow__node').count()) === 3, 'a click makes the shape');
  record((await page.getByTestId('diagram-label-editor').count()) === 1, 'with its name ready to be typed');
  await page.keyboard.type('third');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(3000);

  const kept = await stored();
  const line = kept.edges.find((edge) => edge.from === 'a' && edge.to === 'b');
  record(line !== undefined && line.fromSide === 'right' && line.toSide === 'left', `the server keeps the line, leaving by the side that was rested on (${line?.fromSide} to ${line?.toSide})`);
  record(line?.routing === 'curved' && (line?.end ?? 'arrow') === 'arrow', 'as a curved arrow');
  const made = kept.nodes.find((node) => node.id !== 'a' && node.id !== 'b');
  record(made?.label === 'third' && made?.kind === 'rounded' && made?.color === '#dbeafe', `and the new shape, a copy in kind and colour, named as typed (${made?.kind}, ${made?.color}, "${made?.label}")`);
  record(made !== undefined && made.x === 0 && made.w === 160 && made.h === 64 && made.y >= 136 && made.y <= 152, `a step under the first (at ${made?.x}, ${made?.y})`);
  const joined = kept.edges.find((edge) => edge.from === 'a' && edge.to === made?.id);
  record(joined !== undefined && joined.fromSide === 'bottom' && joined.toSide === 'top', 'joined to it from the side that was rested on');

  // Reading a diagram, nothing is offered.
  await page.getByTestId('diagram-mode-view').click();
  await page.waitForTimeout(300);
  const side = await page.locator('.react-flow__node[data-id="b"]').boundingBox();
  await page.mouse.move(side.x + side.width + 60, side.y + side.height + 60);
  await page.mouse.move(side.x + side.width, side.y + side.height / 2, { steps: 4 });
  await page.waitForTimeout(500);
  record((await ghost.count()) === 0, 'viewing, a side offers nothing');
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
