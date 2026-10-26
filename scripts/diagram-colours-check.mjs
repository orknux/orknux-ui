/**
 * A shape's colour: three rows of swatches, and any other colour from the
 * browser's picker after them, kept on the shape as #rrggbb.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });
const { createDiagram: made } = await graphql(
  'mutation ($w: ID!, $n: String!, $d: String) { createDiagram(workspaceId: $w, name: $n, document: $d) { id } }',
  { w: WORKSPACE, n: `zzColours ${Date.now()}`, d: JSON.stringify({ nodes: [{ id: 'a', kind: 'box', label: 'Paint me', x: 0, y: 0 }], edges: [] }) },
);
await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/diagrams/${made.id}`, { waitUntil: 'domcontentloaded' });
const node = page.locator('.react-flow__node[data-id="a"]');
await node.waitFor({ timeout: 20_000 });
await node.click();
await page.getByTestId('diagram-node-colour').first().waitFor({ timeout: 10_000 });

const offered = await page.getByTestId('diagram-node-colour').count();
record(offered >= 27, `three rows of colours are offered (${offered})`);
const picker = page.getByTestId('diagram-node-colour-custom');
record((await picker.count()) === 1, 'and a picker for any other');

// The picker hands its colour over once it is closed - the change event, not every input on the way.
await picker.evaluate((input) => {
  input.value = '#123456';
  input.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(300);
const fill = await node.evaluate((one) => {
  const shaped = one.querySelector('[style*="background"]') ?? one.querySelector('polygon, path, rect');
  return shaped ? getComputedStyle(shaped).backgroundColor || getComputedStyle(shaped).fill : null;
});
record(fill === 'rgb(18, 52, 86)', `the shape takes the picked colour (${fill})`);
await page.waitForFunction(() => document.querySelector('[data-testid="diagram-unsaved"]') === null, null, { timeout: 15_000 }).catch(() => {});
const { diagram } = await graphql('query ($id: ID!) { diagram(id: $id) { document } }', { id: made.id }).catch(() => ({ diagram: null }));
const kept = diagram === null ? null : JSON.parse(diagram.document).nodes.find((one) => one.id === 'a')?.color;
record(kept === '#123456', `and keeps it (${kept})`);

await finish(browser);
