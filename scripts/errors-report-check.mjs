/**
 * Admin > Reports > Errors: the report picker offers it, and it draws what
 * failed - how many of each source, what failed most often, and a row per
 * failure linking to its run or conversation - narrowed by source.
 *
 * Asked for as "add error report too", beside Usage and Ratings.
 */
import { BASE, open, drawn, record, finish, chooseOption, chosenOption } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 1000 } });

try {
  await page.goto(`${BASE}/admin/reports`, { waitUntil: 'domcontentloaded' });
  const picker = page.getByRole('combobox', { name: 'Report' });
  await picker.waitFor({ timeout: 20_000 });
  await chooseOption(page, picker, 'errors');
  await drawn(page, 'Errors');
  record((await chosenOption(page, picker)) === 'errors', 'the report picker offers Errors, and picking it opens it');

  const tiles = page.getByTestId('errors-tiles');
  await tiles.waitFor({ timeout: 15_000 });
  const said = (await tiles.textContent()) ?? '';
  record(/Workflow runs/.test(said) && /Agents/.test(said) && /Quick chat/.test(said), `tiles count each source (${said.replace(/\s+/g, ' ').slice(0, 120)})`);

  const { errorReport } = await graphql('query { errorReport(filter: { from: "2000-01-01" }, size: 5) { total rows { source } } }');
  if (errorReport.total === 0) {
    record(true, 'this installation has no recorded failures; the rows half is skipped');
  } else {
    await chooseOption(page, page.getByRole('combobox', { name: 'Period' }), '365');
    const rows = page.getByTestId('error-row');
    await rows.first().waitFor({ timeout: 15_000 });
    record((await rows.count()) > 0, `failures are listed (${await rows.count()} on the page)`);
    const message = ((await rows.first().locator('[data-error-message]').textContent()) ?? '').trim();
    record(message !== '', `a row says what the failure said ("${message.slice(0, 60)}")`);
    record((await page.getByTestId('errors-often').locator('tbody tr').count()) > 0, 'and what failed most often is listed above them');

    const source = errorReport.rows[0].source;
    await chooseOption(page, page.getByRole('combobox', { name: 'Source' }), source);
    await page.waitForTimeout(800);
    const sources = await rows.evaluateAll((all) => all.map((one) => one.getAttribute('data-error-source')));
    record(sources.length > 0 && sources.every((one) => one === source), `picking a source narrows the rows to it (${source}: ${[...new Set(sources)].join(',')})`);

    const link = rows.first().locator('a');
    if ((await link.count()) > 0) {
      const href = (await link.getAttribute('href')) ?? '';
      record(/\/(executions|sessions)\/\d+$/.test(href), `a row links to its run or conversation (${href})`);
    }
  }
} finally {
  await page.evaluate(() => { try { localStorage.removeItem('orknux.reports.kind'); } catch { /* none kept */ } }).catch(() => undefined);
}

await finish(browser);
