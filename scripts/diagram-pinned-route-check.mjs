/**
 * A line pinned to a side of a shape leaves and arrives by that side, and a
 * right-angle line's runs can be dragged.
 *
 * Two things a pinned end got wrong. A curve arriving at a pinned top came in
 * from the side it would have taken unpinned, so its arrowhead met the shape
 * at a slant. And a right-angle line pinned to the right of both its shapes
 * went straight down between them, through the pin's own shape, with nothing
 * to take hold of to push it out. Now a pinned end is met square on, a
 * right-angle line steps out of the side it is pinned to, and each of its runs
 * has a grip that moves it. This reads both lines as drawn, drags a run, and
 * reads the line back from the server and from a reload.
 */
import { WORKSPACE, BASE, open, record, finish } from './suite/harness.mjs';

const NAME = `zzPinned ${Date.now()}`;

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 950 } });

const id = (
  await graphql('mutation ($w: ID!, $n: String!, $d: String) { createDiagram(workspaceId: $w, name: $n, document: $d) { id } }', {
    w: WORKSPACE,
    n: NAME,
    d: JSON.stringify({
      nodes: [
        { id: 'a', kind: 'box', label: 'first', x: 0, y: 0, w: 160, h: 60 },
        { id: 'c', kind: 'database', label: 'store', x: 420, y: 260, w: 120, h: 100 },
        { id: 'f', kind: 'box', label: 'above', x: 760, y: 100, w: 160, h: 60 },
        { id: 'g', kind: 'box', label: 'below', x: 760, y: 300, w: 160, h: 60 },
      ],
      edges: [
        { id: 'k', from: 'a', to: 'c', kind: 'arrow', routing: 'curved', toSide: 'top' },
        { id: 'r', from: 'f', to: 'g', kind: 'arrow', routing: 'right-angles', fromSide: 'right', toSide: 'right' },
      ],
    }),
  })
).createDiagram.id;

const address = `${BASE}/workspace/${WORKSPACE}/explore/diagrams/${id}`;
const stored = async () => JSON.parse((await graphql('query ($id: ID!) { diagram(id: $id) { document } }', { id })).diagram.document);
const pathOf = (edge) => page.locator(`.react-flow__edge[data-id="${edge}"] path.react-flow__edge-path`).getAttribute('d');
/** Every number of a path, in pairs: the points it is drawn through, control points included. */
const pointsOf = (d) => {
  const all = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  return Array.from({ length: Math.floor(all.length / 2) }, (_, at) => ({ x: all[at * 2], y: all[at * 2 + 1] }));
};
const onScreen = async (x, y) => {
  const view = await page.evaluate(() => {
    const at = new DOMMatrix(getComputedStyle(document.querySelector('.react-flow__viewport')).transform);
    const room = document.querySelector('.react-flow').getBoundingClientRect();
    return { x: room.left + at.e, y: room.top + at.f, zoom: at.a };
  });
  return [view.x + x * view.zoom, view.y + y * view.zoom];
};
const arrive = async () => {
  await page.goto(address, { waitUntil: 'domcontentloaded' });
  await page.locator('.react-flow__node[data-id="a"]').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
  if ((await page.getByTestId('diagram-mode-edit').getAttribute('aria-checked')) !== 'true') {
    await page.getByTestId('diagram-mode-edit').click();
  }
};

