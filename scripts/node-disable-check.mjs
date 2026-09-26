/**
 * A node switched off in the editor, and a run that walks through it.
 *
 * Issue #439. Trying one part of a graph meant deleting the parts around it and
 * redrawing their lines afterwards. A node can now be disabled where it stands:
 * it is drawn faded with the word on it, its lines stay, and a run records the
 * step as skipped and hands what reached it straight on.
 *
 * What is measured, and why each is a measurement rather than a look:
 *
 *   dimmed, by how far    - the computed opacity of the card, asserted at about
 *                           half. "It changed" passes on a fade nobody can see;
 *                           see UI-DESIGN-RULES on asserting how far.
 *   the word is on it     - a faded card on its own reads as a card that failed
 *                           to load.
 *   it survives a save    - the switch is read back from the server and from a
 *                           reloaded editor, where the button reads Enable.
 *   the run skips it      - a three-node chain is run with the middle switched
 *                           off: its step is skipped and says why, the node
 *                           after it is handed what the node before produced,
 *                           and the run page draws the step as Skipped.
 *   a trigger has none    - the switch is not offered on a trigger node, which
 *                           the server would refuse anyway.
 *
 * Makes a workflow of its own - three Object nodes and a trigger - runs it once,
 * and removes it. Object nodes are the smallest thing that runs to completion
 * with no model behind them.
 */
import { BASE, WORKSPACE, open, record, finish, selectNode } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });

/* ----------------------------------------------------------------- fixture */

const PREFIX = 'zzNodeDisable';

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

const made = await graphql(`mutation($input: CreateWorkflowInput!) { createWorkflow(input: $input) { workflowId } }`, {
  input: {
    workspaceId: WORKSPACE,
    name: `${PREFIX} flow`,
    description: 'Made by node-disable-check, and removed again.',
  },
});
const WORKFLOW = made.createWorkflow.workflowId;

/** One Object node holding one field, named after itself. */
const objectNode = (key, x) => ({
  key,
  kind: 'OBJECT',
  name: `${PREFIX} ${key}`,
  x,
  y: 200,
  outputName: key,
  mappings: [{ name: 'value', expression: key, mode: 'VALUE' }],
});

await graphql(
  `mutation($w: ID!, $f: ID!, $input: WorkflowGraphInput!) {
     saveWorkflowGraph(workspaceId: $w, workflowId: $f, input: $input) { nodes { key } }
   }`,
  {
    w: WORKSPACE,
    f: WORKFLOW,
    input: {
      nodes: [
        { key: 'start', kind: 'TRIGGER', name: `${PREFIX} start`, x: 40, y: 40 },
        objectNode('first', 40),
        objectNode('middle', 360),
        objectNode('last', 680),
      ],
      edges: [
        { source: 'first', target: 'middle' },
        { source: 'middle', target: 'last' },
      ],
    },
  },
);
console.log(`made workflow ${PREFIX} flow (#${WORKFLOW})`);

const clean = async () => {
  await sweep();
  await finish(browser);
};

/* -------------------------------------------------------------- the rulers */

const EDITOR = `${BASE}/workspace/${WORKSPACE}/workflows/${WORKFLOW}/editor`;

const canvasNode = (key) => page.locator(`.react-flow__node[data-id="${key}"]`);
const toggle = () => page.locator('[data-check="node-enabled"]');

/** The card's computed opacity and whether it carries the word. */
const drawnAs = (key) =>
  page.evaluate((id) => {
    const card = document.querySelector(`.react-flow__node[data-id="${id}"] > div`);
    if (card === null) return null;
    return {
      opacity: Number(getComputedStyle(card).opacity),
      marked: card.getAttribute('data-disabled') === 'true',
      says: (card.textContent ?? '').includes('Disabled'),
    };
  }, key);

/** What the server holds for a node's switch. */
const stored = async (key) => {
  const { workflowGraph } = await graphql(
    `query($w: ID!, $f: ID!) { workflowGraph(workspaceId: $w, workflowId: $f) { nodes { key enabled } } }`,
    { w: WORKSPACE, f: WORKFLOW },
  );
  return workflowGraph.nodes.find((one) => one.key === key)?.enabled ?? null;
};

