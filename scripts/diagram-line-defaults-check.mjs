/**
 * A line is drawn curved unless somebody says otherwise, and a lit line shows
 * only the arrows it has.
 *
 * Two things about a line as it is first met. A line dragged out of a shape
 * was made straight, and nearly every one was then changed to curved by hand -
 * so curved is what a new one is. And a selected line showed arrowheads
 * travelling along it whatever its ends were: a plain line, with no arrow at
 * either end, was drawn pointing somewhere it does not. This draws a line by
 * dragging and reads how it was kept, and counts the travelling arrowheads on
 * a plain line and on an arrow.
 */
import { WORKSPACE, BASE, open, record, finish } from './suite/harness.mjs';

const NAME = `zzLineDefaults ${Date.now()}`;

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 950 } });

const id = (
  await graphql('mutation ($w: ID!, $n: String!, $d: String) { createDiagram(workspaceId: $w, name: $n, document: $d) { id } }', {
    w: WORKSPACE,
    n: NAME,
    d: JSON.stringify({
      nodes: [
        { id: 'a', kind: 'box', label: 'first', x: 0, y: 0, w: 160, h: 60 },
        { id: 'b', kind: 'box', label: 'second', x: 400, y: 0, w: 160, h: 60 },
        { id: 'c', kind: 'box', label: 'third', x: 400, y: 240, w: 160, h: 60 },
        { id: 'd', kind: 'box', label: 'fourth', x: 0, y: 400, w: 160, h: 60 },
      ],
      edges: [
        { id: 'plain', from: 'a', to: 'b', kind: 'line', line: 'solid', start: 'none', end: 'none' },
        // Curved: a new line now looks like the line made before it, which this is - diagram-rich-text-check holds that half.
        { id: 'arrow', from: 'b', to: 'c', kind: 'arrow', line: 'solid', start: 'none', end: 'arrow', routing: 'curved' },
      ],
    }),
  })
).createDiagram.id;

const stored = async () => JSON.parse((await graphql('query ($id: ID!) { diagram(id: $id) { document } }', { id })).diagram.document);
/** Where a point of the drawing is on the screen. */
const onScreen = async (x, y) => {
  const view = await page.evaluate(() => {
    const at = new DOMMatrix(getComputedStyle(document.querySelector('.react-flow__viewport')).transform);
    const room = document.querySelector('.react-flow').getBoundingClientRect();
    return { x: room.left + at.e, y: room.top + at.f, zoom: at.a };
  });
  return [view.x + x * view.zoom, view.y + y * view.zoom];
};
const heads = (edge) => page.locator(`.react-flow__edge[data-id="${edge}"] [data-flow-head]`).count();

try {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/diagrams/${id}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.react-flow__node[data-id="a"]').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
  if ((await page.getByTestId('diagram-mode-edit').getAttribute('aria-checked')) !== 'true') {
    await page.getByTestId('diagram-mode-edit').click();
  }

  // The plain line, selected: lit, and nothing travelling along it.
  await page.mouse.click(...(await onScreen(280, 30)));
  await page.waitForTimeout(500);
  record((await page.getByTestId('diagram-edge-inspector').count()) === 1, 'a click on the plain line selects it');
  const onPlain = await heads('plain');
  record(onPlain === 0, `a selected line with no arrow at either end shows no arrowheads travelling along it (${onPlain})`);

  // The arrow, selected, still shows which way it points.
  await page.mouse.click(...(await onScreen(480, 150)));
  await page.waitForTimeout(500);
  const onArrow = await heads('arrow');
  record(onArrow > 0, `a selected arrow still does (${onArrow})`);

  // A line dragged out of a shape's side and dropped on another shape.
  await page.locator('.react-flow__pane').click({ position: { x: 10, y: 10 } });
  await page.locator('.react-flow__node[data-id="d"]').hover();
  const handle = await page.locator('.react-flow__node[data-id="d"] .react-flow__handle-right').boundingBox();
  const [toX, toY] = await onScreen(480, 270);
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + 40, handle.y - 20, { steps: 4 });
  await page.mouse.move(toX, toY, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(2500);

  const made = (await stored()).edges.find((edge) => edge.from === 'd' && edge.to === 'c');
  record(made !== undefined, 'dragging from a side of one shape onto another draws a line between them');
  record(made?.routing === 'curved', `and the new line is curved (routing ${made?.routing})`);
  const path = made === undefined ? '' : await page.locator(`.react-flow__edge[data-id="${made.id}"] path.react-flow__edge-path`).getAttribute('d');
  record(/C/.test(path ?? ''), 'drawn as a curve on the canvas');
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
