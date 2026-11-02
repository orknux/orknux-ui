/**
 * Admin -> Updates, in the desktop app: a newer package of the app itself is
 * found, downloaded and installed from the page - the way a graphics driver's
 * own manager does it - and a release that is not what runs says why in words
 * that are true.
 *
 * Two things were reported. The desktop app offered no way to a newer package
 * at all; and after going back to an older release from the official list, the
 * page titled it "Updating to 1.2.5" on a server at 1.2.9 and then said the
 * server "was not started by the image" - on a desktop app whose server it had
 * just restarted. What is measured is what is read off the screen:
 *
 * - in the app, the panel asks for a newer package on arriving; one found is
 *   offered with its version, pressing it downloads, the bar is as long as the
 *   bytes say (read with getBoundingClientRect), and installing says Orknux
 *   closes and opens again; an install that cannot update itself says why;
 * - in a browser there is no such panel;
 * - an older release is "Going back to", not "Updating to";
 * - a chosen release the server did not come back on says the release's own
 *   reason, and "not started by the image" only where there is no start loop.
 *
 * The app is the page's own `orknuxDesktop` - its states pushed from here - so
 * nothing is downloaded or installed; desktop/test/package-update.test.js is
 * the app's half. The download row and the server's answers are the page's own
 * too, as in server-update-progress-check.
 */
import { BASE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1400, height: 1000 } });
const running = (await graphql('query { serverUpdates { runningVersion } }')).serverUpdates.runningVersion;

/** Waits until [test] holds, polling; false if it never does. */
async function until(test, ms = 10_000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await test().catch(() => false)) return true;
    await page.waitForTimeout(150);
  }
  return false;
}

const text = async (testId) => (await page.getByTestId(testId).textContent({ timeout: 500 }).catch(() => '')) ?? '';

