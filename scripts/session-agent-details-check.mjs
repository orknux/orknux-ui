/**
 * A session's log says which agent's setup each stretch of it was answered
 * under - issues #391 and #441.
 *
 * #391 kept one snapshot of the agent's setup on the session and drew it once
 * above the transcript, for whichever agent opened it. A session is not one
 * agent's: a Slack thread's session is answered by whichever agent node a run
 * points at it, and an agent is edited between turns, so that one block was
 * right about the first turn and silently wrong about the rest. #441 writes an
 * AGENT_DETAILS line where an agent starts responding with a setup that differs
 * from the last one logged, and the page draws the block at each such line.
 *
 * What is measured, against a real session:
 *
 *   two agents, three turns  - agent A answers, A answers again unchanged, then
 *                              B answers: the server holds exactly two
 *                              AGENT_DETAILS lines, A's then B's, and each
 *                              carries the setup the page draws
 *   the page, oldest first   - two "Agent details" blocks, in that order, each
 *                              naming its agent in the closed header
 *   collapsed by default     - neither block shows its system prompt until it
 *                              is pressed, and pressing the first shows that
 *                              agent's prompt and not the other's
 *   nothing above the log    - the block is a line of the transcript now; the
 *                              old header over the transcript is gone
 *   the prompt that was sent - the recorded system prompt is the text the model
 *                              read: the agent's own prose *and* what the round
 *                              appended to it, which for a node that keeps a
 *                              session includes the paragraph its lent
 *                              scratchpads say about themselves. It used to be
 *                              `agent.systemPrompt` alone - one paragraph of it,
 *                              and null for every agent whose whole instruction
 *                              is what it was granted (#454)
 *   and it leads to the agent - the name in the header is a link to the agent's
 *                              own page, which is where the setup behind a name
 *                              is; before #454 the name was plain text and the
 *                              id was not kept at all
 *
 * ---------------------------------------------------------------------------
 * Why the fixture is a workflow run, and why it needs no model that answers
 *
 * There is no mutation that makes a session - a session exists because an agent
 * node carrying a `sessionKey` ran - so this builds one the way
 * session-pages-check does: a scratch workflow of a session node wired to an
 * agent node, run under one key. The agent's setup is written into the session
 * *before* the model is asked, the way the question is, so a provider that
 * cannot be reached still leaves the line this check is about; the step fails
 * and the run ends, and nothing below reads how.
 *
 * The two agents are made here and removed after, each pointed at the model of
 * whichever agent the workspace already has one on, so that a workspace built
 * from nothing works the same as the one this was written on. They are made
 * rather than found because the check needs two with *different* setups, and
 * the surest way to know two prompts differ is to have written both.
 *
 * What it cannot sweep is the three executions the runs leave; nothing removes
 * an execution, and `removeWorkflow` leaves them behind.
 * ---------------------------------------------------------------------------
 */
import { BASE, WORKSPACE, open, record, drawn, shot, finish } from './suite/harness.mjs';
import { anyOf } from './suite/named.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });

/* ----------------------------------------------------------------- fixture */

const STAMP = Date.now();
const PREFIX = 'zzDetails441';

const FIRST = { name: `${PREFIX} first ${STAMP}`, prompt: `You summarise incidents. (${STAMP})` };
const SECOND = { name: `${PREFIX} second ${STAMP}`, prompt: `You decide what is urgent. (${STAMP})` };

/*
 * Anything a run that died halfway through left behind: sessions, workflows and
 * the two scratch agents. Swept at the start as well as the end, because the
 * sweep also cleans up after runs the suite's timeout killed, which no `finally`
 * can.
 */
