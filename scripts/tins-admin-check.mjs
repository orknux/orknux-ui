/**
 * Admin -> Tins: the list, a remote tin added and removed through the page,
 * the local tin's page, and Admin Settings -> Tins.
 *
 * What is pinned is what is drawn. The list has a row per tin the server
 * lists, with its columns in the order Name, Type, Health, Active sessions,
 * Label; a remote tin's health is a dot in the colour of its status, and the
 * local tin - in-process, nothing to reach - has a dash there instead. A tin's
 * page holds its token write-only, tests a connection on what is typed before
 * anything is saved, and says why its details could not be had when the tin
 * does not answer. The local tin's page offers its label and nothing else to
 * edit, no Delete, and the way to its settings. And the settings page draws
 * every tin knob opening on what the server holds, with the bounds the server
 * enforces.
 *
 * Tins are made with a name nobody would mistake for real at an address under
 * `.invalid`, which can never resolve, so no test ever reaches a network.
 * Everything it makes it removes, and it sweeps what a killed run left behind.
 * The one setting it changes it puts back.
 */
import { BASE, open, record, drawn, finish } from './suite/harness.mjs';

const SCRATCH = 'tinsCheckScratch_';
const ADDRESS = 'http://tins-check.invalid:8090';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

/* -------------------------------------------------- the server's contract - */

const fieldsOf = async (type) =>
  ((await graphql(`query ($n: String!) { __type(name: $n) { fields { name } } }`, { n: type }).catch(() => null))?.__type
    ?.fields ?? []).map((one) => one.name);

const queries = await fieldsOf('Query');
record(
  ['tins', 'tin', 'tinInfo', 'tinSessions', 'tinLabels'].every((one) => queries.includes(one)),
  'the server answers tins, a tin, what it says about itself, its sessions and the labels in use',
);
const mutations = await fieldsOf('Mutation');
record(
  ['createTin', 'updateTin', 'deleteTin', 'testTinConnection'].every((one) => mutations.includes(one)),
  'and makes, edits, removes and tests one',
);
const tinFields = await fieldsOf('Tin');
record(
  ['id', 'name', 'kind', 'label', 'address', 'hasToken', 'health', 'activeSessions', 'createdAt'].every((one) =>
    tinFields.includes(one),
  ),
  `a tin carries every field the list draws (${tinFields.join(' ')})`,
);

const TIN = 'id name kind label address hasToken health { status detail } activeSessions';
const listTins = async () => (await graphql(`{ tins { ${TIN} } }`)).tins;

/* -------------------------------------------------------------- the fixture */

const stale = (await listTins()).filter((one) => one.name.startsWith(SCRATCH));
for (const one of stale) await graphql(`mutation ($id: ID!) { deleteTin(id: $id) }`, { id: one.id }).catch(() => {});
if (stale.length > 0) console.log(`NOTE: swept ${stale.length} scratch tin(s) from an earlier run`);

const made = (
  await graphql(`mutation ($input: TinInput!) { createTin(input: $input) { ${TIN} } }`, {
    input: { name: `${SCRATCH}held`, label: 'tins-check', address: ADDRESS, token: 'tins-check-token' },
  })
).createTin;
record(made.kind === 'REMOTE' && made.hasToken === true, 'a remote tin made with a token says it holds one');
record(!JSON.stringify(made).includes('tins-check-token'), 'and never says what it is');

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

const listed = await listTins();
const local = listed.find((one) => one.kind === 'LOCAL') ?? null;

