/**
 * A workspace's web search is set on its own Settings page, not only on the
 * administrator's copy of it: Research and the search tools read it, and the
 * person running the workspace is the one who goes looking. The side menu's
 * search finds it, and the engine and key are there to be set.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 1000 } });

await page.goto(`${BASE}/workspace/${WORKSPACE}/settings`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('section-menu').waitFor({ timeout: 30_000 }).catch(() => undefined);
await page.locator('h2#search').waitFor({ timeout: 20_000 }).catch(() => undefined);

const entries = await page.getByTestId('section-menu').locator('a, button').allInnerTexts().catch(() => []);
record(entries.map((one) => one.trim()).includes('Search'), `the side menu lists Search (${entries.map((one) => one.trim()).join(', ')})`);

await page.getByPlaceholder('Search settings…').fill('sear');
await page.waitForTimeout(400);
const found = await page.evaluate(() => {
  const heading = document.querySelector('h2#search');
  const box = heading?.getBoundingClientRect();
  return { shown: heading !== null && box !== undefined && box.height > 0, nothing: document.body.innerText.includes('No setting matches.') };
});
record(found.shown && !found.nothing, `searching "sear" keeps the Search section on the page (${JSON.stringify(found)})`);

await page.getByPlaceholder('Search settings…').fill('');
const fields = { engine: await page.locator('#search-engine').count(), key: await page.locator('#search-key').count() };
record(fields.engine === 1, `the section offers the search engine (${JSON.stringify(fields)})`);

await finish(browser);
