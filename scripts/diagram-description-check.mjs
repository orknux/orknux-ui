/**
 * A diagram's description: typed in the editor's panel while nothing is
 * selected, stored when the field is left, there after a reload, and shown on
 * the list under the name on one line, cut with an ellipsis where it is long,
 * the whole of it on hover.
 *
 * Makes its own diagram and removes it.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });
const stamp = Date.now();
const { createDiagram: made } = await graphql(
  'mutation ($w: ID!, $n: String!) { createDiagram(workspaceId: $w, name: $n) { id catalogId } }',
  { w: WORKSPACE, n: `zzDescribed ${stamp}` },
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
