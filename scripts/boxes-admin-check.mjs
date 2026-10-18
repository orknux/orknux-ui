/**
 * Admin -> Boxes: the list, a remote box added and removed through the page,
 * the local box's page, and Admin Settings -> Boxes.
 *
 * What is pinned is what is drawn. The list has a row per box the server
 * lists, with its columns in the order Name, Type, Health, Active sessions,
 * Free sessions; active split into working and idle, since only a
 * working session takes a place against the limit; a remote box's health is a dot in the colour of its status, and the
 * local box - in-process, nothing to reach - has a dash there instead. A box's
 * page holds its token write-only, tests a connection on what is typed before
 * anything is saved, and says why its details could not be had when the box
 * does not answer. A box has a name and no label: the name is what an agent is
 * granted it by. The local box's page offers nothing to edit, no Delete, and the way to its settings. And the settings page draws
 * every box knob opening on what the server holds, with the bounds the server
 * enforces.
 *
 * Boxes are made with a name nobody would mistake for real at an address under
 * `.invalid`, which can never resolve, so no test ever reaches a network.
 * Everything it makes it removes, and it sweeps what a killed run left behind.
 * The settings it changes it puts back.
 */
import { BASE, open, record, drawn, finish } from './suite/harness.mjs';

const SCRATCH = 'boxesCheckScratch_';
const ADDRESS = 'http://boxes-check.invalid:8090';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

/* -------------------------------------------------- the server's contract - */

const fieldsOf = async (type) =>
  ((await graphql(`query ($n: String!) { __type(name: $n) { fields { name } } }`, { n: type }).catch(() => null))?.__type
    ?.fields ?? []).map((one) => one.name);

const queries = await fieldsOf('Query');
record(
  ['boxes', 'box', 'boxInfo', 'boxSessions', 'boxLabels'].every((one) => queries.includes(one)),
  'the server answers boxes, a box, what it says about itself, its sessions and the names to grant',
);
const mutations = await fieldsOf('Mutation');
record(
  ['createBox', 'updateBox', 'deleteBox', 'testBoxConnection'].every((one) => mutations.includes(one)),
  'and makes, edits, removes and tests one',
);
const boxFields = await fieldsOf('Box');
record(
  ['id', 'name', 'kind', 'address', 'hasToken', 'health', 'activeSessions', 'capacity', 'createdAt'].every((one) =>
    boxFields.includes(one),
  ),
  `a box carries every field the list draws (${boxFields.join(' ')})`,
);

const BOX = 'id name kind address hasToken health { status detail } activeSessions';
const listBoxes = async () => (await graphql(`{ boxes { ${BOX} } }`)).boxes;

/* -------------------------------------------------------------- the fixture */

const stale = (await listBoxes()).filter((one) => one.name.startsWith(SCRATCH));
for (const one of stale) await graphql(`mutation ($id: ID!) { deleteBox(id: $id) }`, { id: one.id }).catch(() => {});
if (stale.length > 0) console.log(`NOTE: swept ${stale.length} scratch box(s) from an earlier run`);

const made = (
  await graphql(`mutation ($input: BoxInput!) { createBox(input: $input) { ${BOX} } }`, {
    input: { name: `${SCRATCH}held`, address: ADDRESS, token: 'boxes-check-token' },
  })
).createBox;
record(made.kind === 'REMOTE' && made.hasToken === true, 'a remote box made with a token says it holds one');
record(!JSON.stringify(made).includes('boxes-check-token'), 'and never says what it is');

/** A colour as the browser paints it, so a token and a computed style compare as equals. */
const painted = (value) =>
  page.evaluate((css) => {
    const probe = document.createElement('span');
    probe.style.background = css;
    document.body.appendChild(probe);
    const got = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return got;
  }, value);

/* ------------------------------------------------------------------ the list */

/* The local box's row is checked too: switched off here, it is switched on for the run and off again after. */
const localWasOn = (await graphql(`{ installationSettings { localBoxEnabled } }`)).installationSettings.localBoxEnabled;
if (!localWasOn) await graphql(`mutation { setLocalBoxEnabled(enabled: true) { localBoxEnabled } }`).catch(() => {});

const listed = await listBoxes();
const local = listed.find((one) => one.kind === 'LOCAL') ?? null;