async function sweep() {
  const left = await graphql(
    `query($id: ID!) {
       llmSessions(workspaceId: $id, page: 0, size: 200) { content { id key } }
       workspaceWorkflows(workspaceId: $id, page: 0, size: 200) { content { id name } }
       workspaceAgents(workspaceId: $id, page: 0, size: 200) { content { id name } }
     }`,
    { id: WORKSPACE },
  );
  for (const old of left.llmSessions.content.filter((one) => one.key.includes(PREFIX))) {
    await graphql(`mutation($id: ID!) { removeLlmSession(id: $id) }`, { id: old.id }).catch(() => undefined);
    console.log(`swept session ${old.key} (#${old.id})`);
  }
  for (const old of left.workspaceWorkflows.content.filter((one) => one.name.startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { removeWorkflow(id: $id) }`, { id: old.id }).catch(() => undefined);
    console.log(`swept workflow ${old.name} (#${old.id})`);
  }
  for (const old of left.workspaceAgents.content.filter((one) => one.name.startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { deleteAgent(id: $id) }`, { id: old.id }).catch(() => undefined);
    console.log(`swept agent ${old.name} (#${old.id})`);
  }
}

await sweep();

/*
 * A model to point the two scratch agents at: whichever one an agent here that
 * is switched on already has. The model need not answer - see the header - it
 * only has to be chosen, because an agent node with no model fails before it
 * opens the session.
 */
const LENDER = await anyOf(graphql, 'agent', WORKSPACE, null, {
  override: process.env.ORKNUX_AGENT,
  fits: async (row) => {
    const found = await graphql(`query($id: ID!) { agent(id: $id) { enabled modelId } }`, { id: row.id });
    return found.agent?.enabled === true && found.agent?.modelId !== null;
  },
});
if (LENDER === null) {
  record(false, 'no agent here is switched on with a model chosen, so there is no model to point the fixture at');
  await finish(browser);
}
const { agent: lender } = await graphql(`query($id: ID!) { agent(id: $id) { modelId } }`, { id: LENDER });
const MODEL = lender.modelId;

/** One scratch agent with its own prompt, on the borrowed model. */
async function makeAgent({ name, prompt }) {
  const made = await graphql(
    `mutation($input: CreateAgentInput!) { createAgent(input: $input) { id } }`,
    { input: { workspaceId: WORKSPACE, name, type: 'LLM', systemPrompt: prompt } },
  );
  const id = made.createAgent.id;
  await graphql(`mutation($id: ID!, $input: UpdateAgentInput!) { updateAgent(id: $id, input: $input) { id } }`, {
    id,
    input: { name, systemPrompt: prompt, modelId: MODEL },
  });
  console.log(`made agent ${name} (#${id}) on model #${MODEL}`);
  return id;
}

const firstAgent = await makeAgent(FIRST);
const secondAgent = await makeAgent(SECOND);

const WORKFLOW_NAME = `${PREFIX} ${STAMP}`;
const made = await graphql(`mutation($input: CreateWorkflowInput!) { createWorkflow(input: $input) { id name } }`, {
  input: {
    workspaceId: WORKSPACE,
    name: WORKFLOW_NAME,
    description: 'Made by scripts/session-agent-details-check.mjs to open a session, and removed again after.',
  },
});
const WORKFLOW = made.createWorkflow.id;
console.log(`made workflow ${WORKFLOW_NAME} (#${WORKFLOW})`);

/*
 * A session node wired to an agent node, and nothing else. Saved again between
 * runs with the node pointed at the other agent, which is exactly what a Slack
 * thread's session sees when a different run answers in it: the same key, a
 * different agent. A run starts from the graph as it stands, so re-saving is
 * all a re-pointing takes.
 */
async function pointAt(agentId) {
  const graph = await graphql(
    `mutation($ws: ID!, $id: ID!, $input: WorkflowGraphInput!) {
       saveWorkflowGraph(workspaceId: $ws, workflowId: $id, input: $input) { workflowId problems { message } }
     }`,
    {
      ws: WORKSPACE,
      id: WORKFLOW,
      input: {
        nodes: [
          {
            key: 'session',
            kind: 'SESSION',
            name: 'the conversation this belongs to',
            x: 40,
            y: 40,
            mappings: [
              { name: 'sessionKeyPrefix', expression: PREFIX, mode: 'VALUE' },
              { name: 'sessionKey', expression: `thread-${STAMP}`, mode: 'VALUE' },
            ],
          },
          {
            key: 'agent',
            kind: 'AGENT',
            name: `${PREFIX} asks`,
            agentId,
            outputName: 'said',
            x: 420,
            y: 40,
            mappings: [{ name: 'prompt', expression: 'Say hello.', mode: 'VALUE' }],
          },
        ],
        edges: [{ source: 'session', target: 'agent' }],
      },
    },
  );
  console.log(
    `graph points at #${agentId}: ${graph.saveWorkflowGraph.problems.map((one) => one.message).join('; ') || 'no problems'}`,
  );
}

/** One run, waited out. Hands back how it ended, so a fixture that failed says so. */
async function runIt(patience = 120_000) {
  const { startExecution } = await graphql(
    `mutation($ws: ID!, $id: ID!) { startExecution(workspaceId: $ws, workflowId: $id) { id status } }`,
    { ws: WORKSPACE, id: WORKFLOW },
  );
  const upTo = Date.now() + patience;
  let status = startExecution.status;
  while (status === 'RUNNING' && Date.now() < upTo) {
    await page.waitForTimeout(1000);
    const asked = await graphql(`query($id: ID!) { execution(id: $id) { status } }`, { id: startExecution.id }).catch(
      () => null,
    );
    if (asked !== null) status = asked.execution.status;
  }
  return status;
}

/* Three turns: the first agent twice, unchanged, then the second. */
await pointAt(firstAgent);
console.log(`turn 1, ${FIRST.name}: ${await runIt()}`);
console.log(`turn 2, ${FIRST.name} again: ${await runIt()}`);
await pointAt(secondAgent);
console.log(`turn 3, ${SECOND.name}: ${await runIt()}`);

const { llmSessions } = await graphql(
  `query($id: ID!) { llmSessions(workspaceId: $id, page: 0, size: 200) { content { id key eventCount } } }`,
  { id: WORKSPACE },
);
const session = llmSessions.content.find((one) => one.key === `${PREFIX}:thread-${STAMP}`) ?? null;

/** Everything made here, gone again. */
async function tidy() {
  await sweep();
}

if (session === null) {
  record(
    false,
    'the runs opened no session, so there is nothing to read. The workspace holds: ' +
      `${llmSessions.content.map((one) => one.key).join(', ') || '(nothing)'}`,
  );
  await tidy();
  await finish(browser);
}
console.log(`opened ${session.key} (#${session.id}, ${session.eventCount} lines)`);

/* --------------------------------------------------- what the server holds */

const { llmSessionEvents } = await graphql(
  `query($id: ID!) {
     llmSessionEvents(sessionId: $id, page: 0, size: 200, order: AT, ascending: true) {
       content { id kind actor at agentDetails { agent agentId model systemPrompt tools findable skills memory connections } }
     }
   }`,
  { id: session.id },
);
const lines = llmSessionEvents.content;
const details = lines.filter((one) => one.kind === 'AGENT_DETAILS');
console.log(`transcript: ${lines.length} lines, ${details.length} of them AGENT_DETAILS`);

/*
 * Two, not three. The second turn was the same agent with the same setup, and a
 * line for it would be a line saying nothing had changed - a session one agent
 * talks in for a week would fill with them.
 */
record(details.length === 2, `three turns by two agents leave two AGENT_DETAILS lines, not one per turn (${details.length})`);
record(
  details[0]?.actor === FIRST.name && details[1]?.actor === SECOND.name,
  `in the order the agents answered: ${details.map((one) => one.actor).join(', ') || 'none'}`,
);
/*
 * Carries the setup, rather than being it: since #454 what is recorded is the
 * whole system turn the model was given - the agent's own prompt, then the
 * grants briefing, then whatever a lent shed said about itself - so the
 * agent's prompt is the start of it and not the whole.
 */
record(
  details[0]?.agentDetails?.systemPrompt?.includes(FIRST.prompt) === true &&
    details[1]?.agentDetails?.systemPrompt?.includes(SECOND.prompt) === true,
  'and each carries the setup it was answered with, resolved for the page',
);
/*
 * And the rest of what the model read. The agent node keeps a session, so it
 * lends the agent scratchpads, and #445 puts what a lent tool says about itself
 * into the system turn - which means the recorded prompt is longer than the
 * agent's own prose and says so. This is the half #454 was about: the record
 * used to be `agent.systemPrompt` and nothing else, so it was right only about
 * agents whose instructions happened to be all there was.
 */
record(
  (details[0]?.agentDetails?.systemPrompt?.length ?? 0) > FIRST.prompt.length &&
    details[0]?.agentDetails?.systemPrompt?.includes('You have scratchpads') === true,
  'and carries what the round appended to it, not the agent\'s own field alone',
);
/*
 * Which agent it was, by id. The name alone means a reader wanting the setup
 * behind it goes and finds it on the Agents list, and two agents in a workspace
 * may be called nearly the same thing.
 */
record(
  String(details[0]?.agentDetails?.agentId) === String(firstAgent) &&
    String(details[1]?.agentDetails?.agentId) === String(secondAgent),
  `each line names the agent it is about, by id (${details.map((one) => one.agentDetails?.agentId).join(', ')})`,
);
/*
 * The tools are what the model was handed, not the grant list. Issue #446: an
 * agent granted nothing of the workspace's still had finish_answer lent by the
 * node and a note to write, and the block said it had no tools at all.
 */
const handed = details[0]?.agentDetails?.tools ?? [];
record(
  handed.includes('finish_answer') && handed.includes('note_to_self') && handed.includes('current_time'),
  `the setup names the built-ins the model was handed, lent ones included (${handed.join(', ') || 'none'})`,
);
record(
  handed.join(',') === [...handed].sort().join(','),
  'and names them sorted, so the same setup is the same text',
);
record(
  (details[0]?.agentDetails?.findable ?? []).length === 0,
  'an agent with no ceiling of its own finds nothing rather than carrying it',
);
/* Where it falls: A's before anything A said, B's before anything B said. */
const firstSaid = lines.findIndex((one) => one.kind !== 'AGENT_DETAILS');
const secondDetails = lines.findIndex((one) => one.kind === 'AGENT_DETAILS' && one.actor === SECOND.name);
const lastBefore = lines.slice(0, secondDetails).filter((one) => one.kind !== 'AGENT_DETAILS').length;
record(
  lines[0]?.kind === 'AGENT_DETAILS' && firstSaid > 0,
  'the first line of the log is the first agent\'s setup, before anything was said',
);
record(
  secondDetails > 0 && lastBefore > 0 && secondDetails < lines.length - 1,
  'the second agent\'s setup sits between the turns, where it took the thread',
);

/* --------------------------------------------------------------- the page */

const toggles = page.locator('[data-agent-details-toggle]');

await page.goto(`${BASE}/workspace/${WORKSPACE}/sessions/${session.id}`, { waitUntil: 'domcontentloaded' });
if (await drawn(page, 'the session transcript')) {
  /*
   * Oldest first, so "in order" means the order the agents answered in. The
   * page opens newest-first - a transcript is read to see how a turn ended.
   */
  const direction = page.locator('button[aria-label="Oldest first"], button[aria-label="Newest first"]');
  if ((await direction.getAttribute('aria-label')) === 'Newest first') {
    await direction.click();
  }
  await toggles.nth(1).waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(400);

  const many = await toggles.count();
  record(many === 2, `the transcript draws two Agent details blocks, one per change of setup (${many})`);

  /*
   * The header row rather than the button: the press is "Agent details" and
   * the agent's name sits beside it, outside the button, because it carries a
   * link to the agent and a link inside a button is not a thing.
   */
  const headers = await page.$$eval('[data-agent-details]', (nodes) =>
    nodes.map((node) => (node.firstElementChild?.textContent ?? '').replace(/\s+/g, ' ').trim()),
  );
  console.log(`headers: ${JSON.stringify(headers)}`);
  record(
    headers[0]?.includes('Agent details') && headers[0]?.includes(FIRST.name) && headers[1]?.includes(SECOND.name),
    'each closed header says "Agent details" and names its agent, in the order they answered',
  );

  /*
   * And the name leads to the agent. Read as the href the browser resolved
   * rather than as an attribute, so a path built out of the wrong id or with the
   * workspace left out fails here. Issue #454.
   */
  const links = await page.$$eval('[data-agent-details] [data-agent-details-link]', (nodes) =>
    nodes.map((node) => node.getAttribute('href')),
  );
  console.log(`links: ${JSON.stringify(links)}`);
  record(
    links[0] === `/workspace/${WORKSPACE}/agents/${firstAgent}/settings` &&
      links[1] === `/workspace/${WORKSPACE}/agents/${secondAgent}/settings`,
    'the agent named in each header is a link to that agent\'s own page',
  );
  /* A link in the header, and not inside the press: pressing it must not also open the block. */
  const nested = await page.$$eval(
    '[data-agent-details-toggle] [data-agent-details-link]',
    (nodes) => nodes.length,
  );
  record(nested === 0, `the link sits beside the toggle rather than inside it (${nested} inside)`);

  /* Where the blocks fall among the lines, read off the page rather than assumed. */
  const order = await page.$$eval('[data-agent-details], article[class*="_event_"]', (nodes) =>
    nodes.map((node) => (node.hasAttribute('data-agent-details') ? `D:${node.getAttribute('data-agent-details')}` : 'L')),
  );
  console.log(`drawn order: ${order.join(' ')}`);
  record(order[0] === `D:${FIRST.name}`, 'the first block opens the log');
  const secondAt = order.indexOf(`D:${SECOND.name}`);
  record(
    secondAt > 1 && order.slice(1, secondAt).some((one) => one === 'L') && order.slice(secondAt + 1).some((one) => one === 'L'),
    'the second block sits between the lines, where the other agent took the thread',
  );

  /* The old header over the transcript is gone: nothing agent-details-shaped sits above the filter bar. */
  const above = await page.evaluate(() => {
    const bar = document.querySelector('[class*="_filterBar_"]')?.getBoundingClientRect();
    const blocks = [...document.querySelectorAll('[data-agent-details]')].map((one) => one.getBoundingClientRect().top);
    return bar === undefined ? null : blocks.filter((top) => top < bar.top).length;
  });
  record(above === 0, `no block is drawn above the transcript any more (${above ?? 'no filter bar found'} above it)`);

  /* Collapsed by default: neither prompt is on the page until a press. */
  const body = await page.locator('body').innerText();
  record(
    (await toggles.first().getAttribute('aria-expanded')) === 'false' &&
      (await toggles.nth(1).getAttribute('aria-expanded')) === 'false',
    'both blocks are collapsed by default',
  );
  record(!body.includes(FIRST.prompt) && !body.includes(SECOND.prompt), 'and neither system prompt is on the page until pressed');

  await toggles.first().click();
  await page.waitForTimeout(300);
  const opened = await page.locator('body').innerText();
  record(
    (await toggles.first().getAttribute('aria-expanded')) === 'true' && opened.includes(FIRST.prompt),
    'pressing the first block shows that agent\'s system prompt',
  );
  record(!opened.includes(SECOND.prompt), 'and not the other agent\'s: each block opens on its own');

  /*
   * The prompt is a section of its own, under a heading, and drawn as the text
   * the model was given rather than as one line of it. Issue #454: the row was
   * left out altogether where the field was blank, which is what it was for most
   * agents - so a reader could not tell an agent that was told nothing from a
   * record that did not keep what it was told.
   */
  const shown = await page.$$eval('[data-agent-details] [data-agent-details-prompt]', (nodes) =>
    nodes.map((node) => node.textContent ?? ''),
  );
  record(shown.length === 1, `the opened block draws its system prompt in a section of its own (${shown.length})`);
  record(
    shown[0]?.includes(FIRST.prompt) === true && shown[0]?.includes('You have scratchpads') === true,
    'and draws the whole of what was sent, the round\'s own paragraph included',
  );
  /* Wrapped as written, so a prompt with blank lines and indentation reads as it was sent. */
  const wrapping = await page
    .locator('[data-agent-details] [data-agent-details-prompt] pre')
    .first()
    .evaluate((node) => getComputedStyle(node).whiteSpace);
  record(wrapping === 'pre-wrap', `the prompt keeps its own line breaks and still wraps (${wrapping})`);

  await page.screenshot({ path: shot('session-agent-details.png') });
}

/* ------------------------------------------------------------------ tidy up */

await tidy();

await finish(browser);
