/**
 * Upscale, import and export in the image editor.
 *
 * Upscale opens a window offering the workspace's upscale models and nothing
 * else; the algorithms are the chosen model's server's own, asked again when
 * the model changes; Upscale queues the picture made larger. A picture comes
 * in from a file - picked, dropped on the canvas, or pasted - and goes out as
 * PNG, JPEG or .orkx, which carries its name and prompt and brings them back.
 *
 * The picture, the models, the algorithms and the queue are answered here, so
 * the check needs no upscale server of the installation's.
 */
import { BASE, WORKSPACE, open, record, finish, chooseOption, optionsOffered, openPictureMenu } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 1000 } });

const PICTURE = {
  id: 'DESIGN-801', kind: 'DESIGN', source: 'Design', sourcePath: 'design/images/DESIGN-801', prompt: 'zz upscale: a grey field',
  filename: 'grey.png', contentType: 'image/png', sizeBytes: 1, url: '', previewUrl: null, drawnAt: new Date().toISOString(),
  name: 'Grey field', versionOf: null, draft: null,
  drawnWith: { modelId: '9191', model: 'Drawer', size: null, quality: null, style: null, drawnBy: 'alice' },
};
const model = (id, name, kind) => ({
  id, providerId: '1', workspaceId: WORKSPACE, providerName: 'Stub', name, modelId: name, kind, enabled: true,
  contextWindow: null, maxOutput: null, parallelToolCalls: null,
});
const MODELS = [model('9191', 'Drawer', 'IMAGE'), model('9393', 'Forge', 'UPSCALE'), model('9494', 'SD.Next', 'UPSCALE')];
/** Each server its own algorithms. */
const ALGORITHMS = { 9393: ['R-ESRGAN 4x+', 'Lanczos'], 9494: ['SwinIR 4x', 'ESRGAN_4x', 'Nearest', 'ScuNET GAN'] };
/** Of those, what restores rather than enlarges, as the server names them: what Clean up offers. */
const RESTORERS = { 9393: [], 9494: ['SwinIR 4x', 'ScuNET GAN'] };
const upscales = [];
/** Whether the workspace is answered with no upscale model at all. */
let noUpscalers = false;
const imports = [];

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
const PNG = Buffer.from(dataUrl.split(',')[1], 'base64');

// The archive is the server's to write - its test holds the format - so here it is bytes that pass through.
const ARCHIVE = Buffer.from('PK zz an archive');
const archiveAsked = [];
await page.route('**/api/workspaces/*/design/archive/*', (route) => {
  archiveAsked.push(new URL(route.request().url()).pathname);
  return route.fulfill({ status: 200, contentType: 'application/zip', body: ARCHIVE });
});

await page.route('**/graphql', async (route) => {
  const body = route.request().postDataJSON() ?? {};
  const query = body.query ?? '';
  if (query.includes('workspaceArtifact(')) {
    const id = body.variables?.id ?? PICTURE.id;
    const imported = imports.find((one) => one.id === id);
    return route.fulfill({ json: { data: { workspaceArtifact: { ...PICTURE, id, name: imported?.name ?? PICTURE.name } } } });
  }
  if (query.includes('workspaceModels') || query.includes('models(')) {
    const answered = await route.fetch().catch(() => null);
    const json = answered === null ? null : await answered.json().catch(() => null);
    const list = Object.values(json?.data ?? {}).find(Array.isArray);
    // The installation's own upscale models out, so the window offers exactly the ones answered here.
    if (Array.isArray(list)) {
      list.splice(0, list.length, ...list.filter((one) => one.kind !== 'UPSCALE' && (!noUpscalers || one.kind !== 'IMAGE')),
        ...MODELS.filter((one) => !noUpscalers || (one.kind !== 'UPSCALE' && one.kind !== 'IMAGE')));
    }
    return json === null ? route.continue() : route.fulfill({ json });
  }
  if (query.includes('imageModelParameters')) return route.fulfill({ json: { data: { imageModelParameters: [] } } });
  if (query.includes('designUpscaleAlgorithms')) {
    const names = ALGORITHMS[body.variables?.modelId] ?? [];
    const restorers = RESTORERS[body.variables?.modelId] ?? [];
    return route.fulfill({ json: { data: { designUpscaleAlgorithms: { names, preferred: names[0] ?? null, reason: null, restorers } } } });
  }
  if (query.includes('queueDesignImageUpscale')) {
    upscales.push(body.variables?.input);
    return route.fulfill({ json: { data: { queueDesignImageUpscale: {
      id: '88', status: 'QUEUED', prompt: PICTURE.prompt, modelId: body.variables.input.modelId, model: 'SD.Next', size: null,
      quality: null, style: null, requestedBy: 'alice', requestedAt: new Date().toISOString(), startedAt: null, reason: null,
      ahead: 0, name: PICTURE.name, sourceId: PICTURE.id, upscaler: body.variables.input.algorithm, scale: body.variables.input.scale, image: null,
    } } } });
  }
  if (query.includes('designImageJob(')) return route.fulfill({ json: { data: { designImageJob: null } } });
  if (query.includes('importDesignImage')) {
    const input = body.variables?.input ?? {};
    const id = `DESIGN-${850 + imports.length}`;
    imports.push({ id, name: input.name, prompt: input.prompt, image: input.image, archive: input.archive });
    return route.fulfill({ json: { data: { importDesignImage: { ...PICTURE, id, name: input.name ?? 'Imported picture', prompt: input.prompt ?? PICTURE.prompt } } } });
  }
  return route.continue();
});

