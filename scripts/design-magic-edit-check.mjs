/**
 * Magic edit: select part of a picture, say what to change, and it is asked of
 * the image model's edit endpoint.
 *
 * The editor's toolbar carries a Magic edit group, in violet, left of the zoom:
 * a rectangle and a lasso. Dragging either over the picture draws the selection
 * and, where the pointer lets go, opens a small form - what to change, which
 * model, and Change. Change queues an edit with the picture, the model and a
 * mask the picture's size that is transparent inside the selection.
 *
 * The picture, the models and the queue are answered here, so the check needs
 * no image model of the installation's.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 1000 } });

// A 400 by 300 grey picture, made in the page so its size is known.
const PICTURE_SIZE = { width: 400, height: 300 };
const PICTURE = {
  id: 'DESIGN-901', kind: 'DESIGN', source: 'Design', sourcePath: 'design/images/DESIGN-901', prompt: 'zz magic: a grey field',
  filename: 'grey.png', contentType: 'image/png', sizeBytes: 1, url: '', previewUrl: null, drawnAt: new Date().toISOString(),
  name: 'Grey field', versionOf: null, drawnWith: { modelId: '9191', model: 'Drawer', size: null, quality: null, style: null, drawnBy: 'alice' },
};
const MODELS = [
  { id: '9191', providerId: '1', workspaceId: WORKSPACE, providerName: 'Stub', name: 'Drawer', modelId: 'stub', kind: 'IMAGE', contextWindow: null, maxOutput: null, parallelToolCalls: null },
  { id: '9292', providerId: '1', workspaceId: WORKSPACE, providerName: 'Stub', name: 'Editor', modelId: 'edit', kind: 'IMAGE', contextWindow: null, maxOutput: null, parallelToolCalls: null },
];
const edits = [];
const versionCalls = [];
/** Whether the picture is answered with a draft: changes kept from an earlier visit. */
let withDraft = false;
/** Whether the change asked for is drawn yet: answered as drawn once the check has looked at the waiting. */
let drawnNow = false;
const VERSION = () => ({ ...PICTURE, id: `DESIGN-${902 + edits.length}`, versionOf: PICTURE.id });

// The picture's bytes, drawn by the page itself.
const dataUrl = await page.evaluate(({ width, height }) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const pen = canvas.getContext('2d');
  pen.fillStyle = '#888';
  pen.fillRect(0, 0, width, height);
  return canvas.toDataURL('image/png');
}, PICTURE_SIZE);
PICTURE.url = dataUrl;

await page.route('**/graphql', async (route) => {
  const body = route.request().postDataJSON() ?? {};
  const query = body.query ?? '';
  if (query.includes('workspaceArtifact(')) {
    const id = body.variables?.id;
    if (id === 'DESIGN-960') return route.fulfill({ json: { data: { workspaceArtifact: { ...PICTURE, id, versionOf: PICTURE.id, draft: null } } } });
    return route.fulfill({ json: { data: { workspaceArtifact: { ...PICTURE, draft: withDraft ? 'DESIGN-960' : null } } } });
  }
  if (query.includes('workspaceModels') || query.includes('models(')) {
    const answered = await route.fetch().catch(() => null);
    const json = answered === null ? null : await answered.json().catch(() => null);
    const list = Object.values(json?.data ?? {}).find(Array.isArray);
    if (Array.isArray(list)) list.push(...MODELS);
    return json === null ? route.continue() : route.fulfill({ json });
  }
  if (query.includes('imageModelParameters')) return route.fulfill({ json: { data: { imageModelParameters: [] } } });
  if (query.includes('queueDesignImageEdit')) {
    edits.push(body.variables?.input);
    return route.fulfill({
      json: { data: { queueDesignImageEdit: {
        id: '77', status: 'QUEUED', prompt: body.variables.input.prompt, modelId: body.variables.input.modelId, model: 'Editor',
        size: null, quality: null, style: null, requestedBy: 'alice', requestedAt: new Date().toISOString(), startedAt: null,
        reason: null, ahead: 0, name: 'Grey field', sourceId: PICTURE.id, image: null,
      } } },
    });
  }
  if (query.includes('designImageJob(')) {
    if (!drawnNow) return route.fulfill({ json: { data: { designImageJob: null } } });
    return route.fulfill({ json: { data: { designImageJob: {
      id: body.variables?.id, status: 'DRAWN', prompt: 'a red barn', modelId: '9292', model: 'Editor', size: null, quality: null, style: null,
      requestedBy: 'alice', requestedAt: new Date().toISOString(), startedAt: null, reason: null, ahead: null, name: 'Grey field',
      sourceId: PICTURE.id, image: VERSION(),
    } } } });
  }
  if (query.includes('saveDesignImageVersion')) {
    const copy = body.variables?.asCopy === true;
    versionCalls.push([copy ? 'copy' : 'save', body.variables?.id]);
    return route.fulfill({ json: { data: { saveDesignImageVersion: copy ? { ...PICTURE, id: 'DESIGN-950', name: 'Grey field (copy)' } : PICTURE } } });
  }
  if (query.includes('discardDesignImageVersions')) {
    versionCalls.push(['discard', body.variables?.id]);
    return route.fulfill({ json: { data: { discardDesignImageVersions: true } } });
  }
  return route.continue();
});

