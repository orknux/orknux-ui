/**
 * Admin › Settings › Network access: the desktop app's switch between this
 * computer only and the network.
 *
 * On a server that is not the desktop app's - the development server, CI's
 * fixture - there is no such switch and no card. On the desktop app the card
 * offers the two, asks for the password the person will sign in with when
 * going to the network, refuses two that differ or one too short before it
 * sends anything, and sends the choice with the password.
 *
 * The desktop half is canned: the query is answered as a desktop server would,
 * and the mutation is captured and answered here, so nothing restarts.
 */
import { BASE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 1000 } });

const card = page.getByTestId('desktop-network');
const settings = async () => {
  await page.goto(`${BASE}/admin/settings`, { waitUntil: 'domcontentloaded' });
  await page.locator('#server-updates').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
};

// Not the desktop app's server: nothing to draw.
await settings();
record((await card.count()) === 0, 'off the desktop app, Admin › Settings has no Network access card');

// The desktop app's, as it would answer.
const sent = [];
await page.route('**/graphql', async (route) => {
  const body = route.request().postDataJSON() ?? {};
  const query = body.query ?? '';
  const desktop = { mode: 'LOCAL', chosen: 'LOCAL', restartRequired: false, addresses: ['http://192.168.1.20:8080'], account: 'micha', restarts: false };
  if (query.includes('setDesktopNetwork')) {
    sent.push(body.variables);
    return route.fulfill({ json: { data: { setDesktopNetwork: { ...desktop, chosen: body.variables.mode, restartRequired: true } } } });
  }
  if (query.includes('desktopNetwork')) return route.fulfill({ json: { data: { desktopNetwork: desktop } } });
  return route.continue();
});
await settings();
await card.waitFor({ timeout: 10_000 }).catch(() => undefined);
record((await card.count()) === 1, 'on the desktop app it draws the card');
record((await page.locator('#network-access').count()) === 1, 'under its own heading, which the settings menu lists');

const apply = page.getByTestId('desktop-network-apply');
record(await apply.isDisabled(), 'nothing to apply until something changes');

await card.getByLabel(/Anyone on the network/).check();
await page.locator('#desktop-network-password').fill('correct horse battery');
await page.locator('#desktop-network-repeat').fill('correct horse batterz');
record((await card.getByText('The two passwords differ').count()) === 1 && (await apply.isDisabled()), 'two passwords that differ are said, and stop it');

await page.locator('#desktop-network-repeat').fill('correct horse battery');
record((await card.getByText(/micha/).count()) > 0 && (await card.getByText('http://192.168.1.20:8080').count()) === 1, 'it names who signs in, and where others open it');
await apply.click();
await page.waitForTimeout(400);
record(
  sent.length === 1 && sent[0].mode === 'EXPOSED' && sent[0].password === 'correct horse battery',
  `Apply sends the choice with the password (${JSON.stringify(sent[0] ?? null)})`,
);

await finish(browser);
