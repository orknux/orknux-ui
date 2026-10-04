/**
 * Somebody makes, sees and revokes their own access tokens from Preferences,
 * and the secret is copied with a copy button. Issue #2.
 *
 * Tokens used to be made only on Admin -> Users -> a user, so a person who was
 * not an administrator could not make one for themselves; and the secret was
 * shown above a small "Done" link, with nothing to copy it with. Both pages
 * now draw the same section: the token is made with a name, its secret is shown
 * once with a copy icon beside it, the list says when each was last used, and
 * a token is revoked from its row.
 *
 * The copy is asserted on the clipboard itself, from a plain-http origin, for
 * the reason copy-fallback-check gives. The tokens it makes are revoked again.
 */
import { BASE, USER, open, record, drawn, finish, clipboardText, setClipboardText, asPlainHttp } from './suite/harness.mjs';

const { browser, context, page, graphql } = await open({ viewport: { width: 1400, height: 1000 } });
await asPlainHttp(page);

const session = await (await context.request.get(`${BASE}/api/session`)).json();
const name = `own-tokens-check ${Date.now()}`;

/** One page's token section, driven the way a person would. */
async function mintAndCopy(where) {
  const section = page.getByTestId('access-tokens');
  const there = await section
    .waitFor({ timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  record(there, `${where}: an Access Tokens section is drawn`);
  if (!there) return null;
  await section.getByLabel('Token name').fill(name);
  await section.getByRole('button', { name: 'Generate Token' }).click();

  const notice = page.getByTestId('token-secret');
  const shown = await notice
    .waitFor({ timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  record(shown, `${where}: the new token's secret is shown`);
  if (!shown) return null;
  const secret = ((await notice.locator('code').textContent()) ?? '').trim();
  record(secret.startsWith('orkx_'), `${where}: and it is the secret, not a name (${secret.slice(0, 9)}…)`);
  record((await notice.getByRole('button', { name: 'Done' }).count()) === 0, `${where}: no Done link beside it`);

  const copy = notice.getByTestId('token-copy');
  const icon = (await copy.count()) === 1 && (await copy.locator('img').count()) === 1;
  record(icon, `${where}: a copy icon beside it instead`);
  // Beside the secret, on its line, rather than somewhere under it.
  const [code, button] = await Promise.all([notice.locator('code').boundingBox(), copy.boundingBox()]);
  record(
    code !== null && button !== null && button.x >= code.x + code.width - 1 && Math.abs(button.y + button.height / 2 - (code.y + code.height / 2)) < code.height,
    `${where}: on the secret's own line, to its right`,
  );

  await setClipboardText(context, 'nothing copied yet');
  await page.bringToFront();
  await copy.click();
  record(
    await notice.locator('[role="status"]', { hasText: 'Copied' }).waitFor({ timeout: 5_000 }).then(() => true).catch(() => false),
    `${where}: pressing it says Copied`,
  );
  record((await clipboardText(context)).trim() === secret, `${where}: and the clipboard holds the secret`);

  const row = section.getByTestId('access-token').filter({ hasText: name });
  record((await row.count()) === 1, `${where}: the token is listed by its name`);
  record(/never used/.test((await row.textContent()) ?? ''), `${where}: saying it has never been used`);
  return row;
}

async function revoke(where, row) {
  await row.getByRole('button', { name: 'Revoke' }).click();
  record(
    await row.waitFor({ state: 'detached', timeout: 10_000 }).then(() => true).catch(() => false),
    `${where}: revoking takes it off the list`,
  );
}

// ---- Preferences: the signed-in person's own --------------------------------

await page.goto(`${BASE}/preferences`, { waitUntil: 'domcontentloaded' });
if (await drawn(page, 'the preferences page')) {
  if (session.tokensAllowed !== true) {
    // A directory account: no tokens, and no section offering one.
    await page.waitForTimeout(1000);
    record(
      (await page.getByTestId('preferences-tokens').count()) === 0,
      `Preferences: ${USER} signs in through a directory, so no token section is drawn`,
    );
  } else {
    const row = await mintAndCopy('Preferences');
    const listed = await graphql('{ myTokens { name } }');
    record(listed.myTokens.some((one) => one.name === name), 'Preferences: the server holds it as their own');
    if (row !== null) await revoke('Preferences', row);
    const after = await graphql('{ myTokens { name } }');
    record(!after.myTokens.some((one) => one.name === name), 'Preferences: and the server no longer holds it');
  }
}

// ---- Admin -> Users -> a user: the same section, the same copy button --------

const { users } = await graphql('{ users { id username editable } }');
let target = users.find((one) => one.username === USER && one.editable);
if (target === undefined) {
  // A directory administrator has no tokens of their own; an internal user to hold them, made once.
  target =
    users.find((one) => one.username === 'own-tokens-check') ??
    (await graphql('mutation { createUser(input: { username: "own-tokens-check", displayName: "Token check" }) { id username editable } }'))
      .createUser;
}
await page.goto(`${BASE}/admin/users/${target.id}`, { waitUntil: 'domcontentloaded' });
if (await drawn(page, "the user's page")) {
  const row = await mintAndCopy('Admin user page');
  if (row !== null) await revoke('Admin user page', row);
}

await finish(browser);
