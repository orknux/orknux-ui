/**
 * Design's Videos page, issue #658: the page lists the workspace's videos with
 * their poster, prompt, model, length and state; "Convert to video" on a
 * picture opens the video editor near-full-screen with that picture set to
 * start from - and is not offered where no video model takes one; a video
 * generated there shows how far it has got, then plays, and is still there
 * after a reload.
 *
 * The videos, the model's settings and the pictures are answered here. The
 * file that plays is a real WebM, recorded in the page from a canvas, so
 * "plays" is a decoded frame and a moving clock rather than an element present.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const VIEWPORT = { width: 1440, height: 900 };
const { browser, page } = await open({ viewport: VIEWPORT });

const MODEL = {
  id: '9393', providerId: '1', workspaceId: WORKSPACE, providerName: 'Stub', name: 'Wan', modelId: 'wan', kind: 'VIDEO',
  contextWindow: null, maxOutput: null, parallelToolCalls: null, enabled: true,
};
const PICTURE = {
  id: 'DESIGN-901', kind: 'DESIGN', source: 'Design', sourcePath: 'design/images/DESIGN-901', prompt: 'a lighthouse at dusk',
  filename: 'lighthouse.png', contentType: 'image/png', sizeBytes: 1, url: '', previewUrl: null, drawnAt: new Date().toISOString(),
  name: 'Lighthouse', versionOf: null, draft: null, draftUrl: null,
  drawnWith: { modelId: null, model: 'Drawer', size: null, quality: null, style: null, drawnBy: 'alice' },
};
const SETTINGS = [
  { name: 'frames', kind: 'NUMBER', choices: [], least: '1', most: '1024', preset: '33' },
  { name: 'fps', kind: 'NUMBER', choices: [], least: '1', most: '120', preset: '16' },
  { name: 'width', kind: 'NUMBER', choices: [], least: '64', most: '2048', preset: '832' },
  { name: 'height', kind: 'NUMBER', choices: [], least: '64', most: '2048', preset: '480' },
  { name: 'seed', kind: 'NUMBER', choices: [], least: '-1', most: '9223372036854775807', preset: '-1' },
  { name: 'startImage', kind: 'PICTURE', choices: [], least: null, most: null, preset: null },
];

const video = (overrides) => ({
  id: 'v1', status: 'DONE', name: 'A boat', prompt: 'a paper boat on a pond', modelId: MODEL.id, model: 'Wan', seconds: null, size: null,
  frames: 33, fps: 16, width: 832, height: 480, seed: null, startImageId: null, startImageUrl: null, requestedBy: 'alice',
  requestedAt: new Date().toISOString(), startedAt: null, finishedAt: null, reason: null, progress: 100, ahead: null,
  url: '/api/design-videos/v1', posterUrl: null, contentType: 'video/webm', sizeBytes: 1, durationSeconds: 2.06, ...overrides,
});

/** Whether the model takes a picture to start from; turned off for the half that says the button is not offered. */
let takesStart = true;
/** What Generate asked for. */
const queued = [];
// The video is made once the check has seen it under way, not after a count of reads a slow page may run past.
let release = false;

// A real WebM, recorded from a canvas in the page: what a <video> must decode and play.
await page.goto(`${BASE}/workspace/${WORKSPACE}/design/videos`, { waitUntil: 'domcontentloaded' });
const webm = Buffer.from(
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 120;
    const pen = canvas.getContext('2d');
    const recorder = new MediaRecorder(canvas.captureStream(25), { mimeType: 'video/webm;codecs=vp8' });
    const parts = [];
    recorder.ondataavailable = (event) => parts.push(event.data);
    const stopped = new Promise((resolve) => (recorder.onstop = resolve));
    recorder.start();
    const began = performance.now();
    await new Promise((resolve) => {
      const frame = () => {
        const t = performance.now() - began;
        pen.fillStyle = `hsl(${(t / 5) % 360}, 70%, 50%)`;
        pen.fillRect(0, 0, 160, 120);
        if (t < 2000) requestAnimationFrame(frame);
        else resolve();
      };
      frame();
    });
    recorder.stop();
    await stopped;
    const bytes = new Uint8Array(await new Blob(parts, { type: 'video/webm' }).arrayBuffer());
    let text = '';
    for (const byte of bytes) text += String.fromCharCode(byte);
    return btoa(text);
  }),
  'base64',
);
record(webm.length > 1000, `a WebM was recorded to serve (${webm.length} bytes)`);

// A picture, drawn by the page, to start from.
PICTURE.url = await page.evaluate(() => {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 200;
  const pen = canvas.getContext('2d');
  pen.fillStyle = '#346';
  pen.fillRect(0, 0, 320, 200);
  return canvas.toDataURL('image/png');
});

