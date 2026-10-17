/**
 * An agent's Boxes grant: the labels boxes carry, as a list of ticks drawn the
 * way Connections is, and saved as the agent's boxLabels.
 *
 * An agent starts with none. Each label in use is a row with a checkbox;
 * ticking it grants it. A label granted that no box carries any more stays on
 * the list as a kept row, as a connection that has gone does. The box_ tools
 * are rows on the Tools list that read this grant: Hide while it holds no
 * label, Always once it holds one, and not pressable either way.
 *
 * Makes a scratch agent and a scratch box at an address under `.invalid` - the
 * box only so there is a label in use to be offered - and removes both,
 * sweeping what a killed run left behind.
 */
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const AGENT = 'boxGrantScratch_';
const BOX = 'boxGrantScratchBox';
const OFFERED = 'box-grant-check';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

/* -------------------------------------------------- the server's contract - */

const agentFields = ((await graphql(`{ __type(name: "Agent") { fields { name } } }`).catch(() => null))?.__type?.fields ?? []).map(
  (one) => one.name,
);
record(agentFields.includes('boxLabels'), 'an agent carries its box labels');
const governance = ((await graphql(`{ __type(name: "BuiltInToolGovernance") { enumValues { name } } }`).catch(() => null))?.__type
  ?.enumValues ?? []).map((one) => one.name);
record(governance.includes('BOX_ACCESS'), 'and a built-in tool can be governed by them');
const builtIn = (await graphql(`{ builtInTools { name governance } }`).catch(() => ({ builtInTools: [] }))).builtInTools;
const boxTools = builtIn.filter((one) => one.governance === 'BOX_ACCESS').map((one) => one.name);
record(boxTools.length > 0, `the server brings box tools that read it (${boxTools.join(', ')})`);

/* -------------------------------------------------------------- the fixture */

const agentsNamed = async (prefix) =>
  (
    await graphql(
      `query ($w: ID!, $s: String) { workspaceAgents(workspaceId: $w, page: 0, size: 50, search: $s) { content { id name } } }`,
      { w: WORKSPACE, s: prefix },
    )
  ).workspaceAgents.content.filter((one) => one.name.startsWith(prefix));
for (const one of await agentsNamed(AGENT)) await graphql(`mutation ($id: ID!) { deleteAgent(id: $id) }`, { id: one.id }).catch(() => {});
const boxes = async () => (await graphql(`{ boxes { id name } }`)).boxes.filter((one) => one.name === BOX);
for (const one of await boxes()) await graphql(`mutation ($id: ID!) { deleteBox(id: $id) }`, { id: one.id }).catch(() => {});

const box = (
  await graphql(`mutation ($input: BoxInput!) { createBox(input: $input) { id label } }`, {
    input: { name: BOX, label: OFFERED, address: 'http://box-grant-check.invalid:8090', token: null },
  })
).createBox;
const labels = (await graphql(`{ boxLabels }`)).boxLabels;
record(labels.includes(OFFERED), `the label a box carries is one of the labels in use (${labels.join(', ')})`);

const agent = (
  await graphql(`mutation ($w: ID!, $n: String!) { createAgent(input: { workspaceId: $w, name: $n, type: LLM }) { id boxLabels } }`, {
    w: WORKSPACE,
    n: `${AGENT}${Date.now()}`,
  })
).createAgent;
record(Array.isArray(agent.boxLabels) && agent.boxLabels.length === 0, 'a new agent starts with no box labels');

/* ------------------------------------------------------------ the drawing - */

await page.goto(`${BASE}/workspace/${WORKSPACE}/agents/${agent.id}/settings`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, "the agent's settings"), "the agent's settings open");
const grant = page.locator('[data-box-grant]');
const there = await grant.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
record(there, 'the form has a Boxes grant');

/* The same list of ticks as Connections, one row per label a box carries - not a box to type a label into. */
const row = grant.locator(`[data-grant-name="${OFFERED}"]`);
record(await row.waitFor({ timeout: 10_000 }).then(() => true).catch(() => false), `the label a box carries is a row (${OFFERED})`);
record((await grant.locator('input[placeholder*="box label"]').count()) === 0, 'and there is no box to type a label into');
const tick = row.locator('input[type="checkbox"]');
record((await tick.count()) === 1 && !(await tick.isChecked()), 'it is a checkbox, unticked while the agent holds no label');

/* A box tool reads the grant: Hide with no label, not pressable. */
const boxTool = boxTools[0];
const toolState = () =>
  page.locator(`[data-grant-name="${boxTool}"] [data-tool-state]`).first().getAttribute('data-tool-state').catch(() => null);
if (boxTool !== undefined) {
  record((await toolState()) === 'hide', `${boxTool} reads Hide while the agent holds no box label`);
  record(
    (await page.locator(`[data-grant-name="${boxTool}"] [data-tool-fixed]`).count()) > 0,
    `and is switched by the grant rather than on its own row`,
  );
}

/* Ticking it grants it, and the box tool follows before anything is saved. */
await tick.check();
record(await tick.isChecked(), 'ticking the row grants the label');
if (boxTool !== undefined) record((await toolState()) === 'always', `${boxTool} reads Always once a label is held`);

/* Saved, it is the agent's boxLabels. */
await page.getByRole('button', { name: /^Save/ }).first().click();
await page.waitForTimeout(2_000);
const stored = (await graphql(`query ($id: ID!) { agent(id: $id) { boxLabels } }`, { id: agent.id })).agent.boxLabels;
record(stored.length === 1 && stored[0] === OFFERED, `Save stores the label ticked (${JSON.stringify(stored)})`);

/* And the page opens on it again. */
await page.reload({ waitUntil: 'domcontentloaded' });
await drawn(page, "the agent's settings, again");
const again = page.locator(`[data-box-grant] [data-grant-name="${OFFERED}"] input[type="checkbox"]`);
await again.waitFor({ timeout: 20_000 }).catch(() => {});
record(await again.isChecked().catch(() => false), 'and it is ticked when the page opens again');

/* --------------------------------------------------------------- put back */

await graphql(`mutation ($id: ID!) { deleteAgent(id: $id) }`, { id: agent.id }).catch(() => {});
await graphql(`mutation ($id: ID!) { deleteBox(id: $id) }`, { id: box.id }).catch(() => {});

await finish(browser);
