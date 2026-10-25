/**
 * Quick actions finds a diagram's node by what the box is called, says which
 * diagram it is on, and opens the editor on it with the node selected; the
 * diagram itself is found by its name too.
 *
 * Makes its own diagram, with a word nobody else uses, and removes it.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const BOX = 'input[aria-label="Quick actions"]';
const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });
const stamp = Date.now();
const WORD = `Zzpelican${stamp}`;
const NAME = `zzPaletteMap ${stamp}`;
const { createDiagram: made } = await graphql(
  'mutation ($w: ID!, $n: String!, $d: String) { createDiagram(workspaceId: $w, name: $n, document: $d) { id } }',
  { w: WORKSPACE, n: NAME, d: JSON.stringify({ nodes: [{ id: 'pk', kind: 'rounded', label: `${WORD} service`, x: 0, y: 0, w: 160, h: 60 }], edges: [] }) },
);

async function offered(typed) {
  // A page of this workspace: /workflows is not one, and the catch-all sends it to the last workspace opened.
  await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/diagrams`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(BOX, { timeout: 20_000 });
  await page.click(BOX);
  await page.fill(BOX, typed);
  await page.waitForTimeout(800);
  return page.$$eval('ul[role="listbox"] [role="option"]', (rows) =>
    rows.map((row) => {
      const spans = [...row.querySelectorAll('span')];
      return { label: spans[1]?.textContent?.trim() ?? '', where: spans[2]?.textContent?.trim() ?? '' };
    }),
  );
}

const nodes = await offered(WORD);
const node = nodes.findIndex((one) => one.label === `${WORD} service`);
record(node >= 0 && nodes[node].where.includes(NAME), `typing what a box is called finds the node, on its diagram (${JSON.stringify(nodes)})`);
if (node >= 0) {
  await page.locator('ul[role="listbox"] [role="option"]').nth(node).click();
  await page.waitForURL(/\/explore\/diagrams\/\d+\?node=pk$/, { timeout: 10_000 }).catch(() => undefined);
  record(page.url().endsWith(`/explore/diagrams/${made.id}?node=pk`), `and opens the editor on it (${page.url()})`);
  const label = await page.getByTestId('diagram-node-label').inputValue({ timeout: 10_000 }).catch(() => '');
  record(label === `${WORD} service`, `with the node selected (${label})`);
}

const diagrams = await offered(NAME);
record(diagrams.some((one) => one.label === NAME && one.where.startsWith('Diagram')), `the diagram is found by its name (${JSON.stringify(diagrams)})`);

await graphql('mutation ($id: ID!) { deleteDiagram(id: $id) }', { id: made.id });
await finish(browser);