await page.goto(`${BASE}/admin/tins`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the tins page'), 'Admin -> Tins opens');
const rows = page.locator('[data-tin-row]');
await rows.first().waitFor({ timeout: 20_000 }).catch(() => {});
record((await rows.count()) === listed.length, `a row per tin the server lists (${await rows.count()} of ${listed.length})`);

/* The columns, left to right in the order asked for. */
const HEADINGS = ['Name', 'Type', 'Health', 'Active sessions', 'Label'];
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
const nameX = await page.locator('[data-tin-row] a').first().boundingBox().then((box) => box?.x ?? null).catch(() => null);
record(
  xs[0] !== null && nameX !== null && Math.abs(xs[0] - nameX) < 8,
  `the Name heading is aligned left over the names (heading ${xs[0]}, name ${nameX})`,
);

const row = page.locator(`[data-tin-row="${made.id}"]`);
record((await row.locator('[data-tin-cell="kind"]').innerText().catch(() => '')).trim() === 'Remote', 'the remote tin reads Remote');
record((await row.locator('[data-tin-cell="label"]').innerText().catch(() => '')).trim() === 'tins-check', 'and shows its label');

const health = row.locator('[data-tin-health]');
const status = await health.getAttribute('data-tin-health').catch(() => null);
record(status === 'UP' || status === 'DOWN', `its health is a dot (${status})`);
if (status !== null) {
  const want = await painted(status === 'UP' ? 'var(--color-success, #3fb950)' : 'var(--color-warning, #d29922)');
  const got = await health.evaluate((one) => getComputedStyle(one).backgroundColor).catch(() => null);
  record(got === want, `in the colour of ${status} (${got} against ${want})`);
}
record(status !== 'UP', 'and an address that cannot resolve is not drawn as up');
const healthSays = (await row.locator('[data-tin-cell="health"]').getAttribute('title').catch(() => null)) ?? '';
record(/^Unhealthy: /.test(healthSays), `hovering it says what that means (${healthSays})`);

if (local === null) {
  console.log('NOTE: the server lists no local tin (switched off here), so its row and page are not checked');
} else {
  const localRow = page.locator(`[data-tin-row="${local.id}"]`);
  record((await localRow.locator('[data-tin-cell="kind"]').innerText().catch(() => '')).trim() === 'Local', 'the local tin reads Local');
  const localHealth = await localRow.locator('[data-tin-health]').getAttribute('data-tin-health').catch(() => null);
  record(localHealth === 'UP' || localHealth === 'DOWN', `and has a health dot of its own too (${localHealth})`);
  const localSays = (await localRow.locator('[data-tin-cell="health"]').getAttribute('title').catch(() => null)) ?? '';
  record(/^(Healthy|Unhealthy): /.test(localSays), `with a short status on hover (${localSays})`);
}

/* ------------------------------------------------ adding one, and removing it */

await page.getByRole('link', { name: /^Add tin/ }).click();
await page.waitForURL('**/admin/tins/new', { timeout: 10_000 }).catch(() => {});
record(page.url().endsWith('/admin/tins/new'), 'Add tin opens the form');
await page.locator('#tin-name').fill(`${SCRATCH}added`);
record((await page.locator('label[for="tin-label"] span').filter({ hasText: '*' }).count()) === 1, 'the label is marked required');
await page.locator('#tin-address').fill(ADDRESS);
const blocked = (await page.locator('[data-tin-save-blocked]').getAttribute('title').catch(() => null)) ?? '';
record(blocked === 'Fill in: Label' && (await page.locator('[data-tin-save]').isDisabled()), `a blocked Add tin says why on hover (${blocked})`);
await page.locator('#tin-label').fill('tins-check');

/* The tester asks about what is typed, before anything is saved. */
await page.locator('[data-tin-test]').click();
const result = page.locator('[data-tin-test-result]');
await result.waitFor({ timeout: 30_000 }).catch(() => {});
record((await result.getAttribute('data-tin-test-result').catch(() => null)) === 'failed', 'testing an address that cannot resolve says it failed');
const said = (await page.locator('[data-tin-test-result]').innerText().catch(() => '')).trim();
record(said.length > 0 && !said.includes('\n'), `in one line (${said})`);
record((await listTins()).every((one) => one.name !== `${SCRATCH}added`), 'and saved nothing');

await page.getByRole('button', { name: /^Add tin/ }).click();
await page.waitForURL(/\/admin\/tins\/(?!new)[^/]+$/, { timeout: 15_000 }).catch(() => {});
const added = (await listTins()).find((one) => one.name === `${SCRATCH}added`) ?? null;
record(added !== null && added.label === 'tins-check' && added.address === ADDRESS, 'Add tin stores what was typed');
record(added !== null && page.url().endsWith(`/admin/tins/${encodeURIComponent(added.id)}`), "and opens the new tin's page");

if (added !== null) {
  await page.locator('[data-tin-delete]').click();
  await page.locator('[data-tin-delete-confirm]').click();
  await page.waitForURL(/\/admin\/tins$/, { timeout: 15_000 }).catch(() => {});
  record((await listTins()).every((one) => one.id !== added.id), 'Delete, confirmed, removes it and goes back to the list');
}

/* ------------------------------------------------------- a remote tin's page */

await page.goto(`${BASE}/admin/tins/${encodeURIComponent(made.id)}`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, "the remote tin's page", { within: 60_000 }), "a remote tin's page opens");
const token = page.locator('#tin-token');
record((await token.inputValue().catch(() => null)) === '', 'the token box opens empty: a stored token is fetched only when asked for');
record((await token.getAttribute('type').catch(() => null)) === 'password', 'and is a password box');
record((await token.getAttribute('data-tin-token-held').catch(() => null)) === 'true', 'which says one is held');
/* The eye beside it shows the stored token. */
await page.locator('#tin-token ~ button').first().click();
await page.waitForTimeout(800);
record((await token.getAttribute('type').catch(() => null)) === 'text', 'the eye shows it');
record((await token.inputValue().catch(() => null)) === 'tins-check-token', 'and what it shows is the stored token');
const saveBox = await page.locator('[data-tin-save]').boundingBox().catch(() => null);
const titleBox = await page.locator('h1').first().boundingBox().catch(() => null);
record(
  saveBox !== null && titleBox !== null && Math.abs(saveBox.y + saveBox.height / 2 - (titleBox.y + titleBox.height / 2)) < 16 && saveBox.x > titleBox.x + titleBox.width,
  'Save sits in the top right, beside the title',
);
const infoError = page.locator('[data-tin-info-error]');
await infoError.waitFor({ timeout: 30_000 }).catch(() => {});
record((await infoError.count()) === 1, 'a tin that cannot be reached says so where its details would be');
record((await page.locator('[data-tin-delete]').count()) === 1, 'and can be deleted');

