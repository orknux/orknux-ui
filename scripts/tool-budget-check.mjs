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

/*
 * Hiding a built-in is gated since #482/#483: the rows are fixed until the
 * workspace allows unsafe built-in visibility. This check is about what a switch
 * stores, so it opens the gate for its run and puts it back as it found it.
 */
const unsafeWas = (await graphql(`query ($w: ID!) { workspace(id: $w) { unsafeBuiltInTools } }`, { w: WORKSPACE }))
  .workspace.unsafeBuiltInTools;
const allowUnsafe = (allowed) =>
  graphql(`mutation ($w: ID!, $a: Boolean!) { setWorkspaceUnsafeBuiltInTools(workspaceId: $w, allowed: $a) { id } }`, {
    w: WORKSPACE,
    a: allowed,
  });
await allowUnsafe(true);
const done = async () => {
  await allowUnsafe(unsafeWas).catch(() => undefined);
  await finish(browser);
};

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
  await done();
};

if (TOOL === null) {
  record(false, 'the workspace has a tool to grant');
  await clean();
}

/*
 * The server's own tools, which a fresh agent holds Always from the start and
 * which are rows of this list like anything else. Issue #444. Read here so the
 * grant below keeps them: `tools` replaces the list, and a fixture that sent
 * only the workspace tool would be measuring an agent nobody has.
 */
const { builtInTools } = await graphql(`{ builtInTools { name governance } }`);
const BY_NAME = builtInTools.filter((one) => one.governance === 'GRANT').map((one) => one.name);
// The reaching built-ins - fetching and searching - are switched by name like the
// rest, only off until asked for, so they are not rows of somebody else's grant.
const WITH_GRANT = builtInTools.filter((one) => one.governance !== 'GRANT' && one.governance !== 'GRANT_REACHING');
console.log(`built-ins: ${BY_NAME.length} by name, ${WITH_GRANT.length} with a wider grant`);

