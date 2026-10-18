/**
 * The top bar calls somebody by their display name where the installation has
 * one, and by their username only where it has none.
 *
 * It always printed the username. On the desktop app that is the open-access
 * account, "everyone", while the server had already named the account after
 * the person at the machine - so the one screen that says who you are said
 * nobody. The session now carries the display name; here it is rewritten in
 * the browser, so the check needs no user of its own.
 */
import { BASE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 900 } });

let named = 'Ada Lovelace';
await page.route('**/api/session', async (route) => {
  if (route.request().method() !== 'GET') return route.continue();
  const answered = await route.fetch();
  const json = await answered.json().catch(() => null);
  if (json === null || typeof json !== 'object') return route.fulfill({ response: answered });
  return route.fulfill({ response: answered, json: { ...json, displayName: named } });
});

const header = async () => {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  const menu = page.getByRole('button', { name: /^Account menu for / });
  await menu.waitFor({ timeout: 20_000 });
  return { label: await menu.getAttribute('aria-label'), text: (await page.locator('header').first().innerText()).replace(/\s+/g, ' ') };
};

const shown = await header();
record(shown.label === 'Account menu for Ada Lovelace', `the account menu names the display name (${shown.label})`);
record(/Ada Lovelace/.test(shown.text) && /\bAD\b/.test(shown.text), 'the top bar prints it, and its initials');

named = null;
const plain = await header();
record(!/Ada Lovelace/.test(plain.text) && /^Account menu for \S+$/.test(plain.label ?? ''), `with none, the username stands in (${plain.label})`);

await finish(browser);
