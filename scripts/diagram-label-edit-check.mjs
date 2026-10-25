/**
 * A label is typed over where it is drawn. Double-clicking a node's words - a
 * diamond's here, the shape whose words sit inside a polygon - opens a box over
 * them, inside the shape, in the label's own font, with the words selected;
 * typing and Enter changes the label, which Save keeps through a reload;
 * Escape puts the old one back; Delete and the arrows typed while the box is
 * open neither delete nor move the node; F2 opens it on a selected node; and a
 * connection's label is typed over the same way.
 *
 * Makes its own diagram and removes it.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });
const start = {
  nodes: [
    { id: 'd', kind: 'diamond', label: 'New node', x: 100, y: 100, w: 160, h: 100 },
    { id: 'b', kind: 'box', label: 'Ledger', x: 420, y: 120, w: 160, h: 60 },
  ],
  edges: [{ id: 'db', from: 'd', to: 'b', kind: 'arrow' }],
};
const { createDiagram: made } = await graphql(
  'mutation ($w: ID!, $n: String!, $d: String) { createDiagram(workspaceId: $w, name: $n, document: $d) { id } }',
  { w: WORKSPACE, n: `zzLabels ${Date.now()}`, d: JSON.stringify(start) },
);
const stored = async () => JSON.parse((await graphql('query ($id: ID!) { diagram(id: $id) { document } }', { id: made.id })).diagram.document);
const node = (id) => page.locator(`.react-flow__node[data-id="${id}"]`);
const words = (id) => node(id).getByTestId('diagram-node-label-text');
const editor = page.getByTestId('diagram-label-editor');

async function openEditor() {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/diagrams/${made.id}`, { waitUntil: 'domcontentloaded' });
  await node('d').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(500);
}
await openEditor();

// Double-click on the words: a box over them, in the shape, in their font, the words selected.
const before = await words('d').evaluate((one) => ({ size: getComputedStyle(one).fontSize, align: getComputedStyle(one).textAlign }));
const shape = await node('d').boundingBox();
await words('d').dblclick();
const shown = await editor.waitFor({ timeout: 3_000 }).then(() => true).catch(() => false);
const box = shown ? await editor.boundingBox() : null;
const look = shown ? await editor.evaluate((one) => ({
  size: getComputedStyle(one).fontSize, align: getComputedStyle(one).textAlign, value: one.value,
  selected: one.selectionStart === 0 && one.selectionEnd === one.value.length, focused: document.activeElement === one,
})) : null;
record(shown && look.value === 'New node' && look.selected && look.focused, `double-clicking a diamond's words opens them to typing, selected (${JSON.stringify(look)})`);
record(box !== null && box.x >= shape.x && box.x + box.width <= shape.x + shape.width + 1 && box.y >= shape.y && box.y + box.height <= shape.y + shape.height + 1,
  `over the words, inside the shape (${JSON.stringify({ box, shape })})`);
record(look !== null && look.size === before.size && look.align === before.align, `in the label's own font and centring (${JSON.stringify({ before, look })})`);
record((await page.locator('.react-flow__node').count()) === 2, 'and the double-click made nothing new');

// Delete and the arrows while typing are the box's, not the editor's.
const at = await node('d').boundingBox();
await page.keyboard.press('End');
await page.keyboard.press('Delete');
await page.keyboard.press('ArrowLeft');
await page.keyboard.press('Shift+ArrowUp');
const after = await node('d').boundingBox();
record((await node('d').count()) === 1 && Math.abs(after.x - at.x) < 1 && Math.abs(after.y - at.y) < 1, `Delete and the arrows typed in the box neither delete nor move the node (${JSON.stringify({ at, after })})`);

// Enter puts the label down; Save keeps it through a reload.
await editor.fill('Payment ok?');
await page.keyboard.press('Enter');
await page.waitForTimeout(200);
record((await editor.count()) === 0 && (await words('d').textContent()) === 'Payment ok?', `Enter puts the new label down (${await words('d').textContent()})`);
record((await page.getByTestId('diagram-unsaved').count()) === 1 && (await page.getByTestId('diagram-undo').isEnabled()), 'as a change to save, and a step to undo');
await page.getByTestId('diagram-save').click();
await page.waitForTimeout(900);
await openEditor();
record((await words('d').textContent()) === 'Payment ok?' && (await stored()).nodes.find((one) => one.id === 'd')?.label === 'Payment ok?',
  'saved, it is the label after a reload');

// Escape puts the old one back.
await words('d').dblclick();
await editor.waitFor({ timeout: 3_000 }).catch(() => undefined);
await editor.fill('Wrong');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
record((await editor.count()) === 0 && (await words('d').textContent()) === 'Payment ok?' && (await page.getByTestId('diagram-unsaved').count()) === 0,
  `Escape puts the old label back and changes nothing (${await words('d').textContent()})`);

// F2 on a selected node, and a click away puts it down.
await node('b').click();
await page.keyboard.press('F2');
const f2 = await editor.waitFor({ timeout: 3_000 }).then(() => true).catch(() => false);
if (f2) await editor.fill('General ledger');
await page.locator('.react-flow__pane').click({ position: { x: 20, y: 20 } });
await page.waitForTimeout(200);
record(f2 && (await words('b').textContent()) === 'General ledger', `F2 opens it on a selected node, and a click away puts it down (${await words('b').textContent()})`);

// A connection's label, the same way.
const line = await page.locator('.react-flow__edge[data-id="db"], .react-flow__edge').first().boundingBox();
await page.mouse.dblclick(line.x + line.width / 2, line.y + line.height / 2);
const onLine = await editor.waitFor({ timeout: 3_000 }).then(() => true).catch(() => false);
if (onLine) {
  await editor.fill('settles');
  await page.keyboard.press('Enter');
}
await page.waitForTimeout(200);
const label = (await page.getByTestId('diagram-edge-label').textContent().catch(() => '')) ?? '';
record(onLine && label === 'settles', `double-clicking a connection types over its label (${label})`);

await graphql('mutation ($id: ID!) { deleteDiagram(id: $id) }', { id: made.id });
await finish(browser);
