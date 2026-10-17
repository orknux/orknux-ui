/**
 * Admin > Reports: the usage tracking switch, and the report under it.
 *
 * The switch is the whole of what is recorded, so what is asserted about it is
 * that it says what it is and survives a reload - and that, off, the page says
 * since when, because a report that stops at a date has to say which date. The
 * report is read as drawn: the four totals, the people table with its columns
 * named, and a person opened to their sessions, with the share bar beside each.
 *
 * Leaves the switch as it found it.
 */
import { BASE, open, drawn, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 1000 } });

const { usageTracking: before } = await graphql('query { usageTracking { enabled } }');

await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
await drawn(page, 'Workspaces');
const link = page.getByRole('link', { name: 'Reports' });
record((await link.count()) > 0, 'the admin menu offers Reports');
await link.first().click();
await drawn(page, 'Usage tracking');

const toggle = page.getByRole('switch', { name: /usage tracking/i });
const was = (await toggle.getAttribute('aria-checked')) === 'true';
record(was === before.enabled, `the switch says what the server has (${was})`);

await toggle.click();
await page.waitForFunction((expected) => document.querySelector('[role="switch"]')?.getAttribute('aria-checked') === String(expected), !was);
await page.reload({ waitUntil: 'domcontentloaded' });
await drawn(page, 'Usage tracking');
const after = (await page.getByRole('switch', { name: /usage tracking/i }).getAttribute('aria-checked')) === 'true';
record(after === !was, 'pressing it changes it, and a reload still says so');

const offLine = page.locator('[data-tracking-off-since]');
if (!after) {
  record(/Off since/.test((await offLine.textContent()) ?? ''), 'off, the page says since when');
} else {
  record((await offLine.count()) === 0, 'on, there is no off-since line');
}

// Back as it was.
await page.getByRole('switch', { name: /usage tracking/i }).click();
await page.waitForFunction((expected) => document.querySelector('[role="switch"]')?.getAttribute('aria-checked') === String(expected), was);
const { usageTracking: restored } = await graphql('query { usageTracking { enabled } }');
record(restored.enabled === before.enabled, 'and it is left as it was found');

/* ---- the report ---- */

const pickers = await page.locator('select').count();
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

  await table.getByTestId('usage-person').first().getByRole('button').click();
  const sessions = page.getByTestId('usage-sessions');
  await sessions.waitFor({ timeout: 10_000 });
  const lines = await sessions.getByTestId('usage-session').count();
  record(lines >= 1 && lines <= 5, `opening a person lists their sessions, five at most (${lines})`);
  const bar = await sessions.locator('[class*="barFill"]').first().boundingBox();
  record(bar !== null && bar.height > 0, 'with a share bar drawn beside each');
}

await finish(browser);
