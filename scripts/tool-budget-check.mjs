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
 * here is the form. A tool's grant is one control that cycles Hide, Offer and
 * Always on each press (#413); the count of what always travels appears beside
 * the box once a ceiling is typed, because without one nothing is ever dropped.
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

/* ------------------------------ the control and the count ----------------- */

/* The granted tool loads Offered - available, not yet always carried. #413. */
const pill = page.locator(`[data-grant-name="${TOOL}"] [data-tool-state]`);
record(
  await pill.getAttribute('data-tool-state').then((state) => state === 'offer'),
  'a granted tool reads as Offered',
);

/* The count beside the box appears once a ceiling is typed. */
await box.fill('10');
const count = page.locator('[data-always-count]').first();
const appeared = await count
  .waitFor({ timeout: 10_000 })
  .then(() => true)
  .catch(() => false);
record(appeared, 'typing a ceiling brings out the count of what always travels');
record((await count.innerText()).includes('0 always'), `nothing is marked always yet (${await count.innerText()})`);

/* ------------------------------------------------ what a mark stores ------ */

/* Clicking the granted tool's control cycles it Offer -> Always. */
await pill.click();
record(
  await pill.getAttribute('data-tool-state').then((state) => state === 'always'),
  'clicking a granted tool marks it Always',
);

/*
 * The count is what says the mark landed in the form rather than only on the
 * button: it reads requiredTools, so "1 always" is the form holding it.
 */
const marked = await page
  .waitForFunction(() => document.querySelector('[data-always-count]')?.textContent?.includes('1 always'), {
    timeout: 10_000,
  })
  .then(() => true)
  .catch(() => false);
record(marked, 'and that reaches the count, so the form has it, not only the button');

/*
 * A capability flag has no Offer state. finish_answer is always carried when
 * on rather than searched for, so its control cycles Hide and Always only,
 * never Offer between them. #413.
 */
const flag = page.locator('[data-grant-name="finish_answer"] [data-tool-state]');
if ((await flag.count()) > 0) {
  const start = await flag.getAttribute('data-tool-state');
  await flag.click();
  const one = await flag.getAttribute('data-tool-state');
  await flag.click();
  const two = await flag.getAttribute('data-tool-state');
  record(
    one !== 'offer' && two !== 'offer' && [start, one, two].includes('always'),
    `a capability flag reads Hide or Always, never Offer (${start} -> ${one} -> ${two})`,
  );
}

/* ------------------------------------------- the status filter ----------- */

/*
 * The list narrows to one status. Only where the list is long enough to draw
 * its filters at all, which is where a filter earns its keep. Issue #413.
 */
const statusFilter = page.locator('[data-tool-status-filter]');
if ((await statusFilter.count()) > 0) {
  await statusFilter.selectOption('always');
  await page.waitForTimeout(400);
  record(
    (await page.locator(`[data-grant-name="${TOOL}"] [data-tool-state="always"]`).count()) > 0,
    'filtering to Always shows the tool marked always',
  );
  record(
    (await page.locator('[data-grant-rows] > [data-grant-name] [data-tool-state="offer"]').count()) === 0,
    'and nothing that is merely offered',
  );
  await statusFilter.selectOption('hide');
  await page.waitForTimeout(400);
  record(
    (await page.locator(`[data-grant-name="${TOOL}"]`).count()) === 0,
    'filtering to Hide leaves the always-carried tool out',
  );
  await statusFilter.selectOption('all');
  await page.waitForTimeout(300);
}

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
