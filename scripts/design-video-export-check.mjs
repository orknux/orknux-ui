/**
 * The video editor's Export menu: a finished video offered as GIF, MP4 and
 * MKV, each converted on the server first and then downloaded from the
 * address the server answered, under the name it gave, and a refusal said
 * under the button rather than arriving as a broken file.
 *
 * What is measured is what is drawn and what is asked for: the button is on
 * the toolbar after Download and as tall as it, the menu holds exactly the
 * three formats in order, one line each, each with its hint on hover; the
 * button reads Exporting… and is held while the server converts; a click asks
 * the server for that format by name, and the download that follows is of
 * the address and the filename the server answered - not ones the page made
 * up - and a video still being made has no Export at all.
 *
 * The video and the export are answered here, so it needs no video model. A
 * download is Chromium's own request and is not answered by a route, so what
 * the file holds is not this check's to say: the conversion itself - the
 * GIF's own palette, the sound an MP4 and an MKV keep, the download's name
 * and headers - is DesignVideoExportTest, on both engines.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 900 }, context: { acceptDownloads: true } });

const video = (overrides) => ({
  id: '4141', status: 'DONE', name: 'A boat', prompt: 'a paper boat on a pond', modelId: null, model: 'Wan', seconds: null, size: null,
  frames: 33, fps: 16, width: 832, height: 480, seed: null, startImageId: null, startImageUrl: null, requestedBy: 'alice',
  requestedAt: new Date().toISOString(), startedAt: null, finishedAt: null, reason: null, progress: 100, ahead: null,
  progressSamplingOnly: false, asOf: new Date().toISOString(),
  url: '/api/design-videos/4141', posterUrl: null, contentType: 'video/webm', sizeBytes: 1, durationSeconds: 2.06,
  versionOf: null, upscaledFrom: null, upscaler: null, scale: null, framesDone: null, framesTotal: null, ...overrides,
});

/** What the server answers for each format: an address and a name only it could have chosen. */
const ANSWERS = {
  GIF: { url: '/api/design-videos/4141/export/gif?as=answered', filename: 'paper-boat.gif', contentType: 'image/gif' },
  MP4: { url: '/api/design-videos/4141/export/mp4?as=answered', filename: 'paper-boat.mp4', contentType: 'video/mp4' },
  MKV: { url: '/api/design-videos/4141/export/mkv?as=answered', filename: 'paper-boat.mkv', contentType: 'video/x-matroska' },
};
/** The formats the page asked the server for, in order. */
const asked = [];
/** Held until let go, so the check can see the button while the server converts. */
let release = () => {};
let holding = false;
/** Answered with a refusal instead, for the half that says one is shown. */
let refuse = false;
let status = 'DONE';

await page.route('**/api/design-videos/4141', (route) => route.fulfill({ status: 200, contentType: 'video/webm', body: Buffer.alloc(0) }));
await page.route('**/graphql', async (route) => {
  const body = route.request().postDataJSON() ?? {};
  const query = body.query ?? '';
  if (query.includes('exportDesignVideo')) {
    const format = body.variables?.format;
    asked.push(format);
    if (holding) await new Promise((resolve) => (release = resolve));
    if (refuse) {
      return route.fulfill({
        json: {
          data: null,
          errors: [{
            message: 'The export came to more than the 200 MB an export may be.',
            extensions: { classification: 'BAD_REQUEST', code: 'DesignVideoExportTooLarge', arguments: { most: 200 } },
          }],
        },
      });
    }
    return route.fulfill({ json: { data: { exportDesignVideo: { ...ANSWERS[format], sizeBytes: 1234 } } } });
  }
  if (query.includes('designVideo(')) return route.fulfill({ json: { data: { designVideo: video({ status, url: status === 'DONE' ? '/api/design-videos/4141' : null }) } } });
  if (query.includes('designVideoSettings')) return route.fulfill({ json: { data: { designVideoSettings: { reason: null, settings: [] } } } });
  return route.continue();
});

await page.goto(`${BASE}/workspace/${WORKSPACE}/design/videos/4141`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('video-download').waitFor({ timeout: 20_000 }).catch(() => undefined);

// -- On the toolbar, after Download, as tall as it --------------------------

const button = page.getByTestId('video-export');
await button.waitFor({ timeout: 10_000 }).catch(() => undefined);
const there = (await button.count()) === 1;
record(there, 'a finished video has Export on its toolbar');
const exportBox = there ? await button.boundingBox() : null;
const downloadBox = await page.getByTestId('video-download').boundingBox().catch(() => null);
record(
  exportBox !== null && downloadBox !== null && Math.abs(exportBox.height - downloadBox.height) <= 1 && Math.abs(exportBox.y - downloadBox.y) <= 1,
  `Export stands as tall as Download and in line with it (${exportBox?.height} at ${exportBox?.y}, ${downloadBox?.height} at ${downloadBox?.y})`,
);
record(exportBox !== null && downloadBox !== null && exportBox.x > downloadBox.x, `Export is after Download on the bar (${exportBox?.x} after ${downloadBox?.x})`);
record(
  there && (await page.getByTestId('video-toolbar').locator('[data-testid="video-export"]').count()) === 1,
  "Export is in the video editor's toolbar",
);

// -- The menu: three formats, one line each, each with its hint --------------

/** Opens the menu where it is not open already: the button toggles it. */
async function menuOpen() {
  if ((await page.getByTestId('video-export-menu').count()) === 0) await button.click({ timeout: 10_000 }).catch(() => undefined);
  await page.getByTestId('video-export-menu').waitFor({ timeout: 10_000 }).catch(() => undefined);
}

await menuOpen();
const items = page.getByTestId('video-export-menu').getByRole('menuitem');
const offered = (await items.allInnerTexts().catch(() => [])).map((one) => one.trim());
record(JSON.stringify(offered) === JSON.stringify(['GIF', 'MP4', 'MKV']), `Export offers GIF, MP4 and MKV (${JSON.stringify(offered)})`);
const rows = await items.evaluateAll((all) => all.map((one) => {
  const style = getComputedStyle(one);
  const line = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.4;
  return { lines: Math.round((one.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)) / line), hint: one.title };
})).catch(() => []);
record(rows.length === 3 && rows.every((one) => one.lines === 1), `each format is one line (${JSON.stringify(rows.map((one) => one.lines))})`);
record(rows.length === 3 && rows.every((one) => one.hint.trim().length > 0), `each format says what it is on hover (${JSON.stringify(rows.map((one) => one.hint))})`);