const editAt = (id) => `${BASE}/workspace/${WORKSPACE}/design/images/${id}/edit`;
await page.goto(editAt(PICTURE.id), { waitUntil: 'domcontentloaded' });
await page.getByTestId('editor-picture').waitFor({ timeout: 20_000 }).catch(() => undefined);
await page.waitForTimeout(800);

// With no upscale model the button is off, and why - with where to add one - shows the moment the pointer is over it.
noUpscalers = true;
await page.goto(editAt(PICTURE.id), { waitUntil: 'domcontentloaded' });
await page.getByTestId('editor-picture').waitFor({ timeout: 20_000 }).catch(() => undefined);
await page.waitForTimeout(500);
await openPictureMenu(page);
const off = await page.getByTestId('editor-upscale').isDisabled().catch(() => false);
const hiddenBefore = !(await page.getByTestId('editor-upscale-hint').isVisible().catch(() => false));
await page.getByTestId('editor-upscale-wrap').hover();
await page.waitForTimeout(50);
const upscaleHint = page.getByTestId('editor-upscale-hint');
const shown = await upscaleHint.isVisible().catch(() => false);
const words = (await upscaleHint.innerText().catch(() => '')).trim();
const link = await page.getByTestId('editor-upscale-models').getAttribute('href').catch(() => null);
// Moving onto the link keeps the hint, and the link goes where models are set up.
await page.getByTestId('editor-upscale-models').hover().catch(() => undefined);
const stays = await upscaleHint.isVisible().catch(() => false);
record(off && hiddenBefore && shown && stays && words.startsWith('There is no upscale model') && link === `/workspace/${WORKSPACE}/models`,
  `with no upscale model, Upscale is off and says why at once, linking to Models (${JSON.stringify({ off, hiddenBefore, shown, stays, link })})`);
// With no image model either, the Model field links to where one is added.
const modelsLink = await page.getByTestId('editor-models-link').getAttribute('href').catch(() => null);
record(modelsLink === `/workspace/${WORKSPACE}/models`, `with no image model, the Model field links to Models (${modelsLink})`);
noUpscalers = false;
await page.goto(editAt(PICTURE.id), { waitUntil: 'domcontentloaded' });
await page.getByTestId('editor-picture').waitFor({ timeout: 20_000 }).catch(() => undefined);
await page.waitForTimeout(800);
await openPictureMenu(page);
record((await page.getByTestId('editor-upscale-hint').count()) === 0 && (await page.getByTestId('editor-upscale').isEnabled()),
  'with one, it is on and carries no hint');

/*
 * What works on the whole picture - Upscale, Clean up, Harmonize and Convert
 * to video - is one AI menu, since four buttons of their own pushed the
 * picture's name off the bar. Its button stands apart from Magic edit, divided
 * as Import is from it: one gap either side, not buttons touching.
 */
const magicBox = await page.getByTestId('magic-edit').boundingBox().catch(() => null);
const aiBox = await page.getByTestId('editor-ai').boundingBox().catch(() => null);
const importBox = await page.getByTestId('editor-import').boundingBox().catch(() => null);
const apart = magicBox === null || aiBox === null || importBox === null ? null
  : { magicToAi: aiBox.x - (magicBox.x + magicBox.width), aiToImport: importBox.x - (aiBox.x + aiBox.width) };
record(apart !== null && apart.magicToAi >= 12 && Math.abs(apart.magicToAi - apart.aiToImport) < 2,
  `the AI menu is divided from Magic edit as Import is from it (${JSON.stringify(apart)})`);
// And the menu holds the four in that order, one under the other.
const group = await Promise.all(['editor-upscale', 'editor-cleanup', 'editor-harmonize', 'editor-to-video']
  .map((id) => page.getByTestId('editor-ai-menu').getByTestId(id).boundingBox().catch(() => null)));
const steps = group.every((box) => box !== null)
  ? group.slice(1).map((box, at) => ({ down: Math.round(box.y - (group[at].y + group[at].height)), across: Math.round(box.x - group[at].x) }))
  : null;
