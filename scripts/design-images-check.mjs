/**
 * Design is a section of its own, and a picture on Artifacts opens in it.
 *
 * The bar across the top gains Design and is in the alphabet's order - AI,
 * Chat, Design, Flow, Workspace - and Design's menu starts at Images. A picture
 * on the Artifacts page carries "Open in Design", which lands on that image,
 * shown above the gallery, with what it was drawn with, and its close button
 * goes back to the gallery.
 *
 * The gallery is a gallery: sixty pictures fill rows across the width, and
 * more are read as its end is scrolled to, rather than ten in a row over a
 * pager. "+ New image" in the header goes to the image editor - a page with
 * the canvas and, down its right, the prompt, the model and its parameters -
 * which draws with the model chosen, opens a picture already drawn with what
 * it was drawn from, and undoes and redoes.
 *
 * The artifact list and the drawing are answered here, so the check does not
 * depend on the installation having drawn anything or holding an image model.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 1000 } });

// A grey square: a picture that is certainly there.
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGNgGAWjYBSMAggAAAQQAAGFP6pyAAAAAElFTkSuQmCC';
const PICTURE = {
  id: 'IMAGE-424242',
  kind: 'IMAGE',
  source: 'Run #42',
  sourcePath: 'executions/42',
  prompt: 'zz design check: a lighthouse at dusk',
  filename: 'lighthouse.png',
  contentType: 'image/png',
  sizeBytes: 1024,
  url: PNG,
  previewUrl: PNG,
  drawnAt: new Date().toISOString(),
};
const drawnAsked = [];
// Sixty more, as the gallery's pages: enough for several rows, and a second read.
const MANY = Array.from({ length: 60 }, (_, index) => ({ ...PICTURE, id: `IMAGE-${500000 + index}`, prompt: `zz design check ${index}` }));
const DRAWN = { ...PICTURE, id: 'DESIGN-777', kind: 'DESIGN', source: 'Design', sourcePath: 'design/images/DESIGN-777', prompt: 'zz a drawn lighthouse',
  drawnWith: { modelId: '9191', model: 'Drawer', size: '1024x1024', quality: 'hd', style: null, drawnBy: 'alice' } };
const pagesAsked = [];
const drawRequests = [];

await page.route('**/graphql', async (route) => {
  const body = route.request().postDataJSON() ?? {};
  const query = body.query ?? '';
  if (query.includes('workspaceArtifacts(')) {
    drawnAsked.push(body.variables?.drawn === true);
    if (body.variables?.drawn !== true) {
      return route.fulfill({
        json: { data: { workspaceArtifacts: { content: [PICTURE], page: 0, size: 24, totalElements: 1, totalPages: 1 } } },
      });
    }
    const all = [PICTURE, ...MANY];
    const { page = 0, size = 48 } = body.variables;
    pagesAsked.push(page);
    return route.fulfill({
      json: { data: { workspaceArtifacts: { content: all.slice(page * size, (page + 1) * size), page, size, totalElements: all.length, totalPages: Math.ceil(all.length / size) } } },
    });
  }
  if (query.includes('workspaceArtifact(')) {
    const id = body.variables?.id;
    return route.fulfill({ json: { data: { workspaceArtifact: id === DRAWN.id ? DRAWN : PICTURE } } });
  }
  if (query.includes('workspaceModels') || query.includes('models(')) {
    const answered = await route.fetch().catch(() => null);
    const json = answered === null ? null : await answered.json().catch(() => null);
    const list = Object.values(json?.data ?? {}).find(Array.isArray);
    if (Array.isArray(list)) list.push({ id: '9191', providerId: '1', workspaceId: WORKSPACE, providerName: 'Stub', name: 'Drawer', modelId: 'stub', kind: 'IMAGE', contextWindow: null, maxOutput: null, parallelToolCalls: null });
    return json === null ? route.continue() : route.fulfill({ json });
  }
  if (query.includes('imageModelParameters')) {
    return route.fulfill({ json: { data: { imageModelParameters: [{ name: 'quality', kind: 'CHOICE', choices: ['standard', 'hd'], minSide: null, maxSide: null, step: null }] } } });
  }
  if (query.includes('drawDesignImage')) {
    drawRequests.push(body.variables?.input);
    // Long enough to be seen drawing, and past the moment a quiet loader would appear.
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    return route.fulfill({ json: { data: { drawDesignImage: DRAWN } } });
  }
  return route.continue();
});

