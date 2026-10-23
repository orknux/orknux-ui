/**
 * Admin > Reports keeps the report it shows in the address: a link to
 * `?report=errors` opens the errors report, picking another writes it there,
 * a reload keeps it, and an address naming none is given the one shown.
 */
import { BASE, open, record, finish, chooseOption, chosenOption } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1500, height: 1000 } });
const reportIn = () => new URL(page.url()).searchParams.get('report');
const picker = () => page.getByRole('combobox', { name: 'Report' });

try {
  await page.goto(`${BASE}/admin/reports?report=errors`, { waitUntil: 'domcontentloaded' });
  await picker().waitFor({ timeout: 20_000 });
  const errors = await page.getByTestId('errors-report').waitFor({ timeout: 15_000 }).then(() => true).catch(() => false);
  record(errors && (await chosenOption(page, picker())) === 'errors', 'a link naming the errors report opens it');

  await chooseOption(page, picker(), 'ratings');
  await page.waitForTimeout(500);
  record(reportIn() === 'ratings', `picking another writes it in the address (${page.url()})`);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await picker().waitFor({ timeout: 20_000 });
  record((await chosenOption(page, picker())) === 'ratings', 'and a reload keeps it');

  await page.goto(`${BASE}/admin/reports`, { waitUntil: 'domcontentloaded' });
  await picker().waitFor({ timeout: 20_000 });
  await page.waitForTimeout(500);
  const shown = await chosenOption(page, picker());
  record(reportIn() === shown, `an address naming none is given the one shown (${reportIn()} / ${shown})`);
} finally {
  await page.evaluate(() => { try { localStorage.removeItem('orknux.reports.kind'); } catch { /* none kept */ } }).catch(() => undefined);
}

await finish(browser);
