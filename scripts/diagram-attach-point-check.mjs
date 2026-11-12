/**
 * An arrow's ends can be pinned to a side of their box, and dragged to another.
 *
 * A line used to float: each end found the side of its box facing the other,
 * wherever the boxes were. Now an end can be pinned to a side - it leaves there
 * and stays there - and an end dragged onto another box re-points the line to
 * it. This measures what the server keeps and what the canvas draws: a pinned
 * end leaves from the pinned side, not the side facing the other box, and a
 * reconnect moves the line's end from one box to another.
 */
import { WORKSPACE, BASE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });

const id = (
  await graphql('mutation ($w: ID!, $n: String!, $d: String) { createDiagram(workspaceId: $w, name: $n, document: $d) { id } }', {
    w: WORKSPACE,
    n: `zzAttach ${Date.now()}`,
    d: JSON.stringify({
      nodes: [
        { id: 'a', kind: 'box', label: 'first', x: 0, y: 0, w: 160, h: 60 },
        { id: 'b', kind: 'box', label: 'second', x: 360, y: 260, w: 160, h: 60 },
        { id: 'c', kind: 'box', label: 'third', x: 360, y: 0, w: 160, h: 60 },
      ],
      // Pinned to the top of a and the bottom of b, where a floating line would take neither.
      edges: [{ id: 'e', from: 'a', to: 'b', kind: 'arrow', fromSide: 'top', toSide: 'bottom' }],
    }),
  })
).createDiagram.id;

const stored = async () => JSON.parse((await graphql('query ($id: ID!) { diagram(id: $id) { document } }', { id })).diagram.document);
const edgeOf = (drawing) => drawing.edges.find((one) => one.id === 'e');
const waitSaved = () => page.waitForTimeout(2500);

try {
  // The server keeps the pinned sides through its edge rows, its document and back.
  const first = edgeOf(await stored());
  record(first?.fromSide === 'top' && first?.toSide === 'bottom', `the pinned sides are kept (${first?.fromSide}, ${first?.toSide})`);

  await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/diagrams/${id}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.react-flow__node[data-id="a"]').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);

  // The line leaves the top of a, where it is pinned - a floating end would leave the
  // side facing b, well below the top - so its start sits near a's top-centre in the
  // drawing's own coordinates (a is 160 by 60 at the origin: top-centre is 80, 0).
  const d = await page.locator('.react-flow__edge[data-id="e"] path.react-flow__edge-path').getAttribute('d');
  const start = /M\s*([\d.-]+)[\s,]+([\d.-]+)/.exec(d ?? '');
  const sy = start === null ? NaN : Number(start[2]);
  record(Number.isFinite(sy) && sy < 20, `the pinned end leaves the top of its box (y=${Number.isFinite(sy) ? Math.round(sy) : 'none'} in the drawing)`);

  // The end dragged onto another box re-points the line there. The target end's
  // reconnect handle is dragged onto c's middle, which floats that end (no side).
  if ((await page.getByTestId('diagram-mode-edit').getAttribute('aria-checked')) !== 'true') {
    await page.getByTestId('diagram-mode-edit').click();
  }
  await page.locator('.react-flow__edge[data-id="e"]').hover({ force: true });
  const anchor = page.locator('.react-flow__edge[data-id="e"] .react-flow__edgeupdater-target');
  const grabbed = await anchor.boundingBox().catch(() => null);
  const onto = await page.locator('.react-flow__node[data-id="c"]').boundingBox();
  if (grabbed !== null && onto !== null) {
    await page.mouse.move(grabbed.x + grabbed.width / 2, grabbed.y + grabbed.height / 2);
    await page.mouse.down();
    await page.mouse.move(onto.x + onto.width / 2, onto.y + onto.height / 2, { steps: 8 });
    await page.mouse.up();
    await waitSaved();
  }
  const moved = edgeOf(await stored());
  record(moved?.to === 'c', `an end dragged onto another box re-points the line to it (to=${moved?.to})`);
  record(moved?.toSide === undefined, `and dropping it on the box's middle floats that end again (toSide=${moved?.toSide ?? 'none'})`);
} finally {
  await graphql('mutation ($id: ID!) { deleteDiagram(id: $id) }', { id }).catch(() => undefined);
}

await finish(browser);
