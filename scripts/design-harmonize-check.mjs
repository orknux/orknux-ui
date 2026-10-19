/**
 * Harmonize in the image editor: the whole picture redrawn lightly, so the
 * seams a Magic edit left blend.
 *
 * The button sits beside Upscale and, with no model to redraw with, is off and
 * says why at once with a link to Models. Its window offers the image models
 * Magic edit offers and each Stable Diffusion WebUI by its upscale model,
 * starting at the model the editor holds for the picture; the prompt starts as
 * the picture's own. A WebUI takes a strength - starting where the server says
 * the installation's setting is - and offers its checkpoints; an image model's
 * edit takes none, so the strength is off with a line saying so. What was
 * chosen is what is sent, the result arrives as a draft, and a failure shows
 * the model's own words over the picture, as a failed change does.
 *
 * The picture, the models, the options and the queue are answered here, so the
 * check needs no image server of the installation's.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 1000 } });

const PICTURE = {
  id: 'DESIGN-801', kind: 'DESIGN', source: 'Design', sourcePath: 'design/images/DESIGN-801', prompt: 'zz harmonize: a grey field at dusk',
  filename: 'grey.png', contentType: 'image/png', sizeBytes: 1, url: '', previewUrl: null, drawnAt: new Date().toISOString(),
  name: 'Grey field', versionOf: null, draft: null,
  drawnWith: { modelId: '9292', model: 'Painter', size: null, quality: null, style: null, drawnBy: 'alice' },
};
const model = (id, name, kind, providerName = 'Stub') => ({
  id, providerId: '1', workspaceId: WORKSPACE, providerName, name, modelId: name, kind, enabled: true,
  contextWindow: null, maxOutput: null, parallelToolCalls: null,
});
const MODELS = [model('9191', 'Drawer', 'IMAGE'), model('9292', 'Painter', 'IMAGE'), model('9393', 'Lanczos', 'UPSCALE', 'Forge')];
/** Where the installation's setting puts the strength: not the dialog's own fallback, so a default from nowhere shows. */
const SETTING = 0.35;
const CHECKPOINTS = ['beta.safetensors [bbbb]', 'alpha.safetensors [aaaa]'];
const harmonizes = [];
/** Whether the workspace is answered with no model that could redraw at all. */
let noModels = false;
/** Whether a queued job answers drawn or failed. */
let outcome = 'DRAWN';

const dataUrl = await page.evaluate(() => {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 100;
  const pen = canvas.getContext('2d');
  pen.fillStyle = '#888';
  pen.fillRect(0, 0, 200, 100);
  return canvas.toDataURL('image/png');
});
PICTURE.url = dataUrl;
const DRAFT = { ...PICTURE, id: 'DESIGN-802', versionOf: PICTURE.id };

const jobOf = (id, input, status, image = null, reason = null) => ({
  id, status, prompt: input.prompt, modelId: input.modelId, model: 'Stub', size: null, quality: null, style: null,
  requestedBy: 'alice', requestedAt: new Date().toISOString(), startedAt: null, reason, ahead: status === 'QUEUED' ? 0 : null,
  name: PICTURE.name, sourceId: input.imageId, upscaler: null, scale: null, image,
});

await page.route('**/graphql', async (route) => {
  const body = route.request().postDataJSON() ?? {};
  const query = body.query ?? '';
  if (query.includes('workspaceArtifact(')) {
    const id = body.variables?.id ?? PICTURE.id;
    return route.fulfill({ json: { data: { workspaceArtifact: id === DRAFT.id ? DRAFT : PICTURE } } });
  }
  if (query.includes('workspaceModels') || query.includes('models(')) {
    const answered = await route.fetch().catch(() => null);
    const json = answered === null ? null : await answered.json().catch(() => null);
    const list = Object.values(json?.data ?? {}).find(Array.isArray);
    // The installation's own image and upscale models out, so the window offers exactly the ones answered here.
    if (Array.isArray(list)) {
      list.splice(0, list.length, ...list.filter((one) => one.kind !== 'UPSCALE' && one.kind !== 'IMAGE'), ...(noModels ? [] : MODELS));
    }
    return json === null ? route.continue() : route.fulfill({ json });
  }
  if (query.includes('imageModelParameters')) return route.fulfill({ json: { data: { imageModelParameters: [] } } });
  if (query.includes('designHarmonizeOptions')) {
    const webUi = body.variables?.modelId === '9393';
    return route.fulfill({ json: { data: { designHarmonizeOptions: {
      strengthTaken: webUi, strength: SETTING, checkpoints: webUi ? CHECKPOINTS : [], preferredCheckpoint: webUi ? CHECKPOINTS[0] : null, reason: null,
    } } } });
  }
  if (query.includes('queueDesignImageHarmonize')) {
    const input = body.variables?.input ?? {};
    harmonizes.push(input);
    return route.fulfill({ json: { data: { queueDesignImageHarmonize: jobOf(String(70 + harmonizes.length), input, 'QUEUED') } } });
  }
  if (query.includes('designImageJob(')) {
    const id = body.variables?.id;
    const input = harmonizes[Number(id) - 71];
    if (input === undefined) return route.fulfill({ json: { data: { designImageJob: null } } });
    const answered = outcome === 'DRAWN'
      ? jobOf(id, input, 'DRAWN', DRAFT)
      : jobOf(id, input, 'FAILED', null, 'zz the model said: the edit endpoint is busy');
    return route.fulfill({ json: { data: { designImageJob: answered } } });
  }
  return route.continue();
});

