/**
 * An agent with no skill catalog ticked still reaches the skills the server
 * brings, and its form says so.
 *
 * Reported: the skill tools followed the catalog grants, so an agent with none
 * read `skill_list`, `skill_load` and `skill_search` as Hide and could not load
 * even `!caveman`. They are built-ins now, on unless hidden, and the built-in
 * catalog is held by every agent - drawn ticked and fixed.
 *
 * And the other half of the same page: a skill whose catalog is not granted
 * reads Hide and no press changes it, so it is drawn disabled with the reason
 * on hover rather than looking like a control that does nothing.
 */
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1200 } });
const PREFIX = 'zzSkillReach';

const sweep = async () => {
  const { workspaceAgents } = await graphql(
    `query($w: ID!) { workspaceAgents(workspaceId: $w, size: 200) { content { id name } } }`,
    { w: WORKSPACE },
  );
  for (const old of workspaceAgents.content.filter((one) => one.name.startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { deleteAgent(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
  const { skillCatalogs } = await graphql(`query($w: ID!) { skillCatalogs(workspaceId: $w) { id name } }`, { w: WORKSPACE });
  for (const old of skillCatalogs.filter((one) => one.name.startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { deleteSkillCatalog(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
};
await sweep();

/* A catalog of the workspace's own, with one skill, that this agent is not granted. */
const catalog = (
  await graphql(`mutation($w: ID!, $n: String!) { createSkillCatalog(workspaceId: $w, name: $n) { id name } }`, {
    w: WORKSPACE,
    n: `${PREFIX} playbooks`,
  })
).createSkillCatalog;
const SKILL = `${PREFIX} escalating`;
await graphql(`mutation($input: CreateSkillInput!) { createSkill(input: $input) { id } }`, {
  input: { workspaceId: WORKSPACE, name: SKILL, catalogId: catalog.id },
});

const made = await graphql(`mutation($input: CreateAgentInput!) { createAgent(input: $input) { id name } }`, {
  input: { workspaceId: WORKSPACE, name: `${PREFIX} agent`, type: 'LLM' },
});
const AGENT = made.createAgent.id;
const cleared = await graphql(
  `mutation($id: ID!, $name: String!) { updateAgent(id: $id, input: { name: $name, skillCatalogs: [] }) { skillCatalogs tools } }`,
  { id: AGENT, name: made.createAgent.name },
);
record(cleared.updateAgent.skillCatalogs.length === 0, 'the agent holds no skill catalog');
record(
  ['skill_list', 'skill_load', 'skill_search'].every((name) => cleared.updateAgent.tools.includes(name)),
  `and still holds the skill tools (${cleared.updateAgent.tools.filter((one) => one.startsWith('skill_')).join(', ')})`,
);

await page.goto(`${BASE}/workspace/${WORKSPACE}/agents/${AGENT}/settings`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the agent settings'), 'the agent settings are on screen');
await page.waitForSelector('[data-grant-name="skill_load"] [data-tool-state]', { timeout: 20_000 }).catch(() => {});

const states = await page.evaluate(() =>
  ['skill_list', 'skill_load', 'skill_search'].map(
    (name) => document.querySelector(`[data-grant-name="${name}"] [data-tool-state]`)?.getAttribute('data-tool-state') ?? null,
  ),
);
record(states.every((one) => one === 'always' || one === 'offer'), `the skill tools read as held (${states.join(', ')})`);

const builtIn = page.getByRole('checkbox', { name: 'orknux_skills' });
const there = (await builtIn.count()) > 0;
record(there, 'the built-in catalog has a row among the skill catalogs');
if (there) {
  record((await builtIn.isChecked()) && (await builtIn.isDisabled()), 'drawn ticked and fixed, with nothing ticked');
}

/* ------------------------------------- a skill out of reach is drawn so */

const out = page.locator(`[data-grant-name="${SKILL}"]`);
await out.waitFor({ timeout: 20_000 }).catch(() => {});
const drawnOut = await out.evaluate((row) => ({
  flagged: row.hasAttribute('data-grant-out'),
  opacity: Number(getComputedStyle(row).opacity),
  title: row.getAttribute('title') ?? '',
  control: row.querySelector('[data-tool-state]')?.hasAttribute('disabled') ?? false,
  state: row.querySelector('[data-tool-state]')?.getAttribute('data-tool-state') ?? null,
})).catch(() => null);
record(drawnOut !== null, 'the skill in the ungranted catalog has a row');
if (drawnOut !== null) {
  record(drawnOut.state === 'hide' && drawnOut.control, `it reads Hide and its control is disabled (${drawnOut.state})`);
  record(drawnOut.flagged && drawnOut.opacity < 0.7, `the whole row is drawn dimmed (opacity ${drawnOut.opacity})`);
  // The reason is in the hover card the grant lists draw, which replaced the native title.
  await out.hover();
  const said = await page.locator('[data-grant-card]').first().innerText().catch(() => '');
  record(
    /not granted/.test(said) && said.includes(catalog.name),
    `and hovering it says why, naming the catalog (${JSON.stringify(said.replace(/\s+/g, ' '))})`,
  );
}

await sweep();
await finish(browser);
