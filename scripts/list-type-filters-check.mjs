/**
 * Three lists narrowed by type: providers and models on the Models page,
 * connections on Integrations - and the providers table now says each row's
 * type, which it never did.
 *
 * Each sieve offers only the types the workspace has, so where a list holds
 * one type there is no sieve and nothing to assert; where it holds two or
 * more, choosing one leaves rows of that type and only those, counted off what
 * is drawn. Reads the workspace as it is and changes nothing.
 */
import { BASE, WORKSPACE, open, drawn, record, finish, chooseOption, optionsOffered } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1600, height: 1000 } });

/** Choose each value of a sieve in turn and count the rows that remain, by a data attribute naming the row's type. */
async function sieve(where, filterId, rowAttribute) {
  const filter = page.getByTestId(filterId);
  const rows = await page.locator(`[${rowAttribute}]`).count();
  // Drawn whenever the list has a row, a single type included: a filter that comes and goes with the data reads as missing.
  record(rows === 0 || (await filter.count()) === 1, `${where}: the sieve is drawn (${rows} row(s))`);
  if ((await filter.count()) === 0) return;
  const select = filter;
  const values = (await optionsOffered(page, select)).map((one) => one.value).filter((one) => one !== '');
  record(values.length >= 1, `${where}: the sieve offers the types the list has (${values.join(', ')})`);
  for (const value of values) {
    await chooseOption(page, select, value);
    await page.waitForTimeout(150);
    const seen = await page.locator(`[${rowAttribute}]`).evaluateAll((all) => all.map((one) => one.getAttribute(one.getAttributeNames().find((name) => name.startsWith('data-')))));
    record(seen.length > 0 && seen.every((one) => one === value), `${where}: choosing ${value} leaves ${seen.length} row(s), all of it`);
  }
  await chooseOption(page, select, '');
}

/* ---- Models page: providers wear their type, and both lists have a sieve ---- */

await page.goto(`${BASE}/workspace/${WORKSPACE}/models`, { waitUntil: 'domcontentloaded' });
await drawn(page, 'Providers');
// Against the rows drawn on this page of the list, not the workspace's count: the list is paged.
const drawnRows = await page.locator('section').first().locator('[class*="rowOpens"]').count();
const typed = await page.locator('[data-provider-type]').count();
record(typed > 0 && typed === drawnRows, `every provider row says its type (${typed} of ${drawnRows} rows)`);
await sieve('providers', 'provider-type-filter', 'data-provider-type');
await sieve('models', 'model-kind-filter', 'data-model-kind');

/* ---- Integrations: connections by kind ---- */

await page.goto(`${BASE}/workspace/${WORKSPACE}/integrations`, { waitUntil: 'domcontentloaded' });
await drawn(page, 'Connections');
await sieve('connections', 'connection-type-filter', 'data-connection-kind');

await finish(browser);