await page.goto(`${BASE}/workspace/${WORKSPACE}/design/images/${PICTURE.id}/edit`, { waitUntil: 'domcontentloaded' });
const picture = page.getByTestId('editor-picture');
await picture.waitFor({ timeout: 20_000 }).catch(() => undefined);
await page.waitForTimeout(800);

// The group: violet, left of the zoom, with the two tools.
const group = page.getByTestId('magic-edit');
const groupBox = await group.boundingBox().catch(() => null);
const zoomBox = await page.getByTestId('editor-zoom-out').boundingBox().catch(() => null);
const border = await group.evaluate((one) => getComputedStyle(one).borderTopColor).catch(() => '');
record(groupBox !== null && zoomBox !== null && groupBox.x + groupBox.width <= zoomBox.x && /rgb\((192, 132, 252|126, 34, 206)\)/.test(border),
  `Magic edit sits left of the zoom, in violet (${JSON.stringify({ groupBox, zoomBox, border })})`);
record((await page.getByTestId('magic-rectangle').count()) === 1 && (await page.getByTestId('magic-lasso').count()) === 1, 'with a rectangle and a lasso');
const controls = await group.evaluate((one) => [...one.children].map((child) => child.tagName));
const label = (await group.innerText().catch(() => '')).trim().toLowerCase();
record(JSON.stringify(controls) === JSON.stringify(['SPAN', 'BUTTON', 'BUTTON', 'BUTTON']) && label === 'magic',
  `named by a word rather than an icon that looks like a third tool (${JSON.stringify({ controls, label })})`);

// Rectangle: drag across the middle of the picture.
await page.getByTestId('magic-rectangle').click();
const box = await picture.boundingBox();
const from = { x: box.x + box.width * 0.25, y: box.y + box.height * 0.25 };
const to = { x: box.x + box.width * 0.75, y: box.y + box.height * 0.75 };
await page.mouse.move(from.x, from.y);
await page.mouse.down();
await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
await page.mouse.move(to.x, to.y, { steps: 4 });
await page.mouse.up();
const selected = await page.getByTestId('magic-selection').boundingBox().catch(() => null);
// The box measured includes the outline's glow, a few pixels each side.
record(selected !== null && Math.abs(selected.x - from.x) < 8 && Math.abs(selected.width - (to.x - from.x)) < 16,
  `the rectangle is drawn where it was dragged (${JSON.stringify({ selected, from, to })})`);

const ask = page.getByTestId('magic-ask');
await ask.waitFor({ timeout: 3_000 }).catch(() => undefined);
const askBox = await ask.boundingBox().catch(() => null);
record(askBox !== null && Math.abs(askBox.x - (to.x + 12)) < 30 && Math.abs(askBox.y - (to.y + 12)) < 30,
  `and a form opens by the pointer (${JSON.stringify({ askBox, pointer: to })})`);
const inside = {
  prompt: await ask.getByTestId('magic-prompt').count(),
  model: await ask.getByTestId('magic-model').count(),
  change: (await ask.getByTestId('magic-change').innerText().catch(() => '')).trim(),
  focused: await page.evaluate(() => document.activeElement?.getAttribute('data-testid')),
};
record(inside.prompt === 1 && inside.model === 1 && inside.change === 'Change' && inside.focused === 'magic-prompt',
  `asking what to change, with which model, and Change (${JSON.stringify(inside)})`);

