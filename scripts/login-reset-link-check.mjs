/**
 * The sign-in page offers a password reset only where the installation keeps
 * the passwords. Issue #382.
 *
 * Under a directory sign-in the Reset link beside the password box led to a
 * page that could do nothing about a directory's password, and suggested it
 * could. The auth method is stubbed at the browser, both ways: the
 * installation under test signs in one way, and this is about the other.
 *
 * Signs nobody in and changes nothing.
 */
import { BASE, open, record, finish } from './suite/harness.mjs';

const { browser } = await open();

/** A fresh, signed-out browser told the installation signs in this way. */
const signInPageUnder = async (method) => {
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await context.newPage();
  await page.route('**/api/auth/method', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ method, displayName: 'an account', authorizeUrl: null, notice: null }),
    }),
  );
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Password', { exact: true }).first().waitFor({ timeout: 20_000 });
  await page.waitForTimeout(600);
  const reset = await page.getByRole('button', { name: 'Reset' }).count();
  await context.close();
  return reset;
};

record((await signInPageUnder('INTERNAL')) === 1, 'where the installation keeps the passwords, the password box offers Reset');
record((await signInPageUnder('LDAP')) === 0, 'under a directory sign-in it does not, because the password is not Orknux\'s to reset');

await finish(browser);
