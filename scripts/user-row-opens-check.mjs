/**
 * A row of the Users list opens the user, from anywhere on the row.
 *
 * The pencil at the far right was the only way in, and a small target for the
 * one thing anybody wants from a row. Pressed in the middle of a row - the
 * email cell, nothing clickable of its own - the page is the user's; the name
 * is a real link for the keyboard; and the pencil still opens it, once, rather
 * than once for itself and once for the row under it.
 */
import { BASE, open, drawn, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1500, height: 900 } });

await page.goto(`${BASE}/admin/users`, { waitUntil: 'domcontentloaded' });
await drawn(page, 'Users');
const rows = page.getByTestId('user-row');
record((await rows.count()) > 0, 'the list has rows');
const first = rows.first();
const expected = await first.getByRole('link').first().getAttribute('href');

await first.locator('[class*="colEmail"]').click();
await page.waitForURL((url) => /\/admin\/users\/\d+$/.test(url.pathname), { timeout: 10_000 });
record(page.url().endsWith(expected ?? '§'), `pressing the row's email cell opens the user (${new URL(page.url()).pathname})`);
await page.goBack({ waitUntil: 'domcontentloaded' });
record(new URL(page.url()).pathname === '/admin/users', `and one Back is back at the list (${new URL(page.url()).pathname})`);

await page.goto(`${BASE}/admin/users`, { waitUntil: 'domcontentloaded' });
await drawn(page, 'Users');
const name = rows.first().getByRole('link').first();
record((await name.evaluate((one) => getComputedStyle(one).cursor)) === 'pointer', 'the name is drawn as a link');
await name.focus();
await page.keyboard.press('Enter');
await page.waitForURL((url) => /\/admin\/users\/\d+$/.test(url.pathname), { timeout: 10_000 });
record(true, 'and opens the user from the keyboard');
// The name is a link inside a row that also opens: the two must not both push history.
await page.goBack({ waitUntil: 'domcontentloaded' });
record(new URL(page.url()).pathname === '/admin/users', `one Back from the name's link is back at the list, not a second copy of the page (${new URL(page.url()).pathname})`);
await page.goto(`${BASE}/admin/users`, { waitUntil: 'domcontentloaded' });
await drawn(page, 'Users');
await rows.first().getByRole('link').first().click();
await page.waitForURL((url) => /\/admin\/users\/\d+$/.test(url.pathname), { timeout: 10_000 });
await page.goBack({ waitUntil: 'domcontentloaded' });
record(new URL(page.url()).pathname === '/admin/users', `and the same with the mouse (${new URL(page.url()).pathname})`);

await page.goto(`${BASE}/admin/users`, { waitUntil: 'domcontentloaded' });
await drawn(page, 'Users');
let navigations = 0;
page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) navigations += 1; });
await rows.first().getByRole('link', { name: /^Edit / }).click();
await page.waitForURL((url) => /\/admin\/users\/\d+$/.test(url.pathname), { timeout: 10_000 });
await page.waitForTimeout(300);
record(navigations <= 1, `the pencil opens the user once (${navigations} navigation${navigations === 1 ? '' : 's'})`);

await finish(browser);
