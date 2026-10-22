/**
 * Admin > Reports > Usage, and the switch that decides what it reads.
 *
 * The switch is the whole of what is recorded, and it lives in Admin Settings'
 * Reports section with the installation's other switches; the report draws no
 * switch of its own. What is asserted about it is that it says what the server
 * has and survives a reload - and that, off, the report says so on one line with
 * a link that lands on the switch, and on says nothing. The report is read as
 * drawn: the four totals, the people table with its columns named, and a person
 * opened to their sessions, with the share bar beside each.
 *
 * Leaves the switch as it found it, however the run ends.
 */
import { BASE, open, drawn, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 1000 } });

const { usageTracking: before } = await graphql('query { usageTracking { enabled } }');

try {
await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
await drawn(page, 'Workspaces');
const link = page.getByRole('link', { name: 'Reports' });
record((await link.count()) > 0, 'the admin menu offers Reports');
await page.evaluate(() => { try { localStorage.removeItem('orknux.reports.kind'); } catch { /* none kept */ } });
await link.first().click();
await drawn(page, 'Tokens by person');
record((await page.getByRole('switch').count()) === 0, 'the usage report draws no switch of its own');

/* ---- the switch, in Admin Settings ---- */

await page.goto(`${BASE}/admin/settings#reports`, { waitUntil: 'domcontentloaded' });
const toggle = page.getByRole('switch', { name: /usage tracking/i });
// Disabled until the server has said what it holds, and saying off until then.
const answered = () => page.locator('#usage-tracking [role="switch"]:not([disabled])').waitFor({ timeout: 20_000 });
await answered();
const inReports = await toggle.evaluate((element) => {
  // The section a row is in is the last h2 above it.
  const headings = [...document.querySelectorAll('h2[id]')].filter((one) => one.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING);
  return headings.at(-1)?.id ?? null;
});
record(inReports === 'reports', `Admin Settings holds the usage tracking switch, in its Reports section (${inReports})`);
const was = (await toggle.getAttribute('aria-checked')) === 'true';
record(was === before.enabled, `the switch says what the server has (${was})`);

const settle = async (want) => {
  await page.waitForFunction(
    (expected) => document.querySelector('#usage-tracking [role="switch"]')?.getAttribute('aria-checked') === String(expected),
    want,
    { timeout: 10_000 },
  );
};
// Off first, so the report's line can be looked for; pressed rather than written, so the press is what is tested.
if (was) {
  await toggle.click();
  await settle(false);
}
await page.reload({ waitUntil: 'domcontentloaded' });
await answered();
await settle(false);
record(true, 'pressing it changes it, and a reload still says so');

/* ---- the report, while it is off ---- */

await page.goto(`${BASE}/admin/reports`, { waitUntil: 'domcontentloaded' });
await drawn(page, 'Tokens by person');
const offLine = page.locator('[data-recording-off="usage"]');
await offLine.waitFor({ timeout: 10_000 }).catch(() => {});
const said = ((await offLine.textContent().catch(() => '')) ?? '').trim();
record((await offLine.count()) === 1 && /Usage tracking is off/.test(said), `off, the report says so (${said})`);
const lines = await offLine.evaluate((element) => {
  const height = element.getBoundingClientRect().height;
  const line = Number.parseFloat(getComputedStyle(element).lineHeight) || 20;
  return Math.round(height / line);
}).catch(() => null);
record(lines === 1, `on one line (${lines})`);
const settingsLink = offLine.getByRole('link');
const href = await settingsLink.getAttribute('href').catch(() => null);
record(href === '/admin/settings#usage-tracking', `with a link to the switch (${href})`);
await settingsLink.click();
await page.waitForURL(/\/admin\/settings#usage-tracking$/, { timeout: 10_000 }).catch(() => {});
const landed = page.locator('#usage-tracking [role="switch"]');
await landed.waitFor({ timeout: 20_000 }).catch(() => {});
const view = await landed.evaluate((element) => {
  const box = element.getBoundingClientRect();
  return { top: Math.round(box.top), bottom: Math.round(box.bottom), height: window.innerHeight };
}).catch(() => null);
record(view !== null && view.top >= 0 && view.bottom <= view.height, `which lands on it, in view (${JSON.stringify(view)})`);

/* ---- and while it is on ---- */

await landed.click();
await settle(true);
await page.goto(`${BASE}/admin/reports`, { waitUntil: 'domcontentloaded' });
await drawn(page, 'Tokens by person');
record((await page.locator('[data-recording-off]').count()) === 0, 'on, the report says nothing about it');
} finally {
  // Back as it was.
  await graphql(`mutation { setUsageTracking(enabled: ${before.enabled}) { enabled } }`).catch(() => undefined);
}
const { usageTracking: restored } = await graphql('query { usageTracking { enabled } }');
record(restored.enabled === before.enabled, 'and it is left as it was found');

/* ---- the report ---- */

// The heading sits centred on the row of pickers, not at the foot of it.
const centred = await page.evaluate(() => {
  const heading = [...document.querySelectorAll('h2')].find((one) => /Tokens by person/.test(one.textContent ?? ''));
  // Two columns of one shape: the heading on the labels' line, the search box level with the picker boxes.
  const head = heading?.closest('[class*="reportHead"]');
  const label = head?.querySelector('[class*="pickerLabel"]');
  const box = head?.querySelector('[class*="filters"] [data-select]');
  const search = head?.querySelector('input[type="search"]')?.parentElement;
  if (!heading || !label || !box || !search) return null;
  const mid = (el) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; };
  return { heading: Math.round(mid(heading) - mid(label)), search: Math.round(mid(search) - mid(box)) };
});
record(centred !== null && Math.abs(centred.heading) <= 2, `the heading is on the picker labels' line (${centred?.heading}px off)`);
record(centred !== null && Math.abs(centred.search) <= 2, `and the search box is level with the picker boxes (${centred?.search}px off)`);

