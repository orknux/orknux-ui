/**
 * The wait in the image editor is one line: the mark, "Drawing…", then Stop.
 *
 * It was two layouts and both were wrong. Under a picture being changed, Stop
 * sat on a line of its own below the word; on an empty canvas it sat beside
 * the word with nothing between them, below its middle. Both are measured
 * here off what is drawn: the three in that order left to right, their middles
 * on one line, a gap before Stop, and Stop's word inset from its border by
 * its padding as every secondary button is.
 *
 * The pictures, the models and the job are answered here, so the check needs
 * no image server of the installation's.
 */
import { BASE, WORKSPACE, open, record, finish, openPictureMenu } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 900 } });

const PICTURE = {
  id: 'DESIGN-861', kind: 'DESIGN', source: 'Design', sourcePath: 'design/images/DESIGN-861', prompt: 'zz stop line: a grey field',
  filename: 'grey.png', contentType: 'image/png', sizeBytes: 1, url: '', previewUrl: null, drawnAt: new Date().toISOString(),
  name: 'Grey field', versionOf: null, draft: null,
  drawnWith: { modelId: '9191', model: 'Drawer', size: null, quality: null, style: null, drawnBy: 'alice' },
};
const model = (id, name, kind) => ({
  id, providerId: '1', workspaceId: WORKSPACE, providerName: 'Stub', name, modelId: name, kind, enabled: true,
  contextWindow: null, maxOutput: null, parallelToolCalls: null,
});
const MODELS = [model('9191', 'Drawer', 'IMAGE'), model('9393', 'Forge', 'UPSCALE')];
PICTURE.url = await page.evaluate(() => {
  const canvas = document.createElement('canvas');
  canvas.width = 300;
  canvas.height = 200;
  const pen = canvas.getContext('2d');
  pen.fillStyle = '#888';
  pen.fillRect(0, 0, 300, 200);
  return canvas.toDataURL('image/png');
});

/** Whether the job drawn is of a picture (an upscale of it) or a new one. */
let ofPicture = true;
const job = (status) => ({
  id: '861', status, prompt: PICTURE.prompt, modelId: '9393', model: 'Forge', size: null, quality: null, style: null,
  requestedBy: 'alice', requestedAt: new Date().toISOString(), startedAt: null, reason: null, ahead: 0, name: PICTURE.name,
  sourceId: ofPicture ? PICTURE.id : null, upscaler: 'Lanczos', scale: 2, strength: null, checkpoint: null, image: null,
});

await page.route('**/graphql', async (route) => {
  const body = route.request().postDataJSON() ?? {};
  const query = body.query ?? '';
  if (query.includes('workspaceArtifact(')) return route.fulfill({ json: { data: { workspaceArtifact: PICTURE } } });
  if (query.includes('workspaceModels') || query.includes('models(')) {
    const answered = await route.fetch().catch(() => null);
    const json = answered === null ? null : await answered.json().catch(() => null);
    const list = Object.values(json?.data ?? {}).find(Array.isArray);
    if (Array.isArray(list)) list.splice(0, list.length, ...list.filter((one) => one.kind !== 'UPSCALE' && one.kind !== 'IMAGE'), ...MODELS);
    return json === null ? route.continue() : route.fulfill({ json });
  }
  if (query.includes('imageModelParameters')) return route.fulfill({ json: { data: { imageModelParameters: [] } } });
  if (query.includes('designUpscaleAlgorithms')) {
    return route.fulfill({ json: { data: { designUpscaleAlgorithms: { names: ['Lanczos'], preferred: 'Lanczos', reason: null } } } });
  }
  if (query.includes('queueDesignImageUpscale')) return route.fulfill({ json: { data: { queueDesignImageUpscale: job('QUEUED') } } });
  if (query.includes('designImageJob(')) return route.fulfill({ json: { data: { designImageJob: job('DRAWING') } } });
  return route.continue();
});

/** Where the mark, the word and Stop are drawn, and how far Stop's word sits from its border. */
const measure = () => page.evaluate(() => {
  const line = document.querySelector('[data-testid="editor-drawing"]');
  const status = line?.querySelector('[role="status"]');
  const mark = status?.querySelector('svg');
  const stop = document.querySelector('[data-testid="editor-stop"]');
  if (!line || !status || !mark || !stop) return null;
  const box = (rect) => ({ left: rect.left, right: rect.right, middle: (rect.top + rect.bottom) / 2 });
  const textOf = (element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    // The word alone, not the mark beside it.
    if (element === status) range.setStartAfter(mark);
    return range.getBoundingClientRect();
  };
  const word = textOf(status);
  const stopWord = textOf(stop);
  const button = stop.getBoundingClientRect();
  return {
    mark: box(mark.getBoundingClientRect()),
    word: { ...box(word), text: status.textContent.trim() },
    stop: box(button),
    inset: { left: stopWord.left - button.left, right: button.right - stopWord.right },
  };
});

const oneLine = (m) =>
  m !== null &&
  m.mark.right <= m.word.left &&
  m.word.right + 8 <= m.stop.left &&
  Math.abs(m.mark.middle - m.word.middle) <= 3 &&
  Math.abs(m.word.middle - m.stop.middle) <= 3 &&
  m.inset.left >= 8 &&
  m.inset.right >= 8;

// A picture being upscaled: the picture stays in view, the wait under it.
await page.goto(`${BASE}/workspace/${WORKSPACE}/design/images/${PICTURE.id}/edit`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('editor-picture').waitFor({ timeout: 20_000 }).catch(() => undefined);
await page.waitForTimeout(800);
await openPictureMenu(page);
await page.getByTestId('editor-upscale').click().catch(() => undefined);
await page.getByTestId('upscale-dialog').waitFor({ timeout: 3_000 }).catch(() => undefined);
await page.waitForTimeout(500);
await page.getByTestId('upscale-submit').click().catch(() => undefined);
await page.getByTestId('editor-changing').waitFor({ timeout: 5_000 }).catch(() => undefined);
await page.getByTestId('editor-stop').waitFor({ timeout: 5_000 }).catch(() => undefined);
const over = await measure();
record(oneLine(over), `under a picture being changed, the mark, the word and a padded Stop are one line (${JSON.stringify(over)})`);

// A new picture being drawn: nothing on the canvas but the wait.
ofPicture = false;
await page.goto(`${BASE}/workspace/${WORKSPACE}/design/images/new?job=861`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('editor-stop').waitFor({ timeout: 20_000 }).catch(() => undefined);
await page.waitForTimeout(500);
const alone = await measure();
record(oneLine(alone), `on an empty canvas, the mark, the word and a padded Stop are one line (${JSON.stringify(alone)})`);

await finish(browser);