await page.route('**/api/design-videos/**', (route) =>
  route.fulfill({ status: 200, contentType: 'video/webm', body: webm, headers: { 'Accept-Ranges': 'none' } }),
);
await page.route('**/graphql', async (route) => {
  const body = route.request().postDataJSON() ?? {};
  const query = body.query ?? '';
  if (query.includes('designVideoSettings')) {
    return route.fulfill({
      json: { data: { designVideoSettings: { reason: null, settings: takesStart ? SETTINGS : SETTINGS.filter((one) => one.name !== 'startImage') } } },
    });
  }
  if (query.includes('queueDesignVideo')) {
    queued.push(body.variables?.input);
    return route.fulfill({ json: { data: { queueDesignVideo: video({ id: '77', status: 'QUEUED', progress: null, url: null, durationSeconds: null }) } } });
  }
  if (query.includes('designVideos(')) {
    return route.fulfill({
      json: { data: { designVideos: [
        video({ id: 'v2', status: 'GENERATING', name: 'A kite', prompt: 'a red kite over hills', progress: 40, url: null, durationSeconds: null }),
        video({}),
      ] } },
    });
  }
  if (query.includes('designVideo(')) {
    const id = body.variables?.id;
    if (id !== '77') return route.fulfill({ json: { data: { designVideo: video({ id }) } } });
    const made = release;
    return route.fulfill({
      json: { data: { designVideo: video({
        id: '77', name: 'A lighthouse at dusk', prompt: 'a lighthouse at dusk, waves', startImageId: PICTURE.id, startImageUrl: PICTURE.url,
        status: made ? 'DONE' : 'GENERATING', progress: made ? 100 : 50, url: made ? '/api/design-videos/77' : null,
        durationSeconds: made ? 2 : null,
      }) } },
    });
  }
  if (query.includes('workspaceArtifact(')) return route.fulfill({ json: { data: { workspaceArtifact: PICTURE } } });
  if (query.includes('workspaceArtifacts(')) {
    return route.fulfill({ json: { data: { workspaceArtifacts: { content: [PICTURE], page: 0, size: 48, totalElements: 1, totalPages: 1 } } } });
  }
  if (query.includes('designImageQueue')) return route.fulfill({ json: { data: { designImageQueue: [] } } });
  if (query.includes('Models(') || query.includes('models(')) {
    const answered = await route.fetch().catch(() => null);
    const json = answered === null ? null : await answered.json().catch(() => null);
    const list = json?.data?.models;
    if (Array.isArray(list)) {
      list.push(MODEL);
      return route.fulfill({ json });
    }
    return route.fulfill({ json: { data: { models: [MODEL] } } });
  }
  return route.continue();
});

// -- The page lists -----------------------------------------------------------

