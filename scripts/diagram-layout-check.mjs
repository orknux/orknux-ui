/**
 * Arrange in the diagram editor: three boxes piled on one spot and joined in a
 * chain are laid out by dagre - left to right, each a rank further along than
 * the one it is joined from, none overlapping - and the same from the
 * keyboard's Arrange shortcut; top to bottom runs them down the screen; and
 * undo puts the pile back.
 *
 * Measured off what is drawn: the boxes' own rectangles on the canvas.
 * Makes its own diagram and removes it.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });
const pile = {
  nodes: ['a', 'b', 'c'].map((id) => ({ id, kind: 'box', label: id.toUpperCase(), x: 100, y: 100, w: 160, h: 60 })),
  edges: [{ id: 'ab', from: 'a', to: 'b', kind: 'arrow' }, { id: 'bc', from: 'b', to: 'c', kind: 'arrow' }],
};
const { createDiagram: made } = await graphql(
  'mutation ($w: ID!, $n: String!, $d: String) { createDiagram(workspaceId: $w, name: $n, document: $d) { id } }',
  { w: WORKSPACE, n: `zzLayout ${Date.now()}`, d: JSON.stringify(pile) },
);

await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/diagrams/${made.id}`, { waitUntil: 'domcontentloaded' });
await page.locator('.react-flow__node').first().waitFor({ timeout: 20_000 }).catch(() => undefined);
await page.waitForTimeout(500);

const boxes = () => page.evaluate(() => Object.fromEntries(
  [...document.querySelectorAll('.react-flow__node')].map((one) => {
    const box = one.getBoundingClientRect();
    return [one.getAttribute('data-id'), { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height) }];
  }),
));
const overlap = (p, q) => p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;

const before = await boxes();
record(overlap(before.a, before.b) && overlap(before.b, before.c), `the three boxes start piled on one spot (${JSON.stringify(before)})`);

await page.getByTestId('diagram-arrange').click();
await page.getByTestId('diagram-arrange-lr').click();
await page.waitForTimeout(700);
const across = await boxes();
record(across.a.x + across.a.w <= across.b.x && across.b.x + across.b.w <= across.c.x,
  `Left to right lays the chain out along the screen, each after the one it is joined from (${JSON.stringify(across)})`);
record(!overlap(across.a, across.b) && !overlap(across.b, across.c) && !overlap(across.a, across.c), 'with no box over another');
record((await page.getByTestId('diagram-unsaved').count()) === 1, 'and the change waits to be saved');

await page.getByTestId('diagram-arrange').click();
await page.getByTestId('diagram-arrange-tb').click();
await page.waitForTimeout(700);
const down = await boxes();
record(down.a.y + down.a.h <= down.b.y && down.b.y + down.b.h <= down.c.y, `Top to bottom runs it down the screen (${JSON.stringify(down)})`);

// Undo, twice, is the pile again; the shortcut lays it out as the button does.
await page.getByTestId('diagram-undo').click();
await page.getByTestId('diagram-undo').click();
await page.waitForTimeout(500);
const undone = await boxes();
record(overlap(undone.a, undone.b) && overlap(undone.b, undone.c), `undo puts the pile back (${JSON.stringify(undone)})`);
await page.locator('.react-flow__pane').click({ position: { x: 10, y: 10 } });
await page.keyboard.press('Control+Shift+L');
await page.waitForTimeout(700);
const keyed = await boxes();
record(keyed.a.x + keyed.a.w <= keyed.b.x && keyed.b.x + keyed.b.w <= keyed.c.x, `the Arrange shortcut lays it out as well (${JSON.stringify(keyed)})`);

await graphql('mutation ($id: ID!) { deleteDiagram(id: $id) }', { id: made.id });
await finish(browser);
