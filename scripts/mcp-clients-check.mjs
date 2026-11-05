/**
 * Admin -> MCP lists every MCP client that reached the installation - who, as
 * which client, from which address and host - and what each called; a
 * workspace's MCP page lists that workspace's alone.
 *
 * A token is made for the check and a client is played from the page: it says
 * initialize as a client named for the check, in this workspace and in a
 * second one made for the check, and calls a tool. Both pages are then read
 * for what they draw. The token and the second workspace - and with it its
 * sessions - are removed before the check ends.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });
const { users } = await graphql('query { users { id username type } }');
const owner = users.find((one) => one.type === 'INTERNAL' && one.username === 'alice') ?? users.find((one) => one.type === 'INTERNAL');
const stamp = Date.now();
const here = `zz-here-${stamp}`;
const there = `zz-there-${stamp}`;
let token = null;
let other = null;

/** One JSON-RPC request as an MCP client sends it, with the token and nothing of the browser's session. */
const rpc = (secret, workspace, body, session) =>
  page.evaluate(
    async ({ secret, workspace, body, session }) => {
      const headers = { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${secret}` };
      if (session) headers['Mcp-Session-Id'] = session;
      const answer = await fetch(`/mcp/${workspace}`, { method: 'POST', credentials: 'omit', headers, body: JSON.stringify(body) });
      return { session: answer.headers.get('Mcp-Session-Id'), body: await answer.json() };
    },
    { secret, workspace, body, session },
  );

/** Says initialize as [client], calls a tool, and answers the session it was handed. */
async function connect(secret, workspace, client) {
  const opened = await rpc(secret, workspace, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { clientInfo: { name: client, version: '1.0' } } });
  await rpc(secret, workspace, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'orknux_workflows', arguments: {} } }, opened.session);
  return opened.session;
}

try {
  await page.goto(`${BASE}/workspace/${WORKSPACE}`, { waitUntil: 'domcontentloaded' });
  ({ createUserToken: token } = await graphql('mutation($id: ID, $name: String!) { createUserToken(id: $id, name: $name) { token { id } secret } }', {
    id: owner.id,
    name: `zz mcp clients ${stamp}`,
  }));
  ({ createWorkspace: other } = await graphql('mutation($input: CreateWorkspaceInput!) { createWorkspace(input: $input) { id } }', {
    input: { name: `zz mcp clients ${stamp}` },
  }));
  const session = await connect(token.secret, WORKSPACE, here);
  record(typeof session === 'string' && session.length > 0, `initialize hands the client an Mcp-Session-Id (${session})`);
  await connect(token.secret, other.id, there);

  // ---- Admin -> MCP: every workspace ----
  await page.goto(`${BASE}/admin/mcp`, { waitUntil: 'domcontentloaded' });
  const mine = page.locator('[data-testid="mcp-session"]', { hasText: here });
  await mine.waitFor({ timeout: 20_000 });
  record((await page.locator('[data-testid="mcp-session"]', { hasText: there }).count()) === 1, 'Admin -> MCP lists the clients of every workspace');
  const ip = (await mine.getByTestId('mcp-session-ip').innerText()).trim();
  record(/^[0-9a-f.:]+$/i.test(ip), `each session shows the client's IP address (${ip})`);
  // The host is looked up off the request's thread; a reload after a moment shows it.
  let host = (await mine.getByTestId('mcp-session-host').innerText()).trim();
  for (let attempt = 0; attempt < 5 && host === 'no host name'; attempt += 1) {
    await page.waitForTimeout(1000);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await mine.waitFor({ timeout: 20_000 });
    host = (await mine.getByTestId('mcp-session-host').innerText()).trim();
  }
  // Looked up by reverse DNS: an address with no name there - a Docker bridge, say - is said to have none.
  record(host.length > 0, `and its host name, or that its address has none (${host})`);
  record((await mine.locator('[data-status="connected"]').count()) === 1, 'a client that just called is shown as connected');
  record((await mine.getByTestId('mcp-session-workspace').count()) === 1, 'and Admin -> MCP says which workspace it is in');
  record((await mine.innerText()).includes(`zz mcp clients ${stamp}`), 'and which token it came with');

  await mine.click();
  await page.getByTestId('mcp-calls-session').waitFor({ timeout: 10_000 });
  const calls = page.locator('[data-testid="mcp-call"]');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="mcp-call"]').length > 0, null, { timeout: 10_000 });
  const tools = await calls.evaluateAll((rows) => rows.map((row) => row.getAttribute('data-tool')));
  record(tools.length === 1 && tools[0] === 'orknux_workflows', `picking a session shows its calls and no others (${tools.join(', ')})`);
  const sideways = await page.evaluate(() => ({ scroll: document.scrollingElement.scrollWidth, width: window.innerWidth }));
  const tables = await page.evaluate(() =>
    ['mcp-sessions', 'mcp-calls'].map((id) => {
      const table = document.querySelector(`[data-testid="${id}"]`);
      const box = table.parentElement;
      return { id, table: Math.round(table.scrollWidth), room: Math.round(box.clientWidth) };
    }),
  );
  record(tables.every((one) => one.table <= one.room), `at 1440 pixels both tables fit their cards without scrolling (${JSON.stringify(tables)})`);
  record(sideways.scroll <= sideways.width, `the page does not scroll sideways (${sideways.scroll} <= ${sideways.width})`);

  // ---- One workspace's MCP page: that workspace alone ----
  await page.goto(`${BASE}/workspace/${WORKSPACE}/mcp`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-testid="mcp-session"]', { hasText: here }).waitFor({ timeout: 20_000 });
  record((await page.locator('[data-testid="mcp-session"]', { hasText: there }).count()) === 0, "a workspace's MCP page does not list another workspace's clients");
  record((await page.getByTestId('mcp-session-workspace').count()) === 0, 'and has no workspace column, being one workspace');
  record((await page.locator('[data-testid="mcp-session"]', { hasText: here }).getByTestId('mcp-session-ip').count()) === 1, 'it shows the address too');
} finally {
  if (token !== null) await graphql('mutation($id: ID!) { deleteUserToken(id: $id) }', { id: token.token.id });
  if (other !== null) await graphql('mutation($id: ID!) { deleteWorkspace(id: $id) }', { id: other.id });
}

await finish(browser);
