/**
 * A change that fails leaves the picture in view, with why over it - and the
 * picture's size, which is the one clue when a model on a local server ran out
 * of memory and answered "no results".
 *
 * The picture, the models and the queue are answered here, as in
 * design-magic-edit-check; the edit is answered as failed.
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
      id: body.variables?.id, status: 'FAILED', prompt: 'a red barn', modelId: '9292', model: 'Editor', size: null, quality: null, style: null,
      requestedBy: 'alice', requestedAt: new Date().toISOString(), startedAt: null, reason: '500: "generate_image returned no results"', ahead: null, name: 'Grey field',
      sourceId: PICTURE.id, image: null,
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
const ask = page.getByTestId('magic-ask');
await ask.waitFor({ timeout: 3_000 }).catch(() => undefined);
await ask.getByTestId('magic-model').selectOption('9292');
await ask.getByTestId('magic-prompt').fill('a red barn');
await ask.getByTestId('magic-change').click();
await page.waitForTimeout(600);
drawnNow = true;
await page.getByTestId('editor-failed').waitFor({ timeout: 15_000 }).catch(() => undefined);
const said = await page.getByTestId('editor-failed').innerText().catch(() => '');
record(/no results/.test(said), `the failure is said (${JSON.stringify(said)})`);
record(/400×300/.test(said), 'with the size of the picture it was asked of');
const shown = await page.getByTestId('editor-failed-picture').boundingBox().catch(() => null);
record(shown !== null && shown.width > 100, `and the picture stays in view under it (${JSON.stringify(shown)})`);

await finish(browser);