record(steps !== null && steps.every((step) => step.down >= 0 && step.down < 8 && Math.abs(step.across) < 2),
  `the AI menu holds Upscale, Clean up, Harmonize and Convert to video in that order (${JSON.stringify(steps)})`);

// Upscale: only upscale models, each with its own server's algorithms.
await page.getByTestId('editor-upscale').click();
const dialog = page.getByTestId('upscale-dialog');
await dialog.waitFor({ timeout: 3_000 }).catch(() => undefined);
const offered = (await optionsOffered(page, page.getByTestId('upscale-model')).catch(() => [])).map((one) => one.label);
record(offered.length === 2 && offered.every((one) => /Forge|SD\.Next/.test(one)),
  `the Upscale window offers the upscale models and nothing else (${JSON.stringify(offered)})`);
const algorithmsOf = async () => {
  await page.waitForTimeout(400);
  return optionsOffered(page, page.getByTestId('upscale-algorithm')).then((rows) => rows.map((one) => one.label)).catch(() => []);
};
const first = await algorithmsOf();
await chooseOption(page, page.getByTestId('upscale-model'), '9494');
const second = await algorithmsOf();
record(JSON.stringify(first) === JSON.stringify(ALGORITHMS[9393]) && JSON.stringify(second) === JSON.stringify(ALGORITHMS[9494]),
  `the algorithms are the chosen model's server's own (${JSON.stringify({ first, second })})`);
const scales = (await optionsOffered(page, page.getByTestId('upscale-scale')).catch(() => [])).map((one) => one.label);
record(scales.some((one) => one.includes('400 × 200')), `each scale says what the picture becomes (${JSON.stringify(scales)})`);
await chooseOption(page, page.getByTestId('upscale-algorithm'), 'ESRGAN_4x');
await chooseOption(page, page.getByTestId('upscale-scale'), '4');
await page.getByTestId('upscale-submit').click();
await page.waitForTimeout(500);
const asked = upscales[0] ?? null;
record(asked !== null && asked.modelId === '9494' && asked.algorithm === 'ESRGAN_4x' && asked.scale === 4 && asked.imageId === PICTURE.id,
  `Upscale queues the picture with that model, algorithm and scale (${JSON.stringify(asked)})`);
record(!(await dialog.isVisible().catch(() => false)) && (await page.getByTestId('editor-changing').count()) === 1,
  'and the window closes onto the picture being drawn');

// Clean up: the same road at 1x, offering the server's restoration models, with no scale to choose. Issue #640.
await page.goto(editAt(PICTURE.id), { waitUntil: 'domcontentloaded' });
await page.getByTestId('editor-picture').waitFor({ timeout: 20_000 }).catch(() => undefined);
await openPictureMenu(page);
const cleanupBox = await page.getByTestId('editor-cleanup').boundingBox().catch(() => null);
const upscaleAt = await page.getByTestId('editor-upscale').boundingBox().catch(() => null);
record(cleanupBox !== null && upscaleAt !== null && Math.abs(cleanupBox.x - upscaleAt.x) < 2 && cleanupBox.y > upscaleAt.y &&
  cleanupBox.y - (upscaleAt.y + upscaleAt.height) < 8, `Clean up sits under Upscale (${JSON.stringify({ cleanupBox, upscaleAt })})`);
await page.getByTestId('editor-cleanup').click();
const cleanup = page.getByTestId('cleanup-dialog');
await cleanup.waitFor({ timeout: 3_000 }).catch(() => undefined);
await chooseOption(page, cleanup.getByTestId('cleanup-model'), '9494');
const restorersOffered = await page.waitForTimeout(400)
  .then(() => optionsOffered(page, cleanup.getByTestId('cleanup-algorithm')))
  .then((rows) => rows.map((one) => one.label)).catch(() => []);
record(JSON.stringify(restorersOffered) === JSON.stringify(RESTORERS[9494]) && (await cleanup.getByTestId('upscale-scale').count()) === 0,
  `the Clean up window offers the restoration models and no scale (${JSON.stringify(restorersOffered)})`);
await chooseOption(page, cleanup.getByTestId('cleanup-algorithm'), 'ScuNET GAN');
const upscalesBefore = upscales.length;
await cleanup.getByTestId('cleanup-submit').click();
await page.waitForTimeout(500);
const cleaned = upscales[upscalesBefore] ?? null;
record(cleaned !== null && cleaned.algorithm === 'ScuNET GAN' && cleaned.scale === 1 && cleaned.modelId === '9494' &&
  !(await cleanup.isVisible().catch(() => false)) && (await page.getByTestId('editor-changing').count()) === 1,
  `Clean up queues the picture at 1x with the restoration model chosen, as a draft being drawn (${JSON.stringify(cleaned)})`);

