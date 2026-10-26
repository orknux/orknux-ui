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

// One row to begin with, on one line with No colour, the picker and the toggle; the rest on asking.
await page.evaluate(() => localStorage.removeItem('orknux.sieve.diagram.editor.colours'));
const row = await page.evaluate(() => {
  const tops = [...document.querySelectorAll('[data-testid="diagram-node-colour"], [data-testid="diagram-node-colour-none"], [data-testid="diagram-node-colour-more"]')]
    .map((one) => Math.round(one.getBoundingClientRect().top));
  return { count: document.querySelectorAll('[data-testid="diagram-node-colour"]').length, lines: new Set(tops).size };
});
const first = row.count;
if (first !== 9) {
  // A remembered open state from an earlier run: close it, then look again.
  await page.getByTestId('diagram-node-colour-more').click();
}
const shut = await page.getByTestId('diagram-node-colour').count();
// The toggle is a swatch-sized ring, drawn at full strength, not a faint mark beside them.
const toggle = await page.getByTestId('diagram-node-colour-more').evaluate((one) => {
  const css = getComputedStyle(one);
  return { width: Math.round(one.getBoundingClientRect().width), border: css.borderTopWidth, opacity: css.opacity };
});
record(toggle.width === 20 && toggle.border !== '0px' && toggle.opacity === '1', `the toggle reads as one of the swatches (${JSON.stringify(toggle)})`);
const apart = await page.evaluate(() => {
  const toggle = document.querySelector('[data-testid="diagram-node-colour-more"]').getBoundingClientRect();
  const picker = document.querySelector('[data-testid="diagram-node-colour-custom"]').closest('label').getBoundingClientRect();
  return Math.round(toggle.left - picker.right);
});
record(apart >= 10, `and stands clear of the picker's ring (${apart}px)`);
record(shut === 9, `one row of colours is shown at first (${shut}, lines ${row.lines})`);
await page.getByTestId('diagram-node-colour-more').click();
await page.waitForTimeout(200);
const offered = await page.getByTestId('diagram-node-colour').count();
record(offered >= 27, `asking shows all three rows (${offered})`);
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

// The toolbar's one Delete deletes the whole diagram, asked first, and the list is where it goes after.
record((await page.getByTestId('diagram-delete-diagram').count()) === 0, 'there is one Delete, not a second for the diagram');
await page.getByTestId('diagram-delete').click();
const confirm = page.locator('dialog[open]').getByRole('button', { name: 'Remove', exact: true });
const asked = await confirm.waitFor({ timeout: 5_000 }).then(() => true).catch(() => false);
record(asked, 'Delete asks first');
if (asked) await confirm.click();
await page.waitForURL((url) => url.pathname.endsWith('/explore/diagrams'), { timeout: 10_000 }).catch(() => {});
const gone = await graphql('query ($id: ID!) { diagram(id: $id) { id } }', { id: made.id }).then((one) => one.diagram === null).catch(() => true);
record(gone && page.url().endsWith('/explore/diagrams'), `and it is gone, back on the list (${page.url()})`);

await finish(browser);
