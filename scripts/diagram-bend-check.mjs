/**
 * A straight or curved line is bent by dragging it.
 *
 * A line ran the one way its routing said - straight across, or a curve - and
 * a line that had to go round something could only be made right-angled. Now
 * a selected straight or curved line has a grip in the middle of each part:
 * dragged, it makes a bend there, which has a grip of its own to move it and a
 * double-click takes out. This bends a straight line, moves the bend and takes
 * it out again, bends a curved one, and reads the exported picture to see the
 * server draws it through the same bend.
 */
import { WORKSPACE, BASE, open, record, finish } from './suite/harness.mjs';

const NAME = `zzBend ${Date.now()}`;

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 950 } });

const id = (
  await graphql('mutation ($w: ID!, $n: String!, $d: String) { createDiagram(workspaceId: $w, name: $n, document: $d) { id } }', {
    w: WORKSPACE,
    n: NAME,
    d: JSON.stringify({
      nodes: [
        { id: 'a', kind: 'box', label: 'left', x: 0, y: 0, w: 160, h: 60 },
        { id: 'b', kind: 'box', label: 'right', x: 400, y: 0, w: 160, h: 60 },
        { id: 'c', kind: 'box', label: 'lower left', x: 0, y: 240, w: 160, h: 60 },
        { id: 'd', kind: 'box', label: 'lower right', x: 400, y: 240, w: 160, h: 60 },
        { id: 'e', kind: 'box', label: 'bottom left', x: 0, y: 420, w: 160, h: 60 },
        { id: 'f', kind: 'box', label: 'bottom right', x: 400, y: 420, w: 160, h: 60 },
      ],
      edges: [
        { id: 's', from: 'a', to: 'b', kind: 'arrow', routing: 'straight' },
        { id: 'k', from: 'c', to: 'd', kind: 'arrow', routing: 'curved' },
        // Bent twice already, down under its boxes: the part between the two bends runs across at 560.
        { id: 'z', from: 'e', to: 'f', kind: 'arrow', routing: 'straight', points: [[80, 560], [480, 560]] },
      ],
    }),
  })
).createDiagram.id;

const stored = async () => JSON.parse((await graphql('query ($id: ID!) { diagram(id: $id) { document } }', { id })).diagram.document);
const edgeOf = async (edge) => (await stored()).edges.find((one) => one.id === edge);
const pathOf = (edge) => page.locator(`.react-flow__edge[data-id="${edge}"] path.react-flow__edge-path`).getAttribute('d');
const onScreen = async (x, y) => {
  const view = await page.evaluate(() => {
    const at = new DOMMatrix(getComputedStyle(document.querySelector('.react-flow__viewport')).transform);
    const room = document.querySelector('.react-flow').getBoundingClientRect();
    return { x: room.left + at.e, y: room.top + at.f, zoom: at.a };
  });
  return { x: view.x + x * view.zoom, y: view.y + y * view.zoom, zoom: view.zoom };
};
const middle = async (locator) => {
  const box = await locator.boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};
/** Presses at [from] and moves by (dx, dy) in steps before letting go; [during] is looked at before the release. */
async function drag(from, dx, dy, during) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let step = 1; step <= 10; step++) await page.mouse.move(from.x + (dx * step) / 10, from.y + (dy * step) / 10);
  await page.waitForTimeout(150);
  const seen = during === undefined ? undefined : await during();
  await page.mouse.up();
  await page.waitForTimeout(400);
  return seen;
}

