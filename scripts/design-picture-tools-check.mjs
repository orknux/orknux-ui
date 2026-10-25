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
const SETTINGS = {
  brush: 4, brushMost: 50, blur: 6, blurMost: 60, blurFalloff: 3, blurFalloffMost: 40, feather: 5, featherMost: 64,
  layersMost: 32, brushOpacity: 100, brushHardness: 50, markerOpacity: 50,
};
/** What each Magic edit was asked with. */
const edits = [];
/** What each keepDesignImageChange was asked to keep, in order. */
const kept = [];
/** The layers kept with each picture or version, by its id, as the server keeps them: what designImageLayers answers. */
const layersOf = {};
/** What each saveDesignImageVersion saved. */
const saves = [];
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
  if (query.includes('designImageLayers')) {
    const held = layersOf[body.variables?.imageId] ?? [];
    const designImageLayers = held.map((one, at) => ({ id: String(at + 1), name: one.name, visible: one.visible, picture: one.picture, url: one.image }));
    return route.fulfill({ json: { data: { designImageLayers } } });
  }
  if (query.includes('saveDesignImageVersion')) {
    // Over the picture: its file the version's, and its layers the version's - or none, where the version was flat.
    const id = body.variables?.id;
    const version = kept.find((one) => one.version === id);
    saves.push(id);
    ORIGINAL.url = version?.image ?? ORIGINAL.url;
    layersOf[ORIGINAL.id] = layersOf[id] ?? [];
    return route.fulfill({ json: { data: { saveDesignImageVersion: { ...ORIGINAL, versionOf: null } } } });
  }
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
    const id = String(next++);
    kept.push({ ...input, version: `DESIGN-${id}` });
    if (input.layers?.length > 0) layersOf[`DESIGN-${id}`] = input.layers;
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
const strokesHeld = async () => Number(await page.getByTestId('brush-layer').getAttribute('data-strokes').catch(() => 'NaN'));
const painted = await strokesHeld();
await page.getByTestId('editor-undo').click();
const undoneStroke = await strokesHeld();
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
/**
 * The green in a column of the picture across the rows under the stripe, raw. A
 * colour named red is anything over 200 red, and a radius-6 blur three rows from
 * a 4-pixel stripe moves only about a tenth of its green there - still "red" -
 * so the blur is read as how much green those rows gained, inside and outside.
 */
const greenUnder = (xShare) => page.evaluate(([share, from, to]) => {
  const image = document.querySelector('[data-testid="editor-picture"]');
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const pen = canvas.getContext('2d');
  pen.drawImage(image, 0, 0);
  const x = Math.floor(share * (canvas.width - 1));
  let green = 0;
  for (let y = from; y <= to; y += 1) green += pen.getImageData(x, y, 1, 1).data[1];
  return green;
}, [xShare, Math.ceil(size.height / 2) + 2, Math.ceil(size.height / 2) + 6]);
const insideBefore = await greenUnder(0.25);
const outsideBefore = await greenUnder(0.75);
const keptBeforeBlur = kept.length;
await drag([0.5, size.height * 0.3], [size.width * 0.5, size.height * 0.95]);
const outlined = await page.getByTestId('blur-selection').count();
await page.getByTestId('blur-apply').click();
await showsLastKept();
const blurred = await shown([[0.75, 0.7], [0.25, 0.05]]);
const insideAfter = await greenUnder(0.25);
const outsideAfter = await greenUnder(0.75);
// The stripe runs the picture's whole width, so before the blur the two columns are alike; after it only the selected one gained green.
record(outlined === 1 && kept.length === keptBeforeBlur + 1 && insideBefore === outsideBefore &&
  insideAfter - insideBefore > 60 && outsideAfter === outsideBefore && blurred?.colours.join() === 'red,blue',
  `Blur mixes the stripe into the red inside the selection only, and keeps it as a version (${JSON.stringify({ insideBefore, insideAfter, outsideBefore, outsideAfter, blurred })})`);
record(await page.getByTestId('blur-options').isVisible().catch(() => false), 'the blur stays in hand for the next part');

// -- Gradual blur: a soft edge, and along a line ----------------------------------