await ask.getByTestId('magic-model').selectOption('9292');
// Zoomed in before the change is asked for: the zoom is kept through it.
await page.getByTestId('editor-zoom-in').click();
const zoomBefore = await page.getByTestId('editor-zoom').innerText();
await ask.getByTestId('magic-prompt').fill('a red barn');
await ask.getByTestId('magic-change').click();
await page.waitForTimeout(600);
const sent = edits[0] ?? {};
record(sent.imageId === PICTURE.id && sent.modelId === '9292' && sent.prompt === 'a red barn' && String(sent.mask).startsWith('data:image/png;base64,'),
  `Change asks the chosen model to change that picture, with a mask (${JSON.stringify({ ...sent, mask: String(sent.mask).slice(0, 30) })})`);

// The mask: the picture's size, transparent inside the selection and opaque outside it.
const mask = await page.evaluate(async (url) => {
  const image = new Image();
  image.src = url;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const pen = canvas.getContext('2d');
  pen.drawImage(image, 0, 0);
  const alpha = (x, y) => pen.getImageData(x, y, 1, 1).data[3];
  return { width: image.width, height: image.height, middle: alpha(200, 150), corner: alpha(10, 10) };
}, sent.mask);
record(mask.width === PICTURE_SIZE.width && mask.height === PICTURE_SIZE.height && mask.middle === 0 && mask.corner === 255,
  `the mask is the picture's size, transparent inside the selection (${JSON.stringify(mask)})`);
record((await page.getByTestId('editor-drawing').count()) === 1, 'and the change is on the canvas, waiting to be drawn');
const zoomAfter = await page.getByTestId('editor-zoom').innerText();
const drawnAt = Math.round((await page.getByTestId('editor-changing').locator('img').boundingBox().catch(() => null))?.width ?? 0);
record(zoomBefore !== 'Fit' && zoomAfter === zoomBefore && Math.abs(drawnAt - PICTURE_SIZE.width * parseInt(zoomAfter, 10) / 100) < 3,
  `the zoom is kept while the change is drawn (${JSON.stringify({ zoomBefore, zoomAfter, drawnAt })})`);
const changing = page.getByTestId('editor-changing');
const kept = {
  picture: await changing.locator('img').count(),
  selection: await changing.locator('polygon').count(),
  animated: await changing.locator('polygon').evaluate((one) => getComputedStyle(one).animationName).catch(() => ''),
};
const frameBox = await changing.boundingBox().catch(() => null);
const markBox = await page.getByTestId('editor-drawing').boundingBox().catch(() => null);
record(kept.picture === 1 && kept.selection === 1 && /breathing/.test(kept.animated) && frameBox !== null && markBox !== null && markBox.y >= frameBox.y + frameBox.height,
  `while it is drawn the picture stays, the selection highlighted and alive, and Drawing under it (${JSON.stringify({ ...kept, frameBox, markBox })})`);

// Drawn: the change is a version of the picture, not a picture of its own - marked unsaved, with Save on.
drawnNow = true;
await page.getByTestId('editor-unsaved').waitFor({ timeout: 8_000 }).catch(() => undefined);
record((await page.getByTestId('editor-unsaved').count()) === 1 && (await page.getByTestId('editor-save').isEnabled()),
  'the drawn change is shown as unsaved, and Save lights');
// A second round over the change just drawn: Select all outlines the whole of the picture now shown.
await page.waitForTimeout(500);
await page.getByTestId('magic-all').click().catch(() => undefined);
const secondRound = {
  selection: await page.getByTestId('magic-selection').boundingBox().catch(() => null),
  picture: await page.getByTestId('editor-picture').boundingBox().catch(() => null),
};
record(secondRound.selection !== null && secondRound.picture !== null
  && Math.abs(secondRound.selection.width - secondRound.picture.width) < 16 && Math.abs(secondRound.selection.x - secondRound.picture.x) < 8,
  `on a second round Select all outlines the whole picture shown (${JSON.stringify(secondRound)})`);
