/**
 * The image editor's own tools - the ones that change the picture without a
 * model - measured on what they draw.
 *
 * Each is worked out in the browser and kept as a version through
 * keepDesignImageChange, so the check answers that mutation itself, keeps the
 * picture it was handed, and serves it back as the version: what is then on
 * the canvas is exactly what the tool made. It is read back pixel by pixel.
 *
 * The picture is 60 by 40, red on its left half and blue on its right, so a
 * turn shows in its sides and a mirror in which colour is where.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 900 } });

const picture = (id, url, versionOf) => ({
  id, kind: 'DESIGN', source: 'Design', sourcePath: `design/images/${id}`, prompt: 'zz tools: two halves', filename: 'halves.png',
  contentType: 'image/png', sizeBytes: 1, url, previewUrl: null, drawnAt: new Date().toISOString(), name: 'Halves',
  versionOf, draft: null, draftUrl: null,
  drawnWith: { modelId: null, model: 'Imported', size: null, quality: null, style: null, drawnBy: 'alice' },
});

const HALVES = await page.evaluate(() => {
  const canvas = document.createElement('canvas');
  canvas.width = 60;
  canvas.height = 40;
  const pen = canvas.getContext('2d');
  pen.fillStyle = '#ff0000';
  pen.fillRect(0, 0, 30, 40);
  pen.fillStyle = '#0000ff';
  pen.fillRect(30, 0, 30, 40);
  return canvas.toDataURL('image/png');
});
const ORIGINAL = picture('DESIGN-701', HALVES, null);
/** Another picture in Orknux, an agent's, for Import from Orknux; and a document beside it, which is no picture. */
const OTHER = { ...picture('SAVED-77', HALVES, null), kind: 'SAVED', name: null, prompt: 'zz tools: an agent kept this' };
const DOCUMENT = { ...picture('SAVED-78', '/api/artifacts/78', null), kind: 'SAVED', contentType: 'application/pdf', filename: 'notes.pdf' };
/** The installation's numbers for the tools, answered here so what the page starts at is known. */
const SETTINGS = { brush: 4, brushMost: 50, blur: 6, blurMost: 60, feather: 5, featherMost: 64 };
/** What each Magic edit was asked with. */
const edits = [];
/** What each keepDesignImageChange was asked to keep, in order. */
const kept = [];
let next = 702;

await page.route('**/graphql', async (route) => {
  const body = route.request().postDataJSON() ?? {};
  const query = body.query ?? '';
  if (query.includes('workspaceArtifact(')) {
    const one = [ORIGINAL, OTHER].find((held) => held.id === body.variables?.id) ?? null;
    return route.fulfill({ json: { data: { workspaceArtifact: one } } });
  }
  if (query.includes('workspaceArtifacts(')) {
    const content = [ORIGINAL, OTHER, DOCUMENT];
    return route.fulfill({ json: { data: { workspaceArtifacts: { content, page: 0, size: content.length, totalElements: content.length, totalPages: 1 } } } });
  }
  if (query.includes('designImageHistory')) return route.fulfill({ json: { data: { designImageHistory: [] } } });
  if (query.includes('imageModelParameters')) return route.fulfill({ json: { data: { imageModelParameters: [] } } });
  if (query.includes('workspaceModels') || query.includes('models(')) {
    // One image model to ask a Magic edit of, beside whatever the installation has.
    const answered = await route.fetch().catch(() => null);
    const json = answered === null ? null : await answered.json().catch(() => null);
    const list = Object.values(json?.data ?? {}).find(Array.isArray);
    if (Array.isArray(list)) {
      list.unshift({
        id: '9191', providerId: '1', workspaceId: WORKSPACE, providerName: 'Stub', name: 'Drawer', modelId: 'drawer', kind: 'IMAGE',
        enabled: true, contextWindow: null, maxOutput: null, parallelToolCalls: null,
      });
    }
    return json === null ? route.continue() : route.fulfill({ json });
  }
  if (query.includes('queueDesignImageEdit')) {
    const input = body.variables?.input;
    edits.push(input);
    return route.fulfill({
      json: {
        data: {
          queueDesignImageEdit: {
            id: '9901', status: 'QUEUED', prompt: input.prompt, modelId: input.modelId, model: 'Drawer', size: null, quality: null, style: null,
            negativePrompt: null, requestedBy: 'alice', requestedAt: new Date().toISOString(), startedAt: null, reason: null, ahead: 0,
            name: 'Halves', sourceId: input.imageId, upscaler: null, scale: null, image: null,
          },
        },
      },
    });
  }
  if (query.includes('designImageEditorSettings')) {
    return route.fulfill({ json: { data: { designImageEditorSettings: SETTINGS } } });
  }
  if (query.includes('keepDesignImageChange')) {
    const input = body.variables?.input;
    kept.push(input);
    const id = String(next++);
    const version = picture(`DESIGN-${id}`, input.image, ORIGINAL.id);
    return route.fulfill({
      json: {
        data: {
          keepDesignImageChange: {
            id, status: 'DRAWN', prompt: input.change, modelId: null, model: 'Image editor', size: null, quality: null, style: null,
            negativePrompt: null, requestedBy: 'alice', requestedAt: new Date().toISOString(), startedAt: null, reason: null, ahead: null,
            name: 'Halves', sourceId: input.imageId, upscaler: null, scale: null, image: version,
          },
        },
      },
    });
  }
  return route.continue();
});

