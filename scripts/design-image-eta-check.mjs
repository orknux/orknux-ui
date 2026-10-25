/**
 * A picture being drawn says how long it has taken, and how long is left where
 * anything knows.
 *
 * The image editor's wait said "Drawing…" and Stop, and nothing of how long:
 * a Harmonize on a CPU takes minutes and the page gave no sense of whether it
 * was nearly done. It now says, on the wait's own line before Stop, the time
 * taken - counting up while it draws - and a time left from one of two sources,
 * said differently: a Stable Diffusion WebUI's own reckoning is "about N s
 * left", and the time the same model's pictures of the kind usually take, less
 * the time taken, is "estimated N s left". With neither, or once an estimate
 * has run out, it says only the time taken rather than a number nobody has.
 *
 * The picture, the models and the job's progress are answered here, so the
 * check needs no image server of the installation's.
 */
import { BASE, WORKSPACE, open, record, finish, openPictureMenu } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 1000 } });

const PICTURE = {
  id: 'DESIGN-971', kind: 'DESIGN', source: 'Design', sourcePath: 'design/images/DESIGN-971', prompt: 'zz eta: a grey field at dusk',
  filename: 'grey.png', contentType: 'image/png', sizeBytes: 1, url: '', previewUrl: null, drawnAt: new Date().toISOString(),
  name: 'Grey field', versionOf: null, draft: null,
  drawnWith: { modelId: '9797', model: 'Painter', size: null, quality: null, style: null, drawnBy: 'alice' },
};
const model = (id, name, kind, providerName = 'Stub') => ({
  id, providerId: '1', workspaceId: WORKSPACE, providerName, name, modelId: name, kind, enabled: true,
  contextWindow: null, maxOutput: null, parallelToolCalls: null,
});
const MODELS = [model('9797', 'Painter', 'IMAGE'), model('9898', 'Lanczos', 'UPSCALE', 'Forge')];

PICTURE.url = await page.evaluate(() => {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 100;
  const pen = canvas.getContext('2d');
  pen.fillStyle = '#888';
  pen.fillRect(0, 0, 200, 100);
  return canvas.toDataURL('image/png');
});

/**
 * What the server says of the wait now: when it started, and what is known of
 * the time left. `drawing` takes how many seconds ago it started and fixes that
 * moment, so it stays put across the page's asks as a real start does.
 */
let wait = { status: 'QUEUED', startedAt: null, progress: null, secondsLeft: null, typicalSeconds: null };
const drawing = (startedAgo, progress, secondsLeft, typicalSeconds) =>
  ({ status: 'DRAWING', startedAt: Date.now() - startedAgo * 1000, progress, secondsLeft, typicalSeconds });

const jobNow = () => ({
  id: '97', status: wait.status, prompt: 'a grey field at dusk', modelId: '9898', model: 'Lanczos', size: null, quality: null, style: null,
  requestedBy: 'alice', requestedAt: new Date().toISOString(),
  startedAt: wait.startedAt === null ? null : new Date(wait.startedAt).toISOString(),
  reason: null, ahead: wait.status === 'QUEUED' ? 1 : null, name: PICTURE.name, sourceId: PICTURE.id, upscaler: null, scale: null,
  strength: 0.3, checkpoint: null, image: null,
  progress: wait.progress, secondsLeft: wait.secondsLeft, typicalSeconds: wait.typicalSeconds, asOf: new Date().toISOString(),
});

await page.route('**/graphql', async (route) => {
  const body = route.request().postDataJSON() ?? {};
  const query = body.query ?? '';
  if (query.includes('workspaceArtifact(')) return route.fulfill({ json: { data: { workspaceArtifact: PICTURE } } });
  if (query.includes('workspaceModels') || query.includes('models(')) {
    const answered = await route.fetch().catch(() => null);
    const json = answered === null ? null : await answered.json().catch(() => null);
    const list = Object.values(json?.data ?? {}).find(Array.isArray);
    if (Array.isArray(list)) {
      list.splice(0, list.length, ...list.filter((one) => one.kind !== 'UPSCALE' && one.kind !== 'IMAGE'), ...MODELS);
      return route.fulfill({ json });
    }
    // The workspace's own list could not be had: these two are the whole of it.
    if (query.includes('models(')) return route.fulfill({ json: { data: { models: MODELS } } });
    return json === null ? route.continue() : route.fulfill({ json });
  }
  if (query.includes('imageModelParameters')) return route.fulfill({ json: { data: { imageModelParameters: [] } } });
  if (query.includes('designHarmonizeOptions')) {
    return route.fulfill({ json: { data: { designHarmonizeOptions: {
      strengthTaken: true, strength: 0.3, checkpoints: [], preferredCheckpoint: null, reason: null,
    } } } });
  }
  if (query.includes('queueDesignImageHarmonize')) return route.fulfill({ json: { data: { queueDesignImageHarmonize: jobNow() } } });
  if (query.includes('designImageJob(')) return route.fulfill({ json: { data: { designImageJob: jobNow() } } });
  if (query.includes('designImageHistory')) return route.fulfill({ json: { data: { designImageHistory: [] } } });
  return route.continue();
});

