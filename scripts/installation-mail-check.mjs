/**
 * Admin -> Settings -> Mail: the installation's own mail server, set from the
 * browser. The section is filled in, goes out with the page's one Save, and
 * after a reload the boxes hold what was stored - except the password, which
 * comes back as set and never as itself, in the box or in any answer.
 *
 * Against the real server rather than a stubbed one, because what is being
 * checked is the round trip: that the stored row is what the page reads back.
 * The host is under .invalid, so the Test on the line below the form is
 * refused without anything leaving the machine, and its answer is shown there.
 * The installation is put back the way it was found at the end.
 */
import { BASE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });

const SECRET = 'mail-check-secret-7319';
const before = (await graphql('{ installationMail { source } }')).installationMail.source;
if (before === 'STORED') {
  // Saving over it would lose somebody's mail server, and there is no password to put back.
  record(false, 'this installation already stores a mail server; run this where Admin Settings -> Mail holds none');
  await finish(browser);
}

// Every answer the page is given, so the password can be looked for in all of them.
const answers = [];
page.on('response', async (response) => {
  if (!response.url().includes('/graphql')) return;
  answers.push(await response.text().catch(() => ''));
});

async function openSection() {
  await page.goto(`${BASE}/admin/settings#mail`, { waitUntil: 'domcontentloaded' });
  await page.locator('#mail-host').waitFor({ timeout: 20_000 }).catch(() => undefined);
  await page
    .waitForFunction(() => document.querySelector('[data-mail-source]')?.getAttribute('data-mail-source') !== '', null, { timeout: 20_000 })
    .catch(() => undefined);
}

await openSection();
record((await page.locator('#mail-host').count()) === 1, 'Admin Settings has a Mail section with a host box');

await page.locator('#mail-host').fill('smtp.mail-check.invalid');
await page.locator('#mail-port').fill('2525');
await page.locator('#mail-security').click();
await page.getByRole('option', { name: 'TLS (implicit)' }).click();
await page.locator('#mail-username').fill('mailer');
await page.locator('#mail-password').fill(SECRET);
await page.locator('#mail-from').fill('orknux@mail-check.invalid');
await page.getByRole('button', { name: /^Save/ }).first().click();
await page
  .waitForFunction(() => document.querySelector('[data-mail-source]')?.getAttribute('data-mail-source') === 'STORED', null, { timeout: 10_000 })
  .catch(() => undefined);

await page.reload({ waitUntil: 'domcontentloaded' });
await openSection();

const value = (id) => page.locator(id).inputValue().catch(() => '');
record((await page.locator('[data-mail-source]').getAttribute('data-mail-source')) === 'STORED', 'after a reload the section says the server is set here');
record((await value('#mail-host')) === 'smtp.mail-check.invalid', `the host is the one saved (${await value('#mail-host')})`);
record((await value('#mail-port')) === '2525', `the port is the one saved (${await value('#mail-port')})`);
record(
  ((await page.locator('#mail-security').textContent()) ?? '').includes('TLS (implicit)'),
  `the security is the one chosen (${await page.locator('#mail-security').textContent()})`,
);
record((await value('#mail-username')) === 'mailer', `the username is the one saved (${await value('#mail-username')})`);
record((await value('#mail-from')) === 'orknux@mail-check.invalid', `the from address is the one saved (${await value('#mail-from')})`);
record(
  (await page.locator('#mail-password').getAttribute('data-password-set')) === 'true' && (await value('#mail-password')) === '',
  'the password is shown as set, and its box is empty',
);
record(!answers.some((text) => text.includes(SECRET)), 'no answer the page was given carries the password');

// Test sits on the line below the form, and what the relay said is shown there.
const test = page.locator('[data-mail-test]');
const form = await page.locator('#mail-from').boundingBox();
const button = await test.boundingBox();
record(form !== null && button !== null && button.y > form.y + form.height, 'Test is on the line below the form');
await page.locator('#mail-test-to').fill('nobody@mail-check.invalid');
await test.click();
await page.locator('[data-mail-test-result]').waitFor({ timeout: 60_000 }).catch(() => undefined);
record(
  (await page.locator('[data-mail-test-result]').getAttribute('data-mail-test-result').catch(() => null)) === 'failed',
  'a test through a host that does not exist is refused, on that line',
);

await page.locator('[data-mail-use-environment]').click({ timeout: 10_000 }).catch(() => undefined);
await page
  .waitForFunction(() => document.querySelector('[data-mail-source]')?.getAttribute('data-mail-source') !== 'STORED', null, { timeout: 10_000 })
  .catch(() => undefined);
record((await page.locator('[data-mail-source]').getAttribute('data-mail-source')) !== 'STORED', 'Use environment settings forgets what was stored');
// Put back however the page fared, so a failure above leaves no server behind.
await graphql('mutation { clearInstallationMail { source } }').catch(() => undefined);

await finish(browser);