await page.keyboard.press('Escape');
await page.getByTestId('editor-save').click().catch(() => undefined);
await page.waitForTimeout(600);
record(versionCalls.some(([what, id]) => what === 'save' && id === 'DESIGN-903') && (await page.getByTestId('editor-unsaved').count()) === 0
  && page.url().endsWith(`/design/images/${PICTURE.id}/edit`),
  `Save writes it over the picture itself (${JSON.stringify({ versionCalls, url: page.url() })})`);

// Another round, thrown away: Discard goes back to the picture as it was saved. The rectangle is still in hand.
if ((await page.getByTestId('magic-rectangle').getAttribute('aria-pressed')) !== 'true') await page.getByTestId('magic-rectangle').click();
const boxAgain = await picture.boundingBox();
await page.mouse.move(boxAgain.x + 20, boxAgain.y + 20);
await page.mouse.down();
await page.mouse.move(boxAgain.x + 120, boxAgain.y + 120, { steps: 5 });
await page.mouse.up();
await page.getByTestId('magic-prompt').fill('a blue barn');
await page.getByTestId('magic-change').click();
await page.getByTestId('editor-unsaved').waitFor({ timeout: 8_000 }).catch(() => undefined);
await page.getByTestId('editor-discard').click().catch(() => undefined);
await page.waitForTimeout(600);
record(versionCalls.some(([what, id]) => what === 'discard' && id === PICTURE.id) && (await page.getByTestId('editor-unsaved').count()) === 0
  && page.url().endsWith(`/design/images/${PICTURE.id}/edit`),
  `Discard throws the change away and goes back to the picture (${JSON.stringify({ versionCalls, url: page.url() })})`);
// Another round, saved as a copy: a new picture, and the editor goes on with it.
await page.mouse.move(boxAgain.x + 20, boxAgain.y + 20);
await page.mouse.down();
await page.mouse.move(boxAgain.x + 120, boxAgain.y + 120, { steps: 5 });
await page.mouse.up();
await page.getByTestId('magic-prompt').fill('a green barn');
await page.getByTestId('magic-change').click();
await page.getByTestId('editor-unsaved').waitFor({ timeout: 8_000 }).catch(() => undefined);
await page.getByTestId('editor-save-copy').click().catch(() => undefined);
await page.waitForURL(/DESIGN-950\/edit$/, { timeout: 5_000 }).catch(() => undefined);
record(versionCalls.some(([what]) => what === 'copy') && page.url().endsWith('/design/images/DESIGN-950/edit')
  && (await page.getByTestId('editor-unsaved').count()) === 0,
  `Save as copy makes a new picture and goes on with it (${JSON.stringify({ versionCalls, url: page.url() })})`);
drawnNow = false;

// Select all: the whole picture selected, and what to change asked.
await page.goto(`${BASE}/workspace/${WORKSPACE}/design/images/${PICTURE.id}/edit`, { waitUntil: 'domcontentloaded' });
await picture.waitFor({ timeout: 20_000 }).catch(() => undefined);
await page.waitForTimeout(800);
await page.getByTestId('magic-all').click().catch(() => undefined);
const whole = await page.getByTestId('magic-selection').boundingBox().catch(() => null);
const pictureNow = await picture.boundingBox().catch(() => null);
record(whole !== null && pictureNow !== null && Math.abs(whole.width - pictureNow.width) < 16 && (await page.getByTestId('magic-ask').count()) === 1,
  `Select all selects the whole picture and asks what to change (${JSON.stringify({ whole, pictureNow })})`);
await page.keyboard.press('Escape');
// Zoomed past the canvas and scrolled: the outline stays on the picture, not where the picture was.
for (let step = 0; step < 4; step += 1) await page.getByTestId('editor-zoom-in').click();
await page.locator('[class*="stage"]').first().evaluate((stage) => { stage.scrollTop = 120; stage.scrollLeft = 60; });
await page.waitForTimeout(300);
await page.getByTestId('magic-all').click().catch(() => undefined);
const zoomedSelection = await page.getByTestId('magic-selection').boundingBox().catch(() => null);
const zoomedPicture = await picture.boundingBox().catch(() => null);
record(zoomedSelection !== null && zoomedPicture !== null
  && Math.abs(zoomedSelection.x - zoomedPicture.x) < 8 && Math.abs(zoomedSelection.y - zoomedPicture.y) < 8 && Math.abs(zoomedSelection.width - zoomedPicture.width) < 16,
  `zoomed and scrolled, the selection stays on the picture (${JSON.stringify({ zoomedSelection, zoomedPicture })})`);
