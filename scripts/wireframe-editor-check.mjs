/**
 * Wireframes in Design, issue #655: the list opens the editor, the editor
 * fills the screen as the image editor does, a tool draws an element that is
 * there after a reload, words are typed in place, and what a model draws in
 * the chat lands on the canvas as a step undo goes back over.
 *
 * Makes its own wireframe and removes it at the end. The model's answer is
 * answered here, since CI has no model: what is under test is that the canvas
 * takes the drawing up, not what a model would draw.
 */
import { BASE, WORKSPACE, open, record, finish, shot } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 900 } });

async function gql(query, variables) {
  return page.evaluate(
    async ({ query, variables }) => {
      const answer = await fetch('/graphql', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query, variables }) });
      return answer.json();
    },
    { query, variables },
  );
}

await page.goto(`${BASE}/workspace/${WORKSPACE}/design/wireframes`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('new-wireframe').waitFor({ timeout: 20_000 });

// The menu down the side lists the page beside Images.
const menu = await page.locator('nav a, aside a').allInnerTexts().catch(() => []);
record(menu.some((one) => one.trim() === 'Wireframes') && menu.some((one) => one.trim() === 'Images'), `Design's menu lists Wireframes beside Images (${menu.join(', ')})`);

// New makes one and opens it in the editor.
await page.getByTestId('new-wireframe').click();
await page.waitForURL(/\/design\/wireframes\/\d+$/, { timeout: 10_000 }).catch(() => undefined);
const id = page.url().match(/\/design\/wireframes\/(\d+)$/)?.[1] ?? null;
record(id !== null, `New opens the editor at the new wireframe (${page.url()})`);
await page.getByTestId('wireframe-svg').waitFor({ timeout: 15_000 }).catch(() => undefined);

// The editor fills the screen as the image editor does: canvas and panel, edge to edge, the same height.
async function frameOf(canvasId, panelId) {
  const canvas = await page.getByTestId(canvasId).boundingBox().catch(() => null);
  const panel = await page.getByTestId(panelId).boundingBox().catch(() => null);
  if (canvas === null || panel === null) return null;
  return { left: canvas.x, right: panel.x + panel.width, top: Math.min(canvas.y, panel.y), bottom: Math.max(canvas.y + canvas.height, panel.y + panel.height), canvas: canvas.width, panel: panel.width };
}
const wire = await frameOf('wireframe-canvas', 'wireframe-panel');
await page.goto(`${BASE}/workspace/${WORKSPACE}/design/images/new`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('editor-canvas').waitFor({ timeout: 15_000 }).catch(() => undefined);
await page.waitForTimeout(500);
const image = await frameOf('editor-canvas', 'editor-panel');
const near = (a, b) => Math.abs(a - b) <= 2;
record(
  wire !== null && image !== null && near(wire.left, image.left) && near(wire.right, image.right) && near(wire.top, image.top) && near(wire.bottom, image.bottom) && near(wire.panel, image.panel),
  `the wireframe editor takes the same frame as the image editor (${JSON.stringify({ wire, image })})`,
);
record(wire !== null && wire.right - wire.left >= 1440 - 2 && wire.bottom - wire.top > 900 * 0.75 && wire.canvas > wire.panel * 2,
  `and that is nearly the whole window, the canvas most of it (${JSON.stringify(wire)})`);

await page.goto(`${BASE}/workspace/${WORKSPACE}/design/wireframes/${id}`, { waitUntil: 'domcontentloaded' });
const svg = page.getByTestId('wireframe-svg');
await svg.waitFor({ timeout: 15_000 }).catch(() => undefined);
await page.waitForTimeout(400);
const box = await svg.boundingBox();

// The rectangle tool draws a box by dragging.
await page.getByTestId('wireframe-tool-rect').click();
await page.mouse.move(box.x + 300, box.y + 200);
await page.mouse.down();
await page.mouse.move(box.x + 420, box.y + 260, { steps: 6 });
await page.mouse.move(box.x + 500, box.y + 320, { steps: 6 });
await page.mouse.up();
const rects = page.locator('[data-element-type="rect"]');
const drawn = await rects.first().locator('rect').first().boundingBox().catch(() => null);
record((await rects.count()) === 1 && drawn !== null && drawn.width > 150 && drawn.height > 90,
  `dragging with the rectangle tool draws one box that size (${JSON.stringify(drawn)})`);
record((await page.getByTestId('wireframe-selected').count()) === 1, 'and selects it');

// The text tool, and words typed where they go.
await page.getByTestId('wireframe-tool-text').click();
await page.mouse.click(box.x + 300, box.y + 400);
const typing = page.getByTestId('wireframe-text-input');
await typing.waitFor({ timeout: 3_000 }).catch(() => undefined);
await typing.fill('Welcome back').catch(() => undefined);
await typing.press('Enter').catch(() => undefined);
const words = await page.locator('[data-element-type="text"]').textContent().catch(() => '');
record(words.includes('Welcome back'), `the text tool types its words in place (${words})`);

// Saved, and there after a reload.
await page.getByTestId('wireframe-save').click();
await page.waitForTimeout(800);
record((await page.getByTestId('wireframe-unsaved').count()) === 0, 'Save writes it');
await page.reload({ waitUntil: 'domcontentloaded' });
await svg.waitFor({ timeout: 15_000 }).catch(() => undefined);
await page.waitForTimeout(600);
record((await page.locator('[data-element-type="rect"]').count()) === 1 && (await page.locator('[data-element-type="text"]').textContent().catch(() => '')).includes('Welcome back'),
  'the box and the words are there after a reload');

// A model's drawing, answered here: a button added, taken onto the canvas, and undone as one step.
const stored = (await gql(`query ($id: ID!) { wireframe(id: $id) { id workspaceId name document elementCount revision createdBy createdAt updatedBy updatedAt } }`, { id })).data.wireframe;
const after = JSON.parse(stored.document);
after.elements.push({ id: 'cta', type: 'button', x: 300, y: 500, w: 160, h: 44, text: 'Sign in', props: { variant: 'primary' } });
let asked = null;
await page.route('**/graphql', async (route) => {
  const body = route.request().postDataJSON() ?? {};
  if (!(body.query ?? '').includes('askWireframe')) return route.continue();
  asked = body.variables;
  return route.fulfill({ json: { data: { askWireframe: {
    answer: 'Added a **Sign in** button.', changed: true,
    wireframe: { ...stored, document: JSON.stringify(after), elementCount: after.elements.length, revision: stored.revision + 1 },
  } } } });
});
await page.getByTestId('wireframe-chat-input').fill('Add a sign in button');
const modelShown = (await page.getByTestId('wireframe-chat-model').textContent().catch(() => '')) ?? '';
if (await page.getByTestId('wireframe-chat-send').isDisabled()) {
  // No chat model in this workspace: Send is not offered, and the model's half cannot be driven.
  record(modelShown.includes('no chat model'), `Send is held back only for want of a chat model (${modelShown})`);
} else {
  await page.getByTestId('wireframe-chat-send').click();
  await page.locator('[data-element-type="button"]').waitFor({ timeout: 10_000 }).catch(() => undefined);
  record(asked !== null && asked.messages.at(-1).content === 'Add a sign in button', `the chat sends what was asked (${JSON.stringify(asked?.messages)})`);
  record((await page.locator('[data-element-type="button"]').textContent().catch(() => '')).includes('Sign in'), 'what the model drew is on the canvas');
  const said = await page.getByTestId('wireframe-chat-message').allInnerTexts();
  record(said.some((one) => one.includes('Added a Sign in button.')), `and its answer is in the panel (${said.join(' | ')})`);
  await page.screenshot({ path: shot('wireframe-editor.png') });
  await page.getByTestId('wireframe-undo').click();
  record((await page.locator('[data-element-type="button"]').count()) === 0, "undo takes the model's change back");
}
await page.unroute('**/graphql');

// Back on the list, the card is there with its drawing.
await page.goto(`${BASE}/workspace/${WORKSPACE}/design/wireframes`, { waitUntil: 'domcontentloaded' });
const card = page.locator(`[data-testid="wireframe-card"][data-wireframe-id="${id}"]`);
await card.waitFor({ timeout: 10_000 }).catch(() => undefined);
record((await card.locator('[data-element-type="rect"]').count()) === 1, 'the list draws the wireframe small on its card');
await card.getByTestId('wireframe-open').click();
await page.waitForURL(new RegExp(`/design/wireframes/${id}$`), { timeout: 10_000 }).catch(() => undefined);
record(page.url().endsWith(`/design/wireframes/${id}`), `clicking the card opens it in the editor (${page.url()})`);

await gql(`mutation ($id: ID!) { deleteWireframe(id: $id) }`, { id });
await finish(browser);