const editAt = (id) => `${BASE}/workspace/${WORKSPACE}/design/images/${id}/edit`;
const openEditor = async () => {
  await page.goto(editAt(PICTURE.id), { waitUntil: 'domcontentloaded' });
  await page.getByTestId('editor-picture').waitFor({ timeout: 20_000 }).catch(() => undefined);
  await page.waitForTimeout(800);
};

// With no model to redraw with, the button is off, and why - with where to add one - shows the moment the pointer is over it.
noModels = true;
await openEditor();
const off = await page.getByTestId('editor-harmonize').isDisabled().catch(() => false);
const hiddenBefore = !(await page.getByTestId('editor-harmonize-hint').isVisible().catch(() => false));
await page.getByTestId('editor-harmonize-wrap').hover().catch(() => undefined);
await page.waitForTimeout(50);
const hint = page.getByTestId('editor-harmonize-hint');
const shown = await hint.isVisible().catch(() => false);
const words = (await hint.innerText().catch(() => '')).trim();
const link = await page.getByTestId('editor-harmonize-models').getAttribute('href').catch(() => null);
await page.getByTestId('editor-harmonize-models').hover().catch(() => undefined);
const stays = await hint.isVisible().catch(() => false);
record(off && hiddenBefore && shown && stays && words.startsWith('There is no image model') && link === `/workspace/${WORKSPACE}/models`,
  `with no model, Harmonize is off and says why at once, linking to Models (${JSON.stringify({ off, hiddenBefore, shown, stays, link })})`);

noModels = false;
await openEditor();
record((await page.getByTestId('editor-harmonize-hint').count()) === 0 && (await page.getByTestId('editor-harmonize').isEnabled().catch(() => false)),
  'with models, it is on and carries no hint');

// Beside Upscale: the next thing along the same row, not across a divider.
const upscaleBox = await page.getByTestId('editor-upscale').boundingBox().catch(() => null);
const harmonizeBox = await page.getByTestId('editor-harmonize').boundingBox().catch(() => null);
const beside = upscaleBox === null || harmonizeBox === null ? null
  : { gap: harmonizeBox.x - (upscaleBox.x + upscaleBox.width), rows: Math.abs(harmonizeBox.y - upscaleBox.y) };
record(beside !== null && beside.gap >= 0 && beside.gap < 20 && beside.rows < 2, `Harmonize sits right beside Upscale (${JSON.stringify(beside)})`);

// The window: every model that can redraw, starting at the editor's own, and the picture's prompt.
await page.getByTestId('editor-harmonize').click();
const dialog = page.getByTestId('harmonize-dialog');
await dialog.waitFor({ timeout: 3_000 }).catch(() => undefined);
await page.waitForTimeout(400);
const offered = await page.getByTestId('harmonize-model').locator('option').evaluateAll((all) => all.map((one) => one.value)).catch(() => []);
const startsAt = await page.getByTestId('harmonize-model').inputValue().catch(() => null);
record(JSON.stringify(offered) === JSON.stringify(['9191', '9292', '9393']) && startsAt === '9292',
  `the window offers the image models and the WebUI, starting at the editor's model (${JSON.stringify({ offered, startsAt })})`);
