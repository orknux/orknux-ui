/**
 * The diagram editor's two panels: the chat on the canvas's left and the
 * settings on its right, each dragged to the width somebody wants, and the
 * chat folded away and remembered folded.
 *
 * The chat used to share the right panel with the settings, under them: a
 * diagram with a long description and a node with notes took the height and
 * left the chat a strip, and a line's properties ran under the chat. Asserted:
 * the chat is a panel left of the canvas, open at first, and the settings have
 * the right panel's whole height; each panel's edge widens it; both widths are
 * there after a reload, and a double-click puts one back; folded, the chat is
 * a strip that brings it back, and stays folded after a reload.
 *
 * Makes its own diagram and removes it.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const NAME = `zzPanelSize ${Date.now()}`;
const KEYS = ['orknux.diagram.panel-width', 'orknux.diagram.chat-width', 'orknux.diagram.editor.chat.sieve'];

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });
const long = (words) => Array.from({ length: words }, (_, at) => `word${at}`).join(' ');
const { createDiagram: made } = await graphql(
  'mutation ($w: ID!, $n: String!, $d: String) { createDiagram(workspaceId: $w, name: $n, document: $d) { id } }',
  {
    w: WORKSPACE,
    n: NAME,
    d: JSON.stringify({ nodes: [{ id: 'n', kind: 'box', label: 'Pricing', x: 0, y: 0, w: 160, h: 60, notes: long(80) }], edges: [] }),
  },
);
await graphql('mutation ($id: ID!, $d: String) { describeDiagram(id: $id, description: $d) { id } }', { id: made.id, d: long(60) });

const address = `${BASE}/workspace/${WORKSPACE}/explore/diagrams/${made.id}`;
const panel = page.getByTestId('diagram-panel');
const chat = page.getByTestId('diagram-chat-panel');
const canvas = page.getByTestId('diagram-canvas');
const widthOf = (locator) => locator.evaluate((one) => one.getBoundingClientRect().width);

async function arrive() {
  await page.goto(address, { waitUntil: 'domcontentloaded' });
  await panel.waitFor({ timeout: 20_000 });
  await page.locator('.react-flow__node[data-id="n"]').click({ timeout: 10_000 });
  await page.waitForTimeout(400);
}

async function drag(handle, dx) {
  const box = await handle.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(200);
}

try {
  await page.goto(address, { waitUntil: 'domcontentloaded' });
  // A clean start: whatever an earlier run left in this browser's storage is not what is being tested.
  await page.evaluate((keys) => keys.forEach((key) => localStorage.removeItem(key)), KEYS);
  await arrive();

  // Where each is: the chat left of the canvas, the settings right of it, and the settings alone in theirs.
  const [chatBox, canvasBox, panelBox] = [await chat.boundingBox(), await canvas.boundingBox(), await panel.boundingBox()];
  record(chatBox !== null && chatBox.x + chatBox.width <= canvasBox.x + 2, `the chat is open at first, a panel left of the canvas (it ends at ${chatBox && Math.round(chatBox.x + chatBox.width)}, the canvas starts at ${Math.round(canvasBox.x)})`);
  record(panelBox.x >= canvasBox.x + canvasBox.width - 2, 'and the settings are right of it');
  record((await panel.locator('[class*="chatArea"]').count()) === 0 && (await chat.locator('[data-testid="diagram-chat-input"]').count()) === 1, 'the chat is in its own panel, not under the settings');
  const settings = await page.getByTestId('diagram-panel-settings').boundingBox();
  record(settings.height >= panelBox.height - 60, `the settings have the panel's whole height (${Math.round(settings.height)} of ${Math.round(panelBox.height)}px)`);

  // Each panel's edge widens it: the settings' to the left, the chat's to the right.
  const panelEdge = page.locator('[role="separator"][aria-controls="diagram-panel"]');
  const chatEdge = page.locator('[role="separator"][aria-controls="diagram-chat"]');
  const narrow = await widthOf(panel);
  await drag(panelEdge, -120);
  const wide = await widthOf(panel);
  record(wide - narrow >= 100, `dragging the settings' edge left widens them (${Math.round(narrow)} -> ${Math.round(wide)}px)`);
  const slim = await widthOf(chat);
  await drag(chatEdge, 100);
  const broad = await widthOf(chat);
  record(broad - slim >= 80, `dragging the chat's edge right widens it (${Math.round(slim)} -> ${Math.round(broad)}px)`);

  await arrive();
  record(Math.abs((await widthOf(panel)) - wide) <= 2 && Math.abs((await widthOf(chat)) - broad) <= 2, 'both widths are kept after a reload');
  await panelEdge.dblclick();
  await page.waitForTimeout(200);
  record(Math.abs((await widthOf(panel)) - narrow) <= 2, 'a double-click puts the settings back to their width');

  // Folded away, the canvas has the room; a strip brings it back; and folded is remembered.
  const before = await widthOf(canvas);
  await page.getByTestId('diagram-chat-hide').click();
  await page.waitForTimeout(300);
  const after = await widthOf(canvas);
  record((await chat.count()) === 0 && (await page.getByTestId('diagram-chat-show').count()) === 1 && after - before >= 200, `the chat folds away, and the canvas takes its room (${Math.round(before)} -> ${Math.round(after)}px)`);
  await arrive();
  record((await chat.count()) === 0 && (await page.getByTestId('diagram-chat-show').count()) === 1, 'folded is remembered after a reload');
  await page.getByTestId('diagram-chat-show').click();
  await page.waitForTimeout(300);
  record((await chat.count()) === 1 && Math.abs((await widthOf(chat)) - broad) <= 2, 'and the strip opens it again, at the width it had');
} catch (error) {
  // A step that throws is a failure, said as one: the clean-up below must not let the run end as a pass.
  record(false, `stopped part-way: ${String(error?.message ?? error).split('\n')[0]}`);
} finally {
  await page.evaluate((keys) => keys.forEach((key) => localStorage.removeItem(key)), KEYS).catch(() => undefined);
  await graphql('mutation ($id: ID!) { deleteDiagram(id: $id) }', { id: made.id }).catch(() => undefined);
  // A deleted diagram is kept in the workspace's bin, and a check's own is nobody's to restore.
  const kept = await graphql('query ($w: ID!) { recycleBin(workspaceId: $w, size: 200) { content { id kind name } } }', { w: WORKSPACE })
    .then((data) => data.recycleBin.content)
    .catch(() => []);
  for (const entry of kept.filter((one) => one.kind === 'DIAGRAM' && one.name === NAME)) {
    await graphql('mutation ($id: ID!) { purgeRecycleBinEntry(id: $id) }', { id: entry.id }).catch(() => undefined);
  }
}

await finish(browser);
