/**
 * A list that refreshes itself does not move while it does.
 *
 * The audit log, and the workspace's audit and triggers lists, drew a spinner
 * line above the rows on every reload - so with auto-refresh on, the whole
 * table jumped down and back once a second. The spinner is for the first load,
 * before there is anything to keep still; after that a reload replaces what
 * changed and leaves the rows where they are.
 *
 * Measured: the first row's top, sampled through a refresh, never moves.
 */
import { BASE, WORKSPACE, open, drawn, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1600, height: 1000 } });

for (const [where, path, row, refresh] of [
  ['admin audit', '/admin/audit', '[class*="row"]', /refresh the audit log/i],
  ['workspace audit', `/workspace/${WORKSPACE}/audit`, '[class*="row"]', /refresh/i],
  ['triggers', `/workspace/${WORKSPACE}/triggers`, '[class*="row"]', /refresh/i],
]) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await drawn(page, where);
  const first = page.locator(`section ${row}, table ${row}`).first();
  if ((await first.count()) === 0) {
    record(false, `${where}: a row to watch`);
    continue;
  }
  // A late web font moves everything once; that is not what is measured here.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  const before = (await first.boundingBox())?.y ?? -1;
  const button = page.getByRole('button', { name: refresh }).first();
  // Held for long enough to be seen: a local reload answers before a sample could catch anything moving.
  const slow = async (route) => {
    await new Promise((done) => setTimeout(done, 600));
    await route.continue();
  };
  await page.route('**/graphql', slow);
  await button.click();
  // Sample while the reload is in flight and after it: the row must sit still throughout.
  const tops = new Set();
  for (let i = 0; i < 20; i++) {
    tops.add(Math.round((await first.boundingBox())?.y ?? -1));
    await page.waitForTimeout(50);
  }
  await page.unroute('**/graphql', slow);
  // A pixel of rounding is not a jump; the spinner line was thirty.
  record([...tops].every((top) => Math.abs(top - before) <= 1), `${where}: the first row stays put through a refresh (before ${Math.round(before)}, tops ${[...tops].join(', ')})`);
}

await finish(browser);