await page.goto(`${BASE}/workspace/${WORKSPACE}/artifacts`, { waitUntil: 'domcontentloaded' });
const link = page.locator('[data-open-in-design]').first();
await link.waitFor({ timeout: 20_000 }).catch(() => undefined);

// The bar, left to right, as drawn - once Chat is in it, which waits for the installation's settings.
await page.locator('nav a', { hasText: /^Chat$/ }).first().waitFor({ timeout: 10_000 }).catch(() => undefined);
const bar = await page.evaluate(() => {
  const names = ['AI', 'Chat', 'Design', 'Flow', 'Workspace'];
  return [...document.querySelectorAll('header a, header button')]
    .filter((one) => names.includes(one.textContent?.trim() ?? ''))
    .map((one) => ({ name: one.textContent.trim(), x: one.getBoundingClientRect().left }))
    .sort((a, b) => a.x - b.x)
    .map((one) => one.name);
});
record(JSON.stringify(bar) === JSON.stringify(['AI', 'Chat', 'Design', 'Flow', 'Workspace']), `the top bar is in the alphabet's order (${bar.join(', ')})`);

record((await link.count()) === 1, 'a picture on Artifacts offers Open in Design');
await link.click().catch(() => undefined);
await page.waitForURL(new RegExp(`/workspace/${WORKSPACE}/design/images/${PICTURE.id}$`), { timeout: 10_000 }).catch(() => undefined);
record(page.url().endsWith(`/design/images/${PICTURE.id}`), `which lands on that image in Design (${page.url()})`);

const shown = page.locator(`[data-design-image="${PICTURE.id}"]`);
await shown.waitFor({ timeout: 10_000 }).catch(() => undefined);
const box = await shown.locator('img').boundingBox().catch(() => null);
record(box !== null && box.width > 200, `the image is shown large above the gallery (${JSON.stringify(box)})`);
record(drawnAsked.includes(true), 'and the gallery asks for drawn pictures only');

// Design is the section lit, and its menu holds Images.
const lit = await page.evaluate(() =>
  [...document.querySelectorAll('header a[aria-current="page"], header a[class*="active"]')].map((one) => one.textContent?.trim()),
);
record(lit.includes('Design'), `Design is the section lit (${JSON.stringify(lit)})`);
const menu = page.locator('nav a', { hasText: 'Images' });
record((await menu.count()) >= 1, 'and its menu lists Images');

// The close button goes back to the gallery.
await page.getByTestId('design-image-close').click().catch(() => undefined);
await page.waitForURL(new RegExp(`/design/images$`), { timeout: 5_000 }).catch(() => undefined);
await shown.waitFor({ state: 'detached', timeout: 5_000 }).catch(() => undefined);
record(page.url().endsWith('/design/images') && (await shown.count()) === 0, `the close button goes back to the gallery (${page.url()})`);

// A gallery: several rows across the width, and more read at its end.
const cards = page.getByTestId('design-gallery').locator('figure');
await cards.nth(10).waitFor({ timeout: 10_000 }).catch(() => undefined);
const rows = await cards.evaluateAll((all) => new Set(all.map((one) => Math.round(one.getBoundingClientRect().top))).size);
record(rows >= 3, `the gallery fills rows rather than one (${rows} rows of ${await cards.count()})`);
await page.getByTestId('design-gallery').locator('figure').last().scrollIntoViewIfNeeded().catch(() => undefined);
await page.waitForTimeout(1500);
record(pagesAsked.includes(1) && (await cards.count()) === 61, `scrolling to its end reads the rest (${await cards.count()}, pages ${JSON.stringify(pagesAsked)})`);
record((await page.locator('[class*="pager"], [class*="Pagination"]').count()) === 0, 'and there is no pager');

// "+ New image", in the header's right corner, goes to the editor rather than a dialog.
const button = page.getByTestId('new-image');
const placed = await button.boundingBox().catch(() => null);
const title = await page.locator('h1', { hasText: 'Images' }).boundingBox().catch(() => null);
record(placed !== null && title !== null && placed.x > 900 && Math.abs(placed.y - title.y) < 40, `+ New image sits at the header's right (${JSON.stringify(placed)})`);
await button.click();
await page.waitForURL(new RegExp(`/design/images/new$`), { timeout: 10_000 }).catch(() => undefined);
record(page.url().endsWith('/design/images/new') && (await page.locator('dialog[open]').count()) === 0, `which opens the editor, not a dialog (${page.url()})`);