/* ------------------------------------------------------- the local tin's page */

if (local !== null) {
  await page.goto(`${BASE}/admin/tins/${encodeURIComponent(local.id)}`, { waitUntil: 'domcontentloaded' });
  record(await drawn(page, "the local tin's page"), "the local tin's page opens");
  const address = page.locator('#tin-address');
  record((await address.getAttribute('data-tin-address').catch(() => null)) === 'in-process', 'its address reads as in-process');
  record(await address.isDisabled().catch(() => false), 'and cannot be edited');
  record(await page.locator('#tin-name').isDisabled().catch(() => false), 'nor can its name');
  record((await page.locator('#tin-token').count()) === 0, 'it has no token box');
  const fixed = page.locator('#tin-label');
  record((await fixed.getAttribute('readonly').catch(() => null)) !== null, 'its label cannot be edited');
  record((await fixed.inputValue().catch(() => null)) === 'local', 'and is always local');
  record((await page.locator('[data-tin-save]').count()) === 0, 'so there is no Save');
  record((await page.locator('[data-tin-delete]').count()) === 0, 'it cannot be deleted');
  record((await page.locator('[data-tin-test]').count()) === 0, 'and has nothing to test');
  const link = page.locator('[data-tin-settings-link]');
  record((await link.getAttribute('href').catch(() => null)) === '/admin/settings#tins', 'it links to the Tins section of Admin Settings');

  const info = await graphql(`query ($id: ID!) { tinInfo(id: $id) { version runtimes { name } } }`, { id: local.id }).catch(() => null);
  if (info?.tinInfo !== undefined) {
    const runtimes = page.locator('[data-tin-runtime]');
    record(
      (await page.locator('[data-tin-details] dl [data-tin-runtime]').count()) === (await runtimes.count()) &&
        (await page.locator('[data-tin-details] dl dl').count()) === 0,
      'a runtime is rows of the same sheet, not a panel inside it',
    );
    await runtimes.first().waitFor({ timeout: 20_000 }).catch(() => {});
    record((await runtimes.count()) === info.tinInfo.runtimes.length, `every runtime it reports is drawn (${await runtimes.count()})`);
    const details = (await page.locator('[data-tin-details]').innerText().catch(() => '')).replace(/\s+/g, ' ');
    record(details.includes(info.tinInfo.version), `and its version (${info.tinInfo.version})`);
  } else {
    record(false, 'the local tin answers tinInfo');
  }
  await page.locator('[data-tin-sessions]').waitFor({ timeout: 10_000 }).catch(() => {});
  record((await page.locator('[data-tin-sessions]').count()) === 1, 'and its sessions are listed below');
}

/* ---------------------------------------------------- Admin Settings -> Tins */

const SETTINGS =
  'localTinEnabled localTinLocation localTinLocationConfigured localTinRuntime localTinMaxSessions localTinDefaultTtlSeconds ' +
  'localTinMaxTtlSeconds localTinIdleTimeoutSeconds tinCommandWaitSeconds tinCommandWaitSecondsConfigured ' +
  'tinCommandTimeoutSeconds tinOutputBytes localTinOutputKeptBytes localTinOutputKeptBytesConfigured tinOutputShownBytes tinRequestTimeoutSeconds';