const prompt = await page.getByTestId('harmonize-prompt').inputValue().catch(() => null);
const hints = await page.getByTestId('harmonize-dialog').locator('button[aria-label]').evaluateAll((all) => all.filter((b) => b.textContent.trim() === '?').length).catch(() => 0);
record(hints >= 2, `the window explains Harmonize and its Strength behind (?) (${hints})`);
// Tall enough for its three lines, and dragged taller: in the dialog's flex sizing it drew one cropped line and would not grow.
const promptBox = page.getByTestId('harmonize-prompt');
const tallBefore = await promptBox.evaluate((el) => Math.round(el.getBoundingClientRect().height)).catch(() => 0);
const box = await promptBox.boundingBox().catch(() => null);
if (box !== null) {
  await page.mouse.move(box.x + box.width - 3, box.y + box.height - 3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 3, box.y + box.height + 80, { steps: 6 });
  await page.mouse.up();
}
const tallAfter = await promptBox.evaluate((el) => Math.round(el.getBoundingClientRect().height)).catch(() => 0);
record(tallBefore >= 60, `the prompt box shows its three lines (${tallBefore}px)`);
record(tallAfter > tallBefore + 40, `and is dragged taller by its corner (${tallBefore}px -> ${tallAfter}px)`);
record(prompt === PICTURE.prompt, `the prompt starts as the picture's own (${JSON.stringify(prompt)})`);
// An image model's edit takes no strength: the field is off, and one line says why.
const strengthOff = await page.getByTestId('harmonize-strength').isDisabled().catch(() => false);
const note = (await page.getByTestId('harmonize-strength-note').innerText().catch(() => '')).trim();
record(strengthOff && note.includes('takes no strength') && (await page.getByTestId('harmonize-checkpoint').count()) === 0,
  `for an image model the strength is off with a note, and no checkpoint is offered (${JSON.stringify({ strengthOff, note })})`);

// A WebUI: the strength on, at the installation's setting, and its checkpoints, the loaded one first.
await page.getByTestId('harmonize-model').selectOption('9393');
await page.waitForTimeout(400);
const strength = await page.getByTestId('harmonize-strength').inputValue().catch(() => null);
const strengthOn = await page.getByTestId('harmonize-strength').isEnabled().catch(() => false);
const checkpoints = await page.getByTestId('harmonize-checkpoint').locator('option').allInnerTexts().catch(() => []);
const checkpoint = await page.getByTestId('harmonize-checkpoint').inputValue().catch(() => null);
record(strengthOn && Number(strength) === SETTING && JSON.stringify(checkpoints) === JSON.stringify(CHECKPOINTS) && checkpoint === CHECKPOINTS[0]
  && (await page.getByTestId('harmonize-strength-note').count()) === 0,
  `for a WebUI the strength starts at the setting and its checkpoints are offered (${JSON.stringify({ strength, strengthOn, checkpoints, checkpoint })})`);

// What was chosen is what is sent, and the window closes onto the picture being redrawn.
await page.getByTestId('harmonize-strength').fill('0.2');
await page.getByTestId('harmonize-checkpoint').selectOption(CHECKPOINTS[1]);
await page.getByTestId('harmonize-prompt').fill('a grey field at dusk, evenly lit');
await page.getByTestId('harmonize-submit').click();
await page.waitForTimeout(400);
const asked = harmonizes[0] ?? null;
record(asked !== null && asked.modelId === '9393' && asked.imageId === PICTURE.id && asked.strength === 0.2
  && asked.checkpoint === CHECKPOINTS[1] && asked.prompt === 'a grey field at dusk, evenly lit',
  `Harmonize queues the picture with that model, prompt, strength and checkpoint (${JSON.stringify(asked)})`);
record(!(await dialog.isVisible().catch(() => false)), 'and the window closes');

// The result lands as a draft of the picture: marked unsaved, with Save and Discard on.
await page.getByTestId('editor-unsaved').waitFor({ timeout: 15_000 }).catch(() => undefined);
const draft = await page.getByTestId('editor-unsaved').isVisible().catch(() => false);
const saveOn = await page.getByTestId('editor-save').isEnabled().catch(() => false);
const discardOn = await page.getByTestId('editor-discard').isEnabled().catch(() => false);
record(draft && saveOn && discardOn && page.url().includes(PICTURE.id),
  `the redrawn picture lands as a draft, to Save or Discard (${JSON.stringify({ draft, saveOn, discardOn, url: page.url() })})`);

// An image model sends no strength and no checkpoint; a failure leaves the picture with the model's own words.
outcome = 'FAILED';
await page.getByTestId('editor-harmonize').click();
await dialog.waitFor({ timeout: 3_000 }).catch(() => undefined);
await page.getByTestId('harmonize-model').selectOption('9191');
await page.waitForTimeout(400);
await page.getByTestId('harmonize-submit').click();
await page.waitForTimeout(400);
const plain = harmonizes[1] ?? null;
record(plain !== null && plain.modelId === '9191' && plain.strength === null && plain.checkpoint === null,
  `an image model is asked with no strength and no checkpoint (${JSON.stringify(plain)})`);
await page.getByTestId('editor-failed').waitFor({ timeout: 15_000 }).catch(() => undefined);
const said = await page.getByTestId('editor-failed').innerText().catch(() => '');
const pictureStays = await page.getByTestId('editor-failed-picture').isVisible().catch(() => false);
record(said.includes('zz the model said: the edit endpoint is busy') && pictureStays,
  `a failed Harmonize keeps the picture and shows the model's words (${JSON.stringify({ said: said.slice(0, 120), pictureStays })})`);

await finish(browser);
