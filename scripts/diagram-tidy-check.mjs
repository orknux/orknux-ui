/**
 * What made a large diagram look untidy, drawn tidily.
 *
 * Diagram 15 had a hexagon a thousand pixels wide whose slanted ends were 150
 * pixels each, components with tabs half their width, a bright blue dot on
 * every node that had notes, and lines that could only run straight across
 * whatever lay between their ends. This draws a diagram with those shapes and
 * a line between two boxes neither level nor stacked, and reads what is drawn:
 * the slants and tabs kept to the height; the notes dot quiet until the node is
 * looked at; and a line set to right angles drawn in horizontal and vertical
 * runs only, with curved drawn as a curve - picked in the line's panel, each
 * choice drawn as well as named. Removes the diagram.
 */
import { BASE, WORKSPACE, open, record, finish, saveEditor } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });

const nodes = [
  { id: 'wide', kind: 'hexagon', label: 'Sign-in and access', x: 0, y: 0, w: 1000, h: 64, notes: 'Who may do what.' },
  { id: 'tabs', kind: 'component', label: 'Command line', x: 0, y: 140, w: 800, h: 60 },
  { id: 'a', kind: 'box', label: 'Order', x: 0, y: 300, w: 160, h: 60 },
  { id: 'b', kind: 'box', label: 'Ledger', x: 420, y: 480, w: 160, h: 60 },
];
const edges = [{ id: 'bent', from: 'a', to: 'b', label: 'posts', routing: 'right-angles', kind: 'arrow' }];
const { createDiagram: made } = await graphql(
  'mutation ($w: ID!, $n: String!, $d: String) { createDiagram(workspaceId: $w, name: $n, document: $d) { id } }',
  { w: WORKSPACE, n: `zzTidy ${Date.now()}`, d: JSON.stringify({ nodes, edges }) },
);

/** How far in a hexagon's slant reaches, in pixels: its outline is drawn in a hundred units stretched to the node's 1000. */
const slantOf = () =>
  page.evaluate(() => {
    const path = document.querySelector('.react-flow__node[data-id="wide"] [data-testid="diagram-node-outline"] path');
    const [, x] = path?.getAttribute('d')?.match(/^M\s*([0-9.]+)/) ?? [];
    return x === undefined ? null : { units: Number(x), pixels: Number(x) * 10 };
  });

/** The points an edge's path visits, and whether it bends with a curve. */
const route = (id) =>
  page.evaluate((edge) => {
    const d = document.querySelector(`.react-flow__edge[data-id="${edge}"] path.react-flow__edge-path`)?.getAttribute('d') ?? '';
    const points = [...d.matchAll(/[ML]\s*([0-9.-]+)[ ,]([0-9.-]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    return { d, points, curved: /C/.test(d) };
  }, id);

try {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/diagrams/${made.id}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.react-flow__node[data-id="wide"]').waitFor({ timeout: 20_000 });
  await page.locator('.react-flow__edge[data-id="bent"] path.react-flow__edge-path').waitFor({ state: 'attached', timeout: 10_000 });
  await page.waitForTimeout(600);

  // A wide hexagon's slants and a wide component's tabs are kept to the height, not the width.
  const slant = await slantOf();
  record(slant !== null && slant.pixels <= 64 / 2 + 0.5, `a hexagon 1000 wide and 64 tall slants no more than half its height (${JSON.stringify(slant)})`);
  const tabs = await page.evaluate(() => {
    const box = document.querySelector('.react-flow__node[data-id="tabs"]');
    const paths = [...(box?.querySelectorAll('[data-testid="diagram-node-outline"] path') ?? [])];
    const tab = paths[1]?.getAttribute('d') ?? '';
    const xs = [...tab.matchAll(/[ML]\s*([0-9.]+)/g)].map((m) => Number(m[1]));
    return { units: Math.max(...xs), width: 800 };
  });
  record(tabs.units * 8 <= 0.35 * 60 + 0.5, `a component 800 wide has tabs no wider than a third of its height (${tabs.units * 8}px)`);

  // The notes dot: quiet on a node nobody is looking at, the selection's colour on the one being looked at.
  const dot = async () =>
    page.evaluate(() => {
      const mark = document.querySelector('.react-flow__node[data-id="wide"] [data-testid="diagram-node-noted"]');
      if (!mark) return null;
      const css = getComputedStyle(mark);
      return { opacity: Number(css.opacity), colour: css.backgroundColor, size: Math.round(mark.getBoundingClientRect().width) };
    });
  const resting = await dot();
  await page.locator('.react-flow__node[data-id="wide"]').hover();
  await page.waitForTimeout(250);
  const looked = await dot();
  await page.mouse.move(5, 5);
  record(resting !== null && resting.opacity < 1 && resting.size <= 6, `a node's notes dot is small and quiet at rest (${JSON.stringify(resting)})`);
  record(looked !== null && looked.opacity === 1 && looked.colour !== resting?.colour, `and stands out on the node being looked at (${JSON.stringify(looked)})`);

  // Right angles: only horizontal and vertical runs, leaving one side and arriving at another.
  const bent = await route('bent');
  const square = bent.points.length >= 2 && bent.points.every((p, at) => at === 0 || p[0] === bent.points[at - 1][0] || p[1] === bent.points[at - 1][1]);
  record(square && bent.points.length >= 3 && !bent.curved, `a line set to right angles runs only across and down (${bent.d})`);

  // The panel offers the three, each drawn; curved is drawn as a curve and is saved.
  const along = await page.locator('.react-flow__edge[data-id="bent"] path.react-flow__edge-path').boundingBox();
  if (along !== null) await page.mouse.click(along.x + along.width / 2, along.y + along.height / 2);
  const picker = page.getByTestId('diagram-edge-routing');
  const offered = await picker.waitFor({ timeout: 5_000 }).then(() => true).catch(() => false);
  record(offered && ((await picker.textContent()) ?? '').includes('Right angles'), `a selected line says how it runs (${await picker.textContent().catch(() => '')})`);
  if (offered) {
    await picker.click();
    const rows = page.getByRole('option');
    await rows.first().waitFor({ timeout: 5_000 });
    const all = await rows.count();
    const drawnRows = await page.locator('[role="option"] [data-routing-icon]').count();
    record(all === 3 && drawnRows === 3, `it runs straight, in right angles or curved, each drawn (${drawnRows} of ${all})`);
    await rows.filter({ hasText: /^\s*Curved\s*$/ }).first().click();
    await page.waitForTimeout(300);
  }
  const curved = await route('bent');
  record(curved.curved, `picked curved, it is drawn as a curve (${curved.d})`);
  await saveEditor(page, 'diagram-save');
  const { diagram } = await graphql('query ($id: ID!) { diagram(id: $id) { document } }', { id: made.id });
  const saved = JSON.parse(diagram.document).edges.find((one) => one.id === 'bent');
  record(saved?.routing === 'curved', `and it is saved so (${JSON.stringify(saved)})`);
} finally {
  await graphql('mutation ($id: ID!) { deleteDiagram(id: $id) }', { id: made.id }).catch(() => undefined);
}

await finish(browser);
