/**
 * Admin Settings draws every number the server behaves by under Limits, from
 * the list the server answers. Issue #453.
 *
 * What is pinned: there is a box per number the server lists, grouped under
 * the server's section headings; a box opens on what the server holds; a saved
 * number reads back; out of range is refused in words with nothing stored; and
 * "Default" hands the number back to the configuration file. What a number then
 * does is the server suite's business (TunablesTest).
 *
 * Leaves every number as it found it.
 */
import { BASE, open, drawn, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const KEY = 'agent.wait.default.seconds';
const listed = async () => (await graphql(`query { tunables { key value configured set least most } }`, {})).tunables;
const one = async () => (await listed()).find((held) => held.key === KEY);

const all = await listed();
const was = await one();
const WANT = was.value === 41 ? 42 : 41;
console.log(`${all.length} numbers listed; ${KEY} was ${was.value}; setting ${WANT}`);

await page.goto(`${BASE}/admin/settings#limits`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the admin settings page'), 'the admin settings page is on screen');

const box = page.locator(`[id="tunable-${KEY}"]`);
const there = await box.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
record(there, 'there is a Limits box for how long agent_wait waits when not told');
if (!there) await finish(browser);

const boxes = await page.locator('[data-tunable]').count();
record(boxes === all.length, `one box per number the server lists (${boxes} of ${all.length})`);
const groups = await page.locator('[data-tuning-section] h3').count();
record(groups >= 2, `drawn in the server's groups (${groups} headings)`);

record(Number(await box.inputValue()) === was.value, `it opens on what the server holds (${await box.inputValue()})`);

await box.fill(String(WANT));
await page.getByRole('button', { name: /^Save/ }).first().click();
await page.waitForTimeout(2500);
record((await one()).value === WANT, `saving ${WANT} stores it (${(await one()).value})`);

/* Out of range is refused in words, and nothing is stored. */
await page.goto(`${BASE}/admin/settings#limits`, { waitUntil: 'domcontentloaded' });
await page.locator(`[id="tunable-${KEY}"]`).fill(String(was.most + 1));
await page.getByRole('button', { name: /^Save/ }).first().click();
await page.waitForTimeout(2000);
const refusal = await page.locator('[role="alert"]').first().textContent().catch(() => '');
record(
  (refusal ?? '').includes(`${was.least}`) && (refusal ?? '').includes(`${was.most}`),
  `${was.most + 1} is refused in words (${JSON.stringify(refusal)})`,
);
record((await one()).value === WANT, 'and the stored number is untouched');

/* Default hands it back to the configuration file. */
await page.goto(`${BASE}/admin/settings#limits`, { waitUntil: 'domcontentloaded' });
const back = page.locator(`[data-tunable="${KEY}"] button[data-default]`);
const offered = await back.waitFor({ timeout: 10_000 }).then(() => true).catch(() => false);
record(offered, 'a number set here offers the way back to the default');
if (offered) {
  await back.click();
  await page.waitForTimeout(1500);
  const now = await one();
  record(!now.set && now.value === now.configured, `Default hands it back to the file (${now.value}, set ${now.set})`);
}

/* Left as it was found. */
await graphql(`mutation ($key: String!, $value: Int) { setTunable(key: $key, value: $value) { value } }`, {
  key: KEY,
  value: was.set ? was.value : null,
});
record((await one()).value === was.value, 'the number is left as it was found');

await finish(browser);