await graphql(
  `mutation($id: ID!, $name: String!, $tools: [String!]) {
     updateAgent(id: $id, input: { name: $name, tools: $tools, skillCatalogs: [] }) { tools }
   }`,
  { id: AGENT, name: made.createAgent.name, tools: [TOOL, ...BY_NAME] },
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
await pill.waitFor({ timeout: 20_000 }).catch(() => undefined);
// The catalogues arrive in waves; a row read while they settle is the wrong row.
await page.waitForTimeout(1500);
record(
  await pill.getAttribute('data-tool-state').then((state) => state === 'offer'),
  'a granted tool reads as Offered',
);

/* ----------------------------------------- every built-in is a row -------- */

/*
 * The list is complete. Issue #444: the server's own tools were switched in
 * five places and shown in one, so the list somebody reads to see what an agent
 * may do said nothing about most of what it could do. Every name the server
 * declares is a row now, and the fresh agent holds every by-name one Always.
 */
const rowless = [];
const notAlways = [];
for (const name of BY_NAME) {
  const row = page.locator(`[data-grant-name="${name}"] [data-tool-state]`);
  if ((await row.count()) !== 1) rowless.push(name);
  else if ((await row.getAttribute('data-tool-state')) !== 'always') notAlways.push(name);
}
record(rowless.length === 0, `every built-in switched by name is a row (${BY_NAME.length}; missing: ${rowless.join(', ') || 'none'})`);
record(notAlways.length === 0, `and a fresh agent reads Always on each (not: ${notAlways.join(', ') || 'none'})`);

/*
 * The ones that come with a wider grant are rows too, read-only: this agent
 * holds no catalogs and no access, so each reads Hide, cannot be pressed, and
 * says where the switch is.
 */
const unfixed = [];
for (const one of WITH_GRANT) {
  const row = page.locator(`[data-grant-name="${one.name}"] [data-tool-state]`);
  const ok =
    (await row.count()) === 1 &&
    (await row.getAttribute('data-tool-fixed')) !== null &&
    (await row.isDisabled()) &&
    (await row.getAttribute('data-tool-state')) === 'hide' &&
    /switch it there/.test((await row.getAttribute('title')) ?? '');
  if (!ok) unfixed.push(one.name);
}
record(
  unfixed.length === 0,
  `every built-in that comes with a grant is a read-only row reading that grant (${WITH_GRANT.length}; wrong: ${unfixed.join(', ') || 'none'})`,
);

/* And the count over the heading includes them all: `n of m granted`. */
const heading = (await page.locator('[data-grants="tools"] [data-grant-count]').innerText()).trim();
const counted = /^(\d+) of (\d+) granted/.exec(heading);
record(
  counted !== null && Number(counted[1]) >= BY_NAME.length + 1 && Number(counted[2]) >= BY_NAME.length + WITH_GRANT.length + 1,
  `the count includes the built-ins - "${heading}" for ${BY_NAME.length} + ${WITH_GRANT.length} built-in rows and the tool`,
);

/* The count beside the box appears once a ceiling is typed. */
await box.fill('10');
const count = page.locator('[data-always-count]').first();
const appeared = await count
  .waitFor({ timeout: 10_000 })
  .then(() => true)
  .catch(() => false);
record(appeared, 'typing a ceiling brings out the count of what always travels');

/*
 * The count includes the built-in capabilities that are on - finish_answer and
 * the picture link are always carried too, not searched for - so a fresh agent
 * reads more than zero always before anything is pinned. Read the number rather
 * than assume it. Issues #413.
 */
const alwaysNow = async () => Number(/(\d+) always/.exec(await count.innerText())?.[1] ?? NaN);
const before = await alwaysNow();
record(Number.isFinite(before), `the count reads how many always travel (${await count.innerText()})`);

/* ------------------------------------------------ what a mark stores ------ */

/* Clicking the granted tool's control cycles it Offer -> Always. */
await pill.click();
record(
  await pill.getAttribute('data-tool-state').then((state) => state === 'always'),
  'clicking a granted tool marks it Always',
);

/*
 * The count is what says the mark landed in the form rather than only on the
 * button: pinning one tool adds one to what always travels.
 */
const marked = await page
  .waitForFunction(
    (was) => {
      const said = document.querySelector('[data-always-count]')?.textContent ?? '';
      return Number(/(\d+) always/.exec(said)?.[1] ?? NaN) === was + 1;
    },
    before,
    { timeout: 10_000 },
  )
  .then(() => true)
  .catch(() => false);
record(marked, 'and pinning one tool adds one to the count, so the form has it, not only the button');

/*
 * A built-in switched by name cycles all three states like any other tool.
 * finish_answer was a flag with no Offer between Hide and Always (#413); since
 * #444 it is a name in the grant list, so Always -> Hide -> Offer -> Always.
 */
const flag = page.locator('[data-grant-name="finish_answer"] [data-tool-state]');
const start = await flag.getAttribute('data-tool-state');
await flag.click();
const one = await flag.getAttribute('data-tool-state');
await flag.click();
const two = await flag.getAttribute('data-tool-state');
await flag.click();
const three = await flag.getAttribute('data-tool-state');
record(
  start === 'always' && one === 'hide' && two === 'offer' && three === 'always',
  `a built-in cycles Always -> Hide -> Offer -> Always like any tool (${start} -> ${one} -> ${two} -> ${three})`,
);

/*
 * Hiding one is the server withholding it: the name leaves `tools`, and with
 * it the Always mark. BuiltInToolsTest pins that a name off the list is
 * neither declared to the model nor answered; what is measured here is that
 * the form's Hide reaches the list the server reads.
 */
const note = page.locator('[data-grant-name="note_to_self"] [data-tool-state]');
await note.click();
record((await note.getAttribute('data-tool-state')) === 'hide', 'note_to_self can be hidden');

/* ------------------------------------------- the status filter ----------- */

/*
 * The list narrows to one status. Only where the list is long enough to draw
 * its filters at all, which is where a filter earns its keep. Issue #413.
 */
const statusFilter = page.locator('[data-grants="tools"] [data-tool-status-filter]'); // the skills list has one too since ed85852
if ((await statusFilter.count()) > 0) {
  await statusFilter.selectOption('always');
  await page.waitForTimeout(400);
  record(
    (await page.locator(`[data-grant-name="${TOOL}"] [data-tool-state="always"]`).count()) > 0,
    'filtering to Always shows the tool marked always',
  );
  record(
    // The tools list's filter, so the tools list's rows: the skills list below has rows of its own.
    (await page.locator('[data-grants="tools"] [data-grant-rows] > [data-grant-name] [data-tool-state="offer"]').count()) === 0,
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

const stored = await graphql(`query($id: ID!) { agent(id: $id) { maxTools tools requiredTools } }`, { id: AGENT });
console.log(`stored: ${JSON.stringify(stored.agent)}`);
record(stored.agent.maxTools === 10, `the ceiling reaches the server (${stored.agent.maxTools})`);
record(
  stored.agent.requiredTools.includes(TOOL),
  `and the tool marked as always carried is stored against it (${JSON.stringify(stored.agent.requiredTools)})`,
);
record(
  !stored.agent.tools.includes('note_to_self') && !stored.agent.requiredTools.includes('note_to_self'),
  'and the hidden built-in has left the list the server offers by, mark and all',
);
record(
  stored.agent.tools.includes('current_time') && stored.agent.requiredTools.includes('current_time'),
  'while the ones left alone are still on it, Always',
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