// -- Each format: asked of the server, then downloaded from where it said ----

/** Clicks one format and answers the download it caused - its address and its name - or null. */
async function exportAs(format) {
  await menuOpen();
  const [arrived] = await Promise.all([
    page.waitForEvent('download', { timeout: 20_000 }).catch(() => null),
    page.getByTestId(`video-export-${format.toLowerCase()}`).click({ timeout: 10_000 }).catch(() => undefined),
  ]);
  if (arrived === null) return null;
  const url = new URL(arrived.url());
  const file = arrived.suggestedFilename();
  await arrived.cancel().catch(() => undefined);
  return { address: `${url.pathname}${url.search}`, file };
}

/** Whether a download is of what the server answered for [format]. */
const answered = (format, got) => got !== null && got.address === ANSWERS[format].url && got.file === ANSWERS[format].filename;

// GIF first, held at the server, to see the button while it converts.
holding = true;
const gifArrived = exportAs('GIF');
await page.waitForFunction(() => document.querySelector('[data-testid="video-export"]')?.getAttribute('aria-busy') === 'true', null, { timeout: 10_000 }).catch(() => undefined);
const whileBusy = {
  words: (await button.innerText().catch(() => '')).trim(),
  disabled: await button.isDisabled().catch(() => false),
  menu: await page.getByTestId('video-export-menu').count(),
};
record(
  whileBusy.words === 'Exporting…' && whileBusy.disabled && whileBusy.menu === 0,
  `while the server converts, the button reads Exporting… and is held (${JSON.stringify(whileBusy)})`,
);
holding = false;
release();
const gif = await gifArrived;
record(answered('GIF', gif), `GIF downloads what the server answered (${JSON.stringify(gif)})`);
await page.waitForFunction(() => document.querySelector('[data-testid="video-export"]')?.getAttribute('aria-busy') !== 'true', null, { timeout: 10_000 }).catch(() => undefined);
record((await button.innerText().catch(() => '')).trim() === 'Export ▾', 'the button reads Export again once the file is on its way');

const mp4 = await exportAs('MP4');
record(answered('MP4', mp4), `MP4 downloads what the server answered (${JSON.stringify(mp4)})`);
const mkv = await exportAs('MKV');
record(answered('MKV', mkv), `MKV downloads what the server answered (${JSON.stringify(mkv)})`);
record(JSON.stringify(asked) === JSON.stringify(['GIF', 'MP4', 'MKV']), `each format was asked of the server by its name (${JSON.stringify(asked)})`);

// -- A refusal is said under the button, on one line -------------------------

refuse = true;
await menuOpen();
const [refusedDownload] = await Promise.all([
  page.waitForEvent('download', { timeout: 3_000 }).catch(() => null),
  page.getByTestId('video-export-mp4').click({ timeout: 10_000 }).catch(() => undefined),
]);
const error = page.getByTestId('video-export-error');
await error.waitFor({ timeout: 10_000 }).catch(() => undefined);
const said = (await error.innerText().catch(() => '')).trim();
const errorBox = await error.boundingBox().catch(() => null);
const errorLine = await error.evaluate((one) => parseFloat(getComputedStyle(one).lineHeight) || parseFloat(getComputedStyle(one).fontSize) * 1.4).catch(() => 0);
record(refusedDownload === null, 'a refused export downloads nothing');
record(said === 'The export came to more than the 200 MB an export may be.', `the refusal is said under the button (${said})`);
record(
  errorBox !== null && exportBox !== null && errorBox.y >= exportBox.y + exportBox.height && errorBox.height <= errorLine * 1.5 + 16,
  `below the button, on one line (${errorBox?.y} under ${exportBox ? exportBox.y + exportBox.height : null}, ${errorBox?.height} tall)`,
);
refuse = false;

// -- A video still being made has no Export ----------------------------------

status = 'GENERATING';
await page.goto(`${BASE}/workspace/${WORKSPACE}/design/videos/4141`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('video-making').waitFor({ timeout: 20_000 }).catch(() => undefined);
record((await page.getByTestId('video-making').count()) === 1 && (await page.getByTestId('video-export').count()) === 0, 'a video being made offers no Export');

await finish(browser);
