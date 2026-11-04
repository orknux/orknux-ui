/**
 * Finding a box or a line in the diagram editor by its words.
 *
 * A diagram of forty services and sixty Kafka topics, laid out wider than the
 * screen, is one where the browser's own find sees nothing: the boxes are
 * drawn, not text it reads. The editor's search box finds a box by its label
 * or its notes and a line by its label; the match is selected and brought to
 * the middle of the canvas, Enter goes to the next, and the count says where
 * it is. What is measured is what is drawn: the selected box's position on the
 * canvas, and the count under the box.
 */
import { WORKSPACE, BASE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });

// Three boxes far apart, so a match off screen has to be brought into view; one found only by its notes.
const drawn = JSON.stringify({
  nodes: [
    { id: 'orders', kind: 'rounded', label: 'order-service', x: 0, y: 0 },
    { id: 'topic', kind: 'database', label: 'orders_created', x: 3000, y: 1600, notes: 'Written by order-service' },
    { id: 'far', kind: 'rounded', label: 'delivery-tracking', x: -2600, y: 2400 },
  ],
  edges: [{ id: 'write', from: 'orders', to: 'topic', label: 'Kafka: orders_created', kind: 'arrow' }],
});
const { createDiagram } = await graphql(
  'mutation ($w: ID!, $n: String!, $d: String) { createDiagram(workspaceId: $w, name: $n, document: $d) { id } }',
  { w: WORKSPACE, n: `zzFind ${Date.now()}`, d: drawn },
);
const id = createDiagram.id;

/** How far the selected box's centre is from the middle of the canvas, in pixels; null with nothing selected. */
const offCentre = () =>
  page.evaluate(() => {
    const pane = document.querySelector('.react-flow')?.getBoundingClientRect();
    const chosen = document.querySelector('.react-flow__node.selected')?.getBoundingClientRect();
    if (!pane || !chosen) return null;
    return Math.hypot(chosen.x + chosen.width / 2 - (pane.x + pane.width / 2), chosen.y + chosen.height / 2 - (pane.y + pane.height / 2));
  });
const selectedId = () => page.evaluate(() => document.querySelector('.react-flow__node.selected')?.getAttribute('data-id') ?? null);
const count = () => page.getByTestId('diagram-find-count').textContent();

