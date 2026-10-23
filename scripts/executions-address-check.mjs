/**
 * The Runs page's filters are in its address: the status, the date range and
 * the search, beside the workflow #437 put there. A filter in component state
 * is one somebody had set once; in the address it is one they can paste, and
 * one Back and a reload keep.
 *
 * Each filter is set on the page and read off the address, then the address is
 * opened cold and each control read back. A value equal to the default is left
 * out, so the page as it opens has a bare address.
 */
import { BASE, WORKSPACE, open, record, finish, chooseOption } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 900 } });
const runs = `${BASE}/workspace/${WORKSPACE}/executions`;
const params = () => Object.fromEntries(new URL(page.url()).searchParams);
const combos = () => page.locator('[role="combobox"][data-select]');
const search = () => page.getByPlaceholder('Search executions...');

await page.goto(runs, { waitUntil: 'domcontentloaded' });
await combos().first().waitFor({ timeout: 20_000 });
record(Object.keys(params()).length === 0, `the page as it opens has a bare address (${page.url()})`);

await chooseOption(page, combos().nth(0), { value: 'FAILED' });
await chooseOption(page, combos().nth(2), { value: '7' });
await search().fill('nightly');
await page.waitForTimeout(800);
const held = params();
record(held.status === 'FAILED' && held.days === '7' && held.q === 'nightly', `each filter is written to the address (${JSON.stringify(held)})`);

// Cold: a new page on that address draws the same filters.
const shared = page.url();
await page.goto('about:blank');
await page.goto(shared, { waitUntil: 'domcontentloaded' });
await combos().first().waitFor({ timeout: 20_000 });
const read = {
  status: await combos().nth(0).getAttribute('data-value'),
  days: await combos().nth(2).getAttribute('data-value'),
  q: await search().inputValue(),
};
record(read.status === 'FAILED' && read.days === '7' && read.q === 'nightly', `opened cold, the address sets the filters (${JSON.stringify(read)})`);

// All time is not the default, so it is written out; the default is left out again.
await chooseOption(page, combos().nth(2), { value: '' });
await page.waitForTimeout(300);
record(params().days === 'all', `all time is said in the address (${JSON.stringify(params())})`);
await chooseOption(page, combos().nth(0), { value: '' });
await chooseOption(page, combos().nth(2), { value: '1' });
await search().fill('');
await page.waitForTimeout(800);
record(Object.keys(params()).length === 0, `and the defaults leave it bare again (${page.url()})`);

await finish(browser);
