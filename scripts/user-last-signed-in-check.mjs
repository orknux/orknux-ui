/**
 * The Users list says when each person last signed in.
 *
 * The suite signs in as its user before the page opens, so that row has a
 * time rather than a dash; the column's heading sits over its cells, and the
 * heading sorts the list by it, newest first.
 */
import { BASE, USER, open, drawn, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1500, height: 900 } });

await page.goto(`${BASE}/admin/users`, { waitUntil: 'domcontentloaded' });
await drawn(page, 'Users');
const rows = page.getByTestId('user-row');
await rows.first().waitFor({ timeout: 15_000 });

const heading = page.getByRole('button', { name: /Last Signed In/ });
record((await heading.count()) === 1, 'the list has a Last Signed In heading');

const mine = rows.filter({ hasText: USER }).first();
const said = (await mine.getByTestId('user-signed-in').innerText()).trim();
record(said !== '—' && said !== '', `the signed-in user's row says when (${said})`);

// The heading over its own cells, not a column off.
const [headLeft, cellLeft] = await Promise.all([
  heading.evaluate((one) => Math.round(one.closest('[class*="colSignedIn"]')?.getBoundingClientRect().left ?? one.getBoundingClientRect().left)),
  mine.getByTestId('user-signed-in').evaluate((one) => Math.round(one.getBoundingClientRect().left)),
]);
record(Math.abs(headLeft - cellLeft) <= 2, `the heading sits over its cells (${headLeft} vs ${cellLeft})`);

// Sorted by it, newest first: the one who just signed in leads.
await heading.click();
await page.waitForTimeout(300);
const leading = (await rows.first().getByTestId('user-signed-in').innerText()).trim();
record(leading === said, `sorting by it puts the latest sign-in first (${leading})`);

await finish(browser);
