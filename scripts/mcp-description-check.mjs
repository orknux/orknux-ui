/**
 * An MCP server says what it is for: typed in the add dialog and on its page,
 * shown under its name on Integrations, and found by searching for it.
 *
 * A tool named `wiki__search`, described by the server's author for every
 * installation, says nothing about which wiki this is or when it is the one to
 * use - so a sentence about it goes to the agent beside the server's name, and
 * to the person reading the list. What is measured is what is drawn and what
 * the server stores.
 */
import { BASE, WORKSPACE, open, record, finish, chooseOption } from './suite/harness.mjs';

const PREFIX = 'zzMcpDescribed';
const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const listed = async () =>
  (await graphql(`query ($w: ID!) { mcpServers(workspaceId: $w) { id name description } }`, { w: WORKSPACE })).mcpServers;
async function sweep() {
  for (const old of (await listed()).filter((one) => one.name.startsWith(PREFIX))) {
    await graphql(`mutation ($id: ID!) { removeMcpServer(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
}
await sweep();

const integrations = `${BASE}/workspace/${WORKSPACE}/integrations`;
const name = `${PREFIX} ${Date.now()}`;
const said = "the team's Confluence, read only";

// ---- the add dialog ---------------------------------------------------------
await page.goto(integrations, { waitUntil: 'domcontentloaded' });
await page.getByRole('button', { name: '+ Add Server', exact: true }).click();
const describe = page.locator('#mcp-server-description');
record(await describe.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false), 'the add dialog has a Description');
await page.locator('#mcp-server-name').fill(name);
await page.locator('#mcp-server-address').fill('http://wiki.example.invalid/mcp');
await describe.fill(said);
await chooseOption(page, '#mcp-server-auth', 'NONE');
await page.locator('button[type="submit"]', { hasText: 'Add Server' }).click();
await page.waitForTimeout(1_500);
const made = (await listed()).find((one) => one.name === name);
record(made?.description === said, `the server stores it (${made?.description})`);

// ---- the list ---------------------------------------------------------------
await page.goto(integrations, { waitUntil: 'domcontentloaded' });
const shown = page.locator('[data-server-description]', { hasText: said });
record(await shown.first().waitFor({ timeout: 20_000 }).then(() => true).catch(() => false), 'the list shows it under the server');
const box = await shown.first().boundingBox();
record(box !== null && box.height > 0 && box.height < 40, `on one line (${box?.height?.toFixed(0)}px)`);

// ---- its page ---------------------------------------------------------------
if (made) {
  await page.goto(`${integrations}/servers/${made.id}`, { waitUntil: 'domcontentloaded' });
  const field = page.locator('#server-description');
  await field.waitFor({ timeout: 20_000 });
  record((await field.inputValue()) === said, 'its page holds it');
  await field.fill('the support space only');
  await page.getByTestId('save-bar').getByRole('button', { name: 'Save Changes', exact: true }).click();
  await page.waitForTimeout(1_000);
  const after = (await listed()).find((one) => one.id === made.id);
  record(after?.description === 'the support space only', `changed and saved (${after?.description})`);
}

await sweep();
await finish(browser);
