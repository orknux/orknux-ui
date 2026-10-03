/**
 * A run's page stops asking once the run has ended, and no page asks while its
 * tab is hidden. Issue #587.
 *
 * Since 0.9.9.8 a run's page and a session's log refresh every second until
 * somebody chooses otherwise. That is right while something is happening and
 * wrong for the rest of the day: a finished run never changes again, and a tab
 * left open behind another one is read by nobody. Both kept asking, every
 * second, for every tab anybody had left open - and on the one core production
 * runs on, that traffic is a large share of what the server spends its time
 * and its memory on. The load test in the server repository
 * (scripts/load/teams.py) is what measured it.
 *
 * So this counts the requests the page actually sends, rather than reading a
 * setting:
 *
 *   1. while the run is going, the page asks about once a second
 *   2. while the tab is hidden, it does not ask at all
 *   3. shown again, it catches up at once
 *   4. once the run has ended, it stops asking - with the interval still on 1s
 *
 * The run waits a few seconds on a timer and touches nothing else, so it needs
 * no model and no connection. Its workflow has a fixed name and is found again
 * on the next run of this check, because a workflow's definition can never be
 * deleted and a check that made one every time would grow the database for
 * ever; the runs it leaves are one per run of the suite.
 */
import { BASE, WORKSPACE, open, record, drawn, finish, shot } from './suite/harness.mjs';

const { browser, page, graphql } = await open();

const FIXTURE = `zz settled run check ${WORKSPACE}`;
const WAIT_SECONDS = 12;

/* ----------------------------------------------------------------- fixture */

async function workflow() {
  const { workspaceWorkflows } = await graphql(
    'query($w: ID!) { workspaceWorkflows(workspaceId: $w, page: 0, size: 500) { content { workflowId name } } }',
    { w: WORKSPACE },
  );
  const held = workspaceWorkflows.content.find((one) => one.name === FIXTURE);
  if (held !== undefined) return held.workflowId;

  const { createAction } = await graphql(
    'mutation($input: CreateActionInput!) { createAction(input: $input) { id } }',
    {
      input: {
        workspaceId: WORKSPACE,
        name: `${FIXTURE} wait`,
        type: 'WAIT',
        subtype: 'TIME',
        durationSeconds: WAIT_SECONDS,
      },
    },
  );
  const { createWorkflow } = await graphql(
    'mutation($input: CreateWorkflowInput!) { createWorkflow(input: $input) { workflowId } }',
    { input: { workspaceId: WORKSPACE, name: FIXTURE, description: 'Made once by scripts/refresh-settled-check.mjs.' } },
  );
  await graphql(
    `mutation($w: ID!, $f: ID!, $input: WorkflowGraphInput!) {
       saveWorkflowGraph(workspaceId: $w, workflowId: $f, input: $input) { status }
     }`,
    {
      w: WORKSPACE,
      f: createWorkflow.workflowId,
      input: {
        nodes: [
          { key: 'start', kind: 'TRIGGER', name: 'Start', x: 40, y: 40 },
          { key: 'wait', kind: 'ACTION', name: 'Wait a little', actionId: createAction.id, x: 320, y: 40 },
        ],
        edges: [{ source: 'start', target: 'wait' }],
      },
    },
  );
  return createWorkflow.workflowId;
}

const flow = await workflow();

// Not awaited: under the inline engine the call returns only when the run has
// ended, and the point is to watch it while it has not.
const starting = graphql(
  'mutation($w: ID!, $f: ID!) { startExecution(workspaceId: $w, workflowId: $f) { id } }',
  { w: WORKSPACE, f: flow },
).catch(() => null);

let runId = null;
for (let tries = 0; tries < 40 && runId === null; tries += 1) {
  const { workspaceExecutions } = await graphql(
    `query($w: ID!, $f: ID) { workspaceExecutions(workspaceId: $w, page: 0, size: 5, workflowId: $f, status: RUNNING) {
       content { id status } } }`,
    { w: WORKSPACE, f: flow },
  );
  runId = workspaceExecutions.content[0]?.id ?? null;
  if (runId === null) await page.waitForTimeout(250);
}
record(runId !== null, `a run of "${FIXTURE}" is going: #${runId}`);

/* -------------------------------------------------------------- the screen */

let asked = 0;
page.on('request', (request) => {
  if (request.url().endsWith('/graphql') && (request.postData() ?? '').includes('query Execution(')) asked += 1;
});

/** How many times the page asked about the run in the next `ms`. */
async function askedIn(ms) {
  const before = asked;
  await page.waitForTimeout(ms);
  return asked - before;
}

/** Pretends the tab is behind another one, or in front again, as the browser would say it. */
async function hidden(yes) {
  await page.evaluate((value) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => value });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (value ? 'hidden' : 'visible') });
    document.dispatchEvent(new Event('visibilitychange'));
  }, yes);
}

if (runId !== null) {
  // The interval nobody chose, which is every second on this page.
  await page.goto(`${BASE}/workspace/${WORKSPACE}/executions/${runId}`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.removeItem('orknux.refreshSeconds'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  if (await drawn(page, 'the run page', { still: 0 })) {
    const going = await askedIn(3_000);
    record(going >= 2, `while the run is going the page asks about once a second: ${going} times in 3s`);

    await hidden(true);
    const behind = await askedIn(3_000);
    record(behind === 0, `while the tab is hidden it does not ask: ${behind} times in 3s`);

    const before = asked;
    await hidden(false);
    await page.waitForTimeout(500);
    record(asked - before >= 1, `shown again, it asks at once: ${asked - before} within half a second`);

    await starting;
    // The page notices the end on its next refresh, and Stop goes - it is only
    // offered while the run is going. Then it should go quiet.
    const ended = await page
      .getByRole('button', { name: 'Stop', exact: true })
      .waitFor({ state: 'detached', timeout: (WAIT_SECONDS + 30) * 1000 })
      .then(() => true)
      .catch(() => false);
    record(ended, 'the run ended, and the page says so');
    await page.waitForTimeout(1_500);
    const after = await askedIn(4_000);
    record(after === 0, `once the run has ended the page stops asking: ${after} times in 4s`);
    const auto = await page.getByLabel('Refresh automatically').inputValue().catch(() => '');
    record(auto === '1', `and the interval is still 1s, for the next run somebody opens: "${auto}"`);
    await page.screenshot({ path: shot('refresh-settled.png') });
  }
}

await finish(browser);
