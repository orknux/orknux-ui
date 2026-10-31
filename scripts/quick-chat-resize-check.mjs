/**
 * The quick chat can be dragged bigger: from its left edge, its top edge or the
 * corner between them, staying anchored to the button, remembered across a load,
 * and never off the window. Read off the panel's box.
 *
 * Sets the workspace's quick-chat model and puts it back; nothing is asked.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });
const SET = 'mutation($w: ID!, $id: ID) { setWorkspaceQuickChatModel(workspaceId: $w, modelId: $id) { id } }';
const { models } = await graphql('query($w: ID!) { models(workspaceId: $w) { id kind } }', { w: WORKSPACE });
const chat = models.find((one) => one.kind === 'CHAT');
record(chat !== undefined, 'the workspace has a chat model to point the panel at');
if (chat === undefined) await finish(browser);
const had = (await graphql('query($w: ID!) { workspace(id: $w) { quickChatModelId } }', { w: WORKSPACE })).workspace.quickChatModelId;
await graphql(SET, { w: WORKSPACE, id: chat.id });

const panel = page.getByTestId('quick-chat-panel');
const box = () => panel.boundingBox();
const openPanel = async () => {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/agents`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Ask AI' }).last().click();
  await panel.waitFor({ timeout: 5_000 });
};
const drag = async (fromX, fromY, toX, toY) => {
  await page.mouse.move(fromX, fromY);
  await page.mouse.down();
  await page.mouse.move(toX, toY, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(150);
};

try {
  await openPanel();
  await page.evaluate(() => {
    localStorage.removeItem('orknux.quickChat.width');
    localStorage.removeItem('orknux.quickChat.height');
  });
  await openPanel();
  const start = await box();
  record(start.width === 380 && start.height === 460, `it opens at its usual size (${start.width} by ${start.height})`);

  await drag(start.x + 3, start.y + 200, start.x - 200, start.y + 200);
  const wider = await box();
  record(Math.abs(wider.width - 583) <= 2 && wider.height === start.height, `its left edge makes it wider and no taller (${wider.width})`);
  record(Math.abs(wider.x + wider.width - (start.x + start.width)) < 1, 'and its right edge stays by the button');

  await drag(wider.x + 200, wider.y + 3, wider.x + 200, wider.y - 150);
  const taller = await box();
  record(Math.abs(taller.height - 613) <= 2 && taller.width === wider.width, `its top edge makes it taller and no wider (${taller.height})`);
  record(Math.abs(taller.y + taller.height - (start.y + start.height)) < 1, 'and its bottom stays where it was');

  await drag(taller.x + 4, taller.y + 4, taller.x - 60, taller.y - 40);
  const corner = await box();
  record(corner.width > taller.width + 50 && corner.height > taller.height + 30, `its corner does both (${corner.width} by ${corner.height})`);

  await openPanel();
  const again = await box();
  record(again.width === corner.width && again.height === corner.height, 'it opens at that size next time');

  await drag(again.x + 3, again.y + 200, -500, again.y + 200);
  await drag((await box()).x + 200, (await box()).y + 3, (await box()).x + 200, -500);
  const most = await box();
  record(most.x >= 0 && most.y >= 0, `it cannot be dragged off the window (${most.x}, ${most.y})`);

  await drag(most.x + 3, most.y + 200, 1400, most.y + 200);
  record((await box()).width === 320, `nor to nothing (${(await box()).width})`);

  await page.getByTitle('Drag to resize; double-click to put it back').dblclick({ position: { x: 4, y: 4 } });
  await page.waitForTimeout(200);
  const back = await box();
  record(back.width === 380 && back.height === 460, `a double-click puts it back (${back.width} by ${back.height})`);
} finally {
  await graphql(SET, { w: WORKSPACE, id: had }).catch(() => undefined);
}
await finish(browser);
