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
 * which queues the picture with the model chosen and shows it the moment it is
 * drawn, keeps Save off until there is something to save and asks before
 * leaving with it unsaved, zooms in and
 * out by button and by the shortcuts chosen in Preferences, opens a picture
 * already drawn with what it was drawn from, and undoes and redoes. A picture
 * still queued shows in the gallery, marked. With a
 * picture open, the gallery stands down its left.
 *
 * The artifact list and the drawing are answered here, so the check does not
 * depend on the installation having drawn anything or holding an image model.
 */
import { BASE, WORKSPACE, open, record, finish, chooseOption, chosenOption } from './suite/harness.mjs';

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
  drawnWith: null,
  name: null,
};
const drawnAsked = [];
// Sixty more, as the gallery's pages: enough for several rows, and a second read.
const MANY = Array.from({ length: 60 }, (_, index) => ({ ...PICTURE, id: `IMAGE-${500000 + index}`, prompt: `zz design check ${index}` }));
const DRAWN = { ...PICTURE, id: 'DESIGN-777', kind: 'DESIGN', source: 'Design', sourcePath: 'design/images/DESIGN-777', prompt: 'zz a drawn lighthouse',
  name: 'Zz drawn lighthouse', drawnWith: { modelId: '9191', model: 'Drawer', size: '1024x1024', quality: 'hd', style: null, drawnBy: 'alice' } };
const SECOND = { ...DRAWN, id: 'DESIGN-778', prompt: 'zz a second lighthouse' };
const pagesAsked = [];
const drawRequests = [];
const deleted = [];
const renamed = [];
/** A request already waiting, for the gallery's tile. */
const WAITING = { id: '30', status: 'QUEUED', prompt: 'zz a queued lighthouse', modelId: '9191', model: 'Drawer', size: null, quality: null, style: null,
  requestedBy: 'alice', requestedAt: new Date().toISOString(), startedAt: null, reason: null, ahead: 1, image: null };
