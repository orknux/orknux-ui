/**
 * A shape in a diagram can be turned, by a shortcut, a button and a number.
 *
 * There was no way to turn a shape at all: a diamond pointed up and a
 * triangle stood on its base, whatever the drawing wanted. Now the selected
 * shapes turn a quarter clockwise on the shortcut (R unless Preferences says
 * otherwise) and on the toolbar's button, and the panel takes any whole number
 * of degrees. This measures what is drawn and what is kept: the shape's own
 * outline stands where a turned one would, the server holds the turn, a line
 * leaves the turned outline rather than the box it was turned from, and four
 * quarter turns leave nothing behind.
 */
import { WORKSPACE, BASE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });

const NAME = `zzRotate ${Date.now()}`;

const id = (
  await graphql('mutation ($w: ID!, $n: String!, $d: String) { createDiagram(workspaceId: $w, name: $n, document: $d) { id } }', {
    w: WORKSPACE,
    n: NAME,
    d: JSON.stringify({
      nodes: [
        { id: 'a', kind: 'box', label: 'first', x: 0, y: 0, w: 160, h: 60 },
        { id: 'b', kind: 'box', label: 'second', x: 400, y: 0, w: 160, h: 60 },
      ],
      edges: [{ id: 'e', from: 'a', to: 'b', kind: 'arrow' }],
    }),
  })
).createDiagram.id;

const stored = async () => JSON.parse((await graphql('query ($id: ID!) { diagram(id: $id) { document } }', { id })).diagram.document);
const turnOf = (drawing) => drawing.nodes.find((one) => one.id === 'a')?.rotation;
const waitSaved = () => page.waitForTimeout(2500);
/** Where the line leaves a, in the drawing's own coordinates. */
const startOf = async () => {
  const d = await page.locator('.react-flow__edge[data-id="e"] path.react-flow__edge-path').getAttribute('d');
  const start = /M\s*([\d.-]+)[\s,]+([\d.-]+)/.exec(d ?? '');
  return start === null ? [NaN, NaN] : [Number(start[1]), Number(start[2])];
};

try {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/diagrams/${id}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.react-flow__node[data-id="a"]').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
  if ((await page.getByTestId('diagram-mode-edit').getAttribute('aria-checked')) !== 'true') {
    await page.getByTestId('diagram-mode-edit').click();
  }

  const [uprightX] = await startOf();
  record(Math.abs(uprightX - 160) < 6, `upright, the line leaves the box's right edge (x=${Math.round(uprightX)}, the edge is at 160)`);

  // Nothing chosen, nothing to turn.
  record(await page.getByTestId('diagram-rotate').isDisabled(), 'the Rotate button is off while no shape is selected');

  // The shortcut, on the selected shape.
  await page.locator('.react-flow__node[data-id="a"]').click();
  record(await page.getByTestId('diagram-rotate').isEnabled(), 'and on once one is');
  await page.keyboard.press('r');
  const wrapper = page.locator('.react-flow__node[data-id="a"] [data-testid="diagram-node-turned"]');
  await wrapper.waitFor({ timeout: 5000 }).catch(() => undefined);
  record((await wrapper.getAttribute('data-rotation').catch(() => null)) === '90', 'the shortcut turns the selected shape a quarter turn');

  // What is drawn: 160 by 60 turned a quarter stands taller than it is wide.
  const drawn = await wrapper.boundingBox().catch(() => null);
  record(drawn !== null && drawn.height > drawn.width * 2, `the shape is drawn turned (${drawn === null ? 'not drawn' : `${Math.round(drawn.width)} by ${Math.round(drawn.height)} on screen`})`);

  // The line leaves the turned outline: its right edge is at 110 now, 30 out from the middle at 80.
  await page.waitForTimeout(400);
  const [turnedX, turnedY] = await startOf();
  record(Math.abs(turnedX - 110) < 6 && Math.abs(turnedY - 30) < 6, `the line leaves the turned outline (${Math.round(turnedX)}, ${Math.round(turnedY)}; the turned edge is at 110, 30)`);

  await waitSaved();
  record(turnOf(await stored()) === 90, `the turn is kept (${turnOf(await stored()) ?? 'none'})`);

  // The button, and the number in the panel showing what it came to.
  await page.getByTestId('diagram-rotate').click();
  record((await wrapper.getAttribute('data-rotation').catch(() => null)) === '180', 'the toolbar button turns it another quarter');
  record((await page.getByTestId('diagram-node-rotation').inputValue().catch(() => '')) === '180', 'and the panel says how far it is turned');

  // Any whole number of degrees, typed.
  await page.getByTestId('diagram-node-rotation').fill('45');
  await page.getByTestId('diagram-node-rotation').blur();
  record((await wrapper.getAttribute('data-rotation').catch(() => null)) === '45', 'a number typed in the panel turns it that far');
  await waitSaved();
  record(turnOf(await stored()) === 45, `and that is kept too (${turnOf(await stored()) ?? 'none'})`);

  // It survives a reload, drawn as it was left.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.react-flow__node[data-id="a"]').waitFor({ timeout: 20_000 });
  record((await wrapper.getAttribute('data-rotation').catch(() => null)) === '45', 'opened again, it is drawn turned');

  // Back upright leaves nothing behind: no wrapper, no rotation in the document.
  if ((await page.getByTestId('diagram-mode-edit').getAttribute('aria-checked')) !== 'true') {
    await page.getByTestId('diagram-mode-edit').click();
  }
  await page.locator('.react-flow__node[data-id="a"]').click();
  await page.getByTestId('diagram-node-rotation').fill('0');
  await page.getByTestId('diagram-node-rotation').blur();
  await waitSaved();
  record((await wrapper.count()) === 0, 'set back to 0 it is drawn upright again');
  record(turnOf(await stored()) === undefined, `and the document holds no turn (${turnOf(await stored()) ?? 'none'})`);
} finally {
  await graphql('mutation ($id: ID!) { deleteDiagram(id: $id) }', { id }).catch(() => undefined);
  // A deleted diagram is kept in the workspace's bin now, and a check's own is nobody's to restore.
  const kept = await graphql('query ($w: ID!) { recycleBin(workspaceId: $w, size: 200) { content { id kind name } } }', { w: WORKSPACE })
    .then((data) => data.recycleBin.content)
    .catch(() => []);
  for (const entry of kept.filter((one) => one.kind === 'DIAGRAM' && one.name === NAME)) {
    await graphql('mutation ($id: ID!) { purgeRecycleBinEntry(id: $id) }', { id: entry.id }).catch(() => undefined);
  }
}

await finish(browser);
