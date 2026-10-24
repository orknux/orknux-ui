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
const SETTINGS = { brush: 4, brushMost: 50, blur: 6, blurMost: 60, blurFalloff: 3, blurFalloffMost: 40, feather: 5, featherMost: 64 };
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

await tap('editor-layers');
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
await tap('editor-layers');

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