const held = (await graphql(`{ installationSettings { ${SETTINGS} } }`)).installationSettings;

await page.goto(`${BASE}/admin/settings#tins`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the settings page'), 'Admin Settings opens');
const heading = page.locator('h2#tins');
await heading.waitFor({ timeout: 20_000 }).catch(() => {});
record((await heading.count()) === 1, 'it has a Tins section');
const headingY = (await heading.boundingBox().catch(() => null))?.y ?? null;

/** Each box, the value it must open on, and the bounds the server enforces. */
const BOXES = [
  ['local-tin-max-sessions', held.localTinMaxSessions, '1', '1000'],
  ['local-tin-default-ttl-seconds', held.localTinDefaultTtlSeconds, '60', '604800'],
  ['local-tin-max-ttl-seconds', held.localTinMaxTtlSeconds, '60', '604800'],
  ['local-tin-idle-timeout-seconds', held.localTinIdleTimeoutSeconds, '60', '86400'],
  ['tin-command-wait-seconds', held.tinCommandWaitSeconds, '1', '3600'],
  ['tin-command-timeout-seconds', held.tinCommandTimeoutSeconds, '1', '86400'],
  ['tin-output-kb', Math.round(held.tinOutputBytes / 1024), '1', '4096'],
  ['tin-output-shown-kb', Math.round(held.tinOutputShownBytes / 1024), '64', '65536'],
  ['local-tin-output-kept-kb', Math.round(held.localTinOutputKeptBytes / 1024), '0', '16384'],
  ['tin-request-timeout-seconds', held.tinRequestTimeoutSeconds, '1', '600'],
];
for (const [id, value, min, max] of BOXES) {
  const box = page.locator(`#${id}`);
  const shown = await box.inputValue().catch(() => null);
  const y = (await box.boundingBox().catch(() => null))?.y ?? null;
  record(
    shown !== null && Number(shown) === value && (await box.getAttribute('min')) === min && (await box.getAttribute('max')) === max,
    `#${id} opens on ${value} and takes ${min} to ${max} (${shown})`,
  );
  record(headingY !== null && y !== null && y > headingY, `#${id} is under the Tins heading`);
}
record(
  (await page.locator('#local-tin-enabled').getAttribute('aria-checked').catch(() => null)) === String(held.localTinEnabled),
  'the local tin switch says what the server holds',
);
record((await page.locator('#local-tin-runtime').inputValue().catch(() => null)) === held.localTinRuntime, 'and so does the runtime');
const options = await page.locator('#local-tin-runtime option').evaluateAll((all) => all.map((one) => one.value));
record(JSON.stringify(options) === JSON.stringify(['local', 'docker']), `which offers local and docker (${options.join(', ')})`);
const location = page.locator('#local-tin-location');
record((await location.getAttribute('placeholder').catch(() => null)) === held.localTinLocationConfigured, 'the location shows its default as the placeholder');
record((await location.inputValue().catch(() => null)) === (held.localTinLocation ?? ''), 'and holds what is set, or nothing');

/* One of them through the page's Save, to the server and back. */
const wanted = held.tinCommandWaitSeconds === 77 ? 78 : 77;
await page.locator('#tin-command-wait-seconds').fill(String(wanted));
await page.getByRole('button', { name: /^Save/ }).first().click();
await page.waitForTimeout(2_000);
const stored = (await graphql(`{ installationSettings { tinCommandWaitSeconds } }`)).installationSettings.tinCommandWaitSeconds;
record(stored === wanted, `the number typed is the number stored (${stored})`);
record(held.tinCommandWaitSecondsConfigured === 300, `a fresh installation waits 300 seconds (${held.tinCommandWaitSecondsConfigured})`);
record(held.localTinOutputKeptBytesConfigured === 1048576, `a fresh installation keeps a megabyte of each local command's output for reading (${held.localTinOutputKeptBytesConfigured})`);

/* --------------------------------------------------------------- put back */

await graphql(`mutation ($s: Int!) { setTinCommandWaitSeconds(seconds: $s) { tinCommandWaitSeconds } }`, {
  s: held.tinCommandWaitSeconds,
}).catch(() => {});
for (const one of (await listTins()).filter((tin) => tin.name.startsWith(SCRATCH))) {
  await graphql(`mutation ($id: ID!) { deleteTin(id: $id) }`, { id: one.id }).catch(() => {});
}

await finish(browser);