// The right half is as the brush left it - the stripe across, untouched by the blur above - so both are tried there.
/** The green in one column of the picture, in its own pixels, across the rows under the stripe. */
const greenAt = (x) => page.evaluate(([column, from, to]) => {
  const image = document.querySelector('[data-testid="editor-picture"]');
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const pen = canvas.getContext('2d');
  pen.drawImage(image, 0, 0);
  let green = 0;
  for (let y = from; y <= to; y += 1) green += pen.getImageData(column, y, 1, 1).data[1];
  return green;
}, [x, Math.ceil(size.height / 2) + 2, Math.ceil(size.height / 2) + 6]);
/** Every pixel of one column, top to bottom, to say a column is exactly as it was. */
const columnAt = (x) => page.evaluate((column) => {
  const image = document.querySelector('[data-testid="editor-picture"]');
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const pen = canvas.getContext('2d');
  pen.drawImage(image, 0, 0);
  return Array.from(pen.getImageData(column, 0, 1, canvas.height).data).join(',');
}, x);
/** Waits for the canvas to show the picture at [url], as an undo puts it back. */
const showsImage = (url) => page.waitForFunction((src) => document.querySelector('[data-testid="editor-picture"]')?.getAttribute('src') === src, url, { timeout: 10_000 })
  .catch(() => undefined);
/** A point of the picture, in its own pixels, on the screen. */
const onScreen = async ([x, y]) => {
  const box = await page.getByTestId('editor-picture').boundingBox();
  return [box.x + (x / size.width) * box.width, box.y + (y / size.height) * box.height];
};

// A soft edge: a rectangle over the right half, blurred whole in its middle and hardly at all at its edge.
const falloffStarts = await page.getByTestId('blur-falloff').inputValue().catch(() => '');
const falloffMost = await page.getByTestId('blur-falloff').getAttribute('max').catch(() => '');
record(falloffStarts === '3' && falloffMost === '40',
  `the blur's falloff starts at the installation's, and goes no further than its most (${JSON.stringify({ falloffStarts, falloffMost })})`);
await page.getByTestId('blur-falloff').fill('4').catch(() => undefined);
const softLeft = Math.ceil(size.width / 2) + 1;
const softRight = size.width - 1;
const softMiddle = Math.round((softLeft + softRight) / 2);
const beforeSoft = { edge: await greenAt(softLeft), middle: await greenAt(softMiddle), outside: await columnAt(softLeft - 2), image: kept[kept.length - 1].image };
const keptBeforeSoft = kept.length;
await drag([softLeft, size.height * 0.3], [softRight, size.height * 0.95]);
await page.getByTestId('blur-apply').click();
await showsLastKept();
const soft = { edge: (await greenAt(softLeft)) - beforeSoft.edge, middle: (await greenAt(softMiddle)) - beforeSoft.middle };
const softened = kept.length === keptBeforeSoft + 1 && /4 px/.test(kept[kept.length - 1].change) && soft.middle > 30 && soft.edge < soft.middle / 3 &&
  (await columnAt(softLeft - 2)) === beforeSoft.outside;
record(softened,
  `with a falloff, the blur is whole in the selection's middle and fades out towards its edge, kept as a version (${JSON.stringify({ soft, change: kept[kept.length - 1]?.change })})`);
await page.getByTestId('editor-undo').click();
await showsImage(beforeSoft.image);
record(softened && (await greenAt(softLeft)) === beforeSoft.edge && (await greenAt(softMiddle)) === beforeSoft.middle,
  'Undo takes the softened blur back');

