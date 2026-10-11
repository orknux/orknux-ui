/**
 * An agent is granted variable catalogs two ways: their secrets, which it may
 * hand a box command by name and never sees, and their plain values, which it
 * may read. Each is a list of the workspace's variable catalogs on the agent's
 * settings, saved with the rest and drawn again when the page opens - and the
 * variable tools are rows on the Tools list switched by those grants.
 */
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const AGENT = 'variableGrantScratch_';
const SECRETS = 'variableGrantVault';
const VALUES = 'variableGrantConfig';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

/* -------------------------------------------------- the server's contract - */

const agentFields = ((await graphql(`{ __type(name: "Agent") { fields { name } } }`).catch(() => null))?.__type?.fields ?? []).map(
  (one) => one.name,
);
record(
  agentFields.includes('secretCatalogs') && agentFields.includes('variableCatalogs'),
  'an agent carries its secret and variable catalogs',
);
const builtIn = (await graphql(`{ builtInTools { name governance } }`).catch(() => ({ builtInTools: [] }))).builtInTools;
const variableTools = builtIn.filter((one) => one.governance === 'VARIABLE_CATALOGS').map((one) => one.name);
record(variableTools.includes('variable_list') && variableTools.includes('variable_get'), `and the variable tools come with them (${variableTools.join(', ')})`);

/* -------------------------------------------------------------- the fixture */

const agentsNamed = async (prefix) =>
  (
    await graphql(
      `query ($w: ID!, $s: String) { workspaceAgents(workspaceId: $w, page: 0, size: 50, search: $s) { content { id name } } }`,
      { w: WORKSPACE, s: prefix },
    )
  ).workspaceAgents.content.filter((one) => one.name.startsWith(prefix));
for (const one of await agentsNamed(AGENT)) await graphql(`mutation ($id: ID!) { deleteAgent(id: $id) }`, { id: one.id }).catch(() => {});

const catalogs = async () => (await graphql(`query ($w: ID!) { variableCatalogs(workspaceId: $w) { id name } }`, { w: WORKSPACE })).variableCatalogs;
for (const name of [SECRETS, VALUES]) {
  if (!(await catalogs()).some((one) => one.name === name)) {
    await graphql(`mutation ($w: ID!, $n: String!) { createVariableCatalog(workspaceId: $w, name: $n) { id } }`, { w: WORKSPACE, n: name });
  }
}

const agent = (
  await graphql(`mutation ($w: ID!, $n: String!) { createAgent(input: { workspaceId: $w, name: $n, type: LLM }) { id } }`, {
    w: WORKSPACE,
    n: `${AGENT}${Date.now()}`,
  })
).createAgent;

/* ------------------------------------------------------------ the drawing - */

const settings = `${BASE}/workspace/${WORKSPACE}/agents/${agent.id}/settings`;
await page.goto(settings, { waitUntil: 'domcontentloaded' });
record(await drawn(page, "the agent's settings"), "the agent's settings open");

const secretList = page.locator('[data-grants="secret catalogs"]');
const valueList = page.locator('[data-grants="variable catalogs"]');
await secretList.waitFor({ timeout: 15_000 }).catch(() => {});
record((await secretList.count()) === 1, 'the form has a Secret Catalogs grant');
record((await valueList.count()) === 1, 'and a Variable Catalogs grant');

const row = (list, name) => list.locator(`[data-grant-name="${name}"]`);
record((await row(secretList, SECRETS).count()) === 1, "the secret grant lists the workspace's variable catalogs");

const toolState = async (name) =>
  (await page.locator(`[data-grant-name="${name}"] [data-tool-state]`).first().getAttribute('data-tool-state').catch(() => null)) ?? null;
const before = await toolState('variable_list');
record(before === 'hide', `variable_list reads Hide while no catalog is granted (${before})`);

await row(secretList, SECRETS).locator('input[type="checkbox"]').click();
await row(valueList, VALUES).locator('input[type="checkbox"]').click();
await page.waitForTimeout(300);
const after = await toolState('variable_list');
record(after === 'always', `and Always once one is (${after})`);

await page.getByRole('button', { name: /^Save/ }).first().click();
await page.waitForTimeout(1500);
const saved = (
  await graphql(`query ($id: ID!) { agent(id: $id) { secretCatalogs variableCatalogs } }`, { id: agent.id })
).agent;
record(
  JSON.stringify(saved.secretCatalogs) === JSON.stringify([SECRETS]) && JSON.stringify(saved.variableCatalogs) === JSON.stringify([VALUES]),
  `Save stores both grants (${JSON.stringify(saved)})`,
);

await page.goto(settings, { waitUntil: 'domcontentloaded' });
await secretList.waitFor({ timeout: 15_000 }).catch(() => {});
await page.waitForTimeout(500);
const ticked = async (list, name) =>
  row(list, name).locator('input[type="checkbox"]').isChecked().catch(() => false);
record((await ticked(secretList, SECRETS)) && (await ticked(valueList, VALUES)), 'and they are drawn ticked when the page opens again');

/* --------------------------------------------------------------- tidy up - */

await graphql(`mutation ($id: ID!) { deleteAgent(id: $id) }`, { id: agent.id }).catch(() => {});
for (const one of (await catalogs()).filter((it) => it.name === SECRETS || it.name === VALUES)) {
  await graphql(`mutation ($id: ID!) { deleteVariableCatalog(id: $id) }`, { id: one.id }).catch(() => {});
}

await finish(browser);
