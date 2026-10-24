/**
 * An address typed without a scheme is taken as http, and the field says so.
 *
 * The product owner, about a box's Address showing `http://192.1`: "in address
 * fields like this, we should assume http by default". So what is pinned is
 * what is drawn: a box's Address and the Add MCP Server dialog's Address,
 * given `host:port` and left, read `http://host:port` - the person sees the
 * http before saving, with no line of prose explaining it - and the placeholder
 * no longer suggests a scheme has to be typed. The box is then added through
 * the page, which a `type="url"` box refused to submit at all, and the server
 * holds the address with its scheme. The MCP dialog's Test is pressed on what
 * the field holds and names the address it tried.
 *
 * The box is at an address under `.invalid` and the MCP server at a port
 * nothing listens on, so nothing reaches a network. Everything made is removed,
 * and what a killed run left behind is swept first.
 */
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const SCRATCH = 'addressSchemeScratch_';
const BOX_TYPED = 'address-scheme-check.invalid:8090';
const MCP_TYPED = '127.0.0.1:9/rpc';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const boxes = async () => (await graphql(`{ boxes { id name address } }`)).boxes;
const servers = async () =>
  (await graphql(`query ($id: ID!) { mcpServers(workspaceId: $id) { id name address } }`, { id: WORKSPACE })).mcpServers;

for (const one of (await boxes()).filter((box) => box.name.startsWith(SCRATCH))) {
  await graphql(`mutation ($id: ID!) { deleteBox(id: $id) }`, { id: one.id }).catch(() => {});
}
for (const one of (await servers()).filter((server) => server.name.startsWith(SCRATCH))) {
  await graphql(`mutation ($id: ID!) { removeMcpServer(id: $id) }`, { id: one.id }).catch(() => {});
}

/* ------------------------------------------------------------------- a box */

await page.goto(`${BASE}/admin/boxes/new`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the add box page'), 'Admin -> Boxes -> Add box opens');

const address = page.locator('#box-address');
await address.waitFor({ timeout: 20_000 }).catch(() => {});
const placeholder = (await address.getAttribute('placeholder').catch(() => null)) ?? '';
record(!placeholder.includes('://'), `the placeholder does not ask for a scheme ("${placeholder}")`);

await page.locator('#box-name').fill(`${SCRATCH}box`);
await page.locator('#box-label').fill('address-scheme-check');
await address.fill(BOX_TYPED);
record((await address.inputValue()) === BOX_TYPED, 'what is typed is left alone while it is typed');
await address.press('Tab');
const shown = await address.inputValue();
record(shown === `http://${BOX_TYPED}`, `left, the field reads what will be stored ("${shown}")`);

await page.locator('[data-box-save]').click();
await page.waitForURL(/\/admin\/boxes\/\d+/, { timeout: 20_000 }).catch(() => {});
const madeBox = (await boxes()).find((box) => box.name === `${SCRATCH}box`) ?? null;
record(madeBox !== null, 'the box is added through the page');
record(madeBox?.address === `http://${BOX_TYPED}`, `and is stored with its scheme (${madeBox?.address})`);
if (madeBox !== null) await graphql(`mutation ($id: ID!) { deleteBox(id: $id) }`, { id: madeBox.id }).catch(() => {});

/* --------------------------------------------------------- an MCP server */

await page.goto(`${BASE}/workspace/${WORKSPACE}/integrations`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'MCP Servers'), 'the integrations page opens');
await page.getByRole('button', { name: '+ Add Server' }).click();
const mcpAddress = page.locator('#mcp-server-address');
const mcpPlaceholder = (await mcpAddress.getAttribute('placeholder').catch(() => null)) ?? '';
record(!mcpPlaceholder.includes('://'), `the MCP placeholder does not ask for a scheme ("${mcpPlaceholder}")`);

await page.locator('#mcp-server-name').fill(`${SCRATCH}mcp`);
await mcpAddress.fill(MCP_TYPED);
await mcpAddress.press('Tab');
const mcpShown = await mcpAddress.inputValue();
record(mcpShown === `http://${MCP_TYPED}`, `left, the MCP address reads what will be stored ("${mcpShown}")`);

await page.locator('dialog[open]').getByRole('button', { name: 'Test', exact: true }).click();
await page.waitForFunction(() => document.querySelector('[data-check-reachable]') !== null, null, { timeout: 30_000 }).catch(() => {});
const sentence = ((await page.locator('[data-check-reachable]').textContent().catch(() => '')) ?? '').trim();
record(sentence.includes('127.0.0.1:9'), `Test asks the address the field holds (${sentence})`);

await page.locator('dialog[open]').getByRole('button', { name: 'Add Server', exact: true }).click();
await page.waitForFunction(() => document.querySelector('dialog[open]') === null, null, { timeout: 20_000 }).catch(() => {});
const madeServer = (await servers()).find((server) => server.name === `${SCRATCH}mcp`) ?? null;
record(madeServer?.address === `http://${MCP_TYPED}`, `the MCP server is stored with its scheme (${madeServer?.address})`);
if (madeServer !== null) await graphql(`mutation ($id: ID!) { removeMcpServer(id: $id) }`, { id: madeServer.id }).catch(() => {});

await finish(browser);
