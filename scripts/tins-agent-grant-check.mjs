/**
 * An agent's Tins grant: labels chosen the way an issue's labels are, offered
 * from the labels tins carry, and saved as the agent's tinLabels.
 *
 * An agent starts with none. Typing narrows the labels in use to the ones that
 * match, a dashed suggestion under the box adds one, Enter adds what was typed,
 * and each chosen label is a chip that is removed by pressing it - the issue
 * page's chips, drawn the same. The tin_ tools are rows on the Tools list that
 * read this grant: Hide while it holds no label, Always once it holds one, and
 * not pressable either way.
 *
 * Makes a scratch agent and a scratch tin at an address under `.invalid` - the
 * tin only so there is a label in use to be offered - and removes both,
 * sweeping what a killed run left behind.
 */
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const AGENT = 'tinGrantScratch_';
const TIN = 'tinGrantScratchTin';
const OFFERED = 'tin-grant-check';
const TYPED = 'tin-grant-typed';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

/* -------------------------------------------------- the server's contract - */

const agentFields = ((await graphql(`{ __type(name: "Agent") { fields { name } } }`).catch(() => null))?.__type?.fields ?? []).map(
  (one) => one.name,
);
record(agentFields.includes('tinLabels'), 'an agent carries its tin labels');
const governance = ((await graphql(`{ __type(name: "BuiltInToolGovernance") { enumValues { name } } }`).catch(() => null))?.__type
  ?.enumValues ?? []).map((one) => one.name);
record(governance.includes('TIN_ACCESS'), 'and a built-in tool can be governed by them');
const builtIn = (await graphql(`{ builtInTools { name governance } }`).catch(() => ({ builtInTools: [] }))).builtInTools;
const tinTools = builtIn.filter((one) => one.governance === 'TIN_ACCESS').map((one) => one.name);
record(tinTools.length > 0, `the server brings tin tools that read it (${tinTools.join(', ')})`);

/* -------------------------------------------------------------- the fixture */

const agentsNamed = async (prefix) =>
  (
    await graphql(
      `query ($w: ID!, $s: String) { workspaceAgents(workspaceId: $w, page: 0, size: 50, search: $s) { content { id name } } }`,
      { w: WORKSPACE, s: prefix },
    )
  ).workspaceAgents.content.filter((one) => one.name.startsWith(prefix));
for (const one of await agentsNamed(AGENT)) await graphql(`mutation ($id: ID!) { deleteAgent(id: $id) }`, { id: one.id }).catch(() => {});
const tins = async () => (await graphql(`{ tins { id name } }`)).tins.filter((one) => one.name === TIN);
for (const one of await tins()) await graphql(`mutation ($id: ID!) { deleteTin(id: $id) }`, { id: one.id }).catch(() => {});

const tin = (
  await graphql(`mutation ($input: TinInput!) { createTin(input: $input) { id label } }`, {
    input: { name: TIN, label: OFFERED, address: 'http://tin-grant-check.invalid:8090', token: null },
  })
).createTin;
const labels = (await graphql(`{ tinLabels }`)).tinLabels;
record(labels.includes(OFFERED), `the label a tin carries is one of the labels in use (${labels.join(', ')})`);

const agent = (
  await graphql(`mutation ($w: ID!, $n: String!) { createAgent(input: { workspaceId: $w, name: $n, type: LLM }) { id tinLabels } }`, {
    w: WORKSPACE,
    n: `${AGENT}${Date.now()}`,
  })
).createAgent;
record(Array.isArray(agent.tinLabels) && agent.tinLabels.length === 0, 'a new agent starts with no tin labels');

/* ------------------------------------------------------------ the drawing - */

await page.goto(`${BASE}/workspace/${WORKSPACE}/agents/${agent.id}/settings`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, "the agent's settings"), "the agent's settings open");
const grant = page.locator('[data-tin-grant]');
const there = await grant.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
record(there, 'the form has a Tins grant');
record((await grant.locator('[data-label-chip]').count()) === 0, 'holding no label');

/* A tin tool reads the grant: Hide with no label, not pressable. */
const tinTool = tinTools[0];
const toolState = () =>
  page.locator(`[data-grant-name="${tinTool}"] [data-tool-state]`).first().getAttribute('data-tool-state').catch(() => null);
