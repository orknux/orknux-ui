/**
 * A picture in the manual opens larger when it is clicked.
 *
 * Issue #217. The manual is forty-six screenshots of this application, drawn
 * into a column some seven hundred pixels wide - so a picture of a screen 1440
 * across arrives at about half size, and the field names it was taken to show
 * are unreadable. There was nothing to do about it but open the file in a tab
 * by hand, which loses the page the picture was explaining.
 *
 * What is measured is the size, because that is the whole request. The picture
 * on the page is measured, clicked, and the picture in the viewer is measured:
 * a viewer that opens and draws the same 700px picture has not zoomed anything.
 * The alt text is asserted to travel with it, since that sentence is the
 * caption saying what is being looked at, and Escape is asserted to close it -
 * a `<dialog>` gives that for free, and a div over the page does not.
 */
import { BASE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 1000 } });

await page.goto(`${BASE}/docs/workflows`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('article img, main img[src*="/screens/"]', { timeout: 20_000 });

/** The first screenshot in the prose, which is the editor. */
const inline = page.locator('img[src*="/screens/"]').first();
await inline.scrollIntoViewIfNeeded();

/*
 * Waited on until the bytes are there, not until the element is. An `<img>`
 * that has not decoded yet has no intrinsic size and therefore no width, so
 * every measurement below would be taken against a zero-wide picture and would
 * read exactly like the layout being broken.
 */
await page
  .waitForFunction(
    () => {
      const image = document.querySelector('img[src*="/screens/"]');
      return image !== null && image.complete && image.naturalWidth > 0;
    },
    { timeout: 20_000 },
  )
  .catch(() => record(false, 'the first screenshot loaded'));

/*
 * And then waited on until the box it occupies is a real one.
 *
 * Decoded is not the same as laid out: the wait above asks the *image* whether
 * it has bytes, and CI measured a picture that had them and still occupied
 * nothing - a stylesheet a moment behind, a section not yet open. Every
 * measurement below is against this box, so a zero here reads as the layout
 * being broken when it is the reading that was early.
 */
const boxed = async () => {
  const until = Date.now() + 20_000;
  for (;;) {
    const box = await inline.boundingBox();
    if ((box?.width ?? 0) > 0 || Date.now() > until) return box;
    await page.waitForTimeout(250);
  }
};

const onPage = await boxed();
record(onPage !== null && onPage.width > 0, `the manual draws a screenshot (${Math.round(onPage?.width ?? 0)}px wide)`);

const alt = (await inline.getAttribute('alt')) ?? '';
record(alt.trim() !== '', 'the screenshot says what it is');

/*
 * It has to look like something that can be pressed before anybody presses it.
 * A picture that opens on click and gives no sign of it is a feature nobody
 * finds.
 *
 * Queried inside the page each time rather than through the handle taken above,
 * and read twice if the first answer is empty. `getComputedStyle` on an element
 * that has just been replaced answers with nothing at all - the manual is nine
 * documents of markdown and re-renders as it is scrolled and searched - and an
 * empty answer read once reported a missing cursor on a page that had one. It
 * failed exactly once, against the built image, and passed on the same code in
 * development three times before that.
 */
async function cursorOverThePicture() {
  return page.evaluate(() => {
    const image = document.querySelector('img[src*="/screens/"]');
    const clickable = image?.closest('button, [role="button"]') ?? image;
    return clickable == null ? '' : getComputedStyle(clickable).cursor;
  });
}

let pointer = await cursorOverThePicture();
if (pointer === '') {
  await page.waitForTimeout(400);
  pointer = await cursorOverThePicture();
}
record(pointer === 'pointer' || pointer === 'zoom-in', `the picture says it can be opened (cursor: ${pointer})`);

await inline.click();
await page.waitForTimeout(500);

const openDialog = await page.evaluate(() => document.querySelector('dialog[open]') !== null);
record(openDialog, 'clicking it opens a viewer over the page');

const zoomed = page.locator('dialog[open] img').first();
const shown = (await zoomed.count()) > 0 ? await zoomed.boundingBox() : null;
record(shown !== null, 'the viewer holds the picture');

record(
  shown !== null && onPage !== null && shown.width > onPage.width * 1.3,
  `the picture is bigger than it was on the page (${Math.round(onPage?.width ?? 0)}px → ${Math.round(shown?.width ?? 0)}px)`,
);

const sameFile = (await zoomed.count()) > 0 ? ((await zoomed.getAttribute('src')) ?? '') : '';
const wanted = (await inline.getAttribute('src')) ?? 'x';
record(sameFile === wanted, 'it is the picture that was clicked');

/*
 * The way out sits on the picture's own corner. Reported: it sat in the
 * window's corner, which on a wide screen was a long way from the picture.
 */
// Measured on a wide screen, where a window corner is far from a picture fitted to the height.
const narrow = page.viewportSize();
await page.setViewportSize({ width: 2400, height: 900 });
await page.waitForTimeout(300);
const wide = (await zoomed.count()) > 0 ? await zoomed.boundingBox() : null;
const closeBox = openDialog
  ? await page.locator('dialog[open] button[aria-label="Close"]').first().boundingBox()
  : null;
const fromCorner = wide !== null && closeBox !== null
  ? Math.hypot(wide.x + wide.width - (closeBox.x + closeBox.width), wide.y - (closeBox.y + closeBox.height))
  : Infinity;
// Outside the picture, covering none of it: wholly above its top edge.
record(wide !== null && closeBox !== null && closeBox.y + closeBox.height <= wide.y + 1, 'the close button sits outside the picture, above it');
if (narrow !== null) await page.setViewportSize(narrow);
record(fromCorner <= 32, `the close button is at the picture's top right corner (${Math.round(fromCorner)}px away)`);

const caption = openDialog
  ? (await page.locator('dialog[open]').first().innerText()).replace(/\s+/g, ' ')
  : '';
record(caption.includes(alt.split(':')[0].slice(0, 20)), 'the viewer says which picture this is');


/*
 * Zoom, pan and Save. A diagram fitted to the window had labels too small to
 * read and no way in but saving it elsewhere - and the desktop app had no Save
 * at all. The wheel zooms about the pointer, a drag moves it, the percentage
 * puts it back, and Save is a link to the picture's own file.
 */
if (openDialog) {
  const picture = page.locator('dialog[open] img').first();
  const before = await picture.boundingBox();
  const level = page.locator('dialog[open] [data-zoom-level]');
  record((await level.innerText()) === '100%', `it opens fitted (${await level.innerText()})`);
  await page.locator('dialog[open] [data-zoom-in]').click();
  await page.locator('dialog[open] [data-zoom-in]').click();
  const bigger = await picture.boundingBox();
  record(bigger !== null && before !== null && bigger.width > before.width * 1.4, `+ enlarges it (${Math.round(before?.width ?? 0)} -> ${Math.round(bigger?.width ?? 0)}px, ${await level.innerText()})`);
  // Enlarged, it spreads past the box it was fitted to - across the viewer, not cropped to that box - and the controls stay on top.
  const spread = await page.evaluate(() => {
    const window = document.querySelector('dialog[open] [data-zoom-window]');
    const shown = window?.querySelector('img');
    if (!window || !shown) return null;
    const box = window.getBoundingClientRect();
    const picture = shown.getBoundingClientRect();
    const plus = [...document.querySelectorAll('dialog[open] button')].find((one) => one.getAttribute('aria-label') === 'Zoom in');
    const p = plus?.getBoundingClientRect();
    const onTop = p ? document.elementFromPoint(p.left + p.width / 2, p.top + p.height / 2) : null;
    return { overflow: getComputedStyle(window).overflow, beyond: picture.width > box.width + 1, controlsOnTop: onTop !== null && plus !== undefined && plus.contains(onTop) };
  });
  record(spread !== null && spread.overflow === 'visible' && spread.beyond && spread.controlsOnTop,
    `the enlarged picture uses the viewer rather than being cropped to its fitted box, under the controls (${JSON.stringify(spread)})`);
  // Dragged, it moves.
  const centre = { x: (before?.x ?? 0) + (before?.width ?? 0) / 2, y: (before?.y ?? 0) + (before?.height ?? 0) / 2 };
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.down();
  await page.mouse.move(centre.x + 80, centre.y + 40, { steps: 5 });
  await page.mouse.up();
  const moved = await picture.boundingBox();
  record(moved !== null && bigger !== null && Math.round(moved.x - bigger.x) === 80, `a drag moves it (${Math.round((moved?.x ?? 0) - (bigger?.x ?? 0))}px)`);
  record(await page.evaluate(() => document.querySelector('dialog[open]') !== null), 'and does not close the viewer');
  // The wheel zooms too; the percentage puts it back.
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.wheel(0, -200);
  await page.waitForTimeout(150);
  record((await level.innerText()) !== '156%', `the wheel zooms (${await level.innerText()})`);
  await level.click();
  await page.waitForTimeout(150);
  const back = await picture.boundingBox();
  record((await level.innerText()) === '100%' && back !== null && before !== null && Math.abs(back.width - before.width) < 1 && Math.abs(back.x - before.x) < 1, `the percentage fits it again (${await level.innerText()})`);
  // Save: a link to the picture's own file, offered as a download.
  const save = page.locator('dialog[open] [data-picture-save]');
  const href = await save.getAttribute('href');
  const named = await save.getAttribute('download');
  record(href === (await picture.getAttribute('src')) && /\.png$/i.test(named ?? ''), `Save downloads the picture as ${named}`);
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 5_000 }).catch(() => null), save.click()]);
  record(download !== null && download.suggestedFilename() === named, `and a click saves it (${download?.suggestedFilename()})`);
}
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
record(
  await page.evaluate(() => document.querySelector('dialog[open]') === null),
  'Escape puts it away again',
);

/*
 * And the light theme, which is where the same forty-six pictures were being
 * put through `brightness(0.42)` - the rule that keeps the stroked icon files
 * readable on white, matched against `img` itself. A manual illustrated with
 * screenshots taken at dusk is what the zoom would otherwise have opened
 * larger, so it is measured here rather than left to somebody's eye.
 */
await page.evaluate(() => window.localStorage.setItem('orknux.theme', 'light'));
await page.goto(`${BASE}/docs/workflows`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('img[src*="/screens/"]', { timeout: 20_000 });

const inLight = await page.evaluate(() => ({
  theme: document.documentElement.getAttribute('data-theme'),
  filter: getComputedStyle(document.querySelector('img[src*="/screens/"]')).filter,
}));
record(inLight.theme === 'light', 'the light theme is the one being read');
record(inLight.filter === 'none', `a screenshot keeps its own colours on white (filter: ${inLight.filter})`);
await page.evaluate(() => window.localStorage.setItem('orknux.theme', 'dark'));

await finish(browser);