await page.goto(`${BASE}/workspace/${WORKSPACE}/design/videos`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('video-card').first().waitFor({ timeout: 20_000 }).catch(() => undefined);
const cards = await page.getByTestId('video-card').count();
record(cards === 2, `the page lists the workspace's videos (${cards})`);
const made = page.locator('[data-video-status="DONE"]');
const facts = {
  prompt: await made.getByTestId('video-prompt').innerText().catch(() => ''),
  model: await made.getByTestId('video-model').innerText().catch(() => ''),
  duration: await made.getByTestId('video-duration').innerText().catch(() => ''),
  status: await made.getByTestId('video-status').innerText().catch(() => ''),
};
record(
  facts.prompt === 'a paper boat on a pond' && facts.model === 'Wan' && facts.duration === '0:02' && facts.status.length > 0,
  `a made video's card says its prompt, model, length and state (${JSON.stringify(facts)})`,
);
// The poster: the file's own first frame, decoded - not an element that never drew.
const poster = await made
  .getByTestId('video-poster')
  .evaluate(async (element) => {
    for (let i = 0; i < 50 && element.readyState < 2; i += 1) await new Promise((resolve) => setTimeout(resolve, 100));
    return { readyState: element.readyState, width: element.videoWidth };
  })
  .catch(() => null);
record(poster !== null && poster.readyState >= 2 && poster.width > 0, `its poster frame is drawn (${JSON.stringify(poster)})`);
const making = await page.locator('[data-video-status="GENERATING"]').getByTestId('video-status').innerText().catch(() => '');
record(/40%/.test(making), `one on its way says how far it has got (${making})`);

// -- Convert to video, from a picture ----------------------------------------------

await page.goto(`${BASE}/workspace/${WORKSPACE}/design/images/${PICTURE.id}`, { waitUntil: 'domcontentloaded' });
const convert = page.getByTestId('design-image-to-video');
await convert.waitFor({ timeout: 20_000 }).catch(() => undefined);
record((await convert.count()) === 1, 'a picture offers Convert to video where a video model starts from one');
await convert.click().catch(() => undefined);
await page.getByTestId('video-panel').waitFor({ timeout: 20_000 }).catch(() => undefined);
const address = new URL(page.url());
record(
  address.pathname === `/workspace/${WORKSPACE}/design/videos/new` && address.searchParams.get('from') === PICTURE.id,
  `and opens the video editor with the picture in the address (${address.pathname}${address.search})`,
);
const start = page.getByTestId('video-start');
await start.waitFor({ timeout: 10_000 }).catch(() => undefined);
record((await start.getAttribute('src').catch(() => null)) === PICTURE.url, 'with the picture set to start from');

// Near-full-screen, as the image editor is: no sidebar, the canvas and panel filling the window.
const canvasBox = await page.getByTestId('video-canvas').boundingBox().catch(() => null);
const panelBox = await page.getByTestId('video-panel').boundingBox().catch(() => null);
const spanned = canvasBox !== null && panelBox !== null ? panelBox.x + panelBox.width - canvasBox.x : 0;
const tall = canvasBox?.height ?? 0;
record(
  canvasBox !== null && canvasBox.x < 4 && spanned >= VIEWPORT.width * 0.98 && tall >= VIEWPORT.height * 0.75,
  `the editor fills the window (${JSON.stringify({ canvasBox, panelBox, spanned, tall })})`,
);

// A reload keeps the picture: it is in the address, not only in the page.
await page.reload({ waitUntil: 'domcontentloaded' });
await page.getByTestId('video-start').waitFor({ timeout: 15_000 }).catch(() => undefined);
record((await page.getByTestId('video-start').count()) === 1, 'and a reload keeps it');

// Only what the model takes is drawn: no seconds or size box for a model that takes frames and a size in pixels.
record(
  (await page.getByTestId('video-seconds').count()) === 0 && (await page.getByTestId('video-frames').count()) === 1,
  'only the settings the model takes are offered',
);

// -- Generate, follow, play ------------------------------------------------------------

await page.getByTestId('video-prompt').fill('a lighthouse at dusk, waves');
await page.getByTestId('video-frames').fill('33');
await page.getByTestId('video-generate').click();
await page.waitForURL(/\/design\/videos\/77$/, { timeout: 10_000 }).catch(() => undefined);
const input = queued[0] ?? {};
record(
  input.startImageId === PICTURE.id && input.frames === 33 && input.seconds === null && input.prompt === 'a lighthouse at dusk, waves',
  `Generate asks with the prompt, the picture and only taken settings (${JSON.stringify(input)})`,
);
record(page.url().endsWith('/design/videos/77'), `and the address moves to the video (${page.url()})`);
const progress = page.getByTestId('video-progress');
await progress.waitFor({ timeout: 10_000 }).catch(() => undefined);
record((await progress.getAttribute('aria-valuenow').catch(() => null)) === '50', 'how far it has got is shown while it is made');
release = true;

const player = page.getByTestId('video-player');
await player.waitFor({ timeout: 20_000 }).catch(() => undefined);
const played = await player
  .evaluate(async (element) => {
    element.muted = true;
    await element.play().catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 900));
    return { tag: element.tagName, readyState: element.readyState, width: element.videoWidth, time: element.currentTime, controls: element.controls };
  })
  .catch(() => null);
record(
  played !== null && played.tag === 'VIDEO' && played.width > 0 && played.time > 0.2 && played.controls,
  `the video made plays in the editor (${JSON.stringify(played)})`,
);
record((await page.getByTestId('video-download').getAttribute('href').catch(() => null)) === '/api/design-videos/77', 'and offers a download');

await page.reload({ waitUntil: 'domcontentloaded' });
await page.getByTestId('video-player').waitFor({ timeout: 15_000 }).catch(() => undefined);
record((await page.getByTestId('video-player').count()) === 1, 'a reload finds the video where it was');

// -- Offered on every picture: where no model starts from one, the video editor is where that is said --

takesStart = false;
await page.goto(`${BASE}/workspace/${WORKSPACE}/design/images/${PICTURE.id}`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('design-image-edit').waitFor({ timeout: 20_000 }).catch(() => undefined);
await page.waitForTimeout(1500);
const offered = page.getByTestId('design-image-to-video');
record((await offered.count()) === 1, 'Convert to video is on a picture even where no video model starts from one');
await offered.click().catch(() => undefined);
await page.waitForURL(/\/design\/videos\/new/, { timeout: 10_000 }).catch(() => undefined);
record(page.url().includes('/design/videos/new'), `and it opens the video editor (${page.url()})`);

await finish(browser);
