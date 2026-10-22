/**
 * A reference to a variable can be taken off again, and taking it off saves.
 *
 * Reported with a screenshot of the plugins page: a parameter read from a
 * variable, switched to Value, showed an empty box under Value - and Save
 * stayed off, because the switch only changed which control was drawn and told
 * the page nothing. After a reload it was a reference again, and the note under
 * it went on naming the variable while Value was pressed.
 *
 * So, read back from the server rather than off the screen:
 *
 *   - a plugin parameter pointed at a variable and saved is a reference;
 *   - switched to Value it is one unsaved change, and Save stores it - after a
 *     reload the server holds no reference and no value;
 *   - the reference picker's own clear takes a reference off the same way;
 *   - and a secret field elsewhere - an MCP server's token read from a
 *     workspace secret - is cleared by its own clear and saved with no
 *     reference left.
 *
 * Writes its own plugin, catalog, variables and server, and removes them.
 */
import { BASE, WORKSPACE, open, drawn, record, shot, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1100 } });

const KEY = 'zzReferenceUnset';
const SCRATCH = 'referenceUnsetCheck';
const SOURCE = `
export default class Unset extends OrknuxPlugin {
  id() { return '${KEY}'; }
  apiVersion() { return 1; }
  parameters() {
    return [new OrknuxParameter({ name: 'token', type: 'string', description: 'What it reads.' })];
  }
}
`;

const listVariables = async () =>
  (
    await graphql(
      `query ($w: ID!) { workspaceVariables(workspaceId: $w, page: 0, size: 500) { content { id name } } }`,
      { w: WORKSPACE },
    )
  ).workspaceVariables.content;

const listServers = async () =>
  (
    await graphql(`query ($w: ID!) { mcpServers(workspaceId: $w) { id name secretSet secretVariableId } }`, {
      w: WORKSPACE,
    })
  ).mcpServers;