if (tinTool !== undefined) {
  record((await toolState()) === 'hide', `${tinTool} reads Hide while the agent holds no tin label`);
  record(
    (await page.locator(`[data-grant-name="${tinTool}"] [data-tool-fixed]`).count()) > 0,
    `and is switched by the grant rather than on its own row`,
  );
}

/* Typing narrows the labels in use, offered under the box. */
const box = grant.locator('input[type="text"]');
await box.click();
await box.pressSequentially('tin-grant', { delay: 20 });
const suggestion = grant.locator(`[data-label-suggestion="${OFFERED}"]`);
const offered = await suggestion.waitFor({ timeout: 10_000 }).then(() => true).catch(() => false);
record(offered, `typing offers ${OFFERED}`);
const boxAt = await box.boundingBox().catch(() => null);
const suggestionAt = await suggestion.boundingBox().catch(() => null);
record(boxAt !== null && suggestionAt !== null && suggestionAt.y >= boxAt.y + boxAt.height - 1, 'under the box');
await box.fill('zzz-no-such-label');
record((await grant.locator('[data-label-suggestion]').count()) === 0, 'and offers nothing that does not match');
await box.fill('tin-grant');

/* Pressing the suggestion makes it a chip, and it is offered no more. */
await suggestion.click();
const chip = grant.locator(`[data-label-chip="${OFFERED}"]`);
record(await chip.waitFor({ timeout: 5_000 }).then(() => true).catch(() => false), 'pressing it makes it a chip');
record((await grant.locator(`[data-label-suggestion="${OFFERED}"]`).count()) === 0, 'and it is offered no more');

/* Enter adds what was typed, whether or not a tin carries it yet. */
await box.fill(TYPED);
await box.press('Enter');
const typedChip = grant.locator(`[data-label-chip="${TYPED}"]`);
record(await typedChip.waitFor({ timeout: 5_000 }).then(() => true).catch(() => false), 'Enter adds a label typed in full');
const first = await chip.boundingBox().catch(() => null);
const second = await typedChip.boundingBox().catch(() => null);
record(
  first !== null && second !== null && Math.abs(first.y - second.y) < 2 && second.x > first.x,
  'the chips sit in a row, in the order they were chosen',
);

/* Drawn as the issue page draws a label: mono, small, a 4px corner. */
const look = await chip.evaluate((one) => {
  const style = getComputedStyle(one);
  return { font: style.fontFamily, radius: style.borderTopLeftRadius, border: style.borderTopStyle };
});
record(/mono/i.test(look.font) && look.radius === '4px' && look.border === 'solid', `a chip is drawn as a label (${JSON.stringify(look)})`);

/* The tin tool follows the grant before anything is saved. */
if (tinTool !== undefined) record((await toolState()) === 'always', `${tinTool} reads Always once a label is held`);

/* Pressing a chip removes it. */
await box.fill('scratch-removed');
await box.press('Enter');
await grant.locator('[data-label-chip="scratch-removed"]').click();
record((await grant.locator('[data-label-chip="scratch-removed"]').count()) === 0, 'pressing a chip removes it');

/* Saved, it is the agent's tinLabels. */
await page.getByRole('button', { name: /^Save/ }).first().click();
await page.waitForTimeout(2_000);
const stored = (await graphql(`query ($id: ID!) { agent(id: $id) { tinLabels } }`, { id: agent.id })).agent.tinLabels;
record(
  stored.length === 2 && stored.includes(OFFERED) && stored.includes(TYPED),
  `Save stores the labels chosen (${JSON.stringify(stored)})`,
);

/* And the page opens on them again. */
await page.reload({ waitUntil: 'domcontentloaded' });
await drawn(page, "the agent's settings, again");
await page.locator('[data-tin-grant]').waitFor({ timeout: 20_000 }).catch(() => {});
record((await page.locator('[data-tin-grant] [data-label-chip]').count()) === 2, 'and they are drawn when the page opens again');

/* --------------------------------------------------------------- put back */

await graphql(`mutation ($id: ID!) { deleteAgent(id: $id) }`, { id: agent.id }).catch(() => {});
await graphql(`mutation ($id: ID!) { deleteTin(id: $id) }`, { id: tin.id }).catch(() => {});

await finish(browser);