await page.goto(`${BASE}/admin/boxes`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the boxes page'), 'Admin -> Boxes opens');
const rows = page.locator('[data-box-row]');
await rows.first().waitFor({ timeout: 20_000 }).catch(() => {});
record((await rows.count()) === listed.length, `a row per box the server lists (${await rows.count()} of ${listed.length})`);

/* It reloads by itself on the shared interval, so health and sessions stay current without a reload. */
const auto = page.locator('select[aria-label="Refresh automatically"]').first();
record(await auto.isVisible({ timeout: 5_000 }).catch(() => false), 'the boxes list offers automatic refresh');
const chosen = await auto.inputValue().catch(() => null);
let asked = 0;
const counting = (request) => {
  if (request.url().includes('/graphql') && (request.postData() ?? '').includes('query Boxes')) asked += 1;
};
page.on('request', counting);
await auto.selectOption('1').catch(() => {});
await page.waitForTimeout(3_500);
page.off('request', counting);
record(asked >= 2, `and at a second it asks for the boxes again by itself (${asked} times in 3.5s)`);
if (chosen !== null) await auto.selectOption(chosen).catch(() => {});

/* The columns, left to right in the order asked for. */
const HEADINGS = ['Name', 'Type', 'Health', 'Active sessions', 'Free sessions'];
const xs = [];
for (const heading of HEADINGS) {
  const box = await page.locator('button', { hasText: new RegExp(`^${heading}`) }).first().boundingBox().catch(() => null);
  xs.push(box?.x ?? null);
}
record(
  xs.every((x, i) => x !== null && (i === 0 || x > xs[i - 1])),
  `the columns read ${HEADINGS.join(', ')}, left to right (${JSON.stringify(xs)})`,
);

/* The Name heading starts where the names do, not centred over a stretched button. */
const nameX = await page.locator('[data-box-row] a').first().boundingBox().then((box) => box?.x ?? null).catch(() => null);
record(
  xs[0] !== null && nameX !== null && Math.abs(xs[0] - nameX) < 8,
  `the Name heading is aligned left over the names (heading ${xs[0]}, name ${nameX})`,
);

const row = page.locator(`[data-box-row="${made.id}"]`);
record((await row.locator('[data-box-cell="kind"]').innerText().catch(() => '')).trim() === 'Remote', 'the remote box reads Remote');
record((await row.locator('[data-box-cell="label"]').count()) === 0, 'and has no label column: a box is its name');

const health = row.locator('[data-box-health]');
const status = await health.getAttribute('data-box-health').catch(() => null);
record(status === 'UP' || status === 'DOWN', `its health is a dot (${status})`);
if (status !== null) {
  const want = await painted(status === 'UP' ? 'var(--color-success, #3fb950)' : 'var(--color-warning, #d29922)');
  const got = await health.evaluate((one) => getComputedStyle(one).backgroundColor).catch(() => null);
  record(got === want, `in the colour of ${status} (${got} against ${want})`);
}
record(status !== 'UP', 'and an address that cannot resolve is not drawn as up');
const healthSays = (await row.locator('[data-box-cell="health"]').getAttribute('title').catch(() => null)) ?? '';
record(/^Unhealthy: /.test(healthSays), `hovering it says what that means (${healthSays})`);
record((await row.locator('[data-box-cell="free"]').innerText().catch(() => '')).trim() === '—', 'a box that cannot be asked has no free count to give');

if (local === null) {
  console.log('NOTE: the server lists no local box (switched off here), so its row and page are not checked');
} else {
  const localRow = page.locator(`[data-box-row="${local.id}"]`);
  record((await localRow.locator('[data-box-cell="kind"]').innerText().catch(() => '')).trim() === 'Local', 'the local box reads Local');
  const localHealth = await localRow.locator('[data-box-health]').getAttribute('data-box-health').catch(() => null);
  record(localHealth === 'UP' || localHealth === 'DOWN', `and has a health dot of its own too (${localHealth})`);
  const localSays = (await localRow.locator('[data-box-cell="health"]').getAttribute('title').catch(() => null)) ?? '';
  record(/^(Healthy|Unhealthy): /.test(localSays), `with a short status on hover (${localSays})`);

  /* How full it is, as the server counts it: working and idle apart, and the room left of the most it takes. */
  const room = (await graphql(`{ box(id: "local") { capacity { active busy idle max free } } }`)).box?.capacity ?? null;
  record(room !== null && room.busy + room.idle === room.active && room.free === room.max - room.busy, `the local box says how full it is (${JSON.stringify(room)})`);
  if (room !== null) {
    const sessionsCell = (await localRow.locator('[data-box-cell="sessions"]').innerText().catch(() => '')).trim();
    record(sessionsCell === `${room.busy} working · ${room.idle} idle`, `its active sessions read working and idle apart (${sessionsCell})`);
    const freeCell = (await localRow.locator('[data-box-cell="free"]').innerText().catch(() => '')).trim();
    record(freeCell === `${room.free} / ${room.max}`, `and its free sessions of the most it takes (${freeCell})`);
  }
}

/* ------------------------------------------------ adding one, and removing it */

await page.getByRole('link', { name: /^Add box/ }).click();
await page.waitForURL('**/admin/boxes/new', { timeout: 10_000 }).catch(() => {});
record(page.url().endsWith('/admin/boxes/new'), 'Add box opens the form');
await page.locator('#box-name').fill(`${SCRATCH}added`);
record((await page.locator('#box-label').count()) === 0, 'there is no label to fill in: the name is what a grant names');
const blocked = (await page.locator('[data-box-save-blocked]').getAttribute('title').catch(() => null)) ?? '';
record(blocked === 'Fill in: Address' && (await page.locator('[data-box-save]').isDisabled()), `a blocked Add box says why on hover (${blocked})`);
await page.locator('#box-address').fill(ADDRESS);

/* The tester asks about what is typed, before anything is saved. */
await page.locator('[data-box-test]').click();
const result = page.locator('[data-box-test-result]');
await result.waitFor({ timeout: 30_000 }).catch(() => {});
record((await result.getAttribute('data-box-test-result').catch(() => null)) === 'failed', 'testing an address that cannot resolve says it failed');
const said = (await page.locator('[data-box-test-result]').innerText().catch(() => '')).trim();
record(said.length > 0 && !said.includes('\n'), `in one line (${said})`);
record((await listBoxes()).every((one) => one.name !== `${SCRATCH}added`), 'and saved nothing');

await page.getByRole('button', { name: /^Add box/ }).click();
await page.waitForURL(/\/admin\/boxes\/(?!new)[^/]+$/, { timeout: 15_000 }).catch(() => {});
const added = (await listBoxes()).find((one) => one.name === `${SCRATCH}added`) ?? null;
record(added !== null && added.address === ADDRESS, 'Add box stores what was typed');
record(added !== null && page.url().endsWith(`/admin/boxes/${encodeURIComponent(added.id)}`), "and opens the new box's page");

if (added !== null) {
  await page.locator('[data-box-delete]').click();
  await page.locator('[data-box-delete-confirm]').click();
  await page.waitForURL(/\/admin\/boxes$/, { timeout: 15_000 }).catch(() => {});
  record((await listBoxes()).every((one) => one.id !== added.id), 'Delete, confirmed, removes it and goes back to the list');
}

/* ------------------------------------------------------- a remote box's page */

await page.goto(`${BASE}/admin/boxes/${encodeURIComponent(made.id)}`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, "the remote box's page", { within: 60_000 }), "a remote box's page opens");
const token = page.locator('#box-token');
record((await token.inputValue().catch(() => null)) === '', 'the token box opens empty: a stored token is fetched only when asked for');
record((await token.getAttribute('type').catch(() => null)) === 'password', 'and is a password box');
record((await token.getAttribute('data-box-token-held').catch(() => null)) === 'true', 'which says one is held');
/* The eye beside it shows the stored token. */
await page.locator('#box-token ~ button').first().click();
await page.waitForTimeout(800);
record((await token.getAttribute('type').catch(() => null)) === 'text', 'the eye shows it');
record((await token.inputValue().catch(() => null)) === 'boxes-check-token', 'and what it shows is the stored token');
// Save is the page's, in the strip floating at the foot of the window.
const saveBox = await page.locator('[data-box-save]').boundingBox().catch(() => null);
const stripBox = await page.getByTestId('save-bar').boundingBox().catch(() => null);
record(
  saveBox !== null && stripBox !== null && saveBox.y >= stripBox.y && saveBox.y + saveBox.height <= stripBox.y + stripBox.height,
  'Save sits in the strip at the foot of the window',
);
const infoError = page.locator('[data-box-info-error]');
await infoError.waitFor({ timeout: 30_000 }).catch(() => {});
record((await infoError.count()) === 1, 'a box that cannot be reached says so where its details would be');
record((await page.locator('[data-box-delete]').count()) === 1, 'and can be deleted');

