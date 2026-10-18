/**
 * A notification list that could not be read says so, and is not drawn empty.
 *
 * While the server was restarting the bell kept its "9+" and the panel said
 * "Nothing yet." - an empty list and a failed one looked the same, so the panel
 * contradicted the badge over it. The failure is now said as a failure, and a
 * count that could not be asked for leaves no stale number on the bell.
 *
 * The list and the count are failed here; nothing is read or marked read.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 900 } });

let failCount = false;
await page.route('**/graphql', async (route) => {
  const sent = route.request().postData() ?? '';
  if (sent.includes('myNotifications(')) return route.fulfill({ status: 502, body: 'Bad Gateway' });
  if (failCount && sent.includes('myNotificationCount')) return route.fulfill({ status: 502, body: 'Bad Gateway' });
  return route.continue();
});

await page.goto(`${BASE}/workspace/${WORKSPACE}/issues`, { waitUntil: 'domcontentloaded' });
const bell = page.getByRole('button', { name: /^Notifications/ });
await bell.waitFor({ timeout: 20_000 });
await page.waitForTimeout(1000);
await bell.click();
const panel = page.getByRole('dialog', { name: 'Notifications' });
await panel.waitFor({ timeout: 10_000 });
await page.waitForTimeout(800);
const said = (await panel.innerText()).trim();
record(!/Nothing yet/.test(said), `a list that failed is not drawn as empty ("${said}")`);
record(/could not be loaded/i.test(said), 'it says the notifications could not be loaded');

// A count that cannot be asked for leaves no number behind.
await page.keyboard.press('Escape');
failCount = true;
await page.evaluate(() => window.dispatchEvent(new Event('focus')));
await page.waitForTimeout(1500);
const label = await bell.getAttribute('aria-label');
record(label === 'Notifications', `a count that failed shows none, not the last one (${label})`);

await finish(browser);