/** The picture on the canvas, read back: its own size, and the colour at points given as shares of it. */
const shown = (points) => page.evaluate(async (at) => {
  const image = document.querySelector('[data-testid="editor-picture"]');
  if (image === null) return null;
  if (!image.complete) await new Promise((done) => image.addEventListener('load', done, { once: true }));
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const pen = canvas.getContext('2d');
  pen.drawImage(image, 0, 0);
  const colour = ([x, y]) => {
    const [r, g, b] = pen.getImageData(Math.floor(x * (canvas.width - 1)), Math.floor(y * (canvas.height - 1)), 1, 1).data;
    return r > 200 && g < 60 && b < 60 ? 'red' : b > 200 && r < 60 && g < 60 ? 'blue' : `rgb(${r},${g},${b})`;
  };
  return { width: canvas.width, height: canvas.height, colours: at.map(colour) };
}, points);

/** Waits for the canvas to show the version kept last. */
const showsLastKept = async () => {
  const want = kept[kept.length - 1]?.image;
  await page.waitForFunction((src) => document.querySelector('[data-testid="editor-picture"]')?.getAttribute('src') === src, want, { timeout: 10_000 })
    .catch(() => undefined);
};

await page.goto(`${BASE}/workspace/${WORKSPACE}/design/images/${ORIGINAL.id}/edit`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('editor-picture').waitFor({ timeout: 20_000 }).catch(() => undefined);
const before = await shown([[0.1, 0.5], [0.9, 0.5]]);
record(before?.width === 60 && before?.height === 40 && before.colours.join() === 'red,blue',
  `the picture opens 60x40, red left and blue right (${JSON.stringify(before)})`);

// -- Rotate and mirror (#634) -------------------------------------------------

await page.getByTestId('editor-rotate-right').click();
await showsLastKept();
const right = await shown([[0.5, 0.1], [0.5, 0.9]]);
record(kept.length === 1 && kept[0].imageId === ORIGINAL.id && kept[0].change !== '' &&
  right?.width === 40 && right?.height === 60 && right.colours.join() === 'red,blue',
  `Rotate right keeps a version 40x60 with the left half turned to the top (${JSON.stringify({ right, change: kept[0]?.change })})`);
record(await page.getByTestId('editor-unsaved').isVisible().catch(() => false), 'the rotated picture is a draft, marked so');

await page.getByTestId('editor-rotate-left').click();
await showsLastKept();
const back = await shown([[0.1, 0.5], [0.9, 0.5]]);
record(kept.length === 2 && kept[1].imageId === 'DESIGN-702' && back?.width === 60 && back?.height === 40 && back.colours.join() === 'red,blue',
  `Rotate left turns it back, 60x40, red left again (${JSON.stringify(back)})`);

await page.getByTestId('editor-flip-horizontal').click();
await showsLastKept();
const flipped = await shown([[0.1, 0.5], [0.9, 0.5]]);
record(flipped?.width === 60 && flipped.colours.join() === 'blue,red', `Flip horizontally puts blue on the left (${JSON.stringify(flipped)})`);

await page.getByTestId('editor-rotate-right').click();
await showsLastKept();
await page.getByTestId('editor-flip-vertical').click();
await showsLastKept();
const upended = await shown([[0.5, 0.1], [0.5, 0.9]]);
// Flipped (blue left), turned right (blue on top), flipped vertically (blue at the foot).
record(upended?.width === 40 && upended?.height === 60 && upended.colours.join() === 'red,blue',
  `Flip vertically swaps top for bottom (${JSON.stringify(upended)})`);

// Undo walks back over the versions: the canvas shows the one before.
await page.getByTestId('editor-undo').click();
await page.waitForFunction((src) => document.querySelector('[data-testid="editor-picture"]')?.getAttribute('src') === src, kept[3].image, { timeout: 10_000 })
  .catch(() => undefined);
const undone = await shown([[0.5, 0.1], [0.5, 0.9]]);
record(undone?.colours.join() === 'blue,red', `Undo shows the picture before the vertical flip (${JSON.stringify(undone)})`);

/** Drags over the picture between two points given in its own pixels, as somebody selecting would. */
const drag = async (from, to, steps = 6) => {
  const box = await page.getByTestId('editor-picture').boundingBox();
  const size = await page.evaluate(() => {
    const image = document.querySelector('[data-testid="editor-picture"]');
    return { width: image.naturalWidth, height: image.naturalHeight };
  });
  const at = ([x, y]) => [box.x + (x / size.width) * box.width, box.y + (y / size.height) * box.height];
  await page.mouse.move(...at(from));
  await page.mouse.down();
  await page.mouse.move(...at(to), { steps });
  await page.mouse.up();
};

// -- Crop (#635) ---------------------------------------------------------------

// The picture shown is 40x60, blue over red: the middle of it is kept.
await page.getByTestId('editor-zoom-in').click();
await page.getByTestId('editor-zoom-in').click();
await page.getByTestId('editor-crop').click();
const cropBar = await page.getByTestId('crop-options').isVisible().catch(() => false);
await drag([5, 15], [35, 45]);
const said = (await page.getByTestId('crop-size').textContent().catch(() => '')) ?? '';
const keptBefore = kept.length;
await page.keyboard.press('Enter');
await showsLastKept();
const crop = await shown([[0.5, 0.1], [0.5, 0.9]]);
record(cropBar && kept.length === keptBefore + 1 && crop !== null && Math.abs(crop.width - 30) <= 1 && Math.abs(crop.height - 30) <= 1 &&
  said.replace(/\s/g, '') === `${crop.width}×${crop.height}` && crop.colours.join() === 'blue,red',
  `Crop keeps what was selected, the size its bar said, and Enter applies it (${JSON.stringify({ crop, said })})`);
record(!(await page.getByTestId('crop-options').isVisible().catch(() => false)), 'the crop tool is put down once it is applied');

// -- Brush (#637) ----------------------------------------------------------------

// The cropped picture, about 30x30, blue over red: a green stroke across its middle.
await page.getByTestId('editor-brush').click();
await page.getByTestId('brush-options').waitFor({ timeout: 3_000 }).catch(() => undefined);
const startsAt = await page.getByTestId('brush-size').inputValue().catch(() => '');
const brushMost = await page.getByTestId('brush-size').getAttribute('max').catch(() => '');
record(startsAt === '4' && brushMost === '50', `the brush starts at the installation's width, and goes no wider than its most (${JSON.stringify({ startsAt, brushMost })})`);
await page.getByTestId('brush-colour').fill('#00ff00');
const keptBeforeBrush = kept.length;
const middle = await page.evaluate(() => document.querySelector('[data-testid="editor-picture"]').naturalHeight / 2);
const across = await page.evaluate(() => document.querySelector('[data-testid="editor-picture"]').naturalWidth);
await drag([1, middle], [across - 1, middle], 10);
const painted = await page.locator('[data-testid="brush-layer"] path').count();
await page.getByTestId('editor-undo').click();
const undoneStroke = await page.locator('[data-testid="brush-layer"] path').count();
record(painted === 1 && undoneStroke === 0 && kept.length === keptBeforeBrush,
  `a stroke is drawn over the picture as it goes, and Undo takes it back before anything is kept (${JSON.stringify({ painted, undoneStroke })})`);
await drag([1, middle], [across - 1, middle], 10);
await page.getByTestId('brush-apply').click();
await showsLastKept();
const brushed = await shown([[0.5, 0.5], [0.5, 0.05], [0.5, 0.95]]);
record(kept.length === keptBeforeBrush + 1 && brushed?.colours[0] === 'rgb(0,255,0)' && brushed.colours[1] === 'blue' && brushed.colours[2] === 'red',
  `Apply keeps the painted picture: green where the stroke went, untouched elsewhere (${JSON.stringify(brushed)})`);

// -- Selective blur (#636) -------------------------------------------------------

// Blue over a green stripe over red: the left half of the stripe's lower edge is blurred, the right half is not.
await page.getByTestId('editor-blur').click();
await page.getByTestId('blur-options').waitFor({ timeout: 3_000 }).catch(() => undefined);
const blurStarts = await page.getByTestId('blur-radius').inputValue().catch(() => '');
const blurMost = await page.getByTestId('blur-radius').getAttribute('max').catch(() => '');
record(blurStarts === '6' && blurMost === '60', `the blur starts at the installation's radius, and goes no further than its most (${JSON.stringify({ blurStarts, blurMost })})`);
const size = await page.evaluate(() => {
  const image = document.querySelector('[data-testid="editor-picture"]');
  return { width: image.naturalWidth, height: image.naturalHeight };
});
const keptBeforeBlur = kept.length;
await drag([0.5, size.height * 0.3], [size.width * 0.5, size.height * 0.95]);
const outlined = await page.getByTestId('blur-selection').count();
await page.getByTestId('blur-apply').click();
await showsLastKept();
const blurred = await shown([[0.25, 0.7], [0.75, 0.7], [0.25, 0.05]]);
const mixed = blurred?.colours[0] ?? '';
record(outlined === 1 && kept.length === keptBeforeBlur + 1 && mixed !== 'red' && mixed !== 'rgb(0,255,0)' && blurred.colours[1] === 'red' && blurred.colours[2] === 'blue',
  `Blur mixes the stripe into the red inside the selection only, and keeps it as a version (${JSON.stringify(blurred)})`);
record(await page.getByTestId('blur-options').isVisible().catch(() => false), 'the blur stays in hand for the next part');
await page.getByTestId('blur-cancel').click();

// -- Feather on a Magic edit (#638) ----------------------------------------------

await page.getByTestId('magic-rectangle').click();
await drag([2, 2], [size.width - 2, size.height / 2]);
await page.getByTestId('magic-ask').waitFor({ timeout: 3_000 }).catch(() => undefined);
const featherStarts = await page.getByTestId('magic-feather').inputValue().catch(() => '');
const featherMost = await page.getByTestId('magic-feather').getAttribute('max').catch(() => '');
const askBox = await page.getByTestId('magic-ask').boundingBox().catch(() => null);
const featherBox = await page.getByTestId('magic-feather').boundingBox().catch(() => null);
record(featherStarts === '5' && featherMost === '64' && askBox !== null && featherBox !== null &&
  featherBox.y >= askBox.y && featherBox.y + featherBox.height <= askBox.y + askBox.height,
  `the Magic edit asks for a feather beside the prompt, starting at the installation's (${JSON.stringify({ featherStarts, featherMost })})`);
await page.getByTestId('magic-feather').fill('9');
await page.getByTestId('magic-prompt').fill('zz tools: a sky');
await page.getByTestId('magic-change').click();
await page.waitForFunction(() => document.querySelector('[data-testid="editor-drawing"]') !== null, null, { timeout: 5_000 }).catch(() => undefined);
record(edits.length === 1 && edits[0].feather === 9 && edits[0].prompt === 'zz tools: a sky',
  `the feather chosen goes with the change, in the picture's pixels (${JSON.stringify(edits.map((one) => one.feather))})`);

// -- Import from Orknux (#632) - last, since it opens another picture -----------

await page.getByTestId('editor-import').click();
const menu = await page.getByTestId('editor-import-menu').isVisible().catch(() => false);
await page.getByTestId('editor-import-from-orknux').click();
await page.getByTestId('picture-picker-grid').waitFor({ timeout: 5_000 }).catch(() => undefined);
const offered = await page.evaluate(() => [...document.querySelectorAll('[data-testid="picture-picker-item"]')].map((one) => one.getAttribute('data-id')));
record(menu && JSON.stringify(offered) === JSON.stringify([ORIGINAL.id, OTHER.id]),
  `Import offers a file or Orknux, and Orknux's window offers its pictures and not its documents (${JSON.stringify(offered)})`);
await page.locator(`[data-testid="picture-picker-item"][data-id="${OTHER.id}"]`).click();
await page.waitForURL(`**/design/images/${OTHER.id}/edit`, { timeout: 10_000 }).catch(() => undefined);
await page.waitForFunction(() => document.querySelector('[data-testid="editor-picture"]')?.getAttribute('alt') === 'zz tools: an agent kept this', null, { timeout: 10_000 })
  .catch(() => undefined);
record(page.url().endsWith(`/design/images/${OTHER.id}/edit`) && !(await page.getByTestId('picture-picker').isVisible().catch(() => false)) &&
  (await page.getByTestId('editor-picture').getAttribute('alt').catch(() => '')) === OTHER.prompt,
  `the picture chosen opens in the editor, and the window closes (${page.url()})`);

await finish(browser);
