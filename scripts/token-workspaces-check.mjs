/**
 * A Custom access token chooses which workspaces it reaches, and reaches those
 * and no others.
 *
 * Two workspaces made for the check, one ticked. The token is listed with the
 * one it names, and then used: through GraphQL the ticked workspace answers and
 * the other answers as not there. Held to a workspace it is no installation
 * administrator either, so the users list is refused it although alice may read
 * it. Both workspaces and the token are removed before the check ends.
 */
import { BASE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1100 } });
const { users } = await graphql('query { users { id username type } }');
const owner = users.find((one) => one.type === 'INTERNAL' && one.username === 'alice') ?? users.find((one) => one.type === 'INTERNAL');
const stamp = Date.now();
const name = `zzPlaces ${stamp}`;
const made = [];

/** What a request carrying the token is answered. */
const asToken = (secret, query) =>
  page.evaluate(
    async ({ secret, query }) => {
      const answer = await fetch('/graphql', {
        method: 'POST',
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
        body: JSON.stringify({ query }),
      });
      return answer.json();
    },
    { secret, query },
  );

try {
  for (const which of ['in', 'out']) {
    const { createWorkspace } = await graphql('mutation($input: CreateWorkspaceInput!) { createWorkspace(input: $input) { id } }', {
      input: { name: `zz token ${which} ${stamp}` },
    });
    made.push(createWorkspace.id);
  }
  const [inside, outside] = made;

  await page.goto(`${BASE}/admin/users/${owner.id}`, { waitUntil: 'domcontentloaded' });
  const picker = page.getByTestId('token-access');
  await picker.waitFor({ timeout: 20_000 });
  await picker.scrollIntoViewIfNeeded();
  await picker.click();
  await page.getByRole('option', { name: 'Custom' }).click();
  await page.getByTestId('token-workspaces').waitFor({ timeout: 10_000 });
  // The tools come with their reading ones ticked once they have loaded; until then nothing can be made.
  await page.locator('[data-testid="token-custom-read"] [data-testid^="token-tool-"]').first().waitFor({ timeout: 10_000 });

  record(await page.getByTestId('token-reach-all').isChecked(), 'Custom starts reaching every workspace, as a token always did');
  await page.getByTestId('token-reach-some').check();
  const box = page.getByTestId(`token-workspace-${inside}`);
  await box.waitFor({ timeout: 10_000 });
  record((await page.getByTestId(`token-workspace-${outside}`).count()) === 1, 'Only these lists the workspaces to choose from');

  const generate = page.getByRole('button', { name: 'Generate Token' });
  await page.getByPlaceholder('What is it for?').fill(name);
  record(await generate.isDisabled(), 'with Only these and nothing ticked, no token can be made');
  await box.check();
  record(await generate.isEnabled(), 'one ticked, it can');
  await generate.click();

  const secret = (await page.getByTestId('token-secret').locator('code').textContent())?.trim() ?? '';
  const row = page.locator('[data-testid="access-token"]', { hasText: name });
  await row.waitFor({ timeout: 10_000 });
  const pill = row.locator('[data-token-workspaces]');
  record(
    (await pill.getAttribute('data-token-workspaces')) === '1' && (await pill.textContent())?.includes(`zz token in ${stamp}`),
    `the token is listed with the workspace it reaches (${await pill.textContent()})`,
  );

  const here = await asToken(secret, `{ workspace(id: ${inside}) { name } }`);
  record(here?.data?.workspace?.name === `zz token in ${stamp}`, `the token reads the workspace it names (${JSON.stringify(here)})`);
  const there = await asToken(secret, `{ workspace(id: ${outside}) { name } }`);
  record(there?.data?.workspace === null, `and the other answers as not there (${JSON.stringify(there)})`);
  const people = await asToken(secret, '{ users { username } }');
  record((people?.errors ?? []).length > 0, 'held to a workspace, it is refused what only an installation administrator may read');
} finally {
  const { userTokens } = await graphql('query($id: ID!) { userTokens(id: $id) { id name } }', { id: owner.id });
  for (const one of userTokens.filter((token) => token.name === name)) {
    await graphql('mutation($id: ID!) { deleteUserToken(id: $id) }', { id: one.id });
  }
  for (const id of made) await graphql('mutation($id: ID!) { deleteWorkspace(id: $id) }', { id });
}

await finish(browser);
