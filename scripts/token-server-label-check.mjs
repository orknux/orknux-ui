/**
 * Where a Custom token's tool list hands over a whole other MCP server, it says
 * so loudly.
 *
 * Such an entry is one line among two hundred tools, written `<server>__*`, and
 * ticking it gives the token every tool that server offers now and every one
 * it adds later. Read as one more tool it is easy to tick without meaning to,
 * so it carries a label that says Whole MCP server, and the token made with it
 * carries the same label in the list.
 *
 * The server is made for the check at an address that can never resolve - the
 * catalogue does not call it - and removed with the token before it ends.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1100 } });
const { users } = await graphql('query { users { id username type } }');
const owner = users.find((one) => one.type === 'INTERNAL' && one.username === 'alice') ?? users.find((one) => one.type === 'INTERNAL');
const stamp = Date.now();
const name = `zzServer ${stamp}`;
let server = null;

try {
  ({ createMcpServer: server } = await graphql(
    'mutation($input: CreateMcpServerInput!) { createMcpServer(input: $input) { id name } }',
    { input: { workspaceId: WORKSPACE, name: `zz label ${stamp}`, address: 'http://zz-label.invalid/mcp' } },
  ));

  await page.goto(`${BASE}/admin/users/${owner.id}`, { waitUntil: 'domcontentloaded' });
  const picker = page.getByTestId('token-access');
  await picker.waitFor({ timeout: 20_000 });
  await picker.scrollIntoViewIfNeeded();
  await picker.click();
  await page.getByRole('option', { name: 'Custom' }).click();
  await page.locator('[data-testid="token-custom-read"] [data-testid^="token-tool-"]').first().waitFor({ timeout: 10_000 });

  await page.getByTestId('token-tool-search').fill(`zz label ${stamp}`.replace(/ /g, '-'));
  let entry = page.locator('[data-mcp-server]').filter({ hasText: String(stamp) });
  if ((await entry.count()) === 0) {
    await page.getByTestId('token-tool-search').fill(String(stamp));
    entry = page.locator('[data-mcp-server]').filter({ hasText: String(stamp) });
  }
  record((await entry.count()) === 1, `the server stands in the list as one entry (${await entry.count()})`);
  const label = entry.locator('strong');
  record((await label.textContent())?.trim() === 'Whole MCP server', `and it is labelled Whole MCP server (${await label.textContent()})`);
  const drawn = await label.evaluate((element) => {
    const style = getComputedStyle(element);
    return { weight: Number(style.fontWeight), background: style.backgroundColor };
  });
  record(drawn.weight >= 700 && drawn.background !== 'rgba(0, 0, 0, 0)', `the label is strong and filled (${JSON.stringify(drawn)})`);
  // The tools' own boxes, not the search box that shares their prefix.
  const plain = await page.locator('input[type=checkbox][data-testid^="token-tool-"]').evaluateAll(
    (all) => all.filter((box) => !box.closest('[data-mcp-server]') && box.closest('label')?.querySelector('strong') != null).map((box) => box.dataset.testid),
  );
  record(plain.length === 0, `no single tool carries it (${plain.join('; ')})`);
  record((await entry.locator('[class*="customSummary"]').count()) === 0, 'the entry says what it is in its badge, with no line under it saying it again');

  // Quick filters beside the search: MCP servers only, built-in, plugins - and All.
  await page.getByTestId('token-tool-search').fill('');
  const listedTools = () =>
    page.locator('input[type=checkbox][data-testid^="token-tool-"]').evaluateAll((all) => all.map((box) => box.dataset.testid.slice('token-tool-'.length)));
  const chip = (source) => page.locator(`[data-testid="token-tool-sources"] [data-source="${source}"]`);
  record((await chip('MCP_SERVER').count()) === 1 && (await chip('BUILT_IN').count()) === 1, 'the tools can be narrowed to MCP servers or to the built-in ones');
  await chip('MCP_SERVER').click();
  let shown = await listedTools();
  record(shown.length > 0 && shown.every((one) => one.includes('__')), `MCP servers shows their tools and nothing else (${shown.length})`);
  record((await chip('MCP_SERVER').getAttribute('aria-pressed')) === 'true', 'and says it is the filter in force');
  await chip('BUILT_IN').click();
  shown = await listedTools();
  record(shown.includes('orknux_issues') && !shown.some((one) => one.includes('__')), `Built-in shows Orknux's own tools (${shown.length})`);
  if ((await chip('PLUGIN').count()) === 1) {
    await chip('PLUGIN').click();
    shown = await listedTools();
    record(shown.length > 0 && !shown.includes('orknux_issues') && !shown.some((one) => one.includes('__')), `Plugins shows the plugins' tools alone (${shown.slice(0, 3).join(', ')})`);
  }
  await chip('ALL').click();

  await entry.locator('input[type=checkbox]').check();
  await page.getByTestId('token-tool-search').fill('');
  await page.getByPlaceholder('What is it for?').fill(name);
  await page.getByRole('button', { name: 'Generate Token' }).click();
  const row = page.locator('[data-testid="access-token"]', { hasText: name });
  await row.waitFor({ timeout: 10_000 });
  const listed = row.locator('[data-token-servers]');
  record((await listed.count()) === 1 && (await listed.textContent())?.trim() === 'Whole MCP server', 'the token made with it is listed with the same label');
} finally {
  const { userTokens } = await graphql('query($id: ID!) { userTokens(id: $id) { id name } }', { id: owner.id });
  for (const one of userTokens.filter((token) => token.name === name)) {
    await graphql('mutation($id: ID!) { deleteUserToken(id: $id) }', { id: one.id });
  }
  if (server !== null) await graphql('mutation($id: ID!) { removeMcpServer(id: $id) }', { id: server.id });
}

await finish(browser);
