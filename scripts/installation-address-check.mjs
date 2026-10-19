/**
 * Admin -> Settings -> Address: where the installation is reached from, which
 * the links it writes are built on. The box opens empty with ORKNUX_BASE_URL as
 * its placeholder, an address typed goes out with the page's Save, and a
 * refusal is shown where it was typed.
 */
import { BASE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1600, height: 1000 } });
const sent = [];
let stored = null;

await page.route('**/graphql', async (route) => {
  const body = route.request().postDataJSON() ?? {};
  const query = body.query ?? '';
  const answer = () => ({ url: stored ?? 'http://localhost:5173', stored, configured: 'http://localhost:5173' });
  if (query.includes('setInstallationAddress(')) {
    const url = body.variables?.url ?? '';
    sent.push(url);
    if (url !== '' && !/^https?:\/\//.test(url)) {
      return route.fulfill({
        json: { data: null, errors: [{ message: `${url} is not an address this installation can be reached at.`, extensions: { code: 'InstallationAddressInvalid', arguments: { url } } }] },
      });
    }
    stored = url === '' ? null : url;
    return route.fulfill({ json: { data: { setInstallationAddress: answer() } } });
  }
  if (query.includes('installationAddress')) {
    return route.fulfill({ json: { data: { installationAddress: answer() } } });
  }
  return route.continue();
});

await page.goto(`${BASE}/admin/settings#address`, { waitUntil: 'domcontentloaded' });
const box = page.locator('#installation-address');
await box.waitFor({ timeout: 20_000 }).catch(() => undefined);
await page.waitForFunction(() => !document.querySelector('#installation-address')?.disabled, null, { timeout: 20_000 }).catch(() => undefined);
record((await box.count()) === 1, 'Admin Settings has a box for the installation address');
record((await box.getAttribute('placeholder').catch(() => '')) === 'http://localhost:5173', 'which shows ORKNUX_BASE_URL while it is empty');

await box.fill('https://orknux.example.com/');
await page.getByRole('button', { name: /^Save/ }).first().click();
await page.waitForTimeout(1500);
record(sent.includes('https://orknux.example.com'), `Save sends the address typed, without its trailing slash (${JSON.stringify(sent)})`);

await box.fill('orknux.example.com');
await page.getByRole('button', { name: /^Save/ }).first().click();
await page.waitForTimeout(1500);
record((await page.getByRole('alert').filter({ hasText: 'orknux.example.com' }).count()) > 0, 'an address that is not one is refused, with the reason');

await finish(browser);