// ---- in a browser, nothing --------------------------------------------------
await page.goto(`${BASE}/admin/updates`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('running-version').waitFor({ timeout: 20_000 });
record((await page.getByTestId('app-package').count()) === 0, 'a browser has no app to update, and draws no panel for one');
record(/the image's own jar/.test(await text('running-version')), 'and the server is still the image\'s');

// ---- in the app -------------------------------------------------------------
const STATE = {
  phase: 'idle', current: '1.3.0', version: null, notes: null, releasedAt: null,
  percent: 0, transferred: 0, total: 0, bytesPerSecond: 0, error: null, reason: null,
};
await page.addInitScript((initial) => {
  let state = initial;
  const listeners = new Set();
  window.__appCalls = [];
  window.__pushPackageState = (next) => {
    state = { ...state, ...next };
    listeners.forEach((listener) => listener(state));
  };
  window.orknuxDesktop = {
    tabShortcuts() {},
    windowShortcuts() {},
    recordingKeys() {},
    connectedServer: () => null,
    disconnect() {},
    packageUpdate: {
      state: () => state,
      check: () => window.__appCalls.push('check'),
      install: () => window.__appCalls.push('install'),
      onState: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
  };
}, STATE);

const calls = () => page.evaluate(() => window.__appCalls);
const push = (next) => page.evaluate((given) => window.__pushPackageState(given), next);

await page.goto(`${BASE}/admin/updates`, { waitUntil: 'domcontentloaded' });
const panel = page.getByTestId('app-package');
record(await until(() => panel.isVisible()), 'the app draws a panel for its own package');
record((await calls()).includes('check'), 'and asks for a newer one on arriving');
record(/This app: Orknux 1\.3\.0/.test((await panel.textContent()) ?? ''), 'naming the version the app is');
record(/the jar this app came with/.test(await text('running-version')), 'the server is the jar the app came with, not "the image\'s"');

await push({ phase: 'none' });
record(
  await until(async () => (await text('app-package-current')) === 'orknux.ai offers no desktop package yet.'),
  'nothing offered yet is said plainly, not as a failure',
);
record((await panel.getByRole('alert').count()) === 0, 'and drawn as no alert');

await push({ phase: 'available', version: '1.3.1', notes: 'Faster starts.' });
const install = page.getByTestId('app-package-install');
record(await until(() => install.isVisible()), 'a newer package is offered');
record(((await install.textContent()) ?? '').includes('1.3.1'), 'by its version');
record(/closes Orknux, installs the new package and opens it again/.test(await text('app-package-available')), 'saying what installing it does');
await install.click();
record(await until(async () => (await calls()).includes('install')), 'one press asks the app to download and install it');

await push({ phase: 'downloading', percent: 25, transferred: 50 * 1024 * 1024, total: 200 * 1024 * 1024, bytesPerSecond: 4 * 1024 * 1024 });
const share = async () => {
  const track = await panel.getByRole('progressbar').boundingBox({ timeout: 500 }).catch(() => null);
  const fill = await panel.locator('[role="progressbar"] > div').boundingBox({ timeout: 500 }).catch(() => null);
  return track === null || fill === null || track.width === 0 ? null : fill.width / track.width;
};
record(await until(async () => Math.abs((await share()) - 0.25) < 0.01), `a quarter downloaded draws a quarter of the bar (${(await share())?.toFixed(3)})`);
record(((await panel.textContent()) ?? '').includes('50.0 MB of 200.0 MB'), 'with the bytes of total beside it');

await push({ phase: 'installing', percent: 100 });
record(await until(async () => /closes now, installs it and opens again/.test(await text('app-package-installing'))), 'once downloaded, it says Orknux closes, installs and opens again');

await push({ phase: 'unavailable', reason: 'This Orknux was installed from the MSI, which cannot update itself: install the newer MSI from orknux.ai.' });
record(await until(async () => /installed from the MSI/.test(await text('app-package-unavailable'))), 'an install that cannot update itself says why');

// ---- the desktop app updates as a package, never by swapping its jar --------
await page.route('**/graphql', async (route) => {
  const body = route.request().postData() ?? '';
  if (body.includes('query ServerUpdates')) {
    const response = await route.fetch();
    const json = await response.json();
    const updates = json?.data?.serverUpdates;
    // What a desktop server answers: ORKNUX_SELF_UPDATE is false, so the lists are empty.
    if (updates) Object.assign(updates, { enabled: false, available: [], stored: [] });
    return route.fulfill({ response, json });
  }
  if (body.includes('query ServerReleaseDownload')) {
    // A jar download left from before, which a desktop app is not to be shown.
    return route.fulfill({ json: { data: { serverReleaseDownload: {
      id: '9', source: 'ORKNUX_AI', version: '1.2.5', host: 'orknux.ai', state: 'DONE', received: 1, total: 1,
      bytesPerSecond: 0, attempts: 1, resumed: 0, failedInRow: 0, nextAttemptAt: null, lastError: null,
      activate: true, releaseId: '5', failure: null, startedAt: '2026-10-28T10:00:00Z', finishedAt: '2026-10-28T10:01:00Z',
    } } } });
  }
  return route.continue();
});
await page.goto(`${BASE}/admin/updates`, { waitUntil: 'domcontentloaded' });
record(await until(() => panel.isVisible()), 'with jar updates off, the app panel is still there');
await page.waitForTimeout(1500);
record((await page.getByText('From official server').count()) === 0, 'and no official jar list');
record((await page.getByText('Upload a jar').count()) === 0, 'no jar to upload');
record((await page.getByText('From a URL').count()) === 0, 'no jar from a URL');
record((await page.getByText(/Kept in the database/).count()) === 0, 'no kept releases');
record((await page.getByTestId('release-download').count()) === 0, 'no jar download left from before');
record((await page.getByTestId('updates-disabled').count()) === 0, 'and no line saying updates are turned off');
await page.unroute('**/graphql');

// ---- a release that is not what runs ----------------------------------------
let restartable = true;
const OLDER = '1.0.0';
const download = {
  id: '1', source: 'ORKNUX_AI', version: OLDER, host: 'orknux.ai', state: 'DONE',
  received: 1, total: 1, bytesPerSecond: 0, attempts: 1, resumed: 0, failedInRow: 0,
  nextAttemptAt: null, lastError: null, activate: true, releaseId: '77', failure: null,
  startedAt: '2026-11-02T10:00:00Z', finishedAt: '2026-11-02T10:01:00Z',
};
const why = 'It was built for schema V500, and this database has run migrations up to V646 that it cannot go back past.';
await page.route('**/graphql', async (route) => {
  const body = route.request().postData() ?? '';
  if (body.includes('query ServerUpdates')) {
    const response = await route.fetch();
    const json = await response.json();
    const updates = json?.data?.serverUpdates;
    if (updates) {
      updates.restartable = restartable;
      updates.stored = [
        ...(updates.stored ?? []),
        {
          id: '77', version: OLDER, source: 'ORKNUX_AI', sourceUrl: null, size: 1, schemaVersion: 500,
          storedAt: '2026-11-02T10:01:00Z', storedBy: 'admin', state: 'STORED', failure: null, heldBack: null,
          running: false, activatable: false, refusal: why,
        },
      ];
    }
    return route.fulfill({ response, json });
  }
  if (body.includes('query ServerReleaseDownload')) {
    return route.fulfill({ json: { data: { serverReleaseDownload: download } } });
  }
  return route.continue();
});

await page.goto(`${BASE}/admin/updates`, { waitUntil: 'domcontentloaded' });
const done = page.getByTestId('download-done');
record(await until(() => done.isVisible()), 'a chosen release the server did not come back on is reported');
const title = (await page.getByTestId('release-download').locator('p').first().textContent()) ?? '';
record(title.startsWith(`Going back to ${OLDER}`), `an older release is going back, not updating: "${title}"`);
const said = (await done.textContent()) ?? '';
record(said === `${OLDER} was chosen, but the server came back on ${running}: ${why}`, `in the release's own reason: "${said}"`);
record(!/not started by the image/.test(said), 'and not "not started by the image", which a restarted server was');

restartable = false;
await page.goto(`${BASE}/admin/updates`, { waitUntil: 'domcontentloaded' });
record(
  await until(async () => /not started by the image/.test(await text('download-done'))),
  'where nothing restarts the server, that is still what it says',
);

await finish(browser);