// Export: PNG, JPEG and .orkx - the last with the name and prompt.
await page.goto(editAt(PICTURE.id), { waitUntil: 'domcontentloaded' });
await page.getByTestId('editor-picture').waitFor({ timeout: 20_000 }).catch(() => undefined);
await page.waitForTimeout(500);
await page.getByTestId('editor-export').click();
const items = await page.getByTestId('editor-export-menu').locator('button').allInnerTexts().catch(() => []);
record(JSON.stringify(items) === JSON.stringify(['PNG', 'JPEG', 'Orknux (.orkx)']), `Export offers PNG, JPEG and Orknux (${JSON.stringify(items)})`);
const downloaded = async (testId) => {
  const waiting = page.waitForEvent('download', { timeout: 5_000 }).catch(() => null);
  if (!(await page.getByTestId('editor-export-menu').isVisible().catch(() => false))) await page.getByTestId('editor-export').click();
  await page.getByTestId(testId).click();
  const download = await waiting;
  if (download === null) return null;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return { name: download.suggestedFilename(), bytes: Buffer.concat(chunks) };
};
const png = await downloaded('editor-export-png');
record(png !== null && png.name === 'Grey field.png' && png.bytes.subarray(0, 4).toString('hex') === '89504e47',
  `PNG saves the picture as a PNG named after it (${png?.name})`);
const jpeg = await downloaded('editor-export-jpeg');
record(jpeg !== null && jpeg.name === 'Grey field.jpg' && jpeg.bytes.subarray(0, 3).toString('hex') === 'ffd8ff',
  `JPEG saves it re-encoded as a JPEG (${jpeg?.name})`);
const orkx = await downloaded('editor-export-orkx');
record(orkx !== null && orkx.name === 'Grey field.orkx' && orkx.bytes.equals(ARCHIVE)
  && archiveAsked[0] === `/api/workspaces/${WORKSPACE}/design/archive/${PICTURE.id}`,
  `Orknux saves the server's archive of the picture (${JSON.stringify({ name: orkx?.name, asked: archiveAsked })})`);

// Import: a file picked opens as a picture of its own, named after the file.
await page.getByTestId('editor-import-file').setInputFiles({ name: 'holiday.png', mimeType: 'image/png', buffer: PNG });
await page.waitForURL(/DESIGN-850\/edit/, { timeout: 5_000 }).catch(() => undefined);
record(imports[0]?.name === 'holiday' && imports[0]?.image?.startsWith('data:image/png;base64,') && page.url().includes('DESIGN-850'),
  `a picked file is imported, named after it, and opened (${JSON.stringify({ name: imports[0]?.name, url: page.url() })})`);

// An .orkx file goes to the server whole, which reads its project and picture.
await page.getByTestId('editor-import-file').setInputFiles({ name: 'Grey field.orkx', mimeType: 'application/octet-stream', buffer: ARCHIVE });
await page.waitForTimeout(800);
const sent = imports[1]?.archive ?? '';
record(sent !== '' && Buffer.from(sent.split(',')[1] ?? '', 'base64').equals(ARCHIVE) && imports[1]?.image == null,
  `an .orkx file is handed to the server as an archive (${JSON.stringify({ archive: sent.slice(0, 40) })})`);

// Dropped on the canvas: said while it is held there, imported when it lands.
await page.getByTestId('editor-picture').waitFor({ timeout: 10_000 }).catch(() => undefined);
const transfer = await page.evaluateHandle((base64) => {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const data = new DataTransfer();
  data.items.add(new File([bytes], 'dropped.png', { type: 'image/png' }));
  return data;
}, PNG.toString('base64'));
await page.getByTestId('editor-canvas').dispatchEvent('dragover', { dataTransfer: transfer });
const hint = await page.getByTestId('editor-drop-hint').isVisible().catch(() => false);
await page.getByTestId('editor-canvas').dispatchEvent('drop', { dataTransfer: transfer });
await page.waitForTimeout(800);
record(hint && imports[2]?.name === 'dropped', `a file dropped on the canvas is imported (${JSON.stringify({ hint, name: imports[2]?.name })})`);

// Pasted: a picture on the clipboard opens the same way, named as pasted.
await page.getByTestId('editor-picture').waitFor({ timeout: 10_000 }).catch(() => undefined);
await page.evaluate((base64) => {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const data = new DataTransfer();
  data.items.add(new File([bytes], 'image.png', { type: 'image/png' }));
  document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
}, PNG.toString('base64'));
await page.waitForTimeout(800);
record(imports[3]?.name === 'Pasted picture' && imports[3]?.image?.startsWith('data:image/png;base64,'),
  `a pasted picture is imported (${JSON.stringify({ name: imports[3]?.name })})`);

await finish(browser);
