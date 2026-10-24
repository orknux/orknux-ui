/**
 * Stopping a picture that is waiting or being drawn.
 *
 * A Harmonize sent to a Stable Diffusion WebUI with a 2048 square estimated
 * thirteen hours, and nothing in Orknux could stop it. The editor's wait mark
 * carries Stop while the picture is queued and while it is drawn; Stop sends
 * the stop for that request, and the editor then says Stopped - not a failure -
 * with the picture it was asked of still in view, where a failed change keeps
 * it. A gallery card of a picture being drawn has Stop too. And Admin Settings
 * offers the working size Harmonize redraws at, beside its strength.
 *
 * The picture, the models, the options, the queue and the stop are answered
 * here, so the check needs no image server of the installation's.
 */
import { BASE, WORKSPACE, open, record, finish, openPictureMenu } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 1000 } });

const PICTURE = {
  id: 'DESIGN-901', kind: 'DESIGN', source: 'Design', sourcePath: 'design/images/DESIGN-901', prompt: 'zz stop: a grey field at dusk',
  filename: 'grey.png', contentType: 'image/png', sizeBytes: 1, url: '', previewUrl: null, drawnAt: new Date().toISOString(),
  name: 'Grey field', versionOf: null, draft: null,
  drawnWith: { modelId: '9292', model: 'Painter', size: null, quality: null, style: null, drawnBy: 'alice' },
};
const model = (id, name, kind, providerName = 'Stub') => ({
  id, providerId: '1', workspaceId: WORKSPACE, providerName, name, modelId: name, kind, enabled: true,
  contextWindow: null, maxOutput: null, parallelToolCalls: null,
});
const MODELS = [model('9292', 'Painter', 'IMAGE'), model('9393', 'Lanczos', 'UPSCALE', 'Forge')];

PICTURE.url = await page.evaluate(() => {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 100;
  const pen = canvas.getContext('2d');
  pen.fillStyle = '#888';
  pen.fillRect(0, 0, 200, 100);
  return canvas.toDataURL('image/png');
});

const jobOf = (id, status, { sourceId = PICTURE.id, ahead = null, prompt = 'a grey field at dusk' } = {}) => ({
  id, status, prompt, modelId: '9393', model: 'Lanczos', size: null, quality: null, style: null,
  requestedBy: 'alice', requestedAt: new Date().toISOString(), startedAt: status === 'QUEUED' ? null : new Date().toISOString(),
  reason: null, ahead, name: PICTURE.name, sourceId, upscaler: null, scale: null, strength: 0.3, checkpoint: null, image: null,
});

/** What the job is now, as the server would answer it. */
let status = 'QUEUED';
const stops = [];
/** The gallery's queue: one picture being drawn, until it is stopped. */
let galleryDrawing = true;

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
  if (query.includes('designHarmonizeOptions')) {
    return route.fulfill({ json: { data: { designHarmonizeOptions: {
      strengthTaken: true, strength: 0.3, checkpoints: [], preferredCheckpoint: null, reason: null,
    } } } });
  }
  if (query.includes('queueDesignImageHarmonize')) {
    return route.fulfill({ json: { data: { queueDesignImageHarmonize: jobOf('91', 'QUEUED', { ahead: 2 }) } } });
  }
  if (query.includes('stopDesignImageJob')) {
    stops.push(body.variables ?? {});
    if (body.variables?.id === '92') {
      galleryDrawing = false;
      return route.fulfill({ json: { data: { stopDesignImageJob: jobOf('92', 'STOPPED', { sourceId: null }) } } });
    }
    status = 'STOPPED';
    return route.fulfill({ json: { data: { stopDesignImageJob: jobOf('91', 'STOPPED') } } });
  }
  if (query.includes('designImageJob(')) {
    return route.fulfill({ json: { data: { designImageJob: jobOf('91', status, { ahead: status === 'QUEUED' ? 2 : null }) } } });
  }
  if (query.includes('designImageQueue')) {
    const queue = galleryDrawing ? [jobOf('92', 'DRAWING', { sourceId: null, prompt: 'zz stop: a red barn' })] : [];
    return route.fulfill({ json: { data: { designImageQueue: queue } } });
  }
  return route.continue();
});

