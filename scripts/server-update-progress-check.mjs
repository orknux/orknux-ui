/**
 * Admin -> Updates: an update downloads in the background and the page shows
 * how far it has got. Issue #602.
 *
 * Reported: an update from the official server ended in a bare "Failed to
 * fetch". The download, the check and the store all ran inside one request, so
 * whatever sat in front of the server and cut long requests cut the update,
 * and the browser was left with its own words for a dropped connection. Now the
 * server answers at once and writes where the download stands; the page polls
 * it. What is measured here is what an administrator reads off the screen:
 *
 * - the bar is as long as the bytes say - its fill's width over the track's,
 *   read with getBoundingClientRect, against received over total - and moves
 *   when they do; the bytes of total and the speed are printed beside it;
 * - a broken connection says it is going on from what it holds;
 * - the steps after it - verifying, storing - are each marked current in turn,
 *   and a failure is a sentence on the screen, at the step it failed at;
 * - a request the network drops is a sentence, never "Failed to fetch";
 * - restarting waits for the server to go and come back, reloads the page, and
 *   the page says it is back on the version it went for.
 *
 * The release source is the page's own answers: no installation a check runs
 * against has an official server offering a newer signed jar, and a restart
 * needs a container to leave. The server's half - resuming with Range, giving
 * up, the row these answers imitate - is ServerReleaseDownloadResumeTest.
 */
import { BASE, open, record, finish, shot } from './suite/harness.mjs';

const MB = 1024 * 1024;
const VERSION = '9.9.9.9';
const { browser, page, graphql } = await open({ viewport: { width: 1400, height: 1000 } });

const running = (await graphql('query { serverUpdates { runningVersion } }')).serverUpdates.runningVersion;

/** The download the server would report; the check moves it along. */
let current = null;
/** How the install mutation is answered: as the server would, or as a dropped connection. */
let dropInstall = false;
/** Calls to the restart probe the check answers as a server that is away. */
let away = 0;

function row(fields) {
  return {
    id: '1',
    source: 'ORKNUX_AI',
    version: VERSION,
    host: 'orknux.ai',
    state: 'DOWNLOADING',
    received: 0,
    total: 400 * MB,
    bytesPerSecond: 0,
    attempts: 1,
    resumed: 0,
    failedInRow: 0,
    nextAttemptAt: null,
    lastError: null,
    activate: true,
    releaseId: null,
    failure: null,
    startedAt: '2026-10-04T10:00:00Z',
    finishedAt: null,
    ...fields,
  };
}

await page.route('**/graphql', async (route) => {
  const body = route.request().postData() ?? '';
  if (body.includes('query ServerUpdates')) {
    const response = await route.fetch();
    const json = await response.json();
    const updates = json?.data?.serverUpdates;
    if (updates) {
      Object.assign(updates, {
        enabled: true,
        restartable: true,
        officialEnabled: true,
        offered: true,
        offeredError: null,
        pin: null,
        pinRefusal: null,
        available: [{ version: VERSION, publishedAt: '2026-10-04T00:00:00Z', changelog: '', size: 400 * MB, stored: false }],
      });
    }
    return route.fulfill({ response, json });
  }
  if (body.includes('mutation Install')) {
    if (dropInstall) return route.abort('failed');
    current = row({});
    return route.fulfill({ json: { data: { installServerRelease: current } } });
  }
  if (body.includes('query ServerReleaseDownload')) {
    return route.fulfill({ json: { data: { serverReleaseDownload: current } } });
  }
  if (body.includes('mutation Dismiss')) {
    current = null;
    return route.fulfill({ json: { data: { dismissServerReleaseDownload: true } } });
  }
  return route.continue();
});
await page.route('**/api/auth/method', async (route) => {
  if (away > 0) {
    away -= 1;
    return route.abort('failed');
  }
  return route.continue();
});

const panel = page.getByTestId('release-download');

/** Waits until [test] holds, polling; false if it never does. */
async function until(test, ms = 10_000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await test().catch(() => false)) return true;
    await page.waitForTimeout(150);
  }
  return false;
}

/** The fill's share of the track, as drawn. */
async function drawnShare() {
  const track = await page.getByTestId('download-bar').boundingBox({ timeout: 500 }).catch(() => null);
  const fill = await page.getByTestId('download-fill').boundingBox({ timeout: 500 }).catch(() => null);
  if (track === null || fill === null || track.width === 0) return null;
  return fill.width / track.width;
}

async function stepState(step) {
  return page
    .locator(`[data-testid="download-steps"] [data-step="${step}"]`)
    .getAttribute('data-state', { timeout: 500 })
    .catch(() => null);
}

