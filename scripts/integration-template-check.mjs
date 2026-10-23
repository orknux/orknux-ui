/**
 * Connections and MCP servers as templates. Issue #646.
 *
 * Made from a connection's and an MCP server's own row on one workspace's
 * Integrations page, as a model's is on the Models page, and used on
 * another's from the Use a template beside each card's Add. The template
 * carries the settings and leaves the credentials behind; using it names the
 * rows that need one, each a link to its settings.
 */
import { BASE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });
const stamp = Date.now();
const CONNECTION = `zzTplConn ${stamp}`;
const SERVER = `zzTplMcp ${stamp}`;
const CONNECTION_TEMPLATE = `zz connection template ${stamp}`;
const SERVER_TEMPLATE = `zz mcp template ${stamp}`;

const workspace = async (name) =>
  (await graphql('mutation($input: CreateWorkspaceInput!) { createWorkspace(input: $input) { id } }', { input: { name } })).createWorkspace.id;
const from = await workspace(`zz tpl int from ${stamp}`);
const into = await workspace(`zz tpl int into ${stamp}`);

/** Publishes a row's template through its own button and the shared dialog. */
async function saveFromRow(rowName, templateName) {
  const save = page.getByRole('button', { name: `Save ${rowName} as a template` });
  await save.waitFor({ timeout: 20_000 });
  await save.click();
  const dialog = page.locator('dialog[open]');
  await dialog.getByLabel('Name').fill(templateName);
  record((await dialog.getByText('Everything it uses').count()) === 0, `the dialog for ${rowName} asks for no depth`);
  await dialog.getByRole('button', { name: 'Publish template' }).click();
  await dialog.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);
}

