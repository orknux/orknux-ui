/**
 * A picture being upscaled can be stopped.
 *
 * Stop was there for an upscale as for a Harmonize, under the picture being
 * changed - but a picture large enough to be worth upscaling filled the
 * canvas, and the wait with its Stop was pushed below it, under the strip of
 * what was asked for, where it could be neither seen nor clicked. So the wait
 * is asked to be in view and to be what a click at Stop lands on, for a
 * square picture and a tall one, and Stop then stops that upscale.
 *
 * The picture, the models, the algorithms, the job and the stop are answered
 * here, so the check needs no upscale server of the installation's.
 */
import { BASE, WORKSPACE, open, record, finish, openPictureMenu } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 900 } });

const PICTURE = {
  id: 'DESIGN-871', kind: 'DESIGN', source: 'Design', sourcePath: 'design/images/DESIGN-871', prompt: 'zz upscale stop: a grey field',
  filename: 'grey.png', contentType: 'image/png', sizeBytes: 1, url: '', previewUrl: null, drawnAt: new Date().toISOString(),
  name: 'Grey field', versionOf: null, draft: null,
  drawnWith: { modelId: '9191', model: 'Drawer', size: null, quality: null, style: null, drawnBy: 'alice' },
};
const model = (id, name, kind) => ({
  id, providerId: '1', workspaceId: WORKSPACE, providerName: 'Stub', name, modelId: name, kind, enabled: true,
  contextWindow: null, maxOutput: null, parallelToolCalls: null,
});
const MODELS = [model('9191', 'Drawer', 'IMAGE'), model('9393', 'Forge', 'UPSCALE')];
const pictureOf = (width, height) => page.evaluate(([w, h]) => {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const pen = canvas.getContext('2d');
  pen.fillStyle = '#888';
  pen.fillRect(0, 0, w, h);
  return canvas.toDataURL('image/png');
}, [width, height]);

let status = 'DRAWING';
const stops = [];
const job = (now) => ({
  id: '871', status: now, prompt: PICTURE.prompt, modelId: '9393', model: 'Forge', size: null, quality: null, style: null,
  requestedBy: 'alice', requestedAt: new Date().toISOString(), startedAt: new Date().toISOString(), reason: null, ahead: 0,
  name: PICTURE.name, sourceId: PICTURE.id, upscaler: 'Lanczos', scale: 2, strength: null, checkpoint: null, image: null,
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
  if (query.includes('stopDesignImageJob')) {
    stops.push(body.variables ?? {});
    status = 'STOPPED';
    return route.fulfill({ json: { data: { stopDesignImageJob: job('STOPPED') } } });
  }
  if (query.includes('designImageJob(')) return route.fulfill({ json: { data: { designImageJob: job(status) } } });
  return route.continue();
});

/** Upscales the picture and answers where Stop is, and whether a click there lands on it. */
async function upscaleAndFindStop() {
  status = 'DRAWING';
  await page.goto(`${BASE}/workspace/${WORKSPACE}/design/images/${PICTURE.id}/edit`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('editor-picture').waitFor({ timeout: 20_000 }).catch(() => undefined);
  await page.waitForTimeout(800);
  await openPictureMenu(page);
  await page.getByTestId('editor-upscale').click().catch(() => undefined);
  await page.getByTestId('upscale-dialog').waitFor({ timeout: 3_000 }).catch(() => undefined);
  await page.waitForTimeout(500);
  await page.getByTestId('upscale-submit').click().catch(() => undefined);
  await page.getByTestId('editor-stop').waitFor({ state: 'attached', timeout: 5_000 }).catch(() => undefined);
  await page.waitForTimeout(800);
  return page.evaluate(() => {
    const stop = document.querySelector('[data-testid="editor-stop"]');
    const stage = document.querySelector('[data-testid="editor-changing"]')?.closest('[class*="stage"]');
    if (!stop || !stage) return null;
    const at = stop.getBoundingClientRect();
    const room = stage.getBoundingClientRect();
    const hit = document.elementFromPoint(at.left + at.width / 2, at.top + at.height / 2);
    return {
      stop: { top: at.top, bottom: at.bottom },
      stage: { top: room.top, bottom: room.bottom },
      inView: at.top >= room.top && at.bottom <= room.bottom,
      landsOnStop: hit === stop || stop.contains(hit),
    };
  });
}

for (const [width, height] of [[1600, 1600], [1000, 2000]]) {
  PICTURE.url = await pictureOf(width, height);
  const found = await upscaleAndFindStop();
  record(found !== null && found.inView && found.landsOnStop,
    `upscaling a ${width}×${height} picture, Stop is in view and a click there lands on it (${JSON.stringify(found)})`);
}

// And Stop stops that upscale.
await page.getByTestId('editor-stop').click({ timeout: 3_000 }).catch(() => undefined);
await page.getByTestId('editor-stopped').waitFor({ timeout: 5_000 }).catch(() => undefined);
const sent = stops[0] ?? null;
const said = (await page.getByTestId('editor-stopped').innerText().catch(() => '')).trim();
record(sent !== null && sent.id === '871' && said === 'Stopped',
  `Stop sends the stop for the upscale, and the editor says Stopped (${JSON.stringify({ sent, said })})`);

await finish(browser);
