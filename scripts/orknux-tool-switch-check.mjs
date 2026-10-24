/**
 * An orknux_ tool is switched on its own, inside the Orknux access grant.
 *
 * Asked for: the grant was all or nothing, so an agent that should read runs
 * but not start one could not be given that. And then: "why can't I change
 * Always to something like Offer?" - the rows cycled Hide and Always only. While
 * the grant is on each row cycles Hide, Offer and Always like every other tool
 * and Save stores it; with the grant off the rows are locked at Hide and say
 * where the grant is.
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
const reads = async () => state().getAttribute('data-tool-state');
const held = async () => (await graphql(`query($id: ID!) { agent(id: $id) { tools requiredTools } }`, { id: agent.id })).agent;
const save = async () => {
  await page.getByRole('button', { name: /^Save/ }).first().click();
  await page.waitForTimeout(2000);
};
const reload = async () => {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await row().waitFor({ timeout: 20_000 }).catch(() => undefined);
};

await page.goto(`${BASE}/workspace/${WORKSPACE}/agents/${agent.id}/settings`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, "the agent's page"), "the agent's page is on screen");
record(await row().waitFor({ timeout: 20_000 }).then(() => true).catch(() => false), `the ${TOOL} row is drawn`);

record((await reads()) === 'always', `granted, it reads Always (${await reads()})`);
record(!(await state().isDisabled()), 'and it can be pressed');
await state().click();
record((await reads()) === 'hide', `one press hides it (${await reads()})`);
await state().click();
record((await reads()) === 'offer', `a second press offers it (${await reads()})`);

/* Offer: granted, not carried. */
await save();
let back = await held();
record(back.tools.includes(TOOL), `saved at Offer, the agent still holds ${TOOL}`);
record(!back.requiredTools.includes(TOOL), 'and it is not marked Always');
record(back.requiredTools.includes('orknux_workflows'), 'while the other orknux_ tools stay Always');
await reload();
record((await reads()) === 'offer', `and it reads Offer after a reload (${await reads()})`);

/* Offer -> Always -> Hide. */
await state().click();
record((await reads()) === 'always', `a press from Offer marks it Always (${await reads()})`);
await state().click();
record((await reads()) === 'hide', `and one more hides it (${await reads()})`);
await save();
back = await held();
record(!back.tools.includes(TOOL), `saved, the server no longer offers ${TOOL}`);
record(back.tools.includes('orknux_workflows'), 'and the other orknux_ tools stay');
await reload();
record((await reads()) === 'hide', 'and it reads Hide after a reload');

/* Grant off: locked. */
await page.getByLabel(/Let this agent ask orknux about orknux/).uncheck();
record(await state().isDisabled(), 'with Orknux access off the rows are locked');

await graphql(`mutation($id: ID!) { deleteAgent(id: $id) }`, { id: agent.id }).catch(() => undefined);
await finish(browser);