try {
  await graphql('mutation($input: CreateWorkspaceConnectionInput!) { createWorkspaceConnection(input: $input) { id } }', {
    input: { workspaceId: from, name: CONNECTION, type: 'HTTP', url: 'http://billing.invalid/api', authType: 'BEARER_TOKEN', secret: 'tok-secret' },
  });
  await graphql('mutation($input: CreateMcpServerInput!) { createMcpServer(input: $input) { id } }', {
    input: { workspaceId: from, name: SERVER, address: 'http://search.invalid/mcp', authType: 'API_KEY', secret: 'key-secret' },
  });

  await page.goto(`${BASE}/workspace/${from}/integrations`, { waitUntil: 'domcontentloaded' });
  await saveFromRow(CONNECTION, CONNECTION_TEMPLATE);
  await saveFromRow(SERVER, SERVER_TEMPLATE);

  const { integrationTemplates: held } = await graphql('query { integrationTemplates { id name connections mcpServers } }');
  const connectionMade = held.find((one) => one.name === CONNECTION_TEMPLATE);
  const serverMade = held.find((one) => one.name === SERVER_TEMPLATE);
  record(
    connectionMade !== undefined && connectionMade.connections.length === 1 && connectionMade.connections[0] === CONNECTION,
    `the connection's row publishes that connection (${JSON.stringify(connectionMade)})`,
  );
  record(
    serverMade !== undefined && serverMade.mcpServers.length === 1 && serverMade.mcpServers[0] === SERVER,
    `the MCP server's row publishes that server (${JSON.stringify(serverMade)})`,
  );

  // Its page on Admin > Templates lists what is inside rather than "Nothing this installation can read".
  if (connectionMade !== undefined) {
    await page.goto(`${BASE}/admin/templates/${connectionMade.id}`, { waitUntil: 'domcontentloaded' });
    const inside = page.locator('[data-template-connection]');
    await inside.first().waitFor({ timeout: 15_000 }).catch(() => undefined);
    const listed = (await inside.allTextContents()).map((one) => one.replace(/\s+/g, ' ').trim());
    const text = (await page.locator('main').textContent()) ?? '';
    record(
      listed.length === 1 && listed[0].includes(CONNECTION) && !text.includes('Nothing this installation can read'),
      `its template page lists the connection inside (${JSON.stringify(listed)})`,
    );
  }

  await page.goto(`${BASE}/workspace/${into}/integrations`, { waitUntil: 'domcontentloaded' });

  // The connections card offers templates of connections, and uses one.
  await page.getByTestId('connections-use-template').waitFor({ timeout: 20_000 });
  await page.getByTestId('connections-use-template').click();
  const list = page.getByTestId('integration-templates');
  const connectionRow = list.locator(`[data-integration-template="${CONNECTION_TEMPLATE}"]`);
  await connectionRow.waitFor({ timeout: 10_000 }).catch(() => undefined);
  record(
    (await list.locator(`[data-integration-template="${SERVER_TEMPLATE}"]`).count()) === 0,
    'the connections card does not offer a template of MCP servers',
  );
  const shown = (await connectionRow.innerText().catch(() => '')).replace(/\s+/g, ' ');
  record(shown.includes(CONNECTION), `another workspace is offered it, naming what is in it (${shown})`);
  await connectionRow.getByRole('button', { name: `Use ${CONNECTION_TEMPLATE}` }).click();
  const note = page.getByTestId('integrations-template-note');
  const said = (await note.innerText({ timeout: 10_000 }).catch(() => '')).replace(/\s+/g, ' ');
  record(said.includes('1 connections added'), `Use makes the connection and says so (${said})`);
  // The page asks for what stayed behind: a link to the new row's settings.
  const ask = note.locator(`[data-needs-credential="${CONNECTION}"]`);
  const href = (await ask.getAttribute('href').catch(() => null)) ?? '';
  record(href.startsWith(`/workspace/${into}/integrations/connections/`), `the note links to the connection that needs a credential (${href})`);
  const row = page.locator(`[data-connection-row="${CONNECTION}"]`);
  await row.waitFor({ timeout: 10_000 }).catch(() => undefined);
  record((await row.count()) === 1, 'the connection is drawn on the list');

  // And the MCP servers card, the same way.
  await page.getByTestId('mcp-servers-use-template').click();
  const serverRow = page.getByTestId('integration-templates').locator(`[data-integration-template="${SERVER_TEMPLATE}"]`);
  await serverRow.waitFor({ timeout: 10_000 }).catch(() => undefined);
  await serverRow.getByRole('button', { name: `Use ${SERVER_TEMPLATE}` }).click();
  // The connection's note is still up for a moment after Use; wait for the server's own.
  const serverNote = page.getByTestId('integrations-template-note').filter({ hasText: 'MCP servers added' });
  const serverSaid = (await serverNote.innerText({ timeout: 10_000 }).catch(() => '')).replace(/\s+/g, ' ');
  record(serverSaid.includes('1 MCP servers added') && serverSaid.includes(SERVER), `Use makes the server and asks for its credential (${serverSaid})`);
  const serverHref = (await serverNote.locator(`[data-needs-credential="${SERVER}"]`).getAttribute('href').catch(() => null)) ?? '';
  record(serverHref.startsWith(`/workspace/${into}/integrations/servers/`), `the note links to the server's settings (${serverHref})`);

  const { mcpServers } = await graphql('query($w: ID!) { mcpServers(workspaceId: $w) { name secretSet } }', { w: into }).catch(() => ({ mcpServers: [] }));
  const arrived = (mcpServers ?? []).find((one) => one.name === SERVER);
  record(arrived !== undefined && arrived.secretSet === false, `the server arrived without its credential (${JSON.stringify(arrived)})`);
} finally {
  const { integrationTemplates } = await graphql('query { integrationTemplates { id name } }').catch(() => ({ integrationTemplates: [] }));
  for (const one of (integrationTemplates ?? []).filter((held) => held.name === CONNECTION_TEMPLATE || held.name === SERVER_TEMPLATE)) {
    await graphql('mutation($id: ID!) { deleteComponentTemplate(id: $id) }', { id: one.id }).catch(() => undefined);
  }
  for (const id of [from, into]) await graphql('mutation($id: ID!) { deleteWorkspace(id: $id) }', { id }).catch(() => undefined);
}

await finish(browser);
