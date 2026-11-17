/**
 * Several shapes are selected by dragging a rectangle over them.
 *
 * A drag on the empty canvas moves it, so taking hold of five shapes meant
 * five Shift-clicks, or a Shift-drag nobody is told about. A tool in the
 * canvas's corner - and a key - turns a drag into a selection rectangle, the
 * way the workflow canvas has it: what the rectangle touches is selected, and
 * what is selected moves and is deleted together. This turns it on, drags a
 * rectangle over two of three shapes, moves them, and reads all of it back.
 */
import { WORKSPACE, BASE, open, record, finish } from './suite/harness.mjs';

const NAME = `zzSelect ${Date.now()}`;

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 950 } });

const id = (
  await graphql('mutation ($w: ID!, $n: String!, $d: String) { createDiagram(workspaceId: $w, name: $n, document: $d) { id } }', {
    w: WORKSPACE,
    n: NAME,
    d: JSON.stringify({
      nodes: [
        { id: 'a', kind: 'box', label: 'first', x: 0, y: 0, w: 160, h: 64 },
        { id: 'b', kind: 'box', label: 'second', x: 320, y: 0, w: 160, h: 64 },
        { id: 'c', kind: 'box', label: 'apart', x: 160, y: 400, w: 160, h: 64 },
      ],
      edges: [],
    }),
  })
).createDiagram.id;

const address = `${BASE}/workspace/${WORKSPACE}/explore/diagrams/${id}`;
const stored = async () => JSON.parse((await graphql('query ($id: ID!) { diagram(id: $id) { document } }', { id })).diagram.document);
const boxOf = (node) => page.locator(`.react-flow__node[data-id="${node}"]`).boundingBox();
const tool = page.getByTestId('diagram-select-mode');
const selected = () => page.locator('.react-flow__node.selected').evaluateAll((all) => all.map((one) => one.getAttribute('data-id')).sort());
const viewport = () => page.locator('.react-flow__viewport').evaluate((one) => getComputedStyle(one).transform);
const arrive = async () => {
  await page.goto(address, { waitUntil: 'domcontentloaded' });
  await page.locator('.react-flow__node[data-id="a"]').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
  if ((await page.getByTestId('diagram-mode-edit').getAttribute('aria-checked')) !== 'true') {
    await page.getByTestId('diagram-mode-edit').click();
  }
};
/** A drag over the empty canvas, from above and left of the first shape to under the middle of the second. */
const sweep = async () => {
  const first = await boxOf('a');
  const second = await boxOf('b');
  await page.mouse.move(first.x - 50, first.y - 50);
  await page.mouse.down();
  await page.mouse.move(first.x + 100, first.y + 60, { steps: 5 });
  await page.mouse.move(second.x + 80, second.y + 100, { steps: 5 });
};

try {
  await arrive();
  record((await tool.count()) === 1 && (await tool.getAttribute('aria-pressed')) === 'false', 'the canvas has a rectangle-select tool in its corner, off to begin with');

  // Off, a drag on the canvas moves it. A short one: the canvas is wanted where it is for what follows.
  const before = await viewport();
  const corner = await boxOf('a');
  await page.mouse.move(corner.x - 50, corner.y - 50);
  await page.mouse.down();
  await page.mouse.move(corner.x - 20, corner.y - 30, { steps: 4 });
  await page.mouse.move(corner.x + 10, corner.y - 10, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  record((await viewport()) !== before && (await selected()).length === 0, 'off, a drag on the empty canvas moves the canvas and selects nothing');

  await tool.click();
  record((await tool.getAttribute('aria-pressed')) === 'true', 'a click turns it on');
  const fixed = await viewport();
  await sweep();
  await page.waitForTimeout(150);
  record((await page.locator('.react-flow__selection').count()) === 1, 'on, a drag draws a rectangle');
  await page.mouse.up();
  await page.waitForTimeout(300);
  record((await viewport()) === fixed, 'and the canvas stays where it is');
  const taken = await selected();
  record(taken.join() === 'a,b', `what the rectangle touched is selected, and nothing else (${taken.join(', ') || 'nothing'})`);

  // The two move as one.
  const hold = await boxOf('a');
  await page.mouse.move(hold.x + 80, hold.y + 32);
  await page.mouse.down();
  await page.mouse.move(hold.x + 100, hold.y + 60, { steps: 4 });
  await page.mouse.move(hold.x + 80 + 40, hold.y + 32 + 96, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(3000);
  const zoom = await page.locator('.react-flow__viewport').evaluate((one) => new DOMMatrix(getComputedStyle(one).transform).a);
  const moved = await stored();
  const at = (node) => moved.nodes.find((one) => one.id === node);
  const dx = at('a').x;
  const dy = at('a').y;
  record(Math.abs(dx - 40 / zoom) <= 8 && Math.abs(dy - 96 / zoom) <= 8, `dragging one of them moves it (${dx}, ${dy})`);
  record(at('b').x === 320 + dx && at('b').y === dy, `and the other by the same amount (${at('b').x}, ${at('b').y})`);
  record(at('c').x === 160 && at('c').y === 400, 'while the one outside the rectangle stays');

  // The key is the tool, and the choice outlives the page.
  await page.locator('.react-flow__pane').click({ position: { x: 30, y: 30 } });
  await page.keyboard.press('s');
  await page.waitForTimeout(200);
  record((await tool.getAttribute('aria-pressed')) === 'false', 'its key turns it off');
  await page.keyboard.press('s');
  await page.waitForTimeout(200);
  record((await tool.getAttribute('aria-pressed')) === 'true', 'and on again');
  await arrive();
  record((await tool.getAttribute('aria-pressed')) === 'true', 'a reload finds it as it was left');

  // Deleting what a rectangle took.
  await sweep();
  await page.mouse.up();
  await page.waitForTimeout(300);
  await page.keyboard.press('Delete');
  await page.waitForTimeout(3000);
  const left = (await stored()).nodes.map((node) => node.id);
  record(left.join() === 'c', `Delete removes everything the rectangle took (left: ${left.join(', ')})`);

  await page.getByTestId('diagram-mode-view').click();
  await page.waitForTimeout(300);
  record((await tool.count()) === 0, 'viewing, there is no such tool: nothing can be changed there');
  await page.getByTestId('diagram-mode-edit').click();
  await tool.click();
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