async function pressUpdate() {
  await page.getByTestId('offered-release').first().getByRole('button', { name: 'Update', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Update', exact: true }).click();
}

await page.goto(`${BASE}/admin/updates`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('offered-release').first().waitFor({ timeout: 20_000 });

// ---- a dropped request is a sentence ----------------------------------------
dropInstall = true;
await pressUpdate();
const refusal = page.getByRole('dialog').getByRole('alert');
const refused = await refusal
  .waitFor({ state: 'visible', timeout: 10_000 })
  .then(() => true)
  .catch(() => false);
const refusalText = refused ? ((await refusal.textContent()) ?? '') : '';
record(refused, 'a request the network drops is reported in the dialog');
record(!/failed to fetch/i.test(refusalText), `and not as the browser's "Failed to fetch": "${refusalText}"`);
record(/could not be reached/.test(refusalText), 'but as a sentence saying the server could not be reached');
await page.keyboard.press('Escape');
dropInstall = false;

// ---- pressing Update answers at once, and the bar follows the bytes ----------
await pressUpdate();
record(await until(() => panel.isVisible()), 'pressing Update shows the download at once, without waiting for it');
current = row({ received: 100 * MB, bytesPerSecond: 5 * MB });
const quarter = await until(async () => Math.abs((await drawnShare()) - 0.25) < 0.01);
record(quarter, `a quarter received draws a quarter of the bar (${(await drawnShare())?.toFixed(3)})`);
const progress = page.getByTestId('download-progress');
const said = (await progress.textContent().catch(() => '')) ?? '';
record(said.includes('100.0 MB of 400.0 MB'), `the bytes of total are printed: "${said}"`);
record(said.includes('5.0 MB/s'), 'and the speed');
record((await stepState('download')) === 'current', 'downloading is the current step');

current = row({ received: 300 * MB, bytesPerSecond: 6 * MB, attempts: 2, resumed: 1 });
const threeQuarters = await until(async () => Math.abs((await drawnShare()) - 0.75) < 0.01);
record(threeQuarters, `and the bar moves with them: three quarters drawn (${(await drawnShare())?.toFixed(3)})`);

current = row({
  state: 'WAITING',
  received: 300 * MB,
  failedInRow: 1,
  lastError: 'the connection closed before the whole jar had arrived',
  nextAttemptAt: '2026-10-04T10:05:00Z',
});
const waiting = page.getByTestId('download-waiting');
record(await until(() => waiting.isVisible()), 'a broken connection is said, not hidden');
const waitingText = (await waiting.textContent().catch(() => '')) ?? '';
record(waitingText.includes('300.0 MB'), `and it goes on from what it holds: "${waitingText}"`);

// ---- the steps after the download ------------------------------------------
current = row({ state: 'VERIFYING', received: 400 * MB });
record(await until(async () => (await stepState('verify')) === 'current'), 'verifying becomes the current step');
record((await stepState('download')) === 'done', 'with downloading marked done');
record((await page.getByTestId('download-bar').count()) === 0, 'and the bar gone with it');
current = row({ state: 'STORING', received: 400 * MB });
record(await until(async () => (await stepState('store')) === 'current'), 'then storing');

const why = `The download of ${VERSION} does not match what orknux.ai listed for it; nothing was stored.`;
current = row({ state: 'FAILED', received: 400 * MB, failure: why, finishedAt: '2026-10-04T10:06:00Z' });
const failure = page.getByTestId('download-failure');
record(await until(() => failure.isVisible()), 'a failed update says so on the screen');
record(((await failure.textContent().catch(() => '')) ?? '') === why, 'in the reason the server gave');
const failedBox = await failure.boundingBox({ timeout: 500 }).catch(() => null);
record(failedBox !== null && failedBox.height > 0 && failedBox.width > 0, 'drawn where it can be read');
record((await stepState('verify')) === 'failed', 'at the step it failed at');
await page.screenshot({ path: shot('server-update-failed.png'), fullPage: true });

await page.getByTestId('download-dismiss').click({ timeout: 5000 }).catch(() => undefined);
record(await until(async () => (await panel.count()) === 0), 'and it can be put away');

// ---- restarting, and back -----------------------------------------------------
await pressUpdate();
await until(() => panel.isVisible());
current = row({ state: 'RESTARTING', version: running, received: 400 * MB, releaseId: '7' });
away = 2;
await page.evaluate(() => {
  window.__beforeRestart = true;
});
record(await until(async () => (await stepState('restart')) === 'current'), 'restarting becomes the current step');
record(await until(() => page.getByTestId('restarting').isVisible()), 'and the page says it reloads once the server answers');
// The server that came back settled the row.
current = row({ state: 'DONE', version: running, received: 400 * MB, releaseId: '7', finishedAt: '2026-10-04T10:08:00Z' });
const reloaded = await until(async () => (await page.evaluate(() => window.__beforeRestart === undefined)), 30_000);
record(reloaded, 'the page reloads itself when the server is back');
const done = page.getByTestId('download-done');
record(await until(() => done.isVisible(), 20_000), 'and says how it ended');
record(((await done.textContent().catch(() => '')) ?? '').includes(`Back on ${running}`), `back on ${running}`);
record((await stepState('end')) === 'done', 'with every step done');
await page.screenshot({ path: shot('server-update-back.png'), fullPage: true });

await finish(browser);
