/**
 * The flowchart and UML shapes. Each is offered under More shapes and added
 * from there; each is drawn as its own outline - stretched to the node, or for
 * an actor, an interface, a boundary, a control and an entity kept round above
 * a label beneath it; a class draws its compartments under rules; and a line
 * ends where a shape's outline is rather than at the box around it.
 *
 * Makes its own diagram and removes it.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const FLOWCHART = ['database', 'document', 'hexagon', 'parallelogram', 'trapezoid', 'triangle', 'cloud'];
const UML = ['actor', 'class', 'component', 'package', 'interface', 'device', 'boundary', 'control', 'entity'];
const ICONS = ['actor', 'interface', 'boundary', 'control', 'entity'];

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });

// Every shape in a grid, an icon stretched wider than it is tall, and a line into a triangle from its right at mid height.
const nodes = [...FLOWCHART, ...UML].map((kind, at) => ({
  id: kind,
  kind,
  label: kind === 'class' ? 'Order\n--\nid: Long\n--\nplace()' : kind,
  x: (at % 6) * 240,
  y: Math.floor(at / 6) * 200,
  ...(ICONS.includes(kind) ? { w: 200, h: 110 } : {}),
}));
nodes.find((one) => one.id === 'triangle').w = 120;
nodes.find((one) => one.id === 'triangle').h = 100;
const triangle = nodes.find((one) => one.id === 'triangle');
nodes.push({ id: 'from', kind: 'box', label: 'from', x: triangle.x + 300, y: triangle.y + 25, w: 100, h: 50 });
const { createDiagram: made } = await graphql(
  'mutation ($w: ID!, $n: String!, $d: String) { createDiagram(workspaceId: $w, name: $n, document: $d) { id } }',
  { w: WORKSPACE, n: `zzShapes ${Date.now()}`, d: JSON.stringify({ nodes, edges: [{ id: 'in', from: 'from', to: 'triangle', kind: 'arrow' }] }) },
);
const node = (id) => page.locator(`.react-flow__node[data-id="${id}"]`);

await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/diagrams/${made.id}`, { waitUntil: 'domcontentloaded' });
await node('database').waitFor({ timeout: 20_000 });
await page.getByRole('button', { name: /fit view/i }).click().catch(() => {});
await page.waitForTimeout(800);

// Each drawn as an outline: the closed pieces fill the node for a stretched shape; for an icon, a round piece stays round.
for (const kind of [...FLOWCHART, ...UML]) {
  const look = await node(kind).evaluate((one, icon) => {
    const shape = one.querySelector('[data-testid="diagram-node-shape"]');
    const art = one.querySelector('[data-testid="diagram-node-outline"]');
    if (shape === null || art === null) return { kind: shape?.getAttribute('data-kind') ?? null, art: false };
    const box = one.getBoundingClientRect();
    const pieces = [...art.querySelectorAll('path, circle')].map((piece) => piece.getBoundingClientRect());
    const left = Math.min(...pieces.map((r) => r.left));
    const right = Math.max(...pieces.map((r) => r.right));
    const top = Math.min(...pieces.map((r) => r.top));
    const bottom = Math.max(...pieces.map((r) => r.bottom));
    const circle = art.querySelector('circle')?.getBoundingClientRect();
    const words = one.querySelector('[data-testid="diagram-node-label-text"]')?.getBoundingClientRect();
    return {
      kind: shape.getAttribute('data-kind'),
      art: true,
      wide: Math.round(right - left) / box.width,
      tall: Math.round(bottom - top) / box.height,
      round: circle ? Math.abs(circle.width - circle.height) : null,
      below: icon && words ? words.top >= bottom - 2 : null,
    };
  }, ICONS.includes(kind));
  if (ICONS.includes(kind)) {
    record(look.kind === kind && look.art && look.round !== null && look.round < 1.5 && look.below === true,
      `${kind} is drawn as its icon, round where it is round in a box wider than tall, its label beneath (${JSON.stringify(look)})`);
  } else {
    record(look.kind === kind && look.art && look.wide > 0.9 && look.tall > 0.8,
      `${kind} is drawn as its outline, the size of the node (${JSON.stringify(look)})`);
  }
}

// A class: its name, then a compartment under a rule for each run between --.
const parts = await node('class').evaluate((one) => {
  const box = one.querySelector('[data-testid="diagram-node-label-text"]');
  return box === null ? null : [...box.children].map((part) => ({ text: part.textContent, rule: getComputedStyle(part).borderTopWidth }));
});
record(parts !== null && parts.length === 3 && parts[0].text === 'Order' && parts[1].text === 'id: Long' && parts[2].text === 'place()'
  && parts[0].rule === '0px' && parts[1].rule !== '0px' && parts[2].rule !== '0px',
  `a class draws its name and two compartments under rules (${JSON.stringify(parts)})`);

// The line into the triangle ends on its slanted side - three quarters across at mid height - not at the box's edge.
const end = await page.locator('.react-flow__edge[data-id="in"] path').first().getAttribute('d');
const points = (end ?? '').match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
const [, , ex, ey] = points;
record(points.length === 4 && Math.abs(ex - (triangle.x + 90)) < 2 && Math.abs(ey - (triangle.y + 50)) < 2,
  `a line into a triangle ends on its side, at ${triangle.x + 90},${triangle.y + 50}, not ${triangle.x + 120} (${end})`);

// More shapes offers every one, under Flowchart and UML, and adds the one picked.
await page.getByTestId('diagram-more-shapes').click();
const offered = await page.locator('[role="menu"] [data-testid^="diagram-add-"]').evaluateAll((items) => items.map((one) => one.getAttribute('data-testid').replace('diagram-add-', '')));
record(JSON.stringify(offered) === JSON.stringify([...FLOWCHART, ...UML]), `More shapes offers every flowchart and UML shape (${JSON.stringify(offered)})`);
const before = await page.locator('.react-flow__node').count();
await page.getByTestId('diagram-add-database').click();
await page.waitForTimeout(300);
const kinds = await page.locator('[data-testid="diagram-node-shape"]').evaluateAll((all) => all.map((one) => one.getAttribute('data-kind')));
record((await page.locator('.react-flow__node').count()) === before + 1 && kinds.filter((kind) => kind === 'database').length === 2
  && (await page.locator('[role="menu"]').count()) === 0, 'picking one adds a node of that shape and closes the menu');

await graphql('mutation ($id: ID!) { deleteDiagram(id: $id) }', { id: made.id });
await finish(browser);
