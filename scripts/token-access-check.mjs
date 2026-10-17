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

/* The picker reads as one: the app's chevron beside it, and as tall as the name box it sits beside. */
const drawnAs = await section.evaluate((root) => {
  const picker = root.querySelector('[data-testid="token-access"]');
  const box = root.querySelector('input[aria-label="Token name"]');
  return {
    chevron: picker?.parentElement?.querySelector('img') !== null,
    native: getComputedStyle(picker).appearance,
    picker: Math.round(picker.getBoundingClientRect().height),
    box: Math.round(box.getBoundingClientRect().height),
  };
});
record(drawnAs.chevron && drawnAs.native === 'none', `the picker carries the app's chevron, not the browser's arrow (${JSON.stringify(drawnAs)})`);
record(Math.abs(drawnAs.picker - drawnAs.box) <= 1, `and is as tall as the name box beside it (${drawnAs.picker} / ${drawnAs.box})`);
await page.screenshot({ path: '/tmp/token-access.png', clip: await section.boundingBox() });

await section.getByLabel('Token name').fill(name);
await section.getByTestId('token-access').selectOption('read');
await section.getByRole('button', { name: 'Generate Token' }).click();
await page.getByTestId('token-secret').waitFor({ timeout: 10_000 });
const secret = ((await page.getByTestId('token-secret').locator('code').textContent()) ?? '').trim();
record(secret.startsWith('orkx_'), 'a token is made from the picker set to Read-only');

const row = section.getByTestId('access-token').filter({ hasText: name });
record((await row.locator('[data-token-access]').getAttribute('data-token-access')) === 'read', 'and it is listed as read-only');

/* The row reads at the size of the name it belongs to, not at a footnote's. */
const sizes = await row.evaluate((one) => {
  const px = (el) => (el === null ? 0 : parseFloat(getComputedStyle(el).fontSize));
  const parts = [...one.children];
  return {
    name: px(parts[0]),
    access: px(one.querySelector('[data-token-access]')),
    when: px(parts.find((el) => /used/.test(el.textContent ?? '')) ?? null),
    revoke: px(one.querySelector('button')),
  };
});
record(sizes.when === sizes.name && sizes.revoke === sizes.name, `when it was used and Revoke are the name's size (${JSON.stringify(sizes)})`);
record(sizes.access >= 12, `and the access tag is no smaller than 12px (${sizes.access})`);

/* A saved token is a list row, not something to type into: it does not wear the input's box. */
const look = await page.evaluate(() => {
  const row = document.querySelector('[data-testid="access-token"]');
  const box = document.querySelector('input[aria-label="Token name"]');
  const style = (el) => { const c = getComputedStyle(el); return { bg: c.backgroundColor, border: c.borderTopWidth + ' ' + c.borderLeftWidth }; };
  return { row: style(row), input: style(box) };
});
record(look.row.bg !== look.input.bg && look.row.border.split(' ')[1] === '0px', `a saved token does not look like the input (${JSON.stringify(look)})`);
const space = await page.evaluate(() => {
  const rows = document.querySelectorAll('[data-testid="access-token"]');
  const box = document.querySelector('input[aria-label="Token name"]');
  return Math.round(box.getBoundingClientRect().top - rows[rows.length - 1].getBoundingClientRect().bottom);
});
record(space >= 16, `and there is room between the list and the box under it (${space}px)`);
await page.screenshot({ path: '/tmp/token-row.png', clip: await section.boundingBox() });

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
