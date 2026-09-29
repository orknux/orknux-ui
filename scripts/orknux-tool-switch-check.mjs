/**
 * An orknux_ tool is switched on its own, inside the Orknux access grant.
 *
 * Asked for: the grant was all or nothing, so an agent that should read runs
 * but not start one could not be given that. While the grant is on each row
 * cycles Hide and Always and Save stores it; with the grant off the rows are
 * locked at Hide and say where the grant is.
 *
 * The agent is this check's own and deleted afterwards.
 */
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 1100 } });
const agent = (await graphql(
  `mutation($w: ID!, $n: String!) { createAgent(input: { workspaceId: $w, name: $n, type: LLM }) { id name } }`,
  { w: WORKSPACE, n: `zz orknux switch ${Date.now()}` },
)).createAgent;
await graphql(`mutation($id: ID!, $n: String!) { updateAgent(id: $id, input: { name: $n, orknuxAccess: true }) { id } }`, { id: agent.id, n: agent.name });

const TOOL = 'orknux_run_workflow';
const row = () => page.locator(`[data-grant-name="${TOOL}"]`).first();
const state = () => row().locator('[data-tool-state]').first();

await page.goto(`${BASE}/workspace/${WORKSPACE}/agents/${agent.id}/settings`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, "the agent's page"), "the agent's page is on screen");
record(await row().waitFor({ timeout: 20_000 }).then(() => true).catch(() => false), `the ${TOOL} row is drawn`);

record((await state().getAttribute('data-tool-state')) === 'always', `granted, it reads Always (${await state().getAttribute('data-tool-state')})`);
record(!(await state().isDisabled()), 'and it can be pressed');
await state().click();
record((await state().getAttribute('data-tool-state')) === 'hide', `one press hides it (${await state().getAttribute('data-tool-state')})`);

await page.getByRole('button', { name: /^Save/ }).first().click();
await page.waitForTimeout(2000);
const held = (await graphql(`query($id: ID!) { agent(id: $id) { tools } }`, { id: agent.id })).agent.tools;
record(!held.includes(TOOL), `saved, the server no longer offers ${TOOL}`);
record(held.includes('orknux_workflows'), 'and the other orknux_ tools stay');

await page.reload({ waitUntil: 'domcontentloaded' });
await row().waitFor({ timeout: 20_000 }).catch(() => undefined);
record((await state().getAttribute('data-tool-state')) === 'hide', 'and it reads Hide after a reload');

/* Grant off: locked. */
await page.getByLabel(/Let this agent ask orknux about orknux/).uncheck();
record(await state().isDisabled(), 'with Orknux access off the rows are locked');

await graphql(`mutation($id: ID!) { deleteAgent(id: $id) }`, { id: agent.id }).catch(() => undefined);
await finish(browser);