try {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/diagrams/${id}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.react-flow__node[data-id="far"]').waitFor({ state: 'attached', timeout: 20_000 });
  await page.waitForTimeout(800);

  const box = page.getByTestId('diagram-find');
  record(await box.isVisible(), 'the editor has a search box');

  // Typing goes to the first match: the box far off to the right, by its label.
  await box.fill('delivery');
  await page.waitForTimeout(600);
  record((await selectedId()) === 'far', `typing selects the match (${await selectedId()})`);
  const off = await offCentre();
  record(off !== null && off < 40, `and brings it to the middle of the canvas (${off?.toFixed(0)}px off)`);
  record((await count()) === '1 of 1', `the count says so (${await count()})`);
  // Readable at a glance: they were 12px words and a hairline grey chevron, taken for no buttons at all.
  const look = await page.evaluate(() => {
    const size = (id) => parseFloat(getComputedStyle(document.querySelector(`[data-testid="${id}"]`)).fontSize);
    const icon = document.querySelector('[data-testid="diagram-find-next"] img')?.getBoundingClientRect();
    return { box: size('diagram-find'), count: size('diagram-find-count'), icon: icon?.width ?? 0 };
  });
  const glow = await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="diagram-find"]').closest('label')).boxShadow);
  record(glow !== 'none' && glow !== '', `while searching the box glows (${glow.slice(0, 60)})`);
  record(look.box >= 13 && look.count >= 12 && look.icon >= 16, `the words and arrows are of a readable size (${JSON.stringify(look)})`);

  // A label and a note both match "order-service": two boxes, Enter goes to the second.
  await box.fill('order-service');
  await page.waitForTimeout(600);
  record((await count()) === '1 of 2', `a word in a box's notes counts too (${await count()})`);
  const first = await selectedId();
  await box.press('Enter');
  await page.waitForTimeout(600);
  const second = await selectedId();
  record(first !== null && second !== null && first !== second, `Enter goes to the next match (${first} then ${second})`);
  record((await count()) === '2 of 2', `and the count follows (${await count()})`);
  await box.press('Shift+Enter');
  await page.waitForTimeout(600);
  record((await selectedId()) === first, 'Shift+Enter goes back');

  // Every match is listed down the left while searching, the current one lit, and a click goes to another.
  const results = page.getByTestId('diagram-find-result');
  record((await results.count()) === 2, `the results panel lists both matches (${await results.count()})`);
  const lit = async () => results.evaluateAll((all) => all.findIndex((one) => one.getAttribute('aria-selected') === 'true'));
  record((await lit()) === 0, `the current match is lit in the panel (${await lit()})`);
  const panel = await page.getByTestId('diagram-find-results').boundingBox();
  const canvas = await page.locator('.react-flow').boundingBox();
  record(panel !== null && canvas !== null && panel.x - canvas.x < 40, `on the left of the canvas (${panel?.x.toFixed(0)} vs ${canvas?.x.toFixed(0)})`);
  await results.nth(1).click();
  await page.waitForTimeout(600);
  record((await selectedId()) === second && (await lit()) === 1, `a click on a result goes to it, and lights it (${await selectedId()}, ${await lit()})`);
  await box.press('Enter');
  await page.waitForTimeout(400);
  record((await lit()) === 0, `stepping with Enter moves the light in the panel too (${await lit()})`);

  // The arrow keys walk the list, from the box and from inside the list - and move no box while they do.
  const places = () => page.locator('.react-flow__node').evaluateAll((all) => all.map((one) => one.style.transform).join('|'));
  const placed = await places();
  await box.press('ArrowDown');
  await page.waitForTimeout(400);
  record((await lit()) === 1 && (await selectedId()) === second, `ArrowDown in the box goes to the next match (${await lit()})`);
  await results.nth(1).focus();
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(400);
  const focusedAt = await results.evaluateAll((all) => all.indexOf(document.activeElement));
  record((await lit()) === 0 && (await selectedId()) === first && focusedAt === 0, `ArrowUp in the list goes back, and the focus goes with it (${await lit()}, ${focusedAt})`);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(400);
  record((await lit()) === 1, `ArrowDown in the list goes on (${await lit()})`);
  record((await places()) === placed, 'and no box was moved by them');

  // Clearing is a cross at the end of the row, after the arrows, while there is a search.
  const ends = await page.evaluate(() => {
    const at = (id) => document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect();
    const clear = at('diagram-find-clear');
    const next = at('diagram-find-next');
    return clear === undefined || next === undefined ? null : { clear: Math.round(clear.left), next: Math.round(next.right), width: Math.round(clear.width) };
  });
  record(ends !== null && ends.clear >= ends.next && ends.width > 0, `a clear button sits right of the arrows (${JSON.stringify(ends)})`);
  await page.getByTestId('diagram-find-clear').click();
  record((await box.inputValue()) === '' && (await page.getByTestId('diagram-find-clear').count()) === 0, 'and clears the search, going with it');
  await box.fill('order-service');
  await page.waitForTimeout(400);

  // A line found by its label is selected as a line.
  await box.fill('Kafka:');
  await page.waitForTimeout(600);
  const lineSelected = await page.evaluate(() => document.querySelector('.react-flow__edge.selected')?.getAttribute('data-id') ?? null);
  record(lineSelected !== null, `a line is found by its label (${lineSelected})`);

  await box.fill('nothing like this');
  await page.waitForTimeout(300);
  record((await count()) === 'None', `nothing found says so (${await count()})`);

  // The shortcut puts the cursor in it from the canvas, and Escape clears it.
  await page.locator('.react-flow__pane').click({ position: { x: 20, y: 20 } });
  await page.keyboard.press('Control+f');
  const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
  record(focused === 'diagram-find', `Ctrl+F puts the cursor in it (${focused})`);
  await page.keyboard.press('Escape');
  record((await box.inputValue()) === '', 'Escape clears it');
  record(!(await page.getByTestId('diagram-find-results').isVisible().catch(() => false)), 'and the results panel goes with the search');

  // Finding changes nothing: the diagram is not marked unsaved.
  record(!(await page.getByTestId('diagram-unsaved').isVisible().catch(() => false)), 'and finding left the diagram unchanged');
} finally {
  await graphql('mutation ($id: ID!) { deleteDiagram(id: $id) }', { id }).catch(() => undefined);
}

await finish(browser);
