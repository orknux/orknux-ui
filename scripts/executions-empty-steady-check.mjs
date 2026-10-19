/**
 * An empty executions list stays still while it refreshes.
 *
 * With nothing to show, "No runs match those filters." was hidden while each
 * refresh loaded and shown again after, so with Auto at one second the table
 * grew and shrank every tick. The empty line is now kept through a refresh.
 *
 * Filters to a search nothing matches, then samples the table's height across
 * several refreshes.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 900 } });

// Slow answers, so a refresh is caught mid-load: the moment the line used to go.
await page.route('**/graphql', async (route) => {
  const query = route.request().postDataJSON()?.query ?? '';
  if (query.includes('workspaceExecutions')) await new Promise((resolve) => setTimeout(resolve, 400));
  return route.continue();
});

await page.goto(`${BASE}/workspace/${WORKSPACE}/executions`, { waitUntil: 'domcontentloaded' });
await page.getByPlaceholder(/Search executions/).fill(`zz nothing ${Date.now()}`);
await page.getByText('No runs match those filters.').waitFor({ timeout: 20_000 });

const heights = new Set();
let gone = 0;
for (let tick = 0; tick < 12; tick += 1) {
  await page.getByRole('button', { name: 'Refresh' }).click();
  for (let look = 0; look < 4; look += 1) {
    await page.waitForTimeout(120);
    if ((await page.getByText('No runs match those filters.').count()) === 0) gone += 1;
    heights.add(await page.evaluate(() => document.querySelector('[class*="table"]')?.getBoundingClientRect().height ?? -1));
  }
}
record(gone === 0 && heights.size === 1, `refreshing an empty list keeps its line and its height (${JSON.stringify({ gone, heights: [...heights] })})`);

await finish(browser);
