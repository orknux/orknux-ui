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

// Tokens an earlier run left behind, revoked first so the list holds only this run's.
const { userTokens } = await graphql(`query($id: ID!) { userTokens(id: $id) { id name } }`, { id: target.id });
for (const old of userTokens.filter((one) => one.name.startsWith('token-access-check'))) {
  await graphql(`mutation($id: ID!) { deleteUserToken(id: $id) }`, { id: old.id }).catch(() => undefined);
}

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
    name: px(one.querySelector('[class*="_name_"]')),
    access: px(one.querySelector('[data-token-access]')),
    when: px(parts.find((el) => /never used|ago/.test(el.textContent ?? '')) ?? null),
    revoke: px(one.querySelector('button')),
  };
});
// Drawn as a user's roles are: the name at 13px, what is known of it at 12px beside it.
const headers = (await section.locator('th').allInnerTexts()).map((one) => one.trim().toLowerCase());
record(['name', 'access', 'created', 'last used'].every((one) => headers.includes(one)), `the tokens are a table with its columns named (${headers.join(', ')})`);
record(sizes.name === 13 && sizes.when === 12 && sizes.access >= 12 && sizes.revoke === 13, `the row reads as a role does - name 13px, details 12px (${JSON.stringify(sizes)})`);

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

/* Closed once copied, and the secret goes with it. */
const notice = page.getByTestId('token-secret');
const closer = notice.getByTestId('token-dismiss');
const placed = await Promise.all([notice.boundingBox(), closer.boundingBox()]);
record(
  placed[1] !== null && placed[1].x + placed[1].width > placed[0].x + placed[0].width - 40 && placed[1].y < placed[0].y + 30,
  "the secret can be dismissed from the notice's corner",
);

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

await closer.click();
record(await notice.waitFor({ state: 'detached', timeout: 5_000 }).then(() => true).catch(() => false), 'dismissing takes the secret off the page');

await row.getByRole('button', { name: 'Revoke' }).click();
record(await row.waitFor({ state: 'detached', timeout: 10_000 }).then(() => true).catch(() => false), 'and it is revoked');

await finish(browser);
