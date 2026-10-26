/**
 * The diagram editor: shapes added from the bar, a connection drawn from one
 * box's handle to another's, a node's notes typed in the panel with a counter
 * that stops at the installation's cap, all of it there after Save and a
 * reload; the panel down the right takes the same place the wireframe editor's
 * does; and what a model changes in the chat lands on the canvas as one step
 * undo goes back over.
 *
 * Makes its own diagram and removes it. The model's answer is answered here,
 * since CI has no model: what is under test is that the canvas takes it up.
 */
import { saveEditor } from './suite/harness.mjs';
import { BASE, WORKSPACE, open, record, finish, shot } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });
const stamp = Date.now();
const made = (await graphql('mutation ($w: ID!, $n: String!) { createDiagram(workspaceId: $w, name: $n) { id noteCharactersMost } }',
  { w: WORKSPACE, n: `zzEditor ${stamp}` })).createDiagram;
const id = made.id;
const CAP = made.noteCharactersMost;

await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/diagrams/${id}`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('diagram-canvas').locator('.react-flow').waitFor({ timeout: 20_000 }).catch(() => undefined);
await page.waitForTimeout(400);

// The panel down the right sits where the wireframe editor's does: the same frame, the same width.
async function frameOf(canvasId, panelId) {
  const canvas = await page.getByTestId(canvasId).boundingBox().catch(() => null);
  const panel = await page.getByTestId(panelId).boundingBox().catch(() => null);
  if (canvas === null || panel === null) return null;
  return { left: canvas.x, right: panel.x + panel.width, top: Math.min(canvas.y, panel.y), bottom: Math.max(canvas.y + canvas.height, panel.y + panel.height), panelX: panel.x, panel: panel.width };
}
const diagramFrame = await frameOf('diagram-canvas', 'diagram-panel');
const composer = await page.getByTestId('diagram-chat-input').boundingBox().catch(() => null);
const { createWireframe: wire } = await graphql('mutation ($w: ID!, $n: String!) { createWireframe(workspaceId: $w, name: $n) { id } }', { w: WORKSPACE, n: `zzFrame ${stamp}` });
await page.goto(`${BASE}/workspace/${WORKSPACE}/design/wireframes/${wire.id}`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('wireframe-svg').waitFor({ timeout: 15_000 }).catch(() => undefined);
await page.waitForTimeout(400);
const wireFrame = await frameOf('wireframe-canvas', 'wireframe-panel');
const wireComposer = await page.getByTestId('wireframe-chat-input').boundingBox().catch(() => null);
await graphql('mutation ($id: ID!) { deleteWireframe(id: $id) }', { id: wire.id });
const near = (a, b) => Math.abs(a - b) <= 2;
record(
  diagramFrame !== null && wireFrame !== null && ['left', 'right', 'top', 'bottom', 'panelX', 'panel'].every((side) => near(diagramFrame[side], wireFrame[side])),
  `the chat panel takes the wireframe editor's place on the right (${JSON.stringify({ diagramFrame, wireFrame })})`,
);
record(composer !== null && wireComposer !== null && near(composer.x, wireComposer.x) && near(composer.width, wireComposer.width) && near(composer.y + composer.height, wireComposer.y + wireComposer.height),
  `and its box to ask in sits at the foot as the wireframe editor's does (${JSON.stringify({ composer, wireComposer })})`);