async function openEditor() {
  await page.goto(EDITOR, { waitUntil: 'domcontentloaded' });
  const drew = await page
    .waitForSelector('.react-flow__node', { timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  if (!drew) {
    record(false, 'the editor drew the graph');
    await clean();
  }
  await page.waitForTimeout(1000);
}

async function save() {
  await page.locator('button[aria-label^="Save"]').click();
  await page.waitForTimeout(2000);
}

/* ------------------------------------------------------ switching the node off */

await openEditor();

const before = await drawnAs('middle');
record(before !== null && before.opacity === 1 && !before.marked, `a node that runs is drawn in full (${JSON.stringify(before)})`);

if (!(await selectNode(page, canvasNode('middle'), 'the middle node'))) await clean();
await page.waitForSelector('[data-check="node-enabled"]', { timeout: 20_000 });
record((await toggle().innerText()).trim() === 'Disable', 'the panel offers Disable on a node that runs');

await toggle().click();
await page.waitForTimeout(900);

const dimmed = await drawnAs('middle');
record(
  dimmed !== null && dimmed.marked && dimmed.opacity > 0.3 && dimmed.opacity < 0.6,
  `switched off, the card is drawn at about half (opacity ${dimmed?.opacity})`,
);
record(dimmed !== null && dimmed.says, 'and carries the word Disabled');
record((await toggle().innerText()).trim() === 'Enable', 'the button now offers Enable');

const others = await Promise.all([drawnAs('first'), drawnAs('last')]);
record(
  others.every((card) => card !== null && card.opacity === 1 && !card.marked),
  'the nodes either side of it are untouched',
);

/* ------------------------------------------------------- saved, and reloaded */

await save();
record((await stored('middle')) === false, 'the server holds the node as disabled');
record((await stored('first')) === true, 'and the one before it as enabled');

await openEditor();
const reloaded = await drawnAs('middle');
record(
  reloaded !== null && reloaded.marked && reloaded.opacity > 0.3 && reloaded.opacity < 0.6 && reloaded.says,
  `a reloaded editor draws it dimmed and marked (${JSON.stringify(reloaded)})`,
);
if (!(await selectNode(page, canvasNode('middle'), 'the middle node'))) await clean();
await page.waitForSelector('[data-check="node-enabled"]', { timeout: 20_000 });
record((await toggle().innerText()).trim() === 'Enable', 'and its panel opens on Enable');

/* ---------------------------------------------------------- a trigger has none */

if (!(await selectNode(page, canvasNode('start'), 'the trigger node'))) await clean();
await page.waitForSelector('#node-name', { timeout: 20_000 });
await page.waitForTimeout(400);
record((await toggle().count()) === 0, 'a trigger node is offered no switch');

/* ------------------------------------------------------------ the run skips it */

const started = await graphql(
  `mutation($w: ID!, $id: ID!) { startExecution(workspaceId: $w, workflowId: $id) { id status } }`,
  { w: WORKSPACE, id: WORKFLOW },
);
const runId = started.startExecution.id;

/** The run, read until it has ended or half a minute has gone. */
let run = null;
for (let waited = 0; waited < 30_000; waited += 1000) {
  const { execution } = await graphql(
    `query($id: ID!) { execution(id: $id) { id status steps { key status input output } } }`,
    { id: runId },
  );
  run = execution;
  if (run.status !== 'RUNNING') break;
  await page.waitForTimeout(1000);
}
console.log(`run #${runId}: ${run?.status}, steps ${JSON.stringify(run?.steps.map((step) => [step.key, step.status]))}`);

const step = (key) => run?.steps.find((one) => one.key === key) ?? null;
record(run?.status === 'COMPLETED', `the run completes (${run?.status})`);
record(step('middle')?.status === 'SKIPPED', `the disabled node's step is skipped (${step('middle')?.status})`);
record(
  step('middle')?.output === 'Skipped: the node is disabled',
  `and says why (${JSON.stringify(step('middle')?.output)})`,
);
record(step('first')?.status === 'COMPLETED' && step('last')?.status === 'COMPLETED', 'the nodes either side of it ran');
record(
  step('last')?.input !== null && step('last')?.input === step('middle')?.input,
  'the node after it was handed exactly what reached the disabled one',
);

/* ------------------------------------------------------------- the run page */

await page.goto(`${BASE}/workspace/${WORKSPACE}/executions/${runId}`, { waitUntil: 'domcontentloaded' });
await page.locator('.react-flow__node').first().waitFor({ state: 'attached', timeout: 30_000 });
await page.waitForTimeout(1500);

/*
 * Read off the mark's accessible name rather than the card's visible text. The
 * outcome word is drawn through `text-transform: uppercase`, so `innerText`
 * hands back SKIPPED for every status alike and a match on the word as written
 * fails on a page that is right. The mark in the corner carries the same word
 * as its aria-label, untransformed, which is what a screen reader is told and
 * what this asserts.
 */
const middleCard = page.locator('.react-flow__node').filter({ hasText: `${PREFIX} middle` });
record((await middleCard.count()) === 1, 'the run page draws the disabled step');
record(
  (await middleCard.locator('[aria-label="Skipped"]').count()) === 1,
  `and marks it Skipped (${JSON.stringify((await middleCard.innerText()).replace(/\s+/g, ' '))})`,
);
const lastCard = page.locator('.react-flow__node').filter({ hasText: `${PREFIX} last` });
record(
  (await lastCard.locator('[aria-label="Ran"]').count()) === 1,
  `while the step after it is marked as having run (${JSON.stringify((await lastCard.innerText()).replace(/\s+/g, ' '))})`,
);

/* ------------------------------------------------------------------- tidy up */

await clean();
