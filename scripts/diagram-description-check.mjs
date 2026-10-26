/**
 * A diagram's description: typed in the editor's panel while nothing is
 * selected, stored when the field is left, there after a reload, and shown on
 * the list under the name on one line, cut with an ellipsis where it is long,
 * the whole of it on hover. And the Diagram section that holds it is in the
 * panel whatever is selected: with a node selected it is still there, folds
 * and opens again, remembers being folded across a reload, and the
 * description typed in it then is stored too.
 *
 * Makes its own diagram and removes it.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });
const stamp = Date.now();
const { createDiagram: made } = await graphql(
  'mutation ($w: ID!, $n: String!, $d: String) { createDiagram(workspaceId: $w, name: $n, document: $d) { id catalogId } }',
  { w: WORKSPACE, n: `zzDescribed ${stamp}`, d: JSON.stringify({ nodes: [{ id: 'n', kind: 'box', label: 'Shop', x: 0, y: 0, w: 160, h: 60 }], edges: [] }) },
);
const SAID = `How a card payment travels from the shop to the ledger and back again, every hop of it, ${stamp}.`;

await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/diagrams/${made.id}`, { waitUntil: 'domcontentloaded' });
const field = page.getByTestId('diagram-description-input');
const there = await field.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
record(there, 'with nothing selected the panel offers the description');
await field.fill(SAID);
await page.locator('.react-flow__pane').click({ position: { x: 30, y: 30 } });
await page.waitForTimeout(800);
const stored = (await graphql('query ($id: ID!) { diagram(id: $id) { description } }', { id: made.id })).diagram.description;
record(stored === SAID, `leaving the field stores it (${stored})`);
await page.reload({ waitUntil: 'domcontentloaded' });
await field.waitFor({ timeout: 20_000 }).catch(() => undefined);
record((await field.inputValue().catch(() => '')) === SAID, 'and it is there after a reload');

// Its corner makes it taller: dragged 150px down, the box grows by most of that.
const corner = await field.boundingBox();
await page.mouse.move(corner.x + corner.width - 3, corner.y + corner.height - 3);
await page.mouse.down();
await page.mouse.move(corner.x + corner.width - 3, corner.y + corner.height + 150, { steps: 10 });
await page.mouse.up();
const grown = Math.round((await field.boundingBox()).height - corner.height);
record(grown >= 100, `dragging its corner makes the description taller (${grown}px)`);

// With a node selected, the Diagram section is still there; folded, it remembers; opened again, it still saves.
await page.locator('.react-flow__node[data-id="n"]').click({ timeout: 10_000 });
await page.getByTestId('diagram-inspector').waitFor({ timeout: 5_000 }).catch(() => undefined);
const section = page.getByTestId('diagram-section');
record((await section.count()) === 1 && (await page.getByTestId('diagram-inspector').count()) === 1, 'with a node selected the Diagram section is still in the panel, beside the node');
await page.getByTestId('diagram-section-toggle').click();
record((await field.count()) === 0 && (await page.getByTestId('diagram-section-toggle').getAttribute('aria-expanded')) === 'false', 'it folds away');
await page.reload({ waitUntil: 'domcontentloaded' });
await section.waitFor({ timeout: 20_000 }).catch(() => undefined);
record((await page.getByTestId('diagram-section-toggle').getAttribute('aria-expanded')) === 'false' && (await field.count()) === 0, 'and stays folded after a reload');
await page.locator('.react-flow__node[data-id="n"]').click({ timeout: 10_000 });
await page.getByTestId('diagram-section-toggle').click();
const AGAIN = `Where the shop's orders go, ${stamp}.`;
await field.fill(AGAIN);
await page.locator('.react-flow__pane').click({ position: { x: 30, y: 30 } });
await page.waitForTimeout(800);
const again = (await graphql('query ($id: ID!) { diagram(id: $id) { description } }', { id: made.id })).diagram.description;
record(again === AGAIN, `opened with a node selected, it shows the description and saves it (${again})`);
await graphql('mutation ($id: ID!, $d: String) { describeDiagram(id: $id, description: $d) { id } }', { id: made.id, d: SAID });

await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/diagrams?catalog=${made.catalogId}`, { waitUntil: 'domcontentloaded' });
const shown = page.locator(`[data-testid="diagram-row"][data-diagram-id="${made.id}"] [data-testid="diagram-description"]`);
await shown.waitFor({ timeout: 20_000 }).catch(() => undefined);
const line = await shown.evaluate((one) => {
  const style = getComputedStyle(one);
  return { text: one.textContent, title: one.getAttribute('title'), height: one.getBoundingClientRect().height, lineHeight: parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.4, overflow: style.textOverflow, cut: one.scrollWidth > one.clientWidth };
}).catch(() => null);
record(line !== null && line.text === SAID && line.title === SAID, `the list shows it under the name, the whole of it on hover (${JSON.stringify(line)})`);
record(line !== null && line.height <= line.lineHeight * 1.5 && line.overflow === 'ellipsis', `on one line, cut with an ellipsis (${JSON.stringify(line)})`);

await graphql('mutation ($id: ID!) { deleteDiagram(id: $id) }', { id: made.id });
await finish(browser);