// Harmonize the picture: the request comes back queued, two ahead.
await page.goto(`${BASE}/workspace/${WORKSPACE}/design/images/${PICTURE.id}/edit`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('editor-picture').waitFor({ timeout: 20_000 }).catch(() => undefined);
await page.waitForTimeout(800);
await openPictureMenu(page);
await page.getByTestId('editor-harmonize').click().catch(() => undefined);
await page.getByTestId('harmonize-dialog').waitFor({ timeout: 3_000 }).catch(() => undefined);
await page.waitForTimeout(400);
await page.getByTestId('harmonize-submit').click().catch(() => undefined);
await page.getByTestId('editor-drawing').waitFor({ timeout: 5_000 }).catch(() => undefined);

const waitWords = (await page.getByTestId('editor-drawing').innerText().catch(() => '')).trim();
const stopQueued = await page.getByTestId('editor-stop').isVisible().catch(() => false);
record(stopQueued && waitWords.includes('Queued, 2 ahead'), `a queued picture's wait carries Stop (${JSON.stringify({ stopQueued, waitWords })})`);

// Asked again, it is being drawn: Stop is still there.
status = 'DRAWING';
await page.waitForFunction(() => document.querySelector('[data-testid="editor-drawing"]')?.textContent?.includes('Drawing'), null, { timeout: 6_000 })
  .catch(() => undefined);
const drawingWords = (await page.getByTestId('editor-drawing').innerText().catch(() => '')).trim();
const stopDrawing = await page.getByTestId('editor-stop').isVisible().catch(() => false);
record(stopDrawing && drawingWords.includes('Drawing'), `a picture being drawn carries Stop (${JSON.stringify({ stopDrawing, drawingWords })})`);

// Stop sends the stop for that request, and the editor says Stopped over the picture it was asked of.
await page.getByTestId('editor-stop').click().catch(() => undefined);
await page.getByTestId('editor-stopped').waitFor({ timeout: 5_000 }).catch(() => undefined);
const sent = stops[0] ?? null;
record(sent !== null && sent.id === '91' && String(sent.workspaceId) === String(WORKSPACE),
  `Stop sends the stop for that request (${JSON.stringify(sent)})`);
const said = (await page.getByTestId('editor-stopped').innerText().catch(() => '')).trim();
const kept = await page.getByTestId('editor-failed-picture').isVisible().catch(() => false);
const keptBox = await page.getByTestId('editor-failed-picture').boundingBox().catch(() => null);
const noFailure = (await page.getByTestId('editor-failed').count()) === 0;
const noWait = (await page.getByTestId('editor-drawing').count()) === 0 && (await page.getByTestId('editor-stop').count()) === 0;
record(said === 'Stopped' && kept && keptBox !== null && keptBox.width > 50 && noFailure && noWait,
  `the editor then says Stopped, not a failure, with the picture kept (${JSON.stringify({ said, kept, keptBox, noFailure, noWait })})`);

// The gallery: a card being drawn is stopped from the card, and goes.
await page.goto(`${BASE}/workspace/${WORKSPACE}/design/images`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('queued-stop').waitFor({ timeout: 15_000 }).catch(() => undefined);
const cardStop = await page.getByTestId('queued-stop').isVisible().catch(() => false);
await page.getByTestId('queued-stop').click().catch(() => undefined);
await page.waitForTimeout(800);
const cardSent = stops[1] ?? null;
const cardGone = (await page.getByTestId('queued-stop').count()) === 0;
record(cardStop && cardSent !== null && cardSent.id === '92' && cardGone,
  `a gallery card being drawn has Stop, which stops it (${JSON.stringify({ cardStop, cardSent, cardGone })})`);

// Admin Settings: the working size Harmonize redraws at, beside its strength.
await page.goto(`${BASE}/admin/settings`, { waitUntil: 'domcontentloaded' });
await page.locator('#image-harmonize-size').waitFor({ timeout: 15_000 }).catch(() => undefined);
const size = await page.locator('#image-harmonize-size').inputValue().catch(() => null);
// Next to it: the field after the strength's, with nothing between (positions move while the page's sections load).
const next = await page.evaluate(() => {
  const fields = [...document.querySelectorAll('input, [data-select], textarea')];
  const strength = fields.findIndex((one) => one.id === 'image-harmonize-strength');
  return strength >= 0 && fields[strength + 1]?.id === 'image-harmonize-size';
}).catch(() => false);
record(size !== null && Number(size) >= 256 && Number(size) <= 4096 && next,
  `Admin Settings offers the Harmonize working size, next to its strength (${JSON.stringify({ size, next })})`);

await finish(browser);
