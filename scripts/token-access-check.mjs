/**
 * An access token is made read-only or read and write, and a read-only one
 * reads and changes nothing.
 *
 * Made on a user's page with the picker beside the name, listed with what it
 * may do, and then used as a script would: a query answers, a mutation is
 * refused. The server's half - MCP offering only reading tools, other writes
 * refused - is ReadOnlyTokenTest's.
 *
 * Makes a token and revokes it.
 */
import { BASE, USER, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, context, page, graphql } = await open({ viewport: { width: 1400, height: 1000 } });
const name = `token-access-check ${Date.now()}`;

const { users } = await graphql('{ users { id username editable } }');
const target =
  users.find((one) => one.username === USER && one.editable) ??
  users.find((one) => one.username === 'own-tokens-check') ??
  (await graphql('mutation { createUser(input: { username: "own-tokens-check", displayName: "Token check" }) { id username editable } }'))
    .createUser;

await page.goto(`${BASE}/admin/users/${target.id}`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, "the user's page"), "the user's page opens");
const section = page.getByTestId('access-tokens');
await section.waitFor({ timeout: 20_000 });

await section.getByLabel('Token name').fill(name);
await section.getByTestId('token-access').selectOption('read');
await section.getByRole('button', { name: 'Generate Token' }).click();
await page.getByTestId('token-secret').waitFor({ timeout: 10_000 });
const secret = ((await page.getByTestId('token-secret').locator('code').textContent()) ?? '').trim();
record(secret.startsWith('orkx_'), 'a token is made from the picker set to Read-only');

const row = section.getByTestId('access-token').filter({ hasText: name });
record((await row.locator('[data-token-access]').getAttribute('data-token-access')) === 'read', 'and it is listed as read-only');

/* Used as a script uses it: no cookie, just the token. */
const asToken = async (query) => {
  const answer = await context.request.fetch(`${BASE}/graphql`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json', Cookie: '' },
    data: { query },
  });
  return answer.json();
};
const read = await asToken('{ myTokens { name } }');
record(read.errors === undefined, `a query answers (${JSON.stringify(read).slice(0, 80)})`);
const wrote = await asToken('mutation { createUserToken(name: "should not exist") { secret } }');
record(wrote.errors?.[0]?.extensions?.code === 'TokenReadOnly', `a mutation is refused (${JSON.stringify(wrote).slice(0, 120)})`);

await row.getByRole('button', { name: 'Revoke' }).click();
record(await row.waitFor({ state: 'detached', timeout: 10_000 }).then(() => true).catch(() => false), 'and it is revoked');

await finish(browser);