// The canvas, and the panel down its right with the prompt, the model and the size.
const canvas = await page.getByTestId('editor-canvas').boundingBox().catch(() => null);
const panel = await page.getByTestId('editor-panel').boundingBox().catch(() => null);
record(canvas !== null && panel !== null && panel.x >= canvas.x + canvas.width - 1 && canvas.width > panel.width * 2,
  `the canvas fills the page and the panel stands at its right (${JSON.stringify({ canvas, panel })})`);
await page.locator('#image-model').selectOption('9191').catch(() => undefined);
await page.getByTestId('image-quality').waitFor({ timeout: 5_000 }).catch(() => undefined);
const fields = await page.getByTestId('editor-panel').locator('label').allInnerTexts();
record(['Prompt', 'Model', 'Quality'].every((one) => fields.includes(one)), `the panel asks for the prompt, the model and its parameters (${fields.join(', ')})`);

await page.locator('#image-prompt').fill('zz a drawn lighthouse');
await page.locator('#image-quality').selectOption('hd').catch(() => undefined);
await page.getByRole('button', { name: 'Generate' }).click().catch(() => undefined);
// While it draws: one Orknux mark and the word Drawing, at once, and nothing that turns up later beside it.
const waiting = page.getByTestId('editor-drawing');
await waiting.waitFor({ timeout: 3_000 }).catch(() => undefined);
const early = {
  marks: await waiting.locator('svg').count(),
  text: (await waiting.innerText().catch(() => '')).trim(),
  side: Math.round((await waiting.locator('svg').first().boundingBox().catch(() => null))?.width ?? 0),
};
await page.waitForTimeout(3_500);
const late = { marks: await waiting.locator('svg').count(), text: (await waiting.innerText().catch(() => '')).trim() };
record(early.marks === 1 && early.text === 'Drawing…' && early.side >= 64 && late.marks === 1 && late.text === 'Drawing…',
  `while drawing, one large mark and "Drawing…" from the start to the end (${JSON.stringify({ early, late })})`);
await page.waitForURL(new RegExp(`/design/images/${DRAWN.id}/edit$`), { timeout: 10_000 }).catch(() => undefined);
const sent = drawRequests[0] ?? {};
record(sent.prompt === 'zz a drawn lighthouse' && sent.modelId === '9191' && sent.quality === 'hd' && sent.size === null,
  `the drawing goes to the model chosen with what was asked (${JSON.stringify(sent)})`);
record((await page.getByTestId('editor-picture').count()) === 1, 'and the picture is on the canvas');

// Undo takes the picture and the quality off; redo puts them back.
await page.locator('body').click({ position: { x: 5, y: 300 } }).catch(() => undefined);
await page.keyboard.press('Control+z');
await page.waitForTimeout(400);
const undone = { url: page.url(), picture: await page.getByTestId('editor-picture').count() };
record(undone.url.endsWith('/design/images/new') && undone.picture === 0, `Ctrl+Z undoes the drawing (${JSON.stringify(undone)})`);
await page.getByTestId('editor-undo').click().catch(() => undefined);
await page.waitForTimeout(300);
const quality = await page.locator('#image-quality').inputValue().catch(() => null);
record(quality === '', `and the undo button the quality chosen before it (${quality})`);
await page.getByTestId('editor-redo').click().catch(() => undefined);
await page.keyboard.press('Control+Shift+z');
await page.waitForTimeout(400);
record(page.url().endsWith(`/design/images/${DRAWN.id}/edit`) && (await page.locator('#image-quality').inputValue().catch(() => null)) === 'hd',
  `redo puts both back (${page.url()})`);

// A picture already drawn opens in the editor with what it was drawn from.
await page.goto(`${BASE}/workspace/${WORKSPACE}/design/images/${DRAWN.id}`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('design-image-edit').click({ timeout: 15_000 }).catch(() => undefined);
await page.waitForURL(new RegExp(`/design/images/${DRAWN.id}/edit$`), { timeout: 10_000 }).catch(() => undefined);
await page.getByTestId('image-quality').waitFor({ timeout: 5_000 }).catch(() => undefined);
await page.waitForTimeout(500);
const carried = {
  prompt: await page.locator('#image-prompt').inputValue().catch(() => null),
  model: await page.locator('#image-model').inputValue().catch(() => null),
  quality: await page.locator('#image-quality').inputValue().catch(() => null),
};
record(carried.prompt === DRAWN.prompt && carried.model === '9191' && carried.quality === 'hd',
  `Open in editor fills in the prompt, model and parameters it was drawn with (${JSON.stringify(carried)})`);

await finish(browser);
