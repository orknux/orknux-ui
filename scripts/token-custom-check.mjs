/**
 * A Custom access token chooses its MCP tools, the reading ones apart from the
 * changing ones, and a search narrows a list of two hundred.
 *
 * Made on alice's own user page, and revoked before the check ends.
 */
import { BASE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1100 } });
const { users } = await graphql('query { users { id username type } }');
const owner = users.find((one) => one.type === 'INTERNAL' && one.username === 'alice') ?? users.find((one) => one.type === 'INTERNAL');
const name = `zzCustom ${Date.now()}`;

try {
  await page.goto(`${BASE}/admin/users/${owner.id}`, { waitUntil: 'domcontentloaded' });
  const picker = page.getByTestId('token-access');
  await picker.waitFor({ timeout: 20_000 });
  await picker.scrollIntoViewIfNeeded();
  await picker.click();
  await page.getByRole('option', { name: 'Custom' }).click();
  await page.getByTestId('token-custom-read').waitFor({ timeout: 10_000 });

  const count = (kind) => page.locator(`[data-testid="token-custom-${kind}"] [data-testid^="token-tool-"]`).count();
  const reads = await count('read');
  const writes = await count('write');
  record(reads > 10 && writes > 10, `Custom lists the tools that read and the ones that change something apart (${reads} and ${writes})`);
  const ticked = await page.locator('[data-testid="token-custom-read"] [data-testid^="token-tool-"]:checked').count();
  record(ticked === reads && (await page.locator('[data-testid="token-custom-write"] [data-testid^="token-tool-"]:checked').count()) === 0, 'it starts as read-only would: every reading tool ticked, no changing one');

  await page.getByTestId('token-tool-search').fill('memory');
  const found = await page.locator('[data-testid^="token-tool-memory_"]').count();
  const shown = await page.locator('[data-testid="token-custom"] [data-testid^="token-tool-"]').count();
  // Found by name or by what a tool does, so a tool whose description mentions memories is shown too.
  record(found >= 1 && shown >= found && shown < reads + writes, `a search narrows the list to what it names (${shown} of ${reads + writes} shown, ${found} named memory)`);

  // Ticking the changing group while searching ticks only what is shown.
  await page.locator('[data-testid="token-custom-write"] legend input[type=checkbox]').check();
  await page.getByTestId('token-tool-search').fill('');
  const chosen = await page.locator('[data-testid="token-custom-write"] [data-testid^="token-tool-"]:checked').evaluateAll((all) => all.map((one) => one.dataset.testid.replace('token-tool-', '')));
  record(chosen.length >= 1 && chosen.every((one) => one.startsWith('memory_')), `the group's box ticks only the tools the search shows (${chosen.join(', ')})`);

  await page.getByPlaceholder('What is it for?').fill(name);
  await page.getByRole('button', { name: 'Generate Token' }).click();
  const row = page.locator('[data-testid="access-token"]', { hasText: name });
  await row.waitFor({ timeout: 10_000 });
  const access = await row.locator('[data-token-access]').getAttribute('data-token-access');
  record(access === 'custom', `the token is listed as Custom (${access})`);
} finally {
  const { userTokens } = await graphql('query($id: ID!) { userTokens(id: $id) { id name } }', { id: owner.id });
  for (const one of userTokens.filter((token) => token.name === name)) {
    await graphql('mutation($id: ID!) { deleteUserToken(id: $id) }', { id: one.id });
  }
}

await finish(browser);