await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/diagrams/${id}`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('diagram-canvas').locator('.react-flow').waitFor({ timeout: 20_000 }).catch(() => undefined);
await page.waitForTimeout(400);

// Two boxes from the bar.
await page.getByTestId('diagram-add-box').click();
await page.getByTestId('diagram-add-ellipse').click();
await page.waitForTimeout(300);
const nodes = page.locator('.react-flow__node');
const kinds = await page.getByTestId('diagram-node-shape').evaluateAll((all) => all.map((one) => one.getAttribute('data-kind')));
record((await nodes.count()) === 2 && kinds.includes('box') && kinds.includes('ellipse'), `the bar adds a box and an ellipse (${JSON.stringify(kinds)})`);

// Pulled apart, then joined from the box's handle to the ellipse's.
const [a, b] = await nodes.evaluateAll((all) => all.map((one) => one.getAttribute('data-id')));
const box = await page.locator(`.react-flow__node[data-id="${a}"]`).boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x - 260, box.y + box.height / 2, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(300);
const from = await page.locator(`.react-flow__node[data-id="${a}"] .react-flow__handle-right`).boundingBox();
const to = await page.locator(`.react-flow__node[data-id="${b}"] .react-flow__handle-left`).boundingBox();
await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
await page.mouse.down();
await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(400);
const line = await page.locator('.react-flow__edge path').first().boundingBox().catch(() => null);
record((await page.locator('.react-flow__edge').count()) === 1 && line !== null && line.width > 20,
  `dragging from one box's handle to the other's draws a line between them (${JSON.stringify(line)})`);

// The node's notes, with a counter that stops at the cap.
await page.locator(`.react-flow__node[data-id="${a}"]`).click();
const label = page.getByTestId('diagram-node-label');
await label.waitFor({ timeout: 5_000 }).catch(() => undefined);
await label.fill('Gateway');
const notes = page.getByTestId('diagram-node-notes');
await notes.fill('Routes every request.');
const counted = (await page.getByTestId('diagram-notes-counter').textContent().catch(() => '')) ?? '';
record(counted.replace(/\s/g, '') === `21/${CAP}`, `the counter says how much of the cap the notes use (${counted})`);
await notes.fill('x'.repeat(CAP + 40));
const held = (await notes.inputValue()).length;
const full = (await page.getByTestId('diagram-notes-counter').textContent().catch(() => '')) ?? '';
const red = await page.getByTestId('diagram-notes-counter').evaluate((one) => getComputedStyle(one).color);
const calm = await page.getByTestId('diagram-node-label').evaluate((one) => getComputedStyle(one.closest('label').querySelector('span')).color);
record(held === CAP && full.replace(/\s/g, '') === `${CAP}/${CAP}` && red !== calm, `the notes stop at the cap, and the counter says so in another colour (${held}, ${full}, ${red})`);
await notes.fill('Routes every request.');
await page.locator('.react-flow__pane').click({ position: { x: 20, y: 20 } });

// Saved, and there after a reload.
await saveEditor(page, 'diagram-save');
await page.waitForTimeout(900);
record((await page.getByTestId('diagram-unsaved').count()) === 0, 'Save writes it');
await page.reload({ waitUntil: 'domcontentloaded' });
await page.locator('.react-flow__node').first().waitFor({ timeout: 15_000 }).catch(() => undefined);
await page.waitForTimeout(500);
const stored = JSON.parse((await graphql('query ($id: ID!) { diagram(id: $id) { document } }', { id })).diagram.document);
const gateway = stored.nodes.find((one) => one.label === 'Gateway');
record(gateway !== undefined && gateway.notes === 'Routes every request.' && stored.edges.length === 1 && stored.edges[0].from === gateway.id,
  `the label, the notes and the line are stored (${JSON.stringify(stored)})`);
record((await page.locator('.react-flow__node').count()) === 2 && (await page.locator('.react-flow__edge').count()) === 1, 'and drawn again after a reload');
await page.screenshot({ path: shot('diagram-editor.png') });

// A model's change, answered here: a node added, taken onto the canvas, undone as one step.
const current = (await graphql(`query ($id: ID!) { diagram(id: $id) {
  id workspaceId catalogId catalogName name agentAccess document nodeCount edgeCount revision noteCharactersMost createdBy createdAt updatedBy updatedAt } }`, { id })).diagram;
const after = JSON.parse(current.document);
after.nodes.push({ id: 'db', kind: 'ellipse', label: 'Ledger', x: 600, y: 0, w: 160, h: 70 });
let asked = null;
await page.route('**/graphql', async (route) => {
  const body = route.request().postDataJSON() ?? {};
  if (!(body.query ?? '').includes('askDiagram')) return route.continue();
  asked = body.variables;
  return route.fulfill({ json: { data: { askDiagram: {
    answer: 'Added the **Ledger**.', changed: true,
    diagram: { ...current, document: JSON.stringify(after), nodeCount: after.nodes.length, revision: current.revision + 1 },
  } } } });
});
const ideas = await page.getByTestId('diagram-idea').count();
record(ideas === 4, `an empty chat offers four ideas (${ideas})`);
await page.getByTestId('diagram-chat-input').fill('Add the ledger');
if (await page.getByTestId('diagram-chat-send').isDisabled()) {
  const shown = (await page.getByTestId('diagram-chat-model').textContent().catch(() => '')) ?? '';
  record(shown.includes('no chat model'), `Send is held back only for want of a chat model (${shown})`);
} else {
  await page.getByTestId('diagram-chat-send').click();
  await page.locator('.react-flow__node[data-id="db"]').waitFor({ timeout: 10_000 }).catch(() => undefined);
  record(asked !== null && asked.messages.at(-1).content === 'Add the ledger', 'the chat sends what was asked');
  record((await page.locator('.react-flow__node[data-id="db"]').count()) === 1, "the model's node is on the canvas");
  await page.getByTestId('diagram-undo').click();
  await page.waitForTimeout(300);
  record((await page.locator('.react-flow__node[data-id="db"]').count()) === 0, "undo takes the model's change back");
}
await page.unroute('**/graphql');

await graphql('mutation ($id: ID!) { deleteDiagram(id: $id) }', { id });
await finish(browser);