try {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/diagrams/${id}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.react-flow__node[data-id="a"]').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
  if ((await page.getByTestId('diagram-mode-edit').getAttribute('aria-checked')) !== 'true') await page.getByTestId('diagram-mode-edit').click();

  // The straight line, selected by a point a quarter of the way along it.
  const quarter = await onScreen(220, 30);
  await page.mouse.click(quarter.x, quarter.y);
  await page.waitForTimeout(300);
  const adds = page.locator('[data-testid="diagram-bend-add"][data-edge="s"]');
  record((await adds.count()) === 1 && (await page.locator('[data-testid="diagram-bend"][data-edge="s"]').count()) === 0, `selected, a straight line offers a grip in its middle to bend it (${await adds.count()})`);
  const grip = await middle(adds.first());
  const expected = await onScreen(280, 30);
  record(Math.abs(grip.x - expected.x) <= 3 && Math.abs(grip.y - expected.y) <= 3, 'on the line, half way along');

  // Dragged down: a bend is made there.
  const aimed = await drag(grip, 0, 120 * quarter.zoom, () => page.getByTestId('diagram-bend-aim').count());
  record(aimed === 1, 'dragging it shows the line as it would run');
  await page.waitForTimeout(2800);
  let kept = await edgeOf('s');
  const bend = kept?.points?.[0];
  record(kept?.points?.length === 1 && Math.abs(bend[0] - 280) <= 8 && Math.abs(bend[1] - 150) <= 8, `let go, the server keeps the bend where it was dragged (${JSON.stringify(kept?.points)})`);
  record(kept?.routing === 'straight', 'and the line stays straight');
  const low = await page.locator('.react-flow__edge[data-id="s"] path.react-flow__edge-path').evaluate((one) => {
    const box = one.getBBox();
    return box.y + box.height;
  });
  record(Math.abs(low - bend[1]) <= 12, `down to the bend: the line now reaches ${Math.round(low)}, the bend is at ${bend[1]}`);

  // The bend's own grip moves it, and a double-click takes it out.
  const bendGrip = page.locator('[data-testid="diagram-bend"][data-edge="s"]');
  record((await bendGrip.count()) === 1 && (await adds.count()) === 2, `the bend has a grip of its own, and each part beside it a grip to bend it again (${await bendGrip.count()} bend, ${await adds.count()} more)`);
  await drag(await middle(bendGrip), 40 * quarter.zoom, 0);
  await page.waitForTimeout(2800);
  kept = await edgeOf('s');
  record(Math.abs(kept?.points?.[0]?.[0] - (bend[0] + 40)) <= 8 && Math.abs(kept?.points?.[0]?.[1] - bend[1]) <= 8, `dragged, the bend moves (${JSON.stringify(kept?.points)})`);
  await bendGrip.dblclick();
  await page.waitForTimeout(2800);
  kept = await edgeOf('s');
  record(kept !== undefined && (kept.points === undefined || kept.points.length === 0), 'a double-click on it takes it out, and the line is straight again');

  // A part between two bends, taken hold of along its length, moves whole: both its bends together.
  const across = await onScreen(200, 560);
  await page.mouse.click(across.x, across.y);
  await page.waitForTimeout(300);
  const span = page.locator('[data-testid="diagram-bend-span"][data-edge="z"]');
  record((await span.count()) === 1, `a line bent twice offers the part between its bends to be taken hold of (${await span.count()})`);
  await drag({ x: across.x, y: across.y }, 0, 40 * across.zoom);
  await page.waitForTimeout(2800);
  const moved = await edgeOf('z');
  record(JSON.stringify(moved?.points) === JSON.stringify([[80, 600], [480, 600]]), `dragged, the part moves whole and both bends with it (${JSON.stringify(moved?.points)})`);

  // Each bend of the selected line has a cross beside it, without the pointer having to find it, which takes it out.
  const crosses = page.locator('[data-testid="diagram-bend-remove"][data-edge="z"]');
  record((await crosses.count()) === 2, `every bend of a selected line shows a cross beside it (${await crosses.count()})`);
  await page.locator('[data-testid="diagram-bend-remove"][data-edge="z"][data-bend="0"]').click();
  await page.waitForTimeout(2800);
  const fewer = await edgeOf('z');
  record(JSON.stringify(fewer?.points) === JSON.stringify([[480, 600]]), `and the cross takes that bend out, leaving the other (${JSON.stringify(fewer?.points)})`);
  // The line's panel takes out what is left, and says how many.
  const unbend = page.getByTestId('diagram-edge-unbend');
  record((await unbend.count()) === 1 && (await unbend.textContent())?.includes('bend') === true, `the line's panel offers to take its bends out (${await unbend.textContent().catch(() => 'none')})`);
  await unbend.click();
  await page.waitForTimeout(2800);
  const plain = await edgeOf('z');
  record(plain !== undefined && (plain.points === undefined || plain.points.length === 0) && (await unbend.count()) === 0, 'and does, after which it offers nothing');

  // The curved line, bent the same way: it passes through the bend as two curves.
  const curveAt = await onScreen(220, 270);
  await page.mouse.click(curveAt.x, curveAt.y);
  await page.waitForTimeout(300);
  const curveAdd = page.locator('[data-testid="diagram-bend-add"][data-edge="k"]');
  record((await curveAdd.count()) === 1, 'a curved line offers the same grip');
  await drag(await middle(curveAdd.first()), 0, 96 * curveAt.zoom);
  await page.waitForTimeout(2800);
  const curved = await edgeOf('k');
  const drawn = await pathOf('k');
  record(curved?.points?.length === 1 && curved.routing === 'curved' && (drawn?.match(/ C /g) ?? []).length === 2, `bent, it is kept curved and drawn as two curves through the bend (${JSON.stringify(curved?.points)})`);

  // The exported picture bends it the same way, through the same point.
  const svg = await (await page.request.get(`${BASE}/api/diagrams/${id}/export/svg`)).text();
  const [bx, by] = curved?.points?.[0] ?? [NaN, NaN];
  record(svg.includes(` ${bx}.0 ${by}.0 C `), `the exported picture draws the curve through the bend at ${bx}, ${by}`);

  // Viewing, nothing is offered to drag.
  await page.getByTestId('diagram-mode-view').click();
  await page.waitForTimeout(300);
  await page.mouse.click(curveAt.x, curveAt.y);
  await page.waitForTimeout(300);
  record((await page.getByTestId('diagram-bend-add').count()) + (await page.getByTestId('diagram-bend').count()) === 0, 'viewing, a line has no grips to bend it');
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
