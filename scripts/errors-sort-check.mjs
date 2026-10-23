/**
 * The errors report's two tables are put in the order of a pressed heading:
 * the rows, a page at a time, in the server's order; what failed most often,
 * among its five. Asked for with a picture of both tables.
 */
import { BASE, open, drawn, record, finish, chooseOption } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 1000 } });

const sortedBy = (texts, ascending) =>
  texts.every((one, at) => at === 0 || (ascending ? 1 : -1) * texts[at - 1].localeCompare(one, undefined, { sensitivity: 'base' }) <= 0);

try {
  await page.evaluate(() => {
    try {
      for (const key of Object.keys(localStorage)) if (key.startsWith('orknux.errors-')) localStorage.removeItem(key);
    } catch { /* nothing kept */ }
  }).catch(() => undefined);
  await page.goto(`${BASE}/admin/reports`, { waitUntil: 'domcontentloaded' });
  const picker = page.getByRole('combobox', { name: 'Report' });
  await picker.waitFor({ timeout: 20_000 });
  await chooseOption(page, picker, 'errors');
  await drawn(page, 'Errors');

  const { errorReport } = await graphql('query { errorReport(filter: { from: "2000-01-01" }, size: 5) { total often { subject } } }');
  if (errorReport.total < 2) {
    record(true, 'this installation has fewer than two recorded failures; there is nothing to put in order');
  } else {
    await chooseOption(page, page.getByRole('combobox', { name: 'Period' }), '365');
    const table = page.getByTestId('errors-table');
    const rows = page.getByTestId('error-row');
    await rows.first().waitFor({ timeout: 15_000 });
    const subjects = () => rows.evaluateAll((all) => all.map((row) => row.children[2].textContent.trim()));
    // By its text: the headings are drawn in capitals, which a role's name follows.
    const heading = (box, name) => box.locator('thead th').filter({ hasText: new RegExp(`^${name}$`, 'i') });

    const when = heading(table, 'When');
    record((await when.locator('[aria-sort]').getAttribute('aria-sort')) === 'descending', 'the rows start newest first, and When says so');

    await heading(table, 'What').getByRole('button').click();
    await page.waitForTimeout(1200);
    const up = await subjects();
    record(sortedBy(up, true), `pressing What puts the rows A to Z (${up.slice(0, 4).join(' | ')})`);
    record((await heading(table, 'What').locator('[aria-sort]').getAttribute('aria-sort')) === 'ascending', 'and its heading says ascending');

    await heading(table, 'What').getByRole('button').click();
    await page.waitForTimeout(1200);
    const down = await subjects();
    record(sortedBy(down, false), `pressing it again turns them round (${down.slice(0, 4).join(' | ')})`);

    const sortable = await table.locator('thead th [aria-sort]').count();
    record(sortable === 5, `every heading of the rows is pressable (${sortable} of 5)`);

    if (errorReport.often.length > 1) {
      const often = page.getByTestId('errors-often');
      const oftenSubjects = () => often.locator('tbody tr').evaluateAll((all) => all.map((row) => row.children[0].textContent.trim()));
      await heading(often, 'What').getByRole('button').click();
      await page.waitForTimeout(400);
      const listed = await oftenSubjects();
      record(sortedBy(listed, true), `what failed most often goes A to Z by What (${listed.join(' | ')})`);
      const pressable = await often.locator('thead th [aria-sort]').count();
      record(pressable === 4, `and every one of its headings is pressable (${pressable} of 4)`);
    }
  }
} finally {
  await page.evaluate(() => {
    try {
      localStorage.removeItem('orknux.reports.kind');
      for (const key of Object.keys(localStorage)) if (key.startsWith('orknux.errors-')) localStorage.removeItem(key);
    } catch { /* none kept */ }
  }).catch(() => undefined);
}

await finish(browser);
