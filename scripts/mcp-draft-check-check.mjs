/**
 * Test in the Add MCP Server dialog: a server can be asked whether it answers
 * before it is added, and asking adds nothing.
 *
 * Pointed at a port nothing listens on, for the reason mcp-check-button-check
 * gives: what has to appear is a reason naming the address, not just a colour.
 * The dialog is then cancelled, and the workspace must hold no server by that
 * name - a Test that saved would be an Add with a different label.
 */
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });

const NAME = `zzMcpDraft ${Date.now()}`;
const ADDRESS = 'http://127.0.0.1:9/rpc';

await page.goto(`${BASE}/workspace/${WORKSPACE}/integrations`, { waitUntil: 'domcontentloaded' });
await drawn(page, 'MCP Servers');
await page.getByRole('button', { name: '+ Add Server' }).click();
await page.locator('#mcp-server-name').fill(NAME);
await page.locator('#mcp-server-address').fill(ADDRESS);

const line = page.getByTestId('mcp-draft-check');
const test = line.getByRole('button', { name: 'Test' });
record((await test.count()) === 1 && (await test.isEnabled()), 'the add dialog offers Test once there is an address');
await test.click();
const said = line.locator('[data-check-reachable]');
await page.waitForFunction(() => document.querySelector('[data-check-reachable]') !== null, null, { timeout: 30_000 }).catch(() => {});
const reachable = await said.getAttribute('data-check-reachable').catch(() => null);
const sentence = ((await said.textContent().catch(() => '')) ?? '').trim();
record(reachable === 'false', `a server nothing answers on is reported unreachable (${reachable})`);
record(sentence.includes('127.0.0.1:9'), `and the reason names the address (${sentence})`);

await page.getByRole('button', { name: 'Cancel' }).click();
const { mcpServers } = await graphql(`query($id: ID!) { mcpServers(workspaceId: $id) { name } }`, { id: WORKSPACE });
record(!mcpServers.some((one) => one.name === NAME), 'and testing added nothing');

await finish(browser);
