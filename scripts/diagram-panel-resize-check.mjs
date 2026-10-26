/**
 * The diagram editor's panel is dragged to the size somebody wants.
 *
 * Fixed, a diagram with a long description and a node with notes took the
 * panel's height and left the chat a strip at the bottom. Asserted: with both,
 * the chat still has room; the line between the settings and the chat moves
 * when dragged; the panel's edge widens it; both are there after a reload; and
 * a double-click puts the width back.
 *
 * Makes its own diagram and removes it.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });
const long = (words) => Array.from({ length: words }, (_, at) => `word${at}`).join(' ');
const { createDiagram: made } = await graphql(
  'mutation ($w: ID!, $n: String!, $d: String) { createDiagram(workspaceId: $w, name: $n, document: $d) { id } }',
  {
    w: WORKSPACE,
    n: `zzPanelSize ${Date.now()}`,
    d: JSON.stringify({ nodes: [{ id: 'n', kind: 'box', label: 'Pricing', x: 0, y: 0, w: 160, h: 60, notes: long(80) }], edges: [] }),
  },
);
await graphql('mutation ($id: ID!, $d: String) { describeDiagram(id: $id, description: $d) { id } }', { id: made.id, d: long(60) });

const address = `${BASE}/workspace/${WORKSPACE}/explore/diagrams/${made.id}`;
await page.goto(address, { waitUntil: 'domcontentloaded' });
// A clean start: whatever an earlier run left in this browser's storage is not what is being tested.
await page.evaluate(() => {
  localStorage.removeItem('orknux.diagram.panel-width');
  localStorage.removeItem('orknux.diagram.panel-settings-height');
});
await page.reload({ waitUntil: 'domcontentloaded' });
const panel = page.getByTestId('diagram-panel');
await panel.waitFor({ timeout: 20_000 });
await page.locator('.react-flow__node[data-id="n"]').click({ timeout: 10_000 });
await page.getByTestId('diagram-inspector').waitFor({ timeout: 5_000 }).catch(() => undefined);
await page.waitForTimeout(300);

const chatHeight = () => page.locator('[data-testid="diagram-panel"] [class*="chatArea"]').first().evaluate((one) => one.getBoundingClientRect().height);
const panelWidth = () => panel.evaluate((one) => one.getBoundingClientRect().width);
const first = await chatHeight();
record(first >= 200, `with a long description and a node's notes the chat keeps room (${Math.round(first)}px)`);

async function drag(handle, dx, dy) {
  const box = await handle.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(200);
}

const split = page.locator('[role="separator"][aria-controls="diagram-panel-settings"]');
await drag(split, 0, -150);
const taller = await chatHeight();
record(taller - first >= 100, `dragging the line up gives the chat more (${Math.round(first)} -> ${Math.round(taller)}px)`);

const edge = page.locator('[role="separator"][aria-controls="diagram-panel"]');
const narrow = await panelWidth();
await drag(edge, -200, 0);
const wide = await panelWidth();
record(wide - narrow >= 150, `dragging the panel's edge left widens it (${Math.round(narrow)} -> ${Math.round(wide)}px)`);

await page.reload({ waitUntil: 'domcontentloaded' });
await panel.waitFor({ timeout: 20_000 });
await page.locator('.react-flow__node[data-id="n"]').click({ timeout: 10_000 });
await page.waitForTimeout(400);
const keptWidth = await panelWidth();
const keptChat = await chatHeight();
record(Math.abs(keptWidth - wide) <= 2, `the width is kept after a reload (${Math.round(keptWidth)}px)`);
record(Math.abs(keptChat - taller) <= 4, `and so is the split (${Math.round(keptChat)}px)`);

await edge.dblclick();
await page.waitForTimeout(200);
const back = await panelWidth();
record(Math.abs(back - narrow) <= 2, `a double-click puts the width back (${Math.round(back)}px)`);

await page.evaluate(() => {
  localStorage.removeItem('orknux.diagram.panel-width');
  localStorage.removeItem('orknux.diagram.panel-settings-height');
});
await graphql('mutation ($id: ID!) { deleteDiagram(id: $id) }', { id: made.id }).catch(() => undefined);
await finish(browser);