const pickers = await page.locator('[data-select]').count();
record(pickers >= 3, `period, workspace and source can be chosen (${pickers} pickers)`);

const { usageReport } = await graphql(
  'query { usageReport(filter: {}) { total rows { key } } }',
);
const table = page.getByTestId('usage-table');
if (usageReport.total === 0) {
  record((await page.getByText('Nothing recorded in this period.').count()) === 1, 'an empty period says so instead of drawing an empty table');
} else {
  const headings = (await table.locator('thead th').allInnerTexts()).map((one) => one.trim().toLowerCase());
  record(
    ['person', 'source', 'sessions', 'input', 'cached', 'output', 'cost', 'last active'].every((one) => headings.includes(one)),
    `the people table names its columns (${headings.join(', ')})`,
  );
  const rows = await table.getByTestId('usage-person').count();
  record(rows === Math.min(usageReport.total, 25), `a row per person, a page at a time (${rows} of ${usageReport.total})`);

  const beside = await table.getByTestId('usage-person').first().evaluate((row) => {
    const name = row.querySelector('[class*="personName"]')?.getBoundingClientRect();
    const count = row.querySelector('[data-person-sessions]');
    const box = count?.getBoundingClientRect();
    return { text: count?.textContent ?? '', right: name !== undefined && box !== undefined && box.left >= name.right, cell: row.cells[2]?.textContent?.trim() };
  });
  record(beside.right && beside.text.includes(beside.cell), `the session count sits to the right of the name (${JSON.stringify(beside)})`);
  await table.getByTestId('usage-person').first().getByRole('button').click();
  const sessions = page.getByTestId('usage-sessions');
  await sessions.waitFor({ timeout: 10_000 });
  const lines = await sessions.getByTestId('usage-session').count();
  record(lines >= 1 && lines <= 5, `opening a person lists their sessions, five at most (${lines})`);
  const bar = await sessions.locator('[class*="barFill"]').first().boundingBox();
  record(bar !== null && bar.height > 0, 'with a share bar drawn beside each');
  // And when they last prompted each, and what their calls there cost - a dash where nothing was priced.
  const date = (await sessions.locator('[data-session-date]').first().textContent())?.trim() ?? '';
  record(/\d/.test(date), `each session says when they last prompted it (${date})`);
  const cost = (await sessions.locator('[data-session-cost]').first().textContent())?.trim() ?? '';
  record(/^(\$|under \$|—)/.test(cost), `and what it cost them (${cost})`);

  // Their sessions are put in a column's order by the server, across every page of them.
  const shares = async () => (await sessions.locator('[class*="sharePct"]').allInnerTexts()).map((one) => Number.parseInt(one, 10));
  const sortable = await sessions.locator('thead button').allInnerTexts();
  record(
    ['session', 'workspace', 'their share', 'tokens', 'cost', 'last active'].every((one) => sortable.some((text) => text.trim().toLowerCase() === one)),
    `every session column but the others is a sort control (${sortable.map((one) => one.trim()).join(', ')})`,
  );
  await sessions.getByRole('button', { name: 'Their share' }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="usage-sessions"] [aria-sort="descending"]')?.textContent?.includes('Their share') === true, null, { timeout: 5_000 }).catch(() => {});
  await page.waitForTimeout(500);
  const down = await shares();
  record(down.every((one, at) => at === 0 || down[at - 1] >= one), `pressing Their share puts the biggest share first (${down.join(', ')})`);
  await sessions.getByRole('button', { name: 'Their share' }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="usage-sessions"] [aria-sort="ascending"]')?.textContent?.includes('Their share') === true, null, { timeout: 5_000 }).catch(() => {});
  await page.waitForTimeout(500);
  const up = await shares();
  record(up.every((one, at) => at === 0 || up[at - 1] <= one), `and again the smallest (${up.join(', ')})`);
  await page.evaluate(() => { localStorage.removeItem('orknux.usage-sessions.sort-order'); localStorage.removeItem('orknux.usage-sessions.sort-ascending'); });

  /* ---- search over the person, order by a column, and the whole thing as a file ---- */

  const people = (await table.getByTestId('usage-person').evaluateAll((all) => all.map((one) => one.getAttribute('data-person'))));
  const firstName = (await table.getByTestId('usage-person').first().locator('[class*="personName"]').textContent())?.trim() ?? '';
  await page.getByRole('searchbox', { name: 'Search people' }).fill(firstName);
  await page.waitForFunction((name) => {
    const rows = [...document.querySelectorAll('[data-testid="usage-person"]')];
    return rows.length >= 1 && rows.every((row) => row.textContent?.includes(name));
  }, firstName, { timeout: 10_000 });
  const narrowed = await table.getByTestId('usage-person').count();
  record(narrowed >= 1 && narrowed <= people.length, `typing a name keeps that person (${narrowed} of ${people.length})`);
  await page.getByRole('searchbox', { name: 'Search people' }).fill('');
  await page.waitForFunction((count) => document.querySelectorAll('[data-testid="usage-person"]').length === count, people.length);

  await table.getByRole('button', { name: 'Person' }).click();
  await page.waitForTimeout(500);
  const byName = await table.getByTestId('usage-person').locator('[class*="personName"]').allInnerTexts();
  const sorted = [...byName].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  record(JSON.stringify(byName) === JSON.stringify(sorted) || byName.length < 2, `pressing Person puts the rows by name (${byName.join(' < ')})`);
  // Back to the usual order, so the next run starts where this one did.
  await table.getByRole('button', { name: 'Input' }).click();
  await page.waitForTimeout(300);
  await page.evaluate(() => { localStorage.removeItem('orknux.usage-report.sort-order'); localStorage.removeItem('orknux.usage-report.sort-ascending'); });

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15_000 }),
    page.getByTestId('usage-export').click(),
  ]);
  const saved = await download.path();
  const text = saved === null ? '' : (await import('node:fs')).readFileSync(saved, 'utf8');
  const csvLines = text.trim().split('\n');
  record(csvLines[0]?.startsWith("person,source,id,") === true, `the export is CSV with a header (${csvLines[0]?.slice(0, 40)})`);
  record(csvLines.length - 1 === usageReport.total, `and a line per person (${csvLines.length - 1} of ${usageReport.total})`);
}

await finish(browser);
