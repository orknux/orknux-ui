/**
 * How many tools an agent carries, and which of them always travel.
 *
 * Issue #372, which goes past #368. That one was about surviving a hard limit -
 * OpenAI and Azure refuse a request over 128 tools, so an agent granted more
 * could not answer at all. This is about the number *below* it: a model handed
 * eighty tools is already choosing from a list it cannot hold in mind, and the
 * context they occupy is paid for on every round of every turn.
 *
 * The eviction and the searching are pinned in ToolBudgetTest. What is measured
 * here is the form, where the two settings are one decision: the second column
 * appears when a ceiling is typed and not before, because without one nothing is
 * ever dropped and marking a row would be marking it against something that
 * never happens.
 *
 * Makes an agent and removes it.
 */
import { BASE, WORKSPACE, open, drawn, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1200 } });

/* ----------------------------------------------------------------- fixture */

const PREFIX = 'zzToolBudget';

const sweep = async () => {
  const { workspaceAgents } = await graphql(
    `query($w: ID!) { workspaceAgents(workspaceId: $w, size: 200) { content { id name } } }`,
    { w: WORKSPACE },
  );
  for (const old of workspaceAgents.content.filter((one) => one.name.startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { deleteAgent(id: $id) }`, { id: old.id }).catch(() => undefined);
    console.log(`swept agent ${old.name}`);
  }
};

await sweep();

const made = await graphql(`mutation($input: CreateAgentInput!) { createAgent(input: $input) { id name } }`, {
  input: { workspaceId: WORKSPACE, name: `${PREFIX} agent`, type: 'LLM' },
});
const AGENT = made.createAgent.id;
console.log(`made agent ${made.createAgent.name} (#${AGENT})`);

/* One granted tool, so there is a row the second column can appear on. */
const { workspaceTools } = await graphql(
  `query($w: ID!) { workspaceTools(workspaceId: $w, page: 0, size: 1) { content { name } } }`,
  { w: WORKSPACE },
);
const TOOL = workspaceTools.content[0]?.name ?? null;
console.log(`granting: ${TOOL}`);

const clean = async () => {
  await sweep();
  await finish(browser);
};

if (TOOL === null) {
  record(false, 'the workspace has a tool to grant');
  await clean();
}

await graphql(
  `mutation($id: ID!, $name: String!, $tools: [String!]) {
     updateAgent(id: $id, input: { name: $name, tools: $tools }) { tools }
   }`,
  { id: AGENT, name: made.createAgent.name, tools: [TOOL] },
);

/* -------------------------------------------------------------------- drive */

await page.goto(`${BASE}/workspace/${WORKSPACE}/agents/${AGENT}/settings`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, "the agent's page"), "the agent's settings are on screen");

const box = page.locator('#agent-max-tools');
const there = await box
  .waitFor({ timeout: 20_000 })
  .then(() => true)
  .catch(() => false);
record(there, 'the agent has a box for how many tools it carries at once');
if (!there) await clean();

record(
  await box.inputValue().then((held) => held === ''),
  'which opens empty, meaning as many as the provider allows',
);

/* ------------------------------ the column follows the ceiling ------------ */

const always = page.locator('[class*="_grantAlways_"]');
record(
  await always.count().then((many) => many === 0),
  'and with no ceiling there is no second column, because nothing is ever dropped',
);

await box.fill('10');
const appeared = await always
  .first()
  .waitFor({ timeout: 10_000 })
  .then(() => true)
  .catch(() => false);
record(appeared, 'typing a ceiling brings out the column that marks what always travels');

/*
 * And not on the rows it would mean nothing for. finish_answer is a flag rather
 * than a tool: the server stores only granted names, so a tick there was dropped
 * on save while the form went on showing it.
 */
record(
  await page
    .locator('[data-grant-name="finish_answer"] [class*="_grantAlways_"]')
    .count()
    .then((many) => many === 0),
  'but not on the rows that are flags rather than tools, where the mark would be dropped on save',
);

/* The count beside the box, which is what makes the number mean something. */
const count = await page.locator('[data-always-count]').first().innerText().catch(() => '');
console.log(`count: ${count}`);
record(count.includes('0 always'), `it counts what is marked as it is typed (${count})`);

/* ------------------------------------------------ what a mark stores ------ */

/*
 * The granted tool's own row, not the first "always" on the page.
 *
 * Two rows of this list are flags rather than tools - finish_answer and the
 * picture link - and the first press of this check landed on one of them. The
 * mark was sent, the server dropped it because it is not a granted tool, and the
 * form went on showing it ticked. Those rows no longer offer the column at all,
 * which is what the assertion below is about as much as this press is.
 */
const row = page.locator(`[data-grant-name="${TOOL}"]`);
await row.locator('[class*="_grantAlways_"] input[type="checkbox"]').check();

/*
 * The count is what says the mark landed in the form rather than only in the
 * DOM - a checkbox inside a label can be toggled twice by one press, once by
 * the input and once by the label forwarding it, which leaves the box looking
 * ticked and the state where it started.
 */
const marked = await page
  .waitForFunction(() => document.querySelector('[data-always-count]')?.textContent?.includes('1 always'), {
    timeout: 10_000,
  })
  .then(() => true)
  .catch(() => false);
record(marked, 'ticking it is counted, so the mark reached the form and not only the checkbox');

/*
 * What the save actually sends, printed. The first run of this check passed
 * every assertion about the form and failed the one about the server, and the
 * only thing that told them apart was reading the request - so it stays.
 */
page.on('request', (request) => {
  const body = request.postData();
  if (body?.includes('UpdateAgent')) {
    const sent = JSON.parse(body).variables.input;
    console.log(`sent: tools=${JSON.stringify(sent.tools)} always=${JSON.stringify(sent.requiredTools)}`);
  }
});

await page.getByRole('button', { name: /^Save/ }).first().click();
await page.waitForTimeout(2500);

const stored = await graphql(`query($id: ID!) { agent(id: $id) { maxTools requiredTools } }`, { id: AGENT });
console.log(`stored: ${JSON.stringify(stored.agent)}`);
record(stored.agent.maxTools === 10, `the ceiling reaches the server (${stored.agent.maxTools})`);
record(
  stored.agent.requiredTools.includes(TOOL),
  `and the tool marked as always carried is stored against it (${JSON.stringify(stored.agent.requiredTools)})`,
);

/* -------------------------------------------------- and the bound --------- */

/*
 * Asked of the server rather than typed: the box's own min and max stop a
 * person, and the bound that matters is behind the screen since the same
 * mutation is reachable from the API.
 */
const refused = await graphql(
  `mutation($id: ID!, $name: String!) { updateAgent(id: $id, input: { name: $name, maxTools: 2 }) { maxTools } }`,
  { id: AGENT, name: made.createAgent.name },
).then(
  () => null,
  (cause) => String(cause?.message ?? cause),
);
console.log(`refusal: ${refused}`);
record(
  refused !== null && refused.includes('not a number of tools'),
  'a ceiling too low to hold the search and a handful of tools is refused',
);

await clean();
