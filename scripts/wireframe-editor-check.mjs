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
const named = menu.map((one) => one.trim());
record(named.includes('Wireframes') && named.indexOf('Wireframes') < named.indexOf('Images') && named.indexOf('Images') < named.indexOf('Videos'),
  `Design's menu runs Wireframes, Images, Videos (${named.join(', ')})`);
await page.goto(`${BASE}/workspace/${WORKSPACE}/workflows`, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
await page.locator('header a', { hasText: /^Design$/ }).first().click({ timeout: 15_000 }).catch(() => undefined);
await page.waitForURL(/\/design\//, { timeout: 10_000 }).catch(() => undefined);
record(/\/design\/wireframes$/.test(page.url()), `Design at the top opens on Wireframes (${page.url()})`);
await page.goto(`${BASE}/workspace/${WORKSPACE}/design/wireframes`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('new-wireframe').waitFor({ timeout: 20_000 });

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

// The history outlives the reload: undo goes back over the words typed before it, like any undo, and redo returns them.
const undoAfterReload = await page.getByTestId('wireframe-undo').isEnabled();
await page.getByTestId('wireframe-undo').click({ timeout: 2_000 }).catch(() => undefined);
await page.waitForTimeout(200);
const undoneWords = (await page.locator('[data-element-type="text"]').textContent().catch(() => '')) ?? '';
const undoneUnsaved = await page.getByTestId('wireframe-unsaved').count();
record(undoAfterReload && !undoneWords.includes('Welcome back') && undoneUnsaved === 1,
  `undo works after a reload, and leaves the drawing unsaved (${JSON.stringify({ undoAfterReload, undoneWords, undoneUnsaved })})`);
await page.getByTestId('wireframe-redo').click({ timeout: 2_000 }).catch(() => undefined);
await page.waitForTimeout(200);
record((await page.locator('[data-element-type="text"]').textContent().catch(() => '')).includes('Welcome back') && (await page.getByTestId('wireframe-unsaved').count()) === 0,
  'and redo brings back what is saved');

// A model's drawing, answered here: a button added, taken onto the canvas, and undone as one step.
const stored = (await gql(`query ($id: ID!) { wireframe(id: $id) { id workspaceId name document elementCount revision createdBy createdAt updatedBy updatedAt } }`, { id })).data.wireframe;
const after = JSON.parse(stored.document);
after.elements.push({ id: 'cta', type: 'button', x: 300, y: 500, w: 160, h: 44, text: 'Sign in', props: { variant: 'primary' } });
let asked = null;
// The answer waits until the canvas has been read while the model is still drawing.
let answer = () => {};
const answerable = new Promise((resolve) => { answer = resolve; });
await page.route('**/graphql', async (route) => {
  const body = route.request().postDataJSON() ?? {};
  if (!(body.query ?? '').includes('askWireframe')) return route.continue();
  asked = body.variables;
  await answerable;
  return route.fulfill({ json: { data: { askWireframe: {
    answer: 'Added a **Sign in** button.', changed: true,
    wireframe: { ...stored, document: JSON.stringify(after), elementCount: after.elements.length, revision: stored.revision + 1 },
  } } } });
});
// An empty chat greets and offers what it can draw, as cards with an icon, a title and a line each.
const welcome = page.getByTestId('wireframe-welcome');
const greeting = (await welcome.locator('h2').textContent().catch(() => '')) ?? '';
const cards = await page.getByTestId('wireframe-idea').evaluateAll((all) =>
  all.map((one) => ({ icon: one.querySelector('img') !== null, lines: one.innerText.split('\n').filter((line) => line.trim() !== '').length, height: Math.round(one.getBoundingClientRect().height) })));
record(greeting.startsWith('Hi ') && cards.length === 4 && cards.every((one) => one.icon && one.lines === 2 && one.height >= 48 && one.height <= 72),
  `an empty chat greets and offers four cards of an icon, a title and a line (${JSON.stringify({ greeting, cards })})`);
const send = await page.getByTestId('wireframe-chat-send').boundingBox();
const typed = await page.getByTestId('wireframe-chat-input').boundingBox();
record(send !== null && typed !== null && send.y > typed.y + typed.height - 2 && send.width <= 40,
  `Send is a round button along the foot of the box, under the words (${JSON.stringify({ send, typed })})`);
await page.screenshot({ path: shot('wireframe-welcome.png'), clip: await page.getByTestId('wireframe-panel').boundingBox() });
await page.getByTestId('wireframe-chat-input').fill('Add a sign in button');
const modelShown = (await page.getByTestId('wireframe-chat-model').textContent().catch(() => '')) ?? '';
if (await page.getByTestId('wireframe-chat-send').isDisabled()) {
  // No chat model in this workspace: Send is not offered, and the model's half cannot be driven.
  record(modelShown.includes('no chat model'), `Send is held back only for want of a chat model (${modelShown})`);
} else {
  // The box is selected, so that is where the model draws, and where the canvas shows it drawing.
  const target = await page.locator('[data-element-type="rect"] rect').first().boundingBox();
  await page.mouse.click(target.x + target.width / 2, target.y + target.height / 2);
  await page.waitForTimeout(150);
  const chosen = await page.getByTestId('wireframe-selected').first().boundingBox().catch(() => null);
  await page.getByTestId('wireframe-chat-send').click();
  const area = page.getByTestId('wireframe-drawing-area');
  await area.waitFor({ timeout: 5_000 }).catch(() => undefined);
  const over = await area.boundingBox({ timeout: 2_000 }).catch(() => null);
  const moving = await area.evaluate((one) => getComputedStyle(one).animationName, null, { timeout: 2_000 }).catch(() => null);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const still = await area.evaluate((one) => getComputedStyle(one).animationName, null, { timeout: 2_000 }).catch(() => null);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  record(chosen !== null && over !== null && ['x', 'y', 'width', 'height'].every((side) => Math.abs(over[side] - chosen[side]) <= 2),
    `while the model draws, the area it draws into is marked over the selected box (${JSON.stringify({ over, chosen })})`);
  record(moving !== null && moving !== 'none' && still === 'none', `and moves, unless motion is reduced (${moving}, ${still})`);

  // The conversation has room on both sides: the request's bubble does not run to the panel's edge, and is as far
  // from it as the status line under it is from the other; nothing in Send spills out of it.
  const room = await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="wireframe-panel"]').getBoundingClientRect();
    const talk = document.querySelector('[data-testid="wireframe-chat"]');
    const port = talk.getBoundingClientRect().left + talk.clientLeft + talk.clientWidth;
    const bubble = [...document.querySelectorAll('[data-testid="wireframe-chat-message"][data-role="user"]')].at(-1)?.getBoundingClientRect();
    const status = talk.querySelector('[role="status"]')?.getBoundingClientRect();
    const send = document.querySelector('[data-testid="wireframe-chat-send"]');
    const spill = Math.max(0, ...[...send.querySelectorAll('*')].map((one) => one.getBoundingClientRect().right - send.getBoundingClientRect().right));
    if (bubble === undefined || status === undefined) return null;
    return { right: Math.round(panel.right - bubble.right), left: Math.round(status.left - panel.left), inside: Math.round(port - bubble.right), spill: Math.round(spill) };
  });
  record(room !== null && room.inside >= 6 && room.right >= 20 && Math.abs(room.right - room.left) <= 3,
    `the request's bubble keeps the same room from the panel's edge as the status line does (${JSON.stringify(room)})`);
  record(room !== null && room.spill <= 1, `nothing spills out of Send while it waits (${JSON.stringify(room)})`);
  await page.screenshot({ path: shot('wireframe-drawing.png') });

  answer();
  await page.locator('[data-element-type="button"]').waitFor({ timeout: 10_000 }).catch(() => undefined);
  record((await page.getByTestId('wireframe-drawing-area').count()) === 0, 'the mark is gone once the model answers');
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
const cursor = await card.locator('[data-element-type="rect"]').first().evaluate((one) => getComputedStyle(one).cursor);
record(cursor === 'pointer', `over the card's drawing the pointer is the card's own (${cursor})`);
// Search narrows the list by a name or by words drawn on a wireframe.
const search = page.getByRole('searchbox');
await search.fill('welcome back');
await page.waitForTimeout(300);
const byWords = await page.locator(`[data-testid="wireframe-card"][data-wireframe-id="${id}"]`).count();
await search.fill('zz-nothing-is-called-this');
await page.waitForTimeout(300);
const none = await page.getByTestId('wireframe-card').count();
const said = (await page.getByTestId('wireframe-none-match').textContent().catch(() => '')) ?? '';
record(byWords === 1 && none === 0 && said.includes('No wireframe matches'), `search finds a wireframe by its drawn words and says when nothing matches (${byWords}, ${none}, ${said})`);
await search.fill('');
await card.getByTestId('wireframe-open').click();
await page.waitForURL(new RegExp(`/design/wireframes/${id}$`), { timeout: 10_000 }).catch(() => undefined);
record(page.url().endsWith(`/design/wireframes/${id}`), `clicking the card opens it in the editor (${page.url()})`);

// Selection as every drawing tool does it: a press outside what is selected lets it go, a frame's empty
// inside included, and a click on one of several selected keeps only that one.
await svg.waitFor({ timeout: 15_000 }).catch(() => undefined);
await page.waitForTimeout(400);
const area = await svg.boundingBox();
await page.getByTestId('wireframe-tool-frame').click();
await page.mouse.move(area.x + 200, area.y + 150);
await page.mouse.down();
await page.mouse.move(area.x + 700, area.y + 600, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(150);
// A pause after each press, as a hand makes: the editor reads its selection back on the next render.
const press = async (x, y) => { await page.mouse.click(x, y); await page.waitForTimeout(150); };
const selectedCount = () => page.getByTestId('wireframe-selected').count();
const inRect = await page.locator('[data-element-type="rect"] rect').first().boundingBox();
await press(inRect.x + inRect.width / 2, inRect.y + inRect.height / 2);
const rectHeld = await selectedCount();
await press(area.x + 650, area.y + 560);
record(rectHeld === 1 && (await selectedCount()) === 0, `a click on the frame's empty inside lets the selection go (${rectHeld} then ${await selectedCount()})`);
await press(inRect.x + inRect.width / 2, inRect.y + inRect.height / 2);
await press(area.x + area.width - 40, area.y + area.height - 40);
record((await selectedCount()) === 0, 'and so does a click on the empty canvas');
const inText = await page.locator('[data-element-type="text"]').boundingBox();
await press(inRect.x + inRect.width / 2, inRect.y + inRect.height / 2);
await page.keyboard.down('Shift');
await press(inText.x + inText.width / 2, inText.y + inText.height / 2);
await page.keyboard.up('Shift');
const both = await selectedCount();
await press(inRect.x + inRect.width / 2, inRect.y + inRect.height / 2);
record(both === 2 && (await selectedCount()) === 1, `a click on one of two selected keeps only that one (${both} then ${await selectedCount()})`);
const frameBox = await page.locator('[data-element-type="frame"] rect').first().boundingBox();
await press(frameBox.x + 2, frameBox.y + frameBox.height / 2);
const frameSelected = await page.locator('[data-testid="wireframe-selected"]').first().boundingBox().catch(() => null);
record((await selectedCount()) === 1 && frameSelected !== null && Math.abs(frameSelected.width - frameBox.width) < 4,
  `a click on the frame's edge still selects the frame (${JSON.stringify(frameSelected)})`);

// A card is sent as its own prompt: with something drawn, Polish this screen comes first.
await page.evaluate(() => sessionStorage.clear());
await page.reload({ waitUntil: 'domcontentloaded' });
await page.getByTestId('wireframe-welcome').waitFor({ timeout: 15_000 }).catch(() => undefined);
let ideaAsked = null;
const now = (await gql(`query ($id: ID!) { wireframe(id: $id) { id workspaceId name document elementCount revision createdBy createdAt updatedBy updatedAt } }`, { id })).data.wireframe;
await page.route('**/graphql', async (route) => {
  const body = route.request().postDataJSON() ?? {};
  if (!(body.query ?? '').includes('askWireframe')) return route.continue();
  ideaAsked = body.variables;
  return route.fulfill({ json: { data: { askWireframe: { answer: 'Tidied.', changed: false, wireframe: now } } } });
});
// The cards follow the drawing, so they are read once it is on the canvas.
await page.locator('[data-element-type]').first().waitFor({ timeout: 15_000 }).catch(() => undefined);
const firstIdea = page.getByTestId('wireframe-idea').first();
const firstTitle = (await firstIdea.textContent().catch(() => '')) ?? '';
if (await firstIdea.isEnabled().catch(() => false)) {
  await firstIdea.click();
  await page.getByTestId('wireframe-chat-message').first().waitFor({ timeout: 10_000 }).catch(() => undefined);
  record(firstTitle.includes('Polish this screen') && (ideaAsked?.messages?.at(-1)?.content ?? '').startsWith('Tidy up what is drawn'),
    `a card sends its own prompt, Polish first once something is drawn (${firstTitle} -> ${ideaAsked?.messages?.at(-1)?.content})`);
  record((await page.getByTestId('wireframe-welcome').count()) === 0, 'and the greeting gives way to the conversation');
}
await page.unroute('**/graphql');

// A history kept in this browser is only handed back to the drawing it was kept for: saved elsewhere since, it is dropped.
await page.reload({ waitUntil: 'domcontentloaded' });
await svg.waitFor({ timeout: 15_000 }).catch(() => undefined);
await page.waitForTimeout(400);
const desk = await svg.boundingBox();
await page.getByTestId('wireframe-tool-image').click();
await page.mouse.click(desk.x + desk.width - 260, desk.y + 120);
await page.getByTestId('wireframe-save').click();
await page.waitForTimeout(800);
const keptBefore = await page.evaluate((wireframe) => {
  try {
    return JSON.parse(localStorage.getItem(`orknux.wireframe.undo.${wireframe}`) ?? 'null')?.past?.length ?? 0;
  } catch {
    return 0;
  }
}, id);
const elsewhere = (await gql(`query ($id: ID!) { wireframe(id: $id) { document revision } }`, { id })).data.wireframe;
const changed = JSON.parse(elsewhere.document);
changed.elements.push({ id: 'elsewhere', type: 'note', x: 40, y: 40, w: 180, h: 120, text: 'Saved elsewhere' });
await gql(`mutation ($id: ID!, $document: String!, $revision: Int) { saveWireframe(id: $id, document: $document, revision: $revision) { revision } }`,
  { id, document: JSON.stringify(changed), revision: elsewhere.revision });
await page.reload({ waitUntil: 'domcontentloaded' });
await page.locator('[data-element-type="note"]').waitFor({ timeout: 15_000 }).catch(() => undefined);
await page.waitForTimeout(400);
const staleUndo = await page.getByTestId('wireframe-undo').isEnabled().catch(() => true);
const images = await page.locator('[data-element-type="image"]').count();
record(keptBefore > 0 && !staleUndo && images === 1 && (await page.locator('[data-element-type="note"]').count()) === 1,
  `a history kept for a drawing saved elsewhere since is not applied (${JSON.stringify({ keptBefore, staleUndo, images })})`);

await gql(`mutation ($id: ID!) { deleteWireframe(id: $id) }`, { id });
await finish(browser);