async function sweep() {
  const { plugins } = await graphql(`query { plugins { id key } }`, {});
  for (const old of plugins.filter((one) => one.key === KEY)) {
    await graphql(`mutation($id: ID!) { unloadPlugin(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
  for (const one of (await listServers()).filter((row) => row.name.startsWith(SCRATCH))) {
    await graphql(`mutation ($id: ID!) { removeMcpServer(id: $id) }`, { id: one.id }).catch(() => undefined);
  }
  for (const one of (await listVariables()).filter((row) => row.name.startsWith(SCRATCH))) {
    await graphql(`mutation ($id: ID!) { deleteVariable(id: $id) }`, { id: one.id }).catch(() => undefined);
  }
  const { variableCatalogs } = await graphql(`query ($w: ID!) { variableCatalogs(workspaceId: $w) { id name } }`, {
    w: WORKSPACE,
  });
  for (const one of variableCatalogs.filter((row) => row.name.startsWith(SCRATCH))) {
    await graphql(`mutation ($id: ID!) { deleteVariableCatalog(id: $id) }`, { id: one.id }).catch(() => undefined);
  }
}
await sweep();
const clean = async () => {
  await sweep();
  await finish(browser);
};

try {
  // ------------------------------------------------------------- the fixture
  const catalogId = (
    await graphql(`mutation($w: ID!, $n: String!) { createVariableCatalog(workspaceId: $w, name: $n) { id } }`, {
      w: WORKSPACE,
      n: `${SCRATCH} catalog`,
    })
  ).createVariableCatalog.id;
  const plainName = `${SCRATCH}Plain`;
  const secretName = `${SCRATCH}Secret`;
  const made = {};
  for (const [name, kind] of [[plainName, 'VALUE'], [secretName, 'SECRET']]) {
    made[name] = (
      await graphql(`mutation($input: CreateVariableInput!) { createVariable(input: $input) { id } }`, {
        input: { workspaceId: WORKSPACE, catalogId, name, type: 'STRING', kind, value: 'x' },
      })
    ).createVariable.id;
  }

  const loaded = await page.request.post(`${BASE}/api/plugins`, {
    multipart: { file: { name: `${KEY}.js`, mimeType: 'text/javascript', buffer: Buffer.from(SOURCE, 'utf8') } },
  });
  record(loaded.ok(), `a plugin with one string parameter loads (${loaded.status()})`);

  const stored = async () => {
    const { workspacePlugins } = await graphql(
      `query($w: ID!) { workspacePlugins(workspaceId: $w) { plugin { id key } parameters { name literal variableId variableName } } }`,
      { w: WORKSPACE },
    );
    return workspacePlugins.find((one) => one.plugin.key === KEY) ?? null;
  };
  const pluginId = (await stored()).plugin.id;

  const unsavedNote = page.locator('[class*="_pageUnsaved_"]');
  const save = page.locator('[class*="_pageSave_"]');
  const sourceSwitch = page.locator('[role="group"][aria-label="token source"]');
  const picker = page.locator('button[aria-label="token reference"]');

  async function openPlugin() {
    await page.goto(`${BASE}/workspace/${WORKSPACE}/plugins`, { waitUntil: 'domcontentloaded' });
    record(await drawn(page, 'the plugins page'), 'the plugins page is on screen');
    await page.getByPlaceholder('Search plugins...').fill(KEY);
    await page.waitForTimeout(600);
    await page.locator(`button[aria-controls="plugin-parameters-${pluginId}"]`).first().click();
    await page.waitForTimeout(500);
  }

  // ------------------------------- a reference, set through the page and saved
  await openPlugin();
  await sourceSwitch.getByRole('button', { name: 'Reference' }).click();
  await picker.click();
  await page.locator(`[data-field-option="${plainName}"]`).first().click();
  await page.waitForTimeout(400);
  record((await unsavedNote.textContent().catch(() => '')) === '1 unsaved', 'a variable picked is 1 unsaved');
  await save.click();
  await page.waitForTimeout(1500);
  const pointed = (await stored()).parameters[0];
  record(pointed.variableId === made[plainName], `Save stores the reference (${JSON.stringify(pointed)})`);

  // ----------------------------------- switched to Value, which has to save
  await sourceSwitch.getByRole('button', { name: 'Value' }).click();
  await page.waitForTimeout(400);
  record(
    (await unsavedNote.textContent().catch(() => '')) === '1 unsaved',
    `switching a reference to Value is 1 unsaved (${await unsavedNote.textContent().catch(() => 'nothing')})`,
  );
  record(await save.isEnabled(), 'and Save is offered');
  record(
    (await page.getByText(`Reads ${plainName} when the plugin runs`).count()) === 0,
    'and the note no longer says the parameter reads the variable',
  );
  if (await save.isEnabled()) await save.click();
  await page.waitForTimeout(1500);
  await openPlugin();
  const valued = (await stored()).parameters[0];
  record(
    valued.variableId === null && valued.literal === null,
    `after a reload the server holds no reference (${JSON.stringify(valued)})`,
  );
  record(
    (await sourceSwitch.getByRole('button', { name: 'Value' }).getAttribute('aria-pressed')) === 'true',
    'and the page opens on Value',
  );

  // ------------------------------------ the picker's own clear, which saves
  await graphql(
    `mutation($w: ID!, $p: ID!, $v: ID) { setPluginParameter(workspaceId: $w, pluginId: $p, name: "token", variableId: $v) { plugin { id } } }`,
    { w: WORKSPACE, p: pluginId, v: made[plainName] },
  );
  await openPlugin();
  const pluginClear = page.locator('#plugin-parameters-' + pluginId + ' [data-reference-clear]');
  record((await pluginClear.count()) === 1, 'a reference offers a clear beside its picker');
  await page.locator('#plugin-parameters-' + pluginId).screenshot({ path: shot('reference-unset-plugin.png') }).catch(() => undefined);
  if ((await pluginClear.count()) === 1) {
    await pluginClear.click();
    await page.waitForTimeout(400);
    record((await unsavedNote.textContent().catch(() => '')) === '1 unsaved', 'clearing it is 1 unsaved');
    await save.click();
    await page.waitForTimeout(1500);
  }
  const cleared = (await stored()).parameters[0];
  record(cleared.variableId === null && cleared.literal === null, `the clear is saved (${JSON.stringify(cleared)})`);

  // ------------------- a secret field elsewhere: an MCP server's token
  const server = (
    await graphql(`mutation($input: CreateMcpServerInput!) { createMcpServer(input: $input) { id secretVariableId } }`, {
      input: {
        workspaceId: WORKSPACE,
        name: `${SCRATCH} server`,
        address: 'http://reference-unset.invalid/mcp',
        authType: 'BEARER_TOKEN',
        secretVariableId: made[secretName],
      },
    })
  ).createMcpServer;
  record(server.secretVariableId === made[secretName], 'an MCP server made reading a workspace secret');

  await page.goto(`${BASE}/workspace/${WORKSPACE}/integrations/servers/${server.id}`, { waitUntil: 'domcontentloaded' });
  record(await drawn(page, 'the MCP server page'), 'the MCP server page is on screen');
  await page.waitForTimeout(800);
  const secretClear = page.locator('[data-reference-clear]');
  record((await secretClear.count()) === 1, 'the token offers a clear beside its picker');
  await page.screenshot({ path: shot('reference-unset-mcp.png') });
  if ((await secretClear.count()) === 1) {
    await secretClear.click();
    await page.waitForTimeout(400);
    const saveServer = page.locator('button[type="submit"]', { hasText: 'Save Changes' });
    record(await saveServer.isEnabled(), 'clearing it offers Save');
    await saveServer.click();
    await page.waitForTimeout(1500);
  }
  const after = (await listServers()).find((row) => row.id === server.id);
  record(
    after?.secretVariableId === null && after?.secretSet === false,
    `the server holds no reference and no token (${JSON.stringify(after)})`,
  );
} catch (cause) {
  record(false, `the check ran to the end (${cause instanceof Error ? cause.message : String(cause)})`);
}

await clean();
