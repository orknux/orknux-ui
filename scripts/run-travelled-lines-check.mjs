/**
 * On a run's canvas, the lines the run travelled are drawn green.
 *
 * Asked for from a screenshot of a run in flight: the trigger said "Started
 * here", the agent after it said Running, and the line between them was the
 * same grey as every line the run had not been near. The boxes said where the
 * run had been; the lines did not.
 *
 * A line is travelled when the step it leaves finished and chose it - every
 * unmarked way out of a step that completed, only the branch a condition
 * answered, only the failure edge of a step that failed onto it - and the step
 * it arrives at was reached. That is the server's own rule (`BranchGate.follow`)
 * read off what the run recorded, so this drives the case where it matters: a
 * condition whose YES side ran and whose NO side did not, with a line from the
 * NO side's box into the YES side's. That one arrives at a box that ran and was
 * still not travelled, which is what a rule read off the target alone would
 * paint green.
 *
 * Read in both themes, against the green the trigger's status bar is painted
 * in, so a hard-coded colour that matched one theme fails in the other.
 *
 * Makes a condition and a workflow of its own and removes both.
 */
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const PREFIX = 'zzTravelledLines';
const STAMP = Date.now();

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 1000 } });

const sweep = async () => {
  const { workspaceWorkflows } = await graphql(
    `query($w: ID!) { workspaceWorkflows(workspaceId: $w, page: 0, size: 200) { content { id name } } }`,
    { w: WORKSPACE },
  );
  for (const old of workspaceWorkflows.content.filter((one) => one.name.startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { removeWorkflow(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
  const { workspaceConditions } = await graphql(
    `query($w: ID!) { workspaceConditions(workspaceId: $w, page: 0, size: 500) { content { id name } } }`,
    { w: WORKSPACE },
  ).catch(() => ({ workspaceConditions: { content: [] } }));
  for (const old of workspaceConditions.content.filter((one) => one.name.startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { deleteCondition(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
};
await sweep();

try {
  const condition = (
    await graphql(`mutation($input: CreateConditionInput!) { createCondition(input: $input) { id } }`, {
      input: { workspaceId: WORKSPACE, name: `${PREFIX} says go ${STAMP}`, type: 'VALUE', check: 'IN_LIST', values: ['go'] },
    })
  ).createCondition.id;

  const workflow = (
    await graphql(`mutation($input: CreateWorkflowInput!) { createWorkflow(input: $input) { workflowId } }`, {
      input: { workspaceId: WORKSPACE, name: `${PREFIX} ${STAMP}`, description: 'Made by run-travelled-lines-check.' },
    })
  ).createWorkflow.workflowId;

  const saved = await graphql(
    `mutation($w: ID!, $f: ID!, $input: WorkflowGraphInput!) {
       saveWorkflowGraph(workspaceId: $w, workflowId: $f, input: $input) { workflowId problems { message } }
     }`,
    {
      w: WORKSPACE,
      f: workflow,
      input: {
        nodes: [
          { key: 'start', kind: 'TRIGGER', name: 'Start', x: 0, y: 150 },
          {
            key: 'gate',
            kind: 'CONDITION',
            name: 'Go?',
            conditionId: condition,
            x: 300,
            y: 150,
            mappings: [{ name: 'value', expression: 'go', mode: 'VALUE' }],
          },
          { key: 'yes', kind: 'OBJECT', name: 'Went', x: 600, y: 0, mappings: [{ name: 'said', expression: 'yes', mode: 'VALUE' }] },
          { key: 'no', kind: 'OBJECT', name: 'Stayed', x: 600, y: 300, mappings: [{ name: 'said', expression: 'no', mode: 'VALUE' }] },
          // Switched off: skipped, and the run passes through it to what follows.
          { key: 'off', kind: 'OBJECT', name: 'Off', enabled: false, x: 900, y: 0, mappings: [{ name: 'said', expression: 'off', mode: 'VALUE' }] },
          { key: 'after', kind: 'OBJECT', name: 'After', x: 1200, y: 0, mappings: [{ name: 'said', expression: 'after', mode: 'VALUE' }] },
        ],
        edges: [
          { source: 'start', target: 'gate' },
          { source: 'gate', target: 'yes', branch: 'YES' },
          { source: 'gate', target: 'no', branch: 'NO' },
          // Into a step that ran, from one that did not.
          { source: 'no', target: 'yes' },
          { source: 'yes', target: 'off' },
          { source: 'off', target: 'after' },
        ],
      },
    },
  );
  console.log(`graph: ${saved.saveWorkflowGraph.problems.map((one) => one.message).join('; ') || 'no problems'}`);

  const run = (
    await graphql(`mutation($w: ID!, $f: ID!) { startExecution(workspaceId: $w, workflowId: $f) { id } }`, { w: WORKSPACE, f: workflow })
  ).startExecution.id;

  // The run is settled before the page is read, so what is drawn is the answer.
  let steps = [];
  for (let tries = 0; tries < 60; tries++) {
    const { execution } = await graphql(`query($id: ID!) { execution(id: $id) { status steps { key status branch } } }`, { id: run });
    steps = execution.steps;
    if (execution.status !== 'RUNNING') break;
    await page.waitForTimeout(500);
  }
  const status = Object.fromEntries(steps.map((one) => [one.key, `${one.status}${one.branch ? `/${one.branch}` : ''}`]));
  console.log(`steps: ${JSON.stringify(status)}`);
  record(
    steps.find((one) => one.key === 'yes')?.status === 'COMPLETED' && steps.find((one) => one.key === 'no')?.status !== 'COMPLETED',
    'the condition answered yes: the YES side ran and the NO side did not',
  );
  record(
    steps.find((one) => one.key === 'off')?.status === 'SKIPPED' && steps.find((one) => one.key === 'after')?.status === 'COMPLETED',
    `the switched-off node was skipped and the run went on past it (${status.off} then ${status.after})`,
  );

  await page.goto(`${BASE}/workspace/${WORKSPACE}/executions/${run}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.react-flow__edge-path', { timeout: 30_000 }).catch(() => {});
  await drawn(page, 'the run', { within: 30_000 });

  const LINES = {
    'start-plain->gate': true,
    'gate-YES->yes': true,
    'gate-NO->no': false,
    'no-plain->yes': false,
    // Reported: the line into and out of a switched-off node the run went through stayed grey.
    'yes-plain->off': true,
    'off-plain->after': true,
  };

  // Reported: a skipped step should be marked by its border - silver at first, then the magenta of the image node.
  const skippedBorder = await page.evaluate(() => {
    const card = document.querySelector('.react-flow__node[data-id="off"] [class*="outcome-skipped"]');
    if (card === null) return null;
    const style = getComputedStyle(card);
    return { color: style.borderTopColor, style: style.borderTopStyle, opacity: style.opacity };
  });
  // Bright: the silver itself, and the card not faded, which would fade the border with it.
  record(
    skippedBorder !== null && skippedBorder.style === 'solid' && skippedBorder.color === 'rgb(236, 72, 153)' && skippedBorder.opacity === '1',
    `a skipped step is drawn with a magenta border (${JSON.stringify(skippedBorder)})`,
  );

  for (const theme of ['light', 'dark']) {
    await page.evaluate((one) => document.documentElement.setAttribute('data-theme', one), theme);
    await page.waitForTimeout(300);
    const read = await page.evaluate((ids) => {
      // The green, resolved the way the browser resolves the stroke: through an element.
      const probe = document.createElement('span');
      probe.style.color = 'var(--color-success-solid)';
      document.body.appendChild(probe);
      const green = getComputedStyle(probe).color;
      probe.remove();
      const bar = document.querySelector('.react-flow__node [class*="accentBar"][class*="trigger"]');
      const strokes = Object.fromEntries(
        ids.map((id) => {
          const path = document.querySelector(`.react-flow__edge[data-id="${id}"] .react-flow__edge-path`);
          return [id, path === null ? null : getComputedStyle(path).stroke];
        }),
      );
      return { green, bar: bar === null ? null : getComputedStyle(bar).backgroundColor, strokes };
    }, Object.keys(LINES));

    record(read.bar === null || read.bar === read.green, `${theme}: the green is the one the trigger's status bar wears (${read.bar} / ${read.green})`);
    for (const [id, travelled] of Object.entries(LINES)) {
      const stroke = read.strokes[id];
      record(
        stroke !== null && (stroke === read.green) === travelled,
        `${theme}: ${id} is ${travelled ? '' : 'not '}drawn green, as a line the run ${travelled ? 'travelled' : 'did not travel'} (stroke ${stroke})`,
      );
    }
  }
} finally {
  await sweep();
}

await finish(browser);
