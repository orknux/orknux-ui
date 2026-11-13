/**
 * Admin > Clients: who uses the Chrome extension, Orknux for Windows and for
 * Linux, and Orknux Shell in a terminal.
 *
 * A page of its own now, lifted out of Admin > Reports. What is asserted is
 * what is drawn: the page is titled Clients and is no longer a pick under
 * Reports, a tile per client counts the people using it, every client has its
 * row under its own name, a desktop client is named by its computer, and one
 * connected now says so. The rows are stood in for by a route on the
 * clientUses query, so the check writes nothing - a real client asking for
 * work would make alice's devices look connected to every agent on the server
 * for a while. The server's half is ClientUseReportTest.
 */
import { BASE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 1000 } });

const now = new Date().toISOString();
const before = new Date(Date.now() - 3 * 86_400_000).toISOString();
const row = (username, displayName, kind, client, name, connected, computer = null) =>
  ({ username, displayName, kind, client, name, version: '1.0.0', computer, firstSeen: before, lastSeen: now, connected });
const rows = [
  row('alice', 'Alice', 'BROWSER', 'Chrome', 'Chrome', true, 'macOS'),
  row('bob', 'Bob', 'BROWSER', 'Chrome', 'Chrome', false),
  row('alice', 'Alice', 'DESKTOP', 'Windows', 'Windows on PC-7', false, 'Windows on PC-7'),
  row('carol', 'Carol', 'DESKTOP', 'Linux', 'Linux on studio', true, 'Linux on studio'),
  row('bob', 'Bob', 'SHELL', 'Shell', 'f3a9', false),
];

await page.route('**/graphql', async (route) => {
  const asked = route.request().postDataJSON()?.query ?? '';
  if (!asked.includes('clientUses')) return route.continue();
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { clientUses: rows } }) });
});

await page.goto(`${BASE}/admin/clients`, { waitUntil: 'domcontentloaded' });
const table = page.getByTestId('clients-table');
await table.waitFor({ timeout: 15_000 }).catch(() => undefined);

const title = ((await page.getByRole('heading', { level: 1 }).first().textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim();
record(title.startsWith('Clients'), `Clients is a page of its own, titled for it (${JSON.stringify(title)})`);
record((await page.getByRole('combobox', { name: 'Report' }).count()) === 0, 'and no longer a pick under Reports');

const tiles = ((await page.getByTestId('clients-tiles').textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ');
record(/Chrome extension\s*2/.test(tiles), `the Chrome tile counts two people (${tiles.slice(0, 160)})`);
record(/Orknux for Windows\s*1/.test(tiles) && /Orknux for Linux\s*1/.test(tiles), 'Windows and Linux are counted apart, one person each');
record(/Orknux Shell \(terminal\)\s*1/.test(tiles), 'the terminal has a tile of its own');

const drawn = await page.getByTestId('client-row').evaluateAll((all) => all.map((one) => one.getAttribute('data-client')));
record(
  ['chrome', 'chrome', 'windows', 'linux', 'terminal'].every((one, at) => drawn.filter((x) => x === one).length >= (at === 1 ? 2 : 1)),
  `every client has its row (${drawn.join(', ')})`,
);
const text = (await table.textContent().catch(() => '')) ?? '';
record(text.includes('Linux on studio') && text.includes('Windows on PC-7'), 'a desktop client is named by its computer');
record(text.includes('macOS'), "a browser's computer is the system it runs on, where the server could tell");
record(!text.includes('f3a9'), "and the Shell's copy id, which means nothing to a person, is not shown");
record((await page.getByTestId('client-connected').count()) === 2, 'the two connected now say so');

await page.getByRole('combobox', { name: 'Client', exact: true }).click().catch(() => undefined);
await page.getByRole('option', { name: 'Orknux Shell (terminal)' }).click().catch(() => undefined);
await page.waitForTimeout(300);
const onlyShell = await page.getByTestId('client-row').evaluateAll((all) => all.map((one) => one.getAttribute('data-client')));
record(onlyShell.length === 1 && onlyShell[0] === 'terminal', `picking the terminal shows only who uses it (${onlyShell.join(', ')})`);

await finish(browser);
