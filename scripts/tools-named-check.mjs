/**
 * Admin Settings sets up to how many findable tools find_tools names outright.
 * Issue #442.
 *
 * The number used to be in the source. What is pinned here is the knob: the
 * box opens on what the server holds, a saved number reads back, the range is
 * refused in words, and what the number does to find_tools' description is
 * ToolSearchTest's business.
 *
 * Leaves the setting as it found it.
 */
import { BASE, open, drawn, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const named = async () =>
  (await graphql(`query { installationSettings { toolsNamedInSearch toolsNamedInSearchConfigured } }`, {}))
    .installationSettings;

const was = (await named()).toolsNamedInSearch;
const WANT = was === 12 ? 24 : 12;
console.log(`named was ${was}; setting ${WANT}`);

await page.goto(`${BASE}/admin/settings`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the admin settings page'), 'the admin settings page is on screen');

const box = page.locator('#tools-named-in-search');
const there = await box.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
record(there, 'there is a box for how many findable tools are named outright');
if (!there) await finish(browser);

record(Number(await box.inputValue()) === was, `it opens on what the server holds (${await box.inputValue()})`);

await box.fill(String(WANT));
await page.getByRole('button', { name: /^Save/ }).first().click();
await page.waitForTimeout(2500);
record((await named()).toolsNamedInSearch === WANT, `saving ${WANT} stores it (${(await named()).toolsNamedInSearch})`);

/* Out of range is refused in words, and nothing is stored. */
await page.goto(`${BASE}/admin/settings`, { waitUntil: 'domcontentloaded' });
await page.locator('#tools-named-in-search').fill('501');
await page.getByRole('button', { name: /^Save/ }).first().click();
await page.waitForTimeout(2000);
const refusal = await page.locator('[role="alert"]').first().textContent().catch(() => '');
record((refusal ?? '').includes('between 0 and 500'), `501 is refused in words (${JSON.stringify(refusal)})`);
record((await named()).toolsNamedInSearch === WANT, 'and the stored number is untouched');

/* Left as it was found. */
await page.goto(`${BASE}/admin/settings`, { waitUntil: 'domcontentloaded' });
await page.locator('#tools-named-in-search').fill(String(was));
await page.getByRole('button', { name: /^Save/ }).first().click();
await page.waitForTimeout(2000);
record((await named()).toolsNamedInSearch === was, 'the setting is left as it was found');

await finish(browser);
