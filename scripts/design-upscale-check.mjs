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
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

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
const ALGORITHMS = { 9393: ['R-ESRGAN 4x+', 'Lanczos'], 9494: ['SwinIR 4x', 'ESRGAN_4x', 'Nearest'] };
const upscales = [];
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
    if (Array.isArray(list)) list.push(...MODELS);
    return json === null ? route.continue() : route.fulfill({ json });
  }
  if (query.includes('imageModelParameters')) return route.fulfill({ json: { data: { imageModelParameters: [] } } });
  if (query.includes('designUpscaleAlgorithms')) {
    const names = ALGORITHMS[body.variables?.modelId] ?? [];
    return route.fulfill({ json: { data: { designUpscaleAlgorithms: { names, preferred: names[0] ?? null, reason: null } } } });
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
    imports.push({ id, name: input.name, prompt: input.prompt, image: input.image });
    return route.fulfill({ json: { data: { importDesignImage: { ...PICTURE, id, name: input.name ?? 'Imported picture', prompt: input.prompt ?? PICTURE.prompt } } } });
  }
  return route.continue();
});

const editAt = (id) => `${BASE}/workspace/${WORKSPACE}/design/images/${id}/edit`;
await page.goto(editAt(PICTURE.id), { waitUntil: 'domcontentloaded' });
await page.getByTestId('editor-picture').waitFor({ timeout: 20_000 }).catch(() => undefined);
await page.waitForTimeout(800);

// Upscale: only upscale models, each with its own server's algorithms.
await page.getByTestId('editor-upscale').click();
const dialog = page.getByTestId('upscale-dialog');
await dialog.waitFor({ timeout: 3_000 }).catch(() => undefined);
const offered = await page.getByTestId('upscale-model').locator('option').allInnerTexts().catch(() => []);
record(offered.length === 2 && offered.every((one) => /Forge|SD\.Next/.test(one)),
  `the Upscale window offers the upscale models and nothing else (${JSON.stringify(offered)})`);
const algorithmsOf = async () => {
  await page.waitForTimeout(400);
  return page.getByTestId('upscale-algorithm').locator('option').allInnerTexts().catch(() => []);
};
const first = await algorithmsOf();
await page.getByTestId('upscale-model').selectOption('9494');
const second = await algorithmsOf();
record(JSON.stringify(first) === JSON.stringify(ALGORITHMS[9393]) && JSON.stringify(second) === JSON.stringify(ALGORITHMS[9494]),
  `the algorithms are the chosen model's server's own (${JSON.stringify({ first, second })})`);
const scales = await page.getByTestId('upscale-scale').locator('option').allInnerTexts().catch(() => []);
record(scales.some((one) => one.includes('400 × 200')), `each scale says what the picture becomes (${JSON.stringify(scales)})`);
await page.getByTestId('upscale-algorithm').selectOption('ESRGAN_4x');
await page.getByTestId('upscale-scale').selectOption('4');
await page.getByTestId('upscale-submit').click();
await page.waitForTimeout(500);
const asked = upscales[0] ?? null;
record(asked !== null && asked.modelId === '9494' && asked.algorithm === 'ESRGAN_4x' && asked.scale === 4 && asked.imageId === PICTURE.id,
  `Upscale queues the picture with that model, algorithm and scale (${JSON.stringify(asked)})`);
record(!(await dialog.isVisible().catch(() => false)) && (await page.getByTestId('editor-changing').count()) === 1,
  'and the window closes onto the picture being drawn');

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
const orkxFile = orkx === null ? null : JSON.parse(orkx.bytes.toString('utf8'));
record(orkx !== null && orkx.name === 'Grey field.orkx' && orkxFile?.format === 'orknux-picture' && orkxFile?.name === 'Grey field'
  && orkxFile?.prompt === PICTURE.prompt && orkxFile?.image === dataUrl,
  `Orknux saves the picture with its name and prompt (${JSON.stringify({ name: orkx?.name, format: orkxFile?.format, keys: Object.keys(orkxFile ?? {}) })})`);

// Import: a file picked opens as a picture of its own, named after the file.
await page.getByTestId('editor-import-file').setInputFiles({ name: 'holiday.png', mimeType: 'image/png', buffer: PNG });
await page.waitForURL(/DESIGN-850\/edit/, { timeout: 5_000 }).catch(() => undefined);
record(imports[0]?.name === 'holiday' && imports[0]?.image?.startsWith('data:image/png;base64,') && page.url().includes('DESIGN-850'),
  `a picked file is imported, named after it, and opened (${JSON.stringify({ name: imports[0]?.name, url: page.url() })})`);

// An .orkx file brings back its name and prompt.
await page.getByTestId('editor-import-file').setInputFiles({ name: 'Grey field.orkx', mimeType: 'application/json', buffer: orkx?.bytes ?? Buffer.from('{}') });
await page.waitForTimeout(800);
record(imports[1]?.name === 'Grey field' && imports[1]?.prompt === PICTURE.prompt && imports[1]?.image === dataUrl,
  `an .orkx file brings back its picture, name and prompt (${JSON.stringify({ name: imports[1]?.name, prompt: imports[1]?.prompt })})`);

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