try {
  await arrive();

  // The curve, pinned to the top of the shape it arrives at.
  const curve = pointsOf(await pathOf('k'));
  const end = curve[curve.length - 1];
  const pull = curve[curve.length - 2];
  record(Math.abs(end.x - 480) < 1 && Math.abs(end.y - 260) < 1, `a curve pinned to a top ends at the middle of that top (${end.x}, ${end.y})`);
  record(Math.abs(pull.x - end.x) < 1 && pull.y < end.y - 8, `and comes straight down onto it: its last pull is at ${pull.x}, ${pull.y}, directly above`);

  // The right-angle line, pinned to the right of both.
  const steps = pointsOf(await pathOf('r'));
  record(steps[0].x === 920 && steps[0].y === 130, `a right-angle line pinned to a right side starts at the middle of it (${steps[0].x}, ${steps[0].y})`);
  record(steps[1].x > 920 && steps[1].y === 130, `and steps out of that side before it turns (next at ${steps[1].x}, ${steps[1].y})`);
  const last = steps[steps.length - 1];
  const beforeLast = steps[steps.length - 2];
  record(last.x === 920 && last.y === 330 && beforeLast.x > 920 && beforeLast.y === 330, 'arriving at the other right side from outside it');
  const out = Math.max(...steps.map((one) => one.x));
  record(steps.every((one) => one.x >= 920), `never crossing either shape (it runs down at x ${out})`);

  // Its run, dragged further out.
  await page.mouse.click(...(await onScreen(out, 230)));
  await page.getByTestId('diagram-edge-inspector').waitFor({ timeout: 5_000 });
  const grips = page.getByTestId('diagram-run-grip');
  record((await grips.count()) >= 1, `selected, the line shows a grip on its run (${await grips.count()})`);
  const grip = await grips.first().boundingBox();
  const zoom = await page.locator('.react-flow__viewport').evaluate((one) => new DOMMatrix(getComputedStyle(one).transform).a);
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2 + 40 * zoom, grip.y + grip.height / 2, { steps: 4 });
  record((await page.getByTestId('diagram-run-aim').count()) === 1, 'dragging the grip shows where the run is going');
  await page.mouse.move(grip.x + grip.width / 2 + 80 * zoom, grip.y + grip.height / 2, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const pushed = Math.max(...pointsOf(await pathOf('r')).map((one) => one.x));
  record(Math.abs(pushed - (out + 80)) <= 4, `and lets it go there: the run is at x ${pushed}, 80 further out`);

  await page.waitForTimeout(2800);
  const kept = (await stored()).edges.find((edge) => edge.id === 'r');
  record(Array.isArray(kept?.points) && kept.points.length >= 1 && kept.points.some((one) => Math.abs(one[0] - pushed) <= 1), `the server keeps the run where it was put (${JSON.stringify(kept?.points)})`);
  record(kept?.fromSide === 'right' && kept?.toSide === 'right', 'and the line still pinned to both right sides');

  await arrive();
  const again = pointsOf(await pathOf('r'));
  record(Math.abs(Math.max(...again.map((one) => one.x)) - pushed) <= 1 && again[1].x > 920, 'a reload draws it the same way');

  // The exported picture routes them as the canvas does.
  const svg = await (await page.request.get(`${BASE}/api/diagrams/${id}/export/svg`)).text();
  const widest = Math.max(...[...svg.matchAll(/<path[^>]* d="([^"]+)"/g)].map((one) => Math.max(...pointsOf(one[1]).map((at) => at.x))));
  // The shapes' rectangles, not the paper behind them, which is the first rectangle and fills the whole frame.
  const boxes = [...svg.matchAll(/<rect[^>]* x="(-?[\d.]+)"[^>]* width="([\d.]+)"[^>]* rx=/g)].map((one) => Number(one[1]) + Number(one[2])).filter((right) => right < widest);
  const edge = Math.max(...boxes);
  // And the run is inside the picture: a frame drawn round the boxes alone cut it off.
  const frame = svg.match(/viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/);
  record(frame !== null && Number(frame[1]) + Number(frame[3]) >= widest, `the exported picture is framed round the run (it ends at ${frame === null ? '?' : Number(frame[1]) + Number(frame[3])}, the run at ${widest})`);
  record(Math.abs(widest - edge - (pushed - 920)) <= 2, `the export draws the run as far out of the shapes as the canvas does (${Math.round(widest - edge)} against ${pushed - 920})`);
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
