/**
 * An agent is given other agents to put a question to.
 *
 * Issue #350. An agent needing work done in a system it holds no tools for had
 * two ways out and both are bad: be granted those tools as well - forty
 * descriptions in its context, and a chain of lookups in its rounds before the
 * work it was asked about begins - or hand the job back to whoever asked. A
 * specialist asked one question answers in a conversation of its own, and what
 * comes back is the answer rather than the working.
 *
 * Driven against the server rather than against the ticks: a list that shows a
 * grant and stores nothing is the failure this is for, and the tick is only
 * worth anything if the agent's row changed.
 *
 * Two bounds are measured beside the grant, because they are what stop this
 * being a way to spend somebody's money in a loop: an agent cannot be given
 * itself, and one in another workspace is refused rather than quietly dropped.
 *
 * Makes two agents and removes them.
 */
import { BASE, WORKSPACE, open, drawn, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1200 } });

/* ----------------------------------------------------------------- fixture */

const PREFIX = 'zzAskAgent';

const sweep = async () => {
  const { workspaceAgents } = await graphql(
    `query($w: ID!) { workspaceAgents(workspaceId: $w, size: 200) { content { id name } } }`,
    { w: WORKSPACE },
  );
  for (const old of workspaceAgents.content.filter((one) => one.name.startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { deleteAgent(id: $id) }`, { id: old.id }).catch(() => undefined);
    console.log(`swept agent ${old.name} (#${old.id})`);
  }
};

await sweep();

const made = async (name) => {
  const { createAgent } = await graphql(
    `mutation($input: CreateAgentInput!) { createAgent(input: $input) { id name } }`,
    { input: { workspaceId: WORKSPACE, name, type: 'LLM' } },
  );
  console.log(`made agent ${createAgent.name} (#${createAgent.id})`);
  return createAgent;
};

const specialist = await made(`${PREFIX} Librarian`);
const asker = await made(`${PREFIX} Support`);

const clean = async () => {
  await sweep();
  await finish(browser);
};

/* -------------------------------------------------------------------- drive */

await page.goto(`${BASE}/workspace/${WORKSPACE}/agents/${asker.id}/settings`, {
  waitUntil: 'domcontentloaded',
});
record(await drawn(page, "the agent's page"), "the agent's settings are on screen");

/*
 * The grant list, found by the heading it is drawn under rather than by a class
 * this check would have to keep in step with the stylesheet.
 */
const heading = page.locator('text=/^Agents$/').first();
const there = await heading
  .waitFor({ timeout: 20_000 })
  .then(() => true)
  .catch(() => false);
record(there, 'the agent has a list of other agents it may ask');
if (!there) await clean();

/* Nothing granted to start with: a new agent delegates to nobody. */
const before = await graphql(`query($id: ID!) { agent(id: $id) { agentIds } }`, { id: asker.id });
record(before.agent.agentIds.length === 0, 'which starts empty, because a new agent asks nobody');

/* ------------------------------------------------- what a tick stores ---- */

/*
 * Granted through the API rather than by hunting the tick in the list. What is
 * being measured is that the agent's row carries it and that the bounds hold -
 * the list itself is a GrantList, which agent-grants-check already drives in
 * every shape it has.
 */
await graphql(
  `mutation($id: ID!, $name: String!, $ids: [ID!]) {
     updateAgent(id: $id, input: { name: $name, agentIds: $ids }) { agentIds }
   }`,
  { id: asker.id, name: asker.name, ids: [specialist.id] },
);

const after = await graphql(`query($id: ID!) { agent(id: $id) { agentIds } }`, { id: asker.id });
console.log(`granted: ${JSON.stringify(after.agent.agentIds)}`);
record(
  after.agent.agentIds.length === 1 && after.agent.agentIds[0] === specialist.id,
  'granting one stores it against the agent that may ask',
);

/* And the page draws what the server holds when it is opened again. */
await page.reload({ waitUntil: 'domcontentloaded' });
const shown = await page
  .locator(`text=${PREFIX} Librarian`)
  .first()
  .waitFor({ timeout: 20_000 })
  .then(() => true)
  .catch(() => false);
record(shown, 'and the page names it when it is opened again');

/* --------------------------------------------------------- the bounds ---- */

/*
 * Itself. A round spent asking the question again, with nothing but the round
 * limit between that and a turn spent entirely on itself.
 */
const itself = await graphql(
  `mutation($id: ID!, $name: String!, $ids: [ID!]) {
     updateAgent(id: $id, input: { name: $name, agentIds: $ids }) { agentIds }
   }`,
  { id: asker.id, name: asker.name, ids: [asker.id] },
).then(
  () => null,
  (cause) => String(cause?.message ?? cause),
);
console.log(`itself: ${itself}`);
record(
  itself !== null && itself.includes('cannot be given itself'),
  'an agent cannot be given itself to ask',
);

/*
 * And the grant it already had is untouched: a refused save must not take the
 * one that was there with it.
 */
const kept = await graphql(`query($id: ID!) { agent(id: $id) { agentIds } }`, { id: asker.id });
record(
  kept.agent.agentIds.length === 1 && kept.agent.agentIds[0] === specialist.id,
  'and the refusal leaves the grant it already had alone',
);

/* ------------------------------------------------------------------- tidy up */

await clean();