// Along a line: sharp before its start, blurred whole past its end, and partly between.
await page.getByTestId('blur-gradient').click();
const lineFrom = Math.round(size.width * 0.6);
const lineTo = Math.round(size.width * 0.9);
await drag([lineFrom, size.height / 2], [Math.round(size.width * 0.8), size.height / 2]);
// The end's handle dragged on to where the blur should be whole.
const handle = await page.getByTestId('blur-line-end').boundingBox().catch(() => null);
if (handle !== null) {
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(...(await onScreen([lineTo, size.height / 2])), { steps: 4 });
  await page.mouse.up();
}
const lineEnd = Number(await page.getByTestId('blur-line').locator('line').getAttribute('x2').catch(() => 'NaN'));
record(handle !== null && Math.abs(lineEnd - lineTo) <= 1, `a gradual blur's line is drawn with its ends, and its end dragged further (${JSON.stringify({ lineEnd, lineTo })})`);
const sharpColumn = lineFrom - 2;
const halfway = Math.round((lineFrom + lineTo) / 2);
const beforeLine = {
  sharp: await columnAt(sharpColumn), middle: await greenAt(halfway), end: await greenAt(size.width - 1), image: kept[kept.length - 1].image,
};
const keptBeforeLine = kept.length;
await page.getByTestId('blur-apply').click();
await showsLastKept();
const along = { middle: (await greenAt(halfway)) - beforeLine.middle, end: (await greenAt(size.width - 1)) - beforeLine.end };
const gradual = kept.length === keptBeforeLine + 1 && (await columnAt(sharpColumn)) === beforeLine.sharp &&
  along.end > 30 && along.middle > along.end * 0.2 && along.middle < along.end * 0.8;
record(gradual,
  `a gradual blur leaves the start's side sharp, blurs past the end whole, and between partly, kept as a version (${JSON.stringify({ along, change: kept[kept.length - 1]?.change })})`);
await page.getByTestId('editor-undo').click();
await showsImage(beforeLine.image);
record(gradual && (await columnAt(sharpColumn)) === beforeLine.sharp && (await greenAt(halfway)) === beforeLine.middle && (await greenAt(size.width - 1)) === beforeLine.end,
  'Undo takes the gradual blur back');
// And gives back the line it was drawn over, with the blur still in hand, to adjust and apply again.
const lineBack = {
  options: await page.getByTestId('blur-options').isVisible().catch(() => false),
  end: Number(await page.getByTestId('blur-line').locator('line').getAttribute('x2', { timeout: 2_000 }).catch(() => 'NaN')),
  apply: await page.getByTestId('blur-apply').isEnabled().catch(() => false),
};
record(lineBack.options && Math.abs(lineBack.end - lineTo) <= 1 && lineBack.apply,
  `Undo brings back the blur's line and keeps the blur in hand (${JSON.stringify(lineBack)})`);
await page.getByTestId('blur-cancel').click();

// -- Layers (#633) ----------------------------------------------------------------

// Layers as any image editor has them: empty ones added over the picture, painted on, renamed, hidden, restacked
// and removed, every one a step Undo takes back. What is drawn is read off the screen, since a layer is never the
// picture's file until it is flattened. The whole picture fitted first, so a point of it is on the screen.
await page.getByTestId('editor-zoom').click();
/** Clicks what is there; a control that is not leaves the step undone, and the record after it says so. */
const tap = (id) => page.getByTestId(id).first().click({ timeout: 3_000 }).catch(() => undefined);
/** The layers panel open or closed, whichever it was: the editor remembers it between pages, so a press alone may close what it meant to open. */
const layersExpanded = async () => (await page.getByTestId('layers-collapse').getAttribute('aria-expanded').catch(() => null)) === 'true';
const layersTo = async (want) => {
  await page.getByTestId('layers-collapse').waitFor({ timeout: 10_000 }).catch(() => undefined);
  if ((await layersExpanded()) !== (want === 'open')) await tap('layers-collapse');
};
/** The layers' names, the top of the stack first, and which is chosen. */
const stack = () => page.evaluate(() => [...document.querySelectorAll('[data-testid="layer-row"]')].map((row) =>
  `${row.getAttribute('aria-selected') === 'true' ? '*' : ''}${row.querySelector('[data-testid="layer-name"]')?.textContent ?? ''}`));