/** The time line's words, and where it sits against the wait's word and Stop. */
const measure = () => page.evaluate(() => {
  const time = document.querySelector('[data-testid="editor-drawing-time"]');
  const status = document.querySelector('[data-testid="editor-drawing"] [role="status"]');
  const stop = document.querySelector('[data-testid="editor-stop"]');
  if (!time || !status || !stop) return { text: time?.textContent?.trim() ?? null, placed: false };
  const of = (element) => element.getBoundingClientRect();
  const [t, w, s] = [of(time), of(status), of(stop)];
  const middle = (rect) => (rect.top + rect.bottom) / 2;
  return {
    text: time.textContent.trim(),
    placed: w.right <= t.left && t.right <= s.left && Math.abs(middle(t) - middle(s)) <= 3 && t.height < 2 * 24,
  };
});

/** Waits until the time line says what `wanted` matches, and answers what it said. */
const saying = async (wanted) => {
  await page.waitForFunction(
    (source) => new RegExp(source).test(document.querySelector('[data-testid="editor-drawing-time"]')?.textContent ?? ''),
    wanted.source,
    { timeout: 6_000 },
  ).catch(() => undefined);
  return measure();
};

// Harmonize the picture: queued first, with no time to tell of yet.
await page.goto(`${BASE}/workspace/${WORKSPACE}/design/images/${PICTURE.id}/edit`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('editor-picture').waitFor({ timeout: 20_000 }).catch(() => undefined);
await page.waitForTimeout(800);
await openPictureMenu(page);
await page.getByTestId('editor-harmonize').click().catch(() => undefined);
await page.getByTestId('harmonize-dialog').waitFor({ timeout: 3_000 }).catch(() => undefined);
await page.waitForTimeout(400);
await page.getByTestId('harmonize-submit').click().catch(() => undefined);
await page.getByTestId('editor-drawing').waitFor({ timeout: 5_000 }).catch(() => undefined);
await page.waitForTimeout(500);
const queued = (await page.getByTestId('editor-drawing-time').count()) === 0;
record(queued, `a picture still queued says no time (${JSON.stringify({ queued })})`);

// Drawn by a WebUI that says forty percent, thirty seconds left: its own reckoning is "about".
wait = drawing(42, 40, 30, 600);
const webUi = await saying(/elapsed · about \d+ s left/);
record(
  /^0:4\d elapsed · about (25|30) s left$/.test(webUi.text ?? '') && webUi.placed,
  `a WebUI's own time left is "about", after the time taken, on the wait's line before Stop (${JSON.stringify(webUi)})`,
);

// The time taken counts up between reads.
const first = Number((webUi.text ?? '').match(/^0:(\d\d)/)?.[1] ?? NaN);
await page.waitForTimeout(2_200);
const later = await measure();
const second = Number((later.text ?? '').match(/^0:(\d\d)/)?.[1] ?? NaN);
record(second >= first + 2, `the time taken counts up while it draws (${JSON.stringify({ first, second, text: later.text })})`);

// A server that says nothing, and a model whose pictures of this kind usually take a minute: "estimated".
wait = drawing(20, null, null, 60);
const usual = await saying(/elapsed · estimated \d+ s left/);
record(
  /^0:2\d elapsed · estimated (35|40) s left$/.test(usual.text ?? '') && !/about/.test(usual.text ?? '') && usual.placed,
  `a time left from the model's usual time is said to be estimated, never "about" (${JSON.stringify(usual)})`,
);

// Run past what it usually takes: no number nobody has, only the time taken.
wait = drawing(75, null, null, 60);
const past = await saying(/^1:1\d elapsed$/);
record(/^1:1\d elapsed$/.test(past.text ?? ''), `an estimate that has run out says only the time taken (${JSON.stringify(past)})`);

// Nothing known at all - no progress, too few timed pictures: only the time taken.
wait = drawing(5, null, null, null);
const nothing = await saying(/^0:0\d elapsed$/);
record(/^0:0\d elapsed$/.test(nothing.text ?? ''), `with nothing to go on it says only the time taken (${JSON.stringify(nothing)})`);

await finish(browser);
