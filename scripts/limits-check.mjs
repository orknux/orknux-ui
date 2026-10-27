/**
 * Admin Settings draws every number the server behaves by under Limits, from
 * the list the server answers. Issue #453.
 *
 * What is pinned: there is a box per number the server lists, grouped under
 * the server's section headings; a box opens on what the server holds; a saved
 * number reads back; a number with no ceiling takes the largest the box holds,
 * and its hint says only the floor; out of range is refused in words with
 * nothing stored, both ends said where there is a ceiling; and "Default" hands
 * the number back to the configuration file. What a number then does is the
 * server suite's business (TunablesTest).
 *
 * Leaves every number as it found it.
 */
import { BASE, open, drawn, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const KEY = 'agent.wait.default.seconds';
/** A share of a whole, which keeps its ceiling. */
const SHARE = 'tool.result.window.percent';
const LARGEST = 2147483647;
const listed = async () => (await graphql(`query { tunables { key value configured set least most } }`, {})).tunables;
const one = async (key = KEY) => (await listed()).find((held) => held.key === key);
const save = async () => {
  await page.getByRole('button', { name: /^Save/ }).first().click();
  await page.waitForTimeout(2000);
};
const refusal = async () => (await page.locator('[role="alert"]').first().textContent().catch(() => '')) ?? '';

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

/* No ceiling: the box has no max, the hint says only the floor, and the largest number is taken. */
record(was.most === null, `${KEY} has no upper bound (most ${was.most})`);
await page.goto(`${BASE}/admin/settings#limits`, { waitUntil: 'domcontentloaded' });
const unbounded = page.locator(`[id="tunable-${KEY}"]`);
await unbounded.waitFor({ timeout: 20_000 });
record((await unbounded.getAttribute('max')) === null, `its box sets no max (${await unbounded.getAttribute('max')})`);
const about = page.locator(`[data-tunable="${KEY}"] button[aria-controls]`).first();
await about.click();
const note = page.locator(`[id="${await about.getAttribute('aria-controls')}"]`);
const hint = (await note.textContent({ timeout: 5_000 }).catch(() => '')) ?? '';
record(hint.includes(`At least ${was.least};`) && !hint.includes('Between'), `its hint says only the floor (${JSON.stringify(hint.slice(-90))})`);
await about.click();
await unbounded.fill(String(LARGEST));
await save();
record((await one()).value === LARGEST, `the largest number the box holds is stored (${(await one()).value})`);

/* Below the floor is refused in words, and nothing is stored. */
await page.goto(`${BASE}/admin/settings#limits`, { waitUntil: 'domcontentloaded' });
await page.locator(`[id="tunable-${KEY}"]`).fill(String(was.least - 1));
await save();
const below = await refusal();
record(below.includes(`${was.least} or more`), `${was.least - 1} is refused in words (${JSON.stringify(below)})`);
record((await one()).value === LARGEST, 'and the stored number is untouched');

/* A share of a whole keeps its ceiling, and past it is refused saying both ends. */
const share = await one(SHARE);
record(share.most !== null, `${SHARE} keeps a ceiling (${share.most})`);
if (share.most !== null) {
  // A reload, not a goto: the same address with its hash is not a new page, and the box refused above would be sent again.
  await page.reload({ waitUntil: 'domcontentloaded' });
  const shareBox = page.locator(`[id="tunable-${SHARE}"]`);
  await shareBox.waitFor({ timeout: 20_000 });
  record((await shareBox.getAttribute('max')) === String(share.most), `its box's max is ${share.most}`);
  await shareBox.fill(String(share.most + 1));
  await save();
  const above = await refusal();
  record(
    above.includes(`${share.least}`) && above.includes(`${share.most}`),
    `${share.most + 1} is refused in words (${JSON.stringify(above)})`,
  );
  record((await one(SHARE)).value === share.value, 'and its stored number is untouched');
}

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
for (const [key, held] of [[KEY, was], [SHARE, share]]) {
  await graphql(`mutation ($key: String!, $value: Int) { setTunable(key: $key, value: $value) { value } }`, {
    key,
    value: held.set ? held.value : null,
  });
}
record((await one()).value === was.value && (await one(SHARE)).value === share.value, 'the numbers are left as they were found');

await finish(browser);