/* ------------------------------------------------------- the local box's page */

if (local !== null) {
  await page.goto(`${BASE}/admin/boxes/${encodeURIComponent(local.id)}`, { waitUntil: 'domcontentloaded' });
  record(await drawn(page, "the local box's page"), "the local box's page opens");
  const address = page.locator('#box-address');
  record((await address.getAttribute('data-box-address').catch(() => null)) === 'in-process', 'its address reads as in-process');
  record(await address.isDisabled().catch(() => false), 'and cannot be edited');
  record(await page.locator('#box-name').isDisabled().catch(() => false), 'nor can its name');
  record((await page.locator('#box-token').count()) === 0, 'it has no token box');
  record((await page.locator('#box-name').inputValue().catch(() => null)) === 'local', 'its name is always local');
  record((await page.locator('[data-box-save]').count()) === 0, 'so there is no Save');
  record((await page.locator('[data-box-delete]').count()) === 0, 'it cannot be deleted');
  record((await page.locator('[data-box-test]').count()) === 0, 'and has nothing to test');
  const link = page.locator('[data-box-settings-link]');
  record((await link.getAttribute('href').catch(() => null)) === '/admin/settings#boxes', 'it links to the Boxes section of Admin Settings');

  const info = await graphql(`query ($id: ID!) { boxInfo(id: $id) { version runtimes { name } } }`, { id: local.id }).catch(() => null);
  if (info?.boxInfo !== undefined) {
    const runtimes = page.locator('[data-box-runtime]');
    record(
      (await page.locator('[data-box-details] dl [data-box-runtime]').count()) === (await runtimes.count()) &&
        (await page.locator('[data-box-details] dl dl').count()) === 0,
      'a runtime is rows of the same sheet, not a panel inside it',
    );
    await runtimes.first().waitFor({ timeout: 20_000 }).catch(() => {});
    record((await runtimes.count()) === info.boxInfo.runtimes.length, `every runtime it reports is drawn (${await runtimes.count()})`);
    const details = (await page.locator('[data-box-details]').innerText().catch(() => '')).replace(/\s+/g, ' ');
    record(details.includes(info.boxInfo.version), `and its version (${info.boxInfo.version})`);
  } else {
    record(false, 'the local box answers boxInfo');
  }
  await page.locator('[data-box-sessions]').waitFor({ timeout: 10_000 }).catch(() => {});
  record((await page.locator('[data-box-sessions]').count()) === 1, 'and its sessions are listed below');
}