/** A row painted across the picture's top, in the blue. */
const row = Math.round(size.height * 0.2);
/** Where on the screen that row is read: left of the layers' panel, which sits over the canvas's right. */
const readPoint = async () => {
  const picture = await page.getByTestId('editor-picture').boundingBox();
  const panel = await page.getByTestId('layers-panel').boundingBox().catch(() => null);
  const right = Math.min(picture.x + picture.width, panel === null ? Infinity : panel.x);
  return { x: picture.x + Math.min(picture.width * 0.25, (right - picture.x) / 2), y: picture.y + ((row + 0.5) / size.height) * picture.height };
};
/** The colour drawn at that point of the screen - the picture and every layer shown over it, as somebody sees them. */
const seen = async () => {
  await page.waitForTimeout(100);
  const { x, y } = await readPoint();
  const shot = await page.screenshot({ clip: { x: Math.round(x), y: Math.round(y), width: 1, height: 1 } });
  return page.evaluate(async (png) => {
    const image = new Image();
    image.src = `data:image/png;base64,${png}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const pen = canvas.getContext('2d');
    pen.drawImage(image, 0, 0);
    const [r, g, b] = pen.getImageData(0, 0, 1, 1).data;
    return r > 200 && g < 60 && b > 200 ? 'magenta' : r < 60 && g > 200 && b > 200 ? 'cyan' : r < 60 && g < 60 && b > 200 ? 'blue' : `rgb(${r},${g},${b})`;
  }, shot.toString('base64'));
};
/** One stroke across the picture at that row, in a colour, with the brush put down after it. */
const paintRow = async (colour) => {
  await tap('editor-brush');
  await page.getByTestId('brush-colour').fill(colour).catch(() => undefined);
  await drag([1, row], [size.width - 1, row], 10);
  await tap('editor-brush');
};
const pictureSrc = () => page.getByTestId('editor-picture').getAttribute('src');

await layersTo('open');
await page.getByTestId('layers-panel').waitFor({ timeout: 3_000 }).catch(() => undefined);
const noFromButtons = (await page.getByTestId('layers-add-file').count()) === 0 && (await page.getByTestId('layers-add-orknux').count()) === 0;
const startsWith = { stack: await stack(), base: await page.getByTestId('layer-base').count(), seen: await seen() };
await tap('layers-new');
const added = await stack();
await tap('editor-undo');
const addUndone = await stack();
await tap('editor-redo');
const addRedone = await stack();
record(noFromButtons && startsWith.stack.length === 0 && startsWith.base === 1 && startsWith.seen === 'blue' &&
  JSON.stringify(added) === '["*Layer 1"]' && addUndone.length === 0 && JSON.stringify(addRedone) === '["*Layer 1"]',
  `New layer adds an empty one over the picture, named and chosen, and Undo takes it away (${JSON.stringify({ startsWith, added, addUndone, addRedone })})`);

// Painted on, the layer changes what is seen and the picture stays as it was: hidden, the picture shows through.
const keptBeforeLayers = kept.length;
const srcBeforeLayers = await pictureSrc();
await paintRow('#ff00ff');
const paintedOn = await seen();
const readAcross = await page.getByTestId('editor-picture').boundingBox().then(async (box) => ((await readPoint()).x - box.x) / box.width);
const pictureUnder = await shown([[readAcross, (row + 0.5) / size.height]]);
await page.locator('[data-testid="layer-row"] [data-testid="layer-visible"]').first().click({ timeout: 3_000 }).catch(() => undefined);
const hiddenShows = await seen();
await tap('editor-undo');
const shownAgain = await seen();
record(paintedOn === 'magenta' && hiddenShows === 'blue' && shownAgain === 'magenta' && kept.length === keptBeforeLayers &&
  (await pictureSrc()) === srcBeforeLayers && pictureUnder?.colours[0] === 'blue',
  `the brush paints on the layer chosen: the picture under it is untouched, shows through with the layer hidden, and Undo shows the layer again (${JSON.stringify({ paintedOn, hiddenShows, shownAgain, pictureUnder })})`);
await tap('editor-undo');
const paintUndone = await seen();
await tap('editor-redo');
const paintRedone = await seen();
record(paintedOn === 'magenta' && paintUndone === 'blue' && paintRedone === 'magenta',
  `Undo takes back what was painted on a layer, and Redo paints it again (${JSON.stringify({ paintUndone, paintRedone })})`);

// Renamed by double-clicking its name.
await page.getByTestId('layer-name').first().dblclick({ timeout: 3_000 }).catch(() => undefined);
await page.getByTestId('layer-name-input').fill('Sky').catch(() => undefined);
await page.getByTestId('layer-name-input').press('Enter').catch(() => undefined);
const renamed = await stack();
await tap('editor-undo');
const renameUndone = await stack();
await tap('editor-redo');
record(JSON.stringify(renamed) === '["*Sky"]' && JSON.stringify(renameUndone) === '["*Layer 1"]' && JSON.stringify(await stack()) === '["*Sky"]',
  `a layer is renamed, and Undo gives it its name back (${JSON.stringify({ renamed, renameUndone })})`);

// A second layer over the first, painted another colour: on top, it is what is seen; moved down, the first is.
await tap('layers-new');
await paintRow('#00ffff');
const twoLayers = { stack: await stack(), seen: await seen() };
await page.locator('[data-testid="layer-row"] [data-testid="layer-down"]').first().click({ timeout: 3_000 }).catch(() => undefined);
const restacked = { stack: await stack(), seen: await seen() };
await tap('editor-undo');
const restackUndone = { stack: await stack(), seen: await seen() };
record(JSON.stringify(twoLayers) === '{"stack":["*Layer 2","Sky"],"seen":"cyan"}' &&
  JSON.stringify(restacked) === '{"stack":["Sky","*Layer 2"],"seen":"magenta"}' &&
  JSON.stringify(restackUndone) === JSON.stringify(twoLayers),
  `a new layer goes over the one chosen, moving it down changes what is on top, and Undo puts it back (${JSON.stringify({ twoLayers, restacked, restackUndone })})`);

// Removed from its own row, beside Rename, the one under it is chosen; the picture's row has no Remove.
const removeBesideRename = await page.locator('[data-testid="layer-row"]').first().evaluate((row) => {
  const rename = row.querySelector('[data-testid="layer-rename"]')?.getBoundingClientRect();
  const remove = row.querySelector('[data-testid="layer-remove"]')?.getBoundingClientRect();
  return rename && remove ? Math.abs(rename.top - remove.top) < 2 && remove.left >= rename.right && remove.left - rename.right < 16 : false;
}).catch(() => false);
await page.locator('[data-testid="layer-row"]').first().getByTestId('layer-remove').click({ timeout: 3_000 }).catch(() => undefined);
const removed = { stack: await stack(), seen: await seen() };
await tap('editor-undo');
const removeUndone = { stack: await stack(), seen: await seen() };
await tap('layer-base');
const pictureKept = (await page.getByTestId('layer-base').locator('[data-testid="layer-remove"]').count().catch(() => 1)) === 0
  && (await page.getByTestId('layers-remove').count()) === 0;
record(removeBesideRename && JSON.stringify(removed) === '{"stack":["*Sky"],"seen":"magenta"}' && JSON.stringify(removeUndone) === JSON.stringify(twoLayers) && pictureKept,
  `Remove sits on the layer's row beside Rename, takes it away, Undo brings it back, and the picture itself has none (${JSON.stringify({ removeBesideRename, removed, removeUndone, pictureKept })})`);

// Flattened, what is seen becomes the picture, as one version.
const keptBeforeFlatten = kept.length;
await tap('layers-flatten');
await showsLastKept();
const flat = await shown([[0.1, (row + 0.5) / size.height]]);
record(kept.length === keptBeforeFlatten + 1 && kept[kept.length - 1].change === 'Layers flattened' && (await stack()).length === 0 &&
  flat?.width === size.width && flat.colours[0] === 'rgb(0,255,255)',
  `Flatten keeps what is seen as one version of the picture's own size, and the layers go (${JSON.stringify({ flat, change: kept[kept.length - 1]?.change })})`);
await layersTo('closed');

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

// -- Layers survive Save ------------------------------------------------------------

// A new layer painted on and saved: kept as a layer beside the flattened picture, and opened again as one.
await page.goto(`${BASE}/workspace/${WORKSPACE}/design/images/${ORIGINAL.id}/edit`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('editor-picture').waitFor({ timeout: 20_000 }).catch(() => undefined);
await page.waitForFunction(() => (document.querySelector('[data-testid="editor-picture"]')?.naturalWidth ?? 0) > 0, null, { timeout: 10_000 }).catch(() => undefined);
/** The picture's own size now, which the strokes below are drawn in. */
const whole = await page.evaluate(() => {
  const image = document.querySelector('[data-testid="editor-picture"]');
  return { width: image.naturalWidth, height: image.naturalHeight };
});
/** A row across the top quarter, where the picture is red on the left. */
const savedRow = Math.round(whole.height * 0.25);
await layersTo('open');
await page.getByTestId('layers-panel').waitFor({ timeout: 3_000 }).catch(() => undefined);
await tap('layers-new');
await tap('editor-brush');
await page.getByTestId('brush-colour').fill('#ff00ff').catch(() => undefined);
await drag([1, savedRow], [whole.width - 1, savedRow], 10);
await tap('editor-brush');
const keptBeforeSave = kept.length;
await tap('editor-save');
for (let waited = 0; saves.length === 0 && waited < 50; waited += 1) await page.waitForTimeout(200);
const sentWithSave = kept[keptBeforeSave];
record(kept.length === keptBeforeSave + 1 && saves.length === 1 && sentWithSave?.layers?.length === 2 &&
  sentWithSave.layers[0].picture === true && sentWithSave.layers[1].name === 'Layer 1' && sentWithSave.layers[1].picture === false,
  `Save keeps the layers with the picture rather than flattening them (${JSON.stringify({ layers: sentWithSave?.layers?.map((one) => one.name), saves })})`);

await page.reload({ waitUntil: 'domcontentloaded' });
await page.getByTestId('editor-picture').waitFor({ timeout: 20_000 }).catch(() => undefined);
await layersTo('open');
await page.getByTestId('layer-row').first().waitFor({ timeout: 5_000 }).catch(() => undefined);
const reopened = await stack();
/** The paint, read where it was painted: on the layer, and not in the picture under it. */
const underPaint = await shown([[0.25, (savedRow + 0.5) / whole.height]]);
const onLayer = await page.evaluate(([x, y, below]) => {
  const canvas = document.querySelector('[data-testid="layer-canvas"]');
  if (canvas === null) return null;
  const pen = canvas.getContext('2d');
  const [r, g, b, a] = pen.getImageData(x, y, 1, 1).data;
  return { painted: `rgba(${r},${g},${b},${a})`, clear: pen.getImageData(x, below, 1, 1).data[3] };
}, [Math.round(whole.width * 0.25), savedRow, Math.round(whole.height * 0.8)]);
record(JSON.stringify(reopened) === '["Layer 1"]' && underPaint?.colours[0] === 'red' && onLayer?.painted === 'rgba(255,0,255,255)' && onLayer.clear === 0,
  `opened again, the picture lists its layer, with the paint on the layer and the picture under it as it was (${JSON.stringify({ reopened, underPaint, onLayer })})`);

// -- Brush tips -------------------------------------------------------------------

// Each tip on a layer of its own over the picture, read off the layer's pixels: what the tip leaves is the layer, nothing else.
/** The alpha of a layer's pixels down one column, between two rows: how a stroke's edge falls off across it. */
const alphaDown = (id, x, from, to) => page.evaluate(([layer, column, top, bottom]) => {
  const canvas = document.querySelector(`[data-testid="layer-canvas"][data-id="${layer}"]`);
  if (canvas === null) return null;
  return Array.from(canvas.getContext('2d').getImageData(column, top, 1, bottom - top + 1).data).filter((_, at) => at % 4 === 3);
}, [id, x, from, to]);
const alphaAt = async (id, x, y) => (await alphaDown(id, x, y, y))?.[0] ?? null;
const chosenLayer = () => page.locator('[data-testid="layer-row"][aria-selected="true"]').getAttribute('data-id').catch(() => null);
/** A click of the brush in one place: a dot of the tip's own shape. */
const dot = async ([x, y]) => {
  const box = await page.getByTestId('editor-picture').boundingBox();
  await page.mouse.click(box.x + (x / whole.width) * box.width, box.y + (y / whole.height) * box.height);
};
await tap('layers-new');
const tips = await chosenLayer();
await tap('editor-brush');
await page.getByTestId('brush-options').waitFor({ timeout: 3_000 }).catch(() => undefined);
await page.getByTestId('brush-size').fill('8').catch(() => undefined);
await page.getByTestId('brush-colour').fill('#00ff00').catch(() => undefined);
const tipsOffered = await page.locator('[data-testid="brush-styles"] [role="radio"]').evaluateAll((all) => all.map((one) => one.getAttribute('title')));
// Hard: a stroke along the top whose edge goes from painted to bare at once.
await tap('brush-style-hard');
await drag([6, 6], [24, 6], 8);
const hardEdge = await alphaDown(tips, 15, 0, 14);
const between = (alphas) => (alphas ?? []).filter((alpha) => alpha > 10 && alpha < 245).length;
// Soft, with no hardness at all: the same stroke fades out across its edge.
await tap('brush-style-soft');
await page.getByTestId('brush-hardness').fill('0').catch(() => undefined);
await drag([6, 20], [24, 20], 8);
const softEdge = await alphaDown(tips, 15, 12, 28);
record(JSON.stringify(tipsOffered) === '["Hard","Soft","Square","Marker","Eraser"]' && hardEdge !== null && Math.max(...hardEdge) === 255 && between(hardEdge) <= 2 &&
  Math.max(...(softEdge ?? [0])) > 200 && between(softEdge) >= 4,
  `the hard tip's edge is sharp, the soft tip's fades across several pixels (${JSON.stringify({ tipsOffered, hardEdge, softEdge })})`);
// Round and square: one click each, and only the square fills its corner.
await tap('brush-style-hard');
await dot([36, 6]);
await tap('brush-style-square');
await dot([50, 6]);
const corners = { round: await alphaAt(tips, 39, 9), square: await alphaAt(tips, 53, 9) };
record(corners.square === 255 && corners.round !== null && corners.round < 128,
  `a square tip leaves a square, filled to its corner, where the round one leaves a circle (${JSON.stringify(corners)})`);
// Marker: see-through, and a stroke back over itself no darker where it crosses.
await tap('brush-style-marker');
const markerStarts = await page.getByTestId('brush-opacity').inputValue().catch(() => '');
await drag([6, 33], [30, 33], 8);
{
  const box = await page.getByTestId('editor-picture').boundingBox();
  const at = ([x, y]) => [box.x + (x / whole.width) * box.width, box.y + (y / whole.height) * box.height];
  await page.mouse.move(...at([40, 33]));
  await page.mouse.down();
  for (const point of [[56, 33], [44, 33]]) await page.mouse.move(...at(point), { steps: 6 });
  await page.mouse.up();
}
const marker = { single: await alphaAt(tips, 18, 33), crossed: await alphaAt(tips, 50, 33), markerStarts };
record(markerStarts === '50' && marker.single !== null && marker.single > 100 && marker.single < 155 && marker.crossed !== null && Math.abs(marker.crossed - marker.single) <= 3,
  `the marker starts half see-through, and a stroke over itself is no darker where it crosses (${JSON.stringify(marker)})`);
// The eraser: on the layer painted and saved earlier, paint taken off to nothing; on the picture itself it is off.
const savedLayer = page.locator('[data-testid="layer-row"]').filter({ hasText: 'Layer 1' });
const painting = await savedLayer.getAttribute('data-id').catch(() => null);
// Chosen by its name: the middle of the row is its buttons, and a click there removed the layer.
await savedLayer.getByTestId('layer-name').click({ timeout: 3_000 }).catch(() => undefined);
await tap('brush-style-eraser');
await page.getByTestId('brush-hardness').fill('100').catch(() => undefined);
const beforeErase = await alphaAt(painting, 15, savedRow);
await drag([6, savedRow], [24, savedRow], 8);
const erased = { before: beforeErase, after: await alphaAt(painting, 15, savedRow), untouched: await alphaAt(painting, 45, savedRow) };
await tap('layer-base');
const eraserOnPicture = await page.getByTestId('brush-style-eraser').isDisabled().catch(() => false);
record(erased.before === 255 && erased.after === 0 && erased.untouched === 255 && eraserOnPicture,
  `the eraser makes a layer's pixels transparent where it goes and nowhere else, and is off on the picture itself (${JSON.stringify({ erased, eraserOnPicture })})`);
await tap('editor-brush');

// -- The rail's shortcuts --------------------------------------------------------

// What the tip trials painted is thrown away, so nothing asks before the page is left below.
await tap('editor-discard');
await page.waitForTimeout(300);
/** A key pressed on the editor's canvas, nowhere a caret is: where its shortcuts are heard. */
const press = async (key) => {
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
  await page.keyboard.press(key);
};
const cropOn = async () => (await page.getByTestId('crop-options').isVisible().catch(() => false)) &&
  (await page.getByTestId('editor-crop').getAttribute('aria-pressed').catch(() => null)) === 'true';
const cropTitle = await page.getByTestId('editor-crop').getAttribute('title').catch(() => '');
await layersTo('closed');
const layersBefore = await layersExpanded();
await press('c');
const cropByKey = await cropOn();
await press('c');
const cropPutDown = !(await cropOn());
await press('Shift+L');
const layersAfter = await layersExpanded();
record(cropTitle === 'Crop (C)' && cropByKey && cropPutDown && !layersBefore && layersAfter,
  `a rail tool answers its key, which its button names, and Shift+L opens the folded layers (${JSON.stringify({ cropTitle, cropByKey, cropPutDown, layersBefore, layersAfter })})`);

// Rebound on Preferences, the tool answers the new key and no longer the old one.
await page.goto(`${BASE}/preferences`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('imageEditor-crop-shortcut').click({ timeout: 10_000 }).catch(() => undefined);
await page.keyboard.press('g');
const recorded = (await page.getByTestId('imageEditor-crop-shortcut').textContent().catch(() => '')) ?? '';
await page.getByTestId('save-bar').getByRole('button', { name: 'Save' }).click({ timeout: 3_000 }).catch(() => undefined);
await page.waitForTimeout(300);
await page.goto(`${BASE}/workspace/${WORKSPACE}/design/images/${ORIGINAL.id}/edit`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('editor-picture').waitFor({ timeout: 20_000 }).catch(() => undefined);
await page.waitForFunction(() => (document.querySelector('[data-testid="editor-picture"]')?.naturalWidth ?? 0) > 0, null, { timeout: 10_000 }).catch(() => undefined);
await press('c');
const oldKey = await cropOn();
await press('g');
const newKey = await cropOn();
const reboundTitle = await page.getByTestId('editor-crop').getAttribute('title').catch(() => '');
record(recorded.trim() === 'G' && !oldKey && newKey && reboundTitle === 'Crop (G)',
  `a key chosen on Preferences picks the tool instead of the default, and its button says so (${JSON.stringify({ recorded, oldKey, newKey, reboundTitle })})`);

// The layers panel is remembered for whoever uses the editor: open stays open over a reload, closed stays closed.
const layersShown = layersExpanded;
const reopen = async () => {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('editor-layers').waitFor({ timeout: 20_000 }).catch(() => undefined);
  await page.waitForTimeout(500);
};
if (!(await layersShown())) await tap('layers-collapse');
await reopen();
const keptOpen = await layersShown();
await tap('layers-collapse');
await reopen();
const keptClosed = !(await layersShown());
record(keptOpen && keptClosed, `the layers panel is remembered across a reload, open or closed (${JSON.stringify({ keptOpen, keptClosed })})`);

// It is a section of the side panel, beside the picture rather than over it, and the rail's Layers opens it folded.
const placed = await page.evaluate(() => {
  const panel = document.querySelector('[data-testid="layers-panel"]')?.getBoundingClientRect();
  const side = document.querySelector('[data-testid="editor-panel"]')?.parentElement?.getBoundingClientRect();
  const canvas = document.querySelector('[data-testid="editor-canvas"]')?.getBoundingClientRect();
  return panel && side && canvas ? { inSide: panel.left >= side.left - 1 && panel.right <= side.right + 1, clearOfCanvas: panel.left >= canvas.right - 1 } : null;
});
await tap('editor-layers');
const openedByRail = await layersExpanded();
record(placed !== null && placed.inSide && placed.clearOfCanvas && openedByRail,
  `the layers sit in the side panel, clear of the picture, and the rail's Layers unfolds them (${JSON.stringify({ placed, openedByRail })})`);

await finish(browser);