/** The requests the editor makes, each drawn a few seconds after it was asked for. */
const asked = [];
const jobFor = (id) => {
  const one = asked.find((held) => held.id === id);
  if (one === undefined) return null;
  const drawn = Date.now() - one.at > 4_500;
  return { ...WAITING, id, prompt: one.input.prompt, ahead: null, status: drawn ? 'DRAWN' : 'DRAWING', image: drawn ? one.picture : null };
};

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
  if (query.includes('queueDesignImage')) {
    const input = body.variables?.input;
    drawRequests.push(input);
    const id = String(40 + asked.length);
    asked.push({ id, input, at: Date.now(), picture: asked.length === 0 ? DRAWN : SECOND });
    return route.fulfill({ json: { data: { queueDesignImage: { ...WAITING, id, prompt: input.prompt, ahead: 0 } } } });
  }
  if (query.includes('designImageJob(')) {
    const id = body.variables?.id;
    return route.fulfill({ json: { data: { designImageJob: id === WAITING.id ? WAITING : jobFor(id) } } });
  }
  if (query.includes('designImageQueue(')) return route.fulfill({ json: { data: { designImageQueue: [WAITING] } } });
  if (query.includes('renameDesignImage')) {
    renamed.push(body.variables?.name);
    return route.fulfill({ json: { data: { renameDesignImage: { ...DRAWN, name: body.variables?.name } } } });
  }
  if (query.includes('deleteArtifact')) {
    deleted.push(body.variables?.id);
    return route.fulfill({ json: { data: { deleteArtifact: true } } });
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
record(box !== null && box.width > 200, `the image is shown large (${JSON.stringify(box)})`);
const side = await page.getByTestId('design-gallery').boundingBox().catch(() => null);
const focusBox = await shown.boundingBox().catch(() => null);
record(side !== null && focusBox !== null && side.x + side.width <= focusBox.x + 1 && side.width >= 160,
  `with the gallery down its left, a column at least (${JSON.stringify({ side, focusBox })})`);
const closeBox = await page.getByTestId('design-image-close').boundingBox().catch(() => null);
const editBox = await page.getByTestId('design-image-edit').boundingBox().catch(() => null);
const editText = (await page.getByTestId('design-image-edit').innerText().catch(() => '')).trim();
const pictureTop = (await shown.locator('img').boundingBox().catch(() => null))?.y ?? 0;
record(closeBox !== null && pictureTop - (closeBox.y + closeBox.height) >= 14,
  `the picture starts clear below the buttons (${Math.round(pictureTop - ((closeBox?.y ?? 0) + (closeBox?.height ?? 0)))}px)`);
// The gallery scrolls on its own: scrolled, the search and the picture stay where they are.
const column = page.getByTestId('design-gallery-column');
const searchBefore = (await page.getByPlaceholder('Search images...').boundingBox().catch(() => null))?.y ?? -1;
const focusBefore = (await shown.boundingBox().catch(() => null))?.y ?? -1;
const scrolled = await column.evaluate((one) => {
  one.scrollTop = 600;
  return { top: one.scrollTop, scrollable: one.scrollHeight > one.clientHeight };
}).catch(() => ({ top: 0, scrollable: false }));
await page.waitForTimeout(300);
const searchAfter = (await page.getByPlaceholder('Search images...').boundingBox().catch(() => null))?.y ?? -2;
const focusAfter = (await shown.boundingBox().catch(() => null))?.y ?? -2;
record(scrolled.scrollable && scrolled.top > 0 && Math.abs(searchAfter - searchBefore) < 1 && Math.abs(focusAfter - focusBefore) < 1,
  `the gallery scrolls on its own, the search and the picture staying put (${JSON.stringify({ scrolled, searchBefore, searchAfter, focusBefore, focusAfter })})`);
await column.evaluate((one) => { one.scrollTop = 0; }).catch(() => undefined);
record(closeBox !== null && closeBox.width >= 36 && editBox !== null && editBox.width < 120 && editText === 'Edit'
  && Math.abs(editBox.y - closeBox.y) < 2 && editBox.x + editBox.width <= closeBox.x && closeBox.x - (editBox.x + editBox.width) >= 14 && closeBox.x - (editBox.x + editBox.width) < 24,
  `a large close button, and Edit just left of it in the corner (${JSON.stringify({ closeBox, editBox, editText })})`);
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
const cards = page.getByTestId('design-gallery').locator('figure:not([data-job-status])');
await cards.nth(10).waitFor({ timeout: 10_000 }).catch(() => undefined);
const rows = await cards.evaluateAll((all) => new Set(all.map((one) => Math.round(one.getBoundingClientRect().top))).size);
record(rows >= 3, `the gallery fills rows rather than one (${rows} rows of ${await cards.count()})`);
await page.getByTestId('design-gallery').locator('figure').last().scrollIntoViewIfNeeded().catch(() => undefined);
await page.waitForTimeout(1500);
record(pagesAsked.includes(1) && (await cards.count()) === 61, `scrolling to its end reads the rest (${await cards.count()}, pages ${JSON.stringify(pagesAsked)})`);
record((await page.locator('[class*="pager"], [class*="Pagination"]').count()) === 0, 'and there is no pager');
const tile = page.locator('figure[data-job-status="QUEUED"]');
record((await tile.count()) === 1 && (await tile.innerText()).includes('Queued') && (await tile.locator('svg').count()) === 1,
  `a queued picture is in the gallery, marked as queued (${(await tile.innerText().catch(() => '')).replace(/\s+/g, ' ')})`);

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
await chooseOption(page, '#image-model', '9191').catch(() => undefined);
await page.getByTestId('image-quality').waitFor({ timeout: 5_000 }).catch(() => undefined);
const fields = await page.getByTestId('editor-panel').locator('label').allInnerTexts();
record(['Prompt', 'Model', 'Quality'].every((one) => fields.includes(one)), `the panel asks for the prompt, the model and its parameters (${fields.join(', ')})`);

// Named before it is drawn, in the top bar; the name goes with the request.
await page.getByTestId('editor-name').click().catch(() => undefined);
await page.getByTestId('editor-name-input').fill('Harbour at dusk');
await page.getByTestId('editor-name-input').press('Enter');
record((await page.getByTestId('editor-name').innerText().catch(() => '')).trim() === 'Harbour at dusk', 'a new picture is named in the top bar before it is drawn');
await page.locator('#image-prompt').fill('zz a drawn lighthouse');
await chooseOption(page, '#image-quality', 'hd').catch(() => undefined);
await page.getByRole('button', { name: 'Generate' }).click().catch(() => undefined);
// Queued and answered at once: while it draws, one Orknux mark and the word Drawing, and nothing that turns up later beside it.
const waiting = page.getByTestId('editor-drawing');
await waiting.waitFor({ timeout: 3_000 }).catch(() => undefined);
const early = {
  marks: await waiting.locator('svg').count(),
  text: (await waiting.innerText().catch(() => '')).trim(),
  side: Math.round((await waiting.locator('svg').first().boundingBox().catch(() => null))?.width ?? 0),
};
record((await page.getByRole('button', { name: 'Generate' }).isEnabled()), 'Generate stays free while it draws, so more can be queued');
await page.waitForTimeout(2_500);
const late = { marks: await waiting.locator('svg').count(), text: (await waiting.innerText().catch(() => '')).trim() };
record(early.marks === 1 && early.text === 'Drawing…' && early.side >= 64 && late.marks === 1 && late.text === 'Drawing…',
  `while drawing, one large mark and "Drawing…" from the start to the end (${JSON.stringify({ early, late })})`);
await page.waitForURL(new RegExp(`/design/images/${DRAWN.id}/edit$`), { timeout: 10_000 }).catch(() => undefined);
const sent = drawRequests[0] ?? {};
record(sent.prompt === 'zz a drawn lighthouse' && sent.modelId === '9191' && sent.quality === 'hd' && sent.size === null && sent.name === 'Harbour at dusk',
  `the picture is queued for the model chosen with what was asked (${JSON.stringify(sent)})`);
record((await page.getByTestId('editor-picture').count()) === 1, 'and is on the canvas the moment it is drawn');
record(!(await page.getByTestId('editor-save').isEnabled()) && !(await page.getByTestId('editor-discard').isEnabled()),
  'kept as it is drawn: Save and Discard stay off while nothing has changed');

// Zoom: the button, then the shortcuts chosen in Preferences - Ctrl+= and Ctrl+- unless changed.
const widthNow = async () => Math.round((await page.getByTestId('editor-picture').boundingBox().catch(() => null))?.width ?? 0);
const fitted = await widthNow();
await page.getByTestId('editor-zoom-in').click();
const zoomedIn = await widthNow();
await page.locator('body').click({ position: { x: 5, y: 300 } }).catch(() => undefined);
await page.keyboard.press('Control+=');
const keyedIn = await widthNow();
await page.keyboard.press('Control+-');
await page.keyboard.press('Control+-');
const keyedOut = await widthNow();
const level = await page.getByTestId('editor-zoom').innerText();
record(zoomedIn > fitted && keyedIn > zoomedIn && keyedOut < keyedIn && /%$/.test(level),
  `zoom in and out by button and by Ctrl+= and Ctrl+- (${JSON.stringify({ fitted, zoomedIn, keyedIn, keyedOut, level })})`);
await page.getByTestId('editor-zoom').click();
record((await page.getByTestId('editor-zoom').innerText()) === 'Fit', 'and the level goes back to Fit');

// Undo takes the picture and the quality off; redo puts them back.
await page.keyboard.press('Control+z');
await page.waitForTimeout(400);
const undone = { url: page.url(), picture: await page.getByTestId('editor-picture').count() };
record(undone.url.endsWith('/design/images/new') && undone.picture === 0, `Ctrl+Z undoes the drawing (${JSON.stringify(undone)})`);
await page.getByTestId('editor-undo').click().catch(() => undefined);
await page.waitForTimeout(300);
const quality = await chosenOption(page, '#image-quality').catch(() => null);
record(quality === '', `and the undo button the quality chosen before it (${quality})`);
await page.getByTestId('editor-redo').click().catch(() => undefined);
await page.keyboard.press('Control+Shift+z');
await page.waitForTimeout(400);
record(page.url().endsWith(`/design/images/${DRAWN.id}/edit`) && (await chosenOption(page, '#image-quality').catch(() => null)) === 'hd',
  `redo puts both back (${page.url()})`);

// The top bar says what the picture is called, and clicking it renames it.
const named = page.getByTestId('editor-name');
record((await named.innerText().catch(() => '')).trim() === DRAWN.name, `the top bar shows the picture's name (${await named.innerText().catch(() => '')})`);
record((await page.getByTestId('editor-rename').count()) === 1, 'beside it a pencil that says it can be renamed');
await page.getByTestId('editor-rename').click().catch(() => undefined);
await page.getByTestId('editor-name-input').fill('Harbour light');
await page.getByTestId('editor-name-input').press('Enter');
await page.waitForTimeout(400);
record(renamed.length === 0 && (await page.getByTestId('editor-name').innerText().catch(() => '')).trim() === 'Harbour light',
  `a rename is held until Save (${JSON.stringify(renamed)})`);
await page.locator('body').click({ position: { x: 5, y: 300 } }).catch(() => undefined);
await page.keyboard.press('Control+z');
const unnamed = (await page.getByTestId('editor-name').innerText().catch(() => '')).trim();
await page.keyboard.press('Control+Shift+z');
const renamedAgain = (await page.getByTestId('editor-name').innerText().catch(() => '')).trim();
record(unnamed === DRAWN.name && renamedAgain === 'Harbour light', `and undone and redone like any change (${JSON.stringify({ unnamed, renamedAgain })})`);
record(await page.getByTestId('editor-save').isEnabled(), 'a rename turns Save on');

// Leaving with it unsaved asks first; staying keeps it.
await page.getByTestId('editor-back').click().catch(() => undefined);
const asking = page.getByRole('dialog');
await asking.waitFor({ timeout: 5_000 }).catch(() => undefined);
const askedToStay = await asking.isVisible().catch(() => false);
await asking.getByRole('button', { name: /^(Stay|Keep editing|Cancel)$/ }).first().click().catch(() => undefined);
await page.waitForTimeout(300);
record(askedToStay && page.url().endsWith(`/design/images/${DRAWN.id}/edit`), `leaving with an unsaved rename asks first (${page.url()})`);


// Save writes the name and turns itself off again.
await page.getByTestId('editor-save').click().catch(() => undefined);
await page.waitForTimeout(500);
record(renamed.includes('Harbour light') && !(await page.getByTestId('editor-save').isEnabled()),
  `Save writes the name (${JSON.stringify(renamed)})`);

// A picture already drawn opens in the editor with what it was drawn from.
await page.goto(`${BASE}/workspace/${WORKSPACE}/design/images/${DRAWN.id}`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('design-image-edit').click({ timeout: 15_000 }).catch(() => undefined);
await page.waitForURL(new RegExp(`/design/images/${DRAWN.id}/edit$`), { timeout: 10_000 }).catch(() => undefined);
await page.getByTestId('image-quality').waitFor({ timeout: 5_000 }).catch(() => undefined);
await page.waitForTimeout(500);
const carried = {
  prompt: await page.locator('#image-prompt').inputValue().catch(() => null),
  model: await chosenOption(page, '#image-model').catch(() => null),
  quality: await chosenOption(page, '#image-quality').catch(() => null),
};
record(carried.prompt === DRAWN.prompt && carried.model === '9191' && carried.quality === 'hd',
  `Open in editor fills in the prompt, model and parameters it was drawn with (${JSON.stringify(carried)})`);

// A picture still queued opens in the editor from its tile, with what it was asked with and what it waits for.
await page.goto(`${BASE}/workspace/${WORKSPACE}/design/images`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('queued-open').first().click({ timeout: 15_000 }).catch(() => undefined);
await page.waitForURL(new RegExp(`/design/images/new\?job=${WAITING.id}$`), { timeout: 10_000 }).catch(() => undefined);
await page.getByTestId('editor-drawing').waitFor({ timeout: 10_000 }).catch(() => undefined);
const opened = {
  url: page.url(),
  prompt: await page.locator('#image-prompt').inputValue().catch(() => null),
  waits: (await page.getByTestId('editor-drawing').innerText().catch(() => '')).trim(),
};
record(opened.url.endsWith(`/design/images/new?job=${WAITING.id}`) && opened.prompt === WAITING.prompt && opened.waits === 'Queued, 1 ahead…',
  `a queued picture opens in the editor, waiting there (${JSON.stringify(opened)})`);

// Remove, left of Edit, deletes the picture once confirmed and goes back to the gallery.
await page.goto(`${BASE}/workspace/${WORKSPACE}/design/images/${DRAWN.id}`, { waitUntil: 'domcontentloaded' });
const remove = page.getByTestId('design-image-remove');
await remove.waitFor({ timeout: 15_000 }).catch(() => undefined);
const removeBox = await remove.boundingBox().catch(() => null);
const editAt = await page.getByTestId('design-image-edit').boundingBox().catch(() => null);
record(removeBox !== null && editAt !== null && removeBox.x + removeBox.width <= editAt.x && Math.abs(removeBox.y - editAt.y) < 2,
  `Remove stands left of Edit (${JSON.stringify({ removeBox, editAt })})`);
const factsAt = await page.locator(`[data-design-image="${DRAWN.id}"] dl`).boundingBox().catch(() => null);
const pictureAt = await page.locator(`[data-design-image="${DRAWN.id}"] > img`).boundingBox().catch(() => null);
const detailRows = (await page.locator(`[data-design-image="${DRAWN.id}"] dt`).allInnerTexts().catch(() => [])).slice(0, 2).join(', ');
const promptRow = detailRows.split(', ')[0];
const statusAt = await page.locator(`[data-design-image="${DRAWN.id}"] [class*="focusStatus"]`).boundingBox().catch(() => null);
const statusText = (await page.locator(`[data-design-image="${DRAWN.id}"] [class*="focusStatus"]`).innerText().catch(() => '')).trim().toLowerCase();
record(statusAt !== null && pictureAt !== null && factsAt !== null && statusAt.y < pictureAt.y && factsAt.y > pictureAt.y && promptRow === 'Prompt' && statusText === DRAWN.name.toLowerCase(),
  `its name above it, what it was drawn with under it, the prompt first and labelled (${JSON.stringify({ statusText, promptRow, status: statusAt?.y, picture: pictureAt?.y, facts: factsAt?.y })})`);
await remove.click().catch(() => undefined);
await page.getByRole('dialog').getByRole('button', { name: /^(Remove|Delete)$/ }).click({ timeout: 5_000 }).catch(() => undefined);
await page.waitForURL(new RegExp(`/design/images$`), { timeout: 5_000 }).catch(() => undefined);
record(deleted.includes(DRAWN.id) && page.url().endsWith('/design/images'), `and once confirmed deletes it and goes back (${JSON.stringify({ deleted, url: page.url() })})`);

await finish(browser);