/* ---------------------------------------------------- Admin Settings -> Boxes */

const SETTINGS =
  'localBoxEnabled localBoxLocation localBoxLocationConfigured localBoxRuntime localBoxMaxSessions localBoxDefaultTtlSeconds ' +
  'localBoxMaxTtlSeconds localBoxIdleTimeoutSeconds boxCommandWaitSeconds boxCommandWaitSecondsConfigured ' +
  'boxCommandTimeoutSeconds boxOutputBytes localBoxOutputKeptBytes localBoxOutputKeptBytesConfigured boxOutputShownBytes boxRequestTimeoutSeconds boxEditUndoSteps boxEditUndoStepsConfigured boxSessionIdleSeconds boxSessionIdleSecondsConfigured ' +
  'boxMaxPorts boxMaxPortsConfigured boxPortCheckSeconds boxPortCheckSecondsConfigured boxPortCheckWaitMillis boxPortCheckWaitMillisConfigured';
const held = (await graphql(`{ installationSettings { ${SETTINGS} } }`)).installationSettings;

await page.goto(`${BASE}/admin/settings#boxes`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the settings page'), 'Admin Settings opens');
const heading = page.locator('h2#boxes');
await heading.waitFor({ timeout: 20_000 }).catch(() => {});
record((await heading.count()) === 1, 'it has a Boxes section');
const headingY = (await heading.boundingBox().catch(() => null))?.y ?? null;

/** Each box, the value it must open on, and the bounds the server enforces. */
const BOXES = [
  ['local-box-max-sessions', held.localBoxMaxSessions, '1', '1000'],
  ['local-box-default-ttl-seconds', held.localBoxDefaultTtlSeconds, '60', '604800'],
  ['local-box-max-ttl-seconds', held.localBoxMaxTtlSeconds, '60', '604800'],
  ['local-box-idle-timeout-seconds', held.localBoxIdleTimeoutSeconds, '60', '86400'],
  ['box-command-wait-seconds', held.boxCommandWaitSeconds, '1', '3600'],
  ['box-command-timeout-seconds', held.boxCommandTimeoutSeconds, '1', '86400'],
  ['box-output-kb', Math.round(held.boxOutputBytes / 1024), '1', '4096'],
  ['box-output-shown-kb', Math.round(held.boxOutputShownBytes / 1024), '64', '65536'],
  ['local-box-output-kept-kb', Math.round(held.localBoxOutputKeptBytes / 1024), '0', '16384'],
  ['box-request-timeout-seconds', held.boxRequestTimeoutSeconds, '1', '600'],
  ['box-edit-undo-steps', held.boxEditUndoSteps, '0', '100'],
  ['box-session-idle-seconds', held.boxSessionIdleSeconds, '60', '86400'],
  ['box-max-ports', held.boxMaxPorts, '0', '20'],
  ['box-port-check-seconds', held.boxPortCheckSeconds, '2', '600'],
  ['box-port-check-wait-ms', held.boxPortCheckWaitMillis, '100', '10000'],
];
for (const [id, value, min, max] of BOXES) {
  const box = page.locator(`#${id}`);
  const shown = await box.inputValue().catch(() => null);
  /*
   * In page coordinates, measured together with the heading: the page scrolls to
   * #boxes after it loads, and a heading measured in the viewport before that
   * scroll against a box measured after it read some boxes as above it.
   */
  const below = await page
    .evaluate((wanted) => {
      const at = (el) => (el === null ? null : el.getBoundingClientRect().top + window.scrollY);
      return { y: at(document.getElementById(wanted)), headingY: at(document.querySelector('h2#boxes')) };
    }, id)
    .catch(() => ({ y: null, headingY: null }));
  record(
    shown !== null && Number(shown) === value && (await box.getAttribute('min')) === min && (await box.getAttribute('max')) === max,
    `#${id} opens on ${value} and takes ${min} to ${max} (${shown})`,
  );
  record(below.headingY !== null && below.y !== null && below.y > below.headingY, `#${id} is under the Boxes heading`);
}
record(
  (await page.locator('#local-box-enabled').getAttribute('aria-checked').catch(() => null)) === String(held.localBoxEnabled),
  'the local box switch says what the server holds',
);
record((await page.locator('#local-box-runtime').inputValue().catch(() => null)) === held.localBoxRuntime, 'and so does the runtime');
const options = await page.locator('#local-box-runtime option').evaluateAll((all) => all.map((one) => one.value));
record(JSON.stringify(options) === JSON.stringify(['local', 'docker']), `which offers local and docker (${options.join(', ')})`);
const location = page.locator('#local-box-location');
record((await location.getAttribute('placeholder').catch(() => null)) === held.localBoxLocationConfigured, 'the location shows its default as the placeholder');
record((await location.inputValue().catch(() => null)) === (held.localBoxLocation ?? ''), 'and holds what is set, or nothing');

/* One of them through the page's Save, to the server and back. */
const wanted = held.boxCommandWaitSeconds === 77 ? 78 : 77;
await page.locator('#box-command-wait-seconds').fill(String(wanted));
await page.getByRole('button', { name: /^Save/ }).first().click();
await page.waitForTimeout(2_000);
const stored = (await graphql(`{ installationSettings { boxCommandWaitSeconds } }`)).installationSettings.boxCommandWaitSeconds;
record(stored === wanted, `the number typed is the number stored (${stored})`);
record(held.boxCommandWaitSecondsConfigured === 300, `a fresh installation waits 300 seconds (${held.boxCommandWaitSecondsConfigured})`);
record(held.boxEditUndoStepsConfigured === 10, `a fresh installation keeps 10 box edits per session for undoing (${held.boxEditUndoStepsConfigured})`);
record(
  held.boxSessionIdleSecondsConfigured === 7200,
  `a fresh installation lets a box session sit idle two hours, not a box's fifteen minutes (${held.boxSessionIdleSecondsConfigured})`,
);
record(
  held.boxMaxPortsConfigured === 5 && held.boxPortCheckSecondsConfigured === 15 && held.boxPortCheckWaitMillisConfigured === 1500,
  `a fresh installation lets a box session expose 5 ports, looked at every 15 s for 1500 ms (${held.boxMaxPortsConfigured}, ${held.boxPortCheckSecondsConfigured}, ${held.boxPortCheckWaitMillisConfigured})`,
);
record(held.localBoxOutputKeptBytesConfigured === 1048576, `a fresh installation keeps a megabyte of each local command's output for reading (${held.localBoxOutputKeptBytesConfigured})`);

/* --------------------------------------------------------------- put back */

if (!localWasOn) await graphql(`mutation { setLocalBoxEnabled(enabled: false) { localBoxEnabled } }`).catch(() => {});

await graphql(`mutation ($s: Int!) { setBoxCommandWaitSeconds(seconds: $s) { boxCommandWaitSeconds } }`, {
  s: held.boxCommandWaitSeconds,
}).catch(() => {});
for (const one of (await listBoxes()).filter((box) => box.name.startsWith(SCRATCH))) {
  await graphql(`mutation ($id: ID!) { deleteBox(id: $id) }`, { id: one.id }).catch(() => {});
}

await finish(browser);
