/**
 * The way from a workflow's graph to what it has done.
 *
 * Issue #437. Runs had a page and the editor did not point at it: somebody who
 * had just pressed Run and come back to fix something went out through the
 * sidebar and picked the workflow again from a list of every workflow in the
 * workspace. The editor now carries a small link beside the pencil, and the
 * runs page reads the workflow it names off the address.
 *
 * Three claims, and each is one a lazy fix would pass on its own:
 *
 *   the link is guarded   - every way out of the editor stores the graph first,
 *                           so a run somebody opens is a run of the graph they
 *                           were looking at. A node is renamed and the link
 *                           pressed; the server has to hold the new name.
 *   it lands filtered     - the Workflow select reads this workflow, and only
 *                           this workflow's rows are drawn. A second workflow
 *                           with a run of its own is made so that "only" is a
 *                           claim about something.
 *   the filter is shared  - the address carries it, so opening that address
 *                           cold draws the same list, and picking All Workflows
 *                           takes it out of the address again.
 *
 * Makes two workflows of its own, runs each once, and removes both. The graphs
 * are one Object node each: the smallest thing that runs to completion without
 * a model, a connection or a schedule.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });

/* ----------------------------------------------------------------- fixture */

const PREFIX = 'zzRunsLink';

const sweep = async () => {
  const { workspaceWorkflows } = await graphql(
    `query($w: ID!) { workspaceWorkflows(workspaceId: $w, size: 200) { content { id name } } }`,
    { w: WORKSPACE },
  );
  for (const old of workspaceWorkflows.content.filter((one) => one.name.startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { removeWorkflow(id: $id) }`, { id: old.id }).catch(() => undefined);
    console.log(`swept workflow ${old.name} (#${old.id})`);
  }
};

await sweep();

/** A workflow of one Object node, run once so the runs page has a row for it. */
async function workflowCalled(name, nodeName) {
  const made = await graphql(
    `mutation($input: CreateWorkflowInput!) { createWorkflow(input: $input) { workflowId } }`,
    { input: { workspaceId: WORKSPACE, name, description: 'Made by editor-runs-link-check, and removed again.' } },
  );
  const workflowId = made.createWorkflow.workflowId;
  await graphql(
    `mutation($w: ID!, $f: ID!, $input: WorkflowGraphInput!) {
       saveWorkflowGraph(workspaceId: $w, workflowId: $f, input: $input) { nodes { key } }
     }`,
    {
      w: WORKSPACE,
      f: workflowId,
      input: {
        nodes: [
          {
            key: 'held',
            kind: 'OBJECT',
            name: nodeName,
            x: 120,
            y: 120,
            outputName: 'ticket',
            mappings: [{ name: 'count', expression: '3', mode: 'VALUE' }],
          },
        ],
        edges: [],
      },
    },
  );
  const started = await graphql(
    `mutation($w: ID!, $id: ID!) { startExecution(workspaceId: $w, workflowId: $id) { id } }`,
    { w: WORKSPACE, id: workflowId },
  );
  console.log(`made workflow ${name} (#${workflowId}) and ran it as #${started.startExecution.id}`);
  return { workflowId, name, runId: started.startExecution.id };
}

const shown = await workflowCalled(`${PREFIX} shown`, 'Holds a count');
const other = await workflowCalled(`${PREFIX} other`, 'Holds another');

const clean = async () => {
  await sweep();
  await finish(browser);
};

/* -------------------------------------------------------------- the rulers */

const EDITOR = `${BASE}/workspace/${WORKSPACE}/workflows/${shown.workflowId}/editor`;
const RUNS = `/workspace/${WORKSPACE}/executions?workflowId=${shown.workflowId}`;

const runsLink = () => page.locator('a[aria-label="Runs of this workflow"]');

/** What the Workflow filter reads, as drawn. */
const filterReads = () =>
  page.$eval('select[aria-label="Workflow:"]', (select) => ({
    value: select.value,
    label: select.options[select.selectedIndex]?.textContent?.trim() ?? '',
  }));

/** The workflow named on every run row drawn. */
const rowsDrawn = () =>
  page.evaluate(() => {
    const isRun = (link) => /\/executions\/\d+$/.test(link.getAttribute('href') ?? '');
    return [...document.querySelectorAll('a[href*="/executions/"]')].filter(isRun).map((link) => {
      const row = link.parentElement;
      const cell = row?.querySelector('a[href$="/editor"]') ?? row?.children[1] ?? null;
      return { id: link.textContent.trim(), workflow: (cell?.textContent ?? '').trim() };
    });
  });

/** Waits for the list and the filter's options to have arrived. */
async function settled() {
  await page
    .waitForFunction(
      () => (document.querySelector('select[aria-label="Workflow:"]')?.options.length ?? 0) > 1,
      undefined,
      { timeout: 20_000 },
    )
    .catch(() => {});
  await page.waitForSelector('text=Showing', { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(900);
}

/* ------------------------------------------------------- the link, guarded */

await page.goto(EDITOR, { waitUntil: 'domcontentloaded' });
const drew = await page
  .waitForSelector('.react-flow__node', { timeout: 30_000 })
  .then(() => true)
  .catch(() => false);
record(drew, 'the editor drew the graph');
if (!drew) await clean();
await page.waitForTimeout(1000);

record((await runsLink().count()) === 1, 'the toolbar carries one link to the runs of this workflow');
record(
  (await runsLink().getAttribute('href')) === RUNS,
  `and it names this workflow in the address (${await runsLink().getAttribute('href')})`,
);
record((await runsLink().getAttribute('title')) === 'Runs of this workflow', 'the link says what it is on hover');

// An edit the server has not heard about, so that leaving has something to store.
await page.click('.react-flow__node');
await page.waitForSelector('#node-name', { timeout: 20_000 });
const RENAMED = 'Holds a renamed count';
await page.locator('#node-name').fill(RENAMED);
await page.waitForTimeout(900);

await runsLink().click();
await page.waitForURL((url) => url.pathname.endsWith('/executions'), { timeout: 20_000 }).catch(() => {});
await settled();

record(
  page.url().endsWith(RUNS),
  `pressing it lands on the runs page, narrowed to this workflow (${page.url()})`,
);

const { workflowGraph } = await graphql(
  `query($w: ID!, $f: ID!) { workflowGraph(workspaceId: $w, workflowId: $f) { nodes { name } } }`,
  { w: WORKSPACE, f: shown.workflowId },
);
record(
  workflowGraph.nodes[0]?.name === RENAMED,
  `the graph was stored on the way out, like every other way out of the editor (server holds ${JSON.stringify(workflowGraph.nodes[0]?.name)})`,
);

/* ---------------------------------------------------------- landed filtered */

const reads = await filterReads();
record(reads.value === String(shown.workflowId), `the Workflow filter is set to this workflow (value ${reads.value})`);
record(reads.label === shown.name, `and reads its name (${JSON.stringify(reads.label)})`);

const rows = await rowsDrawn();
record(rows.length >= 1, `its run is listed (${rows.length} row(s))`);
record(
  rows.length > 0 && rows.every((row) => row.workflow === shown.name),
  `and only its rows are: ${JSON.stringify(rows.map((row) => row.workflow))}`,
);
record(
  !rows.some((row) => row.workflow === other.name),
  `the other workflow's run, which exists, is not among them`,
);

/* ------------------------------------------------------ the address is shared */

await page.goto(`${BASE}${RUNS}`, { waitUntil: 'domcontentloaded' });
await settled();
const cold = await filterReads();
const coldRows = await rowsDrawn();
record(
  cold.value === String(shown.workflowId) && coldRows.length > 0 && coldRows.every((row) => row.workflow === shown.name),
  `the address opened cold draws the same filtered list (${cold.label}, ${coldRows.length} row(s))`,
);

await page.selectOption('select[aria-label="Workflow:"]', '');
await settled();
const widened = await rowsDrawn();
record(!page.url().includes('workflowId='), `picking All Workflows takes the filter out of the address (${page.url()})`);
record(
  widened.some((row) => row.workflow === other.name),
  `and the other workflow's run is back in the list (${widened.length} row(s))`,
);

await page.selectOption('select[aria-label="Workflow:"]', String(other.workflowId));
await settled();
record(
  page.url().endsWith(`?workflowId=${other.workflowId}`),
  `picking a workflow writes it into the address (${page.url()})`,
);

/* ------------------------------------------------------------------- tidy up */

await clean();