await page.keyboard.press('Escape');
await page.getByTestId('editor-zoom').click();
await page.locator('body').click({ position: { x: 5, y: 500 } }).catch(() => undefined);
await page.keyboard.press('Control+a');
record((await page.getByTestId('magic-ask').count()) === 1, 'and Ctrl+A does the same');
// Asked over the whole picture: while it is drawn, the outline shows all round, not clipped at the edges.
await page.getByTestId('magic-prompt').fill('make it night');
await page.getByTestId('magic-change').click();
await page.getByTestId('editor-changing').waitFor({ timeout: 5_000 }).catch(() => undefined);
const edges = await page.getByTestId('editor-changing').locator('svg').evaluate((svg) => getComputedStyle(svg).overflow).catch(() => '');
record(edges === 'visible', `a whole-picture selection keeps its violet outline at the edges while drawn (overflow ${edges})`);
await page.keyboard.press('Escape');

// The tools by their shortcuts, chosen in Preferences - M and L unless changed.
await page.goto(`${BASE}/workspace/${WORKSPACE}/design/images/${PICTURE.id}/edit`, { waitUntil: 'domcontentloaded' });
await picture.waitFor({ timeout: 20_000 }).catch(() => undefined);
await page.waitForTimeout(800);
await page.locator('body').click({ position: { x: 5, y: 500 } }).catch(() => undefined);
await page.keyboard.press('m');
const byM = await page.getByTestId('magic-rectangle').getAttribute('aria-pressed');
await page.keyboard.press('l');
const byL = { rectangle: await page.getByTestId('magic-rectangle').getAttribute('aria-pressed'), lasso: await page.getByTestId('magic-lasso').getAttribute('aria-pressed') };
await page.keyboard.press('l');
const putDown = await page.getByTestId('magic-lasso').getAttribute('aria-pressed');
record(byM === 'true' && byL.rectangle === 'false' && byL.lasso === 'true' && putDown === 'false',
  `M picks the rectangle, L the lasso, and L again puts it down (${JSON.stringify({ byM, byL, putDown })})`);

// A picture with a draft opens at the draft - unsaved changes kept across leaving - with Save on.
withDraft = true;
await page.goto(`${BASE}/workspace/${WORKSPACE}/design/images/${PICTURE.id}/edit`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('editor-unsaved').waitFor({ timeout: 15_000 }).catch(() => undefined);
const draftMark = (await page.getByTestId('editor-unsaved').innerText().catch(() => '')).trim().toLowerCase();
record(draftMark === 'draft' && (await page.getByTestId('editor-save').isEnabled()),
  `a picture with a draft opens at it, marked Draft, with Save on (${draftMark})`);
withDraft = false;

// Lasso: a loop drawn freehand, on the picture opened again.
await page.goto(`${BASE}/workspace/${WORKSPACE}/design/images/${PICTURE.id}/edit`, { waitUntil: 'domcontentloaded' });
await picture.waitFor({ timeout: 20_000 }).catch(() => undefined);
await page.waitForTimeout(800);
await page.getByTestId('magic-lasso').click();
const again = await picture.boundingBox();
const centre = { x: again.x + again.width / 2, y: again.y + again.height / 2 };
const radius = Math.min(again.width, again.height) / 4;
await page.mouse.move(centre.x + radius, centre.y);
await page.mouse.down();
for (let step = 1; step <= 24; step += 1) {
  const angle = (step / 24) * Math.PI * 2;
  await page.mouse.move(centre.x + radius * Math.cos(angle), centre.y + radius * Math.sin(angle));
}
await page.mouse.up();
const loop = await page.getByTestId('magic-selection').getAttribute('points').catch(() => '');
record((loop ?? '').split(' ').length >= 20 && (await page.getByTestId('magic-ask').count()) === 1,
  `the lasso follows the pointer and asks what to change (${(loop ?? '').split(' ').length} points)`);
await page.keyboard.press('Escape');
record((await page.getByTestId('magic-ask').count()) === 0 && (await page.getByTestId('magic-selection').count()) === 0, 'and Escape lets the selection go');

await finish(browser);
