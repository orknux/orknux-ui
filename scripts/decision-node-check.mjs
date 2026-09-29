/**
 * A decision model provider, and the decision node that asks one. Issue #577.
 *
 * Jev and a self-hosted Laya speak one API, so the Providers form offers one
 * type for both, and its key is optional - a Laya started without LAYA_API_KEY
 * has none to give. On the canvas a decision node that branches on a choice
 * leaves by one door per option and one for an answer too unsure to take, and
 * those doors are what the saved lines carry.
 *
 * What is measured is what is drawn:
 *
 *   the form      the type is offered, and its key field carries no required
 *                 mark once it is picked
 *   the menu      Add node offers the decision model
 *   the doors     a node branching on a two-option choice draws three source
 *                 handles, spaced down its edge in order, labelled with the
 *                 options and Unsure - and a line drawn from an option's door
 *                 leaves from that door, not from the node's middle
 *   the pruning   an option removed in the panel takes its door and its line
 *                 with it, so the graph still saves
 *   it sticks     the questions come back after a reload
 *
 * Nothing here calls a model: the provider points at a `.invalid` host and is
 * never checked. `decision-run-check` is the half that runs one, over a stub.
 * Makes its own provider, model and workflow, and removes them.
 */
import { BASE, WORKSPACE, open, record, drawn, finish, selectNode } from './suite/harness.mjs';

const PREFIX = 'zzDecisionNode';
const STAMP = Date.now();

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 1100 } });

/* ----------------------------------------------------------------- fixture */

const sweep = async () => {
  const { workspaceWorkflows } = await graphql(
    `query($w: ID!) { workspaceWorkflows(workspaceId: $w, page: 0, size: 200) { content { id name } } }`,
    { w: WORKSPACE },
  );
  for (const old of workspaceWorkflows.content.filter((one) => one.name.startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { removeWorkflow(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
  const { modelProviders } = await graphql(`query($w: ID!) { modelProviders(workspaceId: $w) { id name } }`, {
    w: WORKSPACE,
  });
  for (const old of modelProviders.filter((one) => one.name.startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { removeModelProvider(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
};
await sweep();

const clean = async () => {
  await sweep();
  await finish(browser);
};

/* ---- the form: the type, and a key it does not insist on ---- */

await page.goto(`${BASE}/workspace/${WORKSPACE}/models/providers/new`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#provider-type', { timeout: 30_000 });
const types = await page.locator('#provider-type option').evaluateAll((all) => all.map((one) => one.value));
record(types.includes('SYSTEM_ONE'), `the Providers form offers the decision model type (${JSON.stringify(types)})`);
await page.locator('#provider-type').selectOption('SYSTEM_ONE').catch(() => undefined);
await page.waitForTimeout(300);
const keyLabel = (await page.locator('label[for="provider-secret"]').first().textContent().catch(() => '')) ?? '';
record(!keyLabel.includes('*'), `and once picked, its key is not marked required (${JSON.stringify(keyLabel)})`);

/* ---- a provider, a model and a graph of this check's own ---- */

const provider = await graphql(
  `mutation($input: CreateModelProviderInput!) { createModelProvider(input: $input) { id } }`,
  {
    input: {
      workspaceId: WORKSPACE,
      name: `${PREFIX} Jev ${STAMP}`,
      type: 'SYSTEM_ONE',
      endpoint: 'https://decisions.invalid',
    },
  },
);
const model = await graphql(`mutation($input: CreateModelInput!) { createModel(input: $input) { id } }`, {
  input: { providerId: provider.createModelProvider.id, name: `${PREFIX} model ${STAMP}`, modelId: 'jev-latest', kind: 'DECISION' },
});
const made = await graphql(`mutation($input: CreateWorkflowInput!) { createWorkflow(input: $input) { workflowId } }`, {
  input: { workspaceId: WORKSPACE, name: `${PREFIX} ${STAMP}`, description: 'Made by decision-node-check.' },
});
const WORKFLOW = made.createWorkflow.workflowId;

await graphql(
  `mutation($w: ID!, $f: ID!, $input: WorkflowGraphInput!) {
     saveWorkflowGraph(workspaceId: $w, workflowId: $f, input: $input) { nodes { key } }
   }`,
  {
    w: WORKSPACE,
    f: WORKFLOW,
    input: {
      nodes: [
        {
          key: 'decide',
          kind: 'DECISION',
          name: `${PREFIX} route`,
          x: 100,
          y: 200,
          decisionModelId: model.createModel.id,
          decisionBranchQuestion: 'department',
          decisionThreshold: 0.8,
          decisionQuestions: [
            {
              key: 'department',
              kind: 'CHOICE',
              instructions: 'Which team?',
              options: [{ name: 'billing', description: 'Charges' }, { name: 'returns' }],
            },
          ],
          mappings: [{ name: 'state', expression: '', mode: 'VALUE' }],
        },
        { key: 'bill', kind: 'OBJECT', name: `${PREFIX} bill`, x: 520, y: 60, mappings: [{ name: 'to', expression: 'billing', mode: 'VALUE' }] },
        { key: 'refund', kind: 'OBJECT', name: `${PREFIX} refund`, x: 520, y: 360, mappings: [{ name: 'to', expression: 'returns', mode: 'VALUE' }] },
      ],
      edges: [
        { source: 'decide', target: 'bill', branch: 'OPTION', option: 'billing' },
        { source: 'decide', target: 'refund', branch: 'OPTION', option: 'returns' },
      ],
    },
  },
);

/* ---- the menu ---- */

const openEditor = async () => {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/workflows/${WORKFLOW}/editor`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.react-flow__node', { timeout: 30_000 });
  await page.waitForTimeout(1500);
};
await openEditor();
if (!(await drawn(page, 'the editor', { within: 30_000, still: 0 }))) await clean();

await page.getByRole('button', { name: /add node/i }).click();
await page.waitForTimeout(300);
const offered = await page.getByRole('menuitem', { name: /^decision model$/i }).count();
record(offered === 1, `Add node offers the decision model (${offered})`);
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

/* ---- the doors ---- */

const node = page.locator('.react-flow__node', { hasText: `${PREFIX} route` }).first();
const doors = async () =>
  node.locator('[data-testid="decision-handle"]').evaluateAll((all) =>
    all.map((one) => {
      const box = one.getBoundingClientRect();
      return { id: one.getAttribute('data-handleid'), y: box.top + box.height / 2, x: box.left + box.width / 2 };
    }),
  );

const drawnDoors = await doors();
record(
  JSON.stringify(drawnDoors.map((one) => one.id)) === JSON.stringify(['opt:billing', 'opt:returns', 'unsure']),
  `a node branching on two options draws a door per option and one for unsure (${JSON.stringify(drawnDoors.map((one) => one.id))})`,
);
record(
  drawnDoors.length === 3 && drawnDoors[0].y < drawnDoors[1].y && drawnDoors[1].y < drawnDoors[2].y,
  `spaced down the node's edge in order (${drawnDoors.map((one) => Math.round(one.y)).join(', ')})`,
);
const labels = await node.locator('span[class*="branchOption"], span[class*="branchUnsure"]').allTextContents();
record(
  JSON.stringify(labels) === JSON.stringify(['billing', 'returns', 'Unsure']),
  `each door says which answer it is (${JSON.stringify(labels)})`,
);

/*
 * The line to `refund` has to leave from the returns door. Read off the path
 * React Flow drew: its first point is where the edge starts.
 */
const start = await page
  .locator('.react-flow__edge[data-id*="opt:returns"] path.react-flow__edge-path, .react-flow__edge[data-testid*="opt:returns"] path')
  .first()
  .evaluate((path) => {
    const at = path.getPointAtLength(0);
    const point = new DOMPoint(at.x, at.y).matrixTransform(path.getScreenCTM());
    return { x: point.x, y: point.y };
  })
  .catch(() => null);
const returnsDoor = drawnDoors.find((one) => one.id === 'opt:returns');
record(
  start !== null && returnsDoor !== undefined && Math.abs(start.y - returnsDoor.y) < 6,
  `the line for returns leaves from its own door (line ${start ? Math.round(start.y) : 'missing'}, door ${returnsDoor ? Math.round(returnsDoor.y) : 'missing'})`,
);

/* ---- the pruning ---- */

await selectNode(page, node, 'the decision node');
await page.waitForSelector('[data-testid="decision-question"]', { timeout: 15_000 }).catch(() => undefined);
await page.getByRole('button', { name: 'Remove option' }).nth(1).click({ timeout: 10_000 }).catch(() => undefined);
await page.waitForTimeout(900);

const after = await doors();
record(
  JSON.stringify(after.map((one) => one.id)) === JSON.stringify(['opt:billing', 'unsure']),
  `removing an option takes its door away (${JSON.stringify(after.map((one) => one.id))})`,
);
const lines = await page.locator('.react-flow__edge').count();
record(lines === 1, `and the line that left by it (${lines} line(s) left)`);

await page.keyboard.press('Control+s');
await page.waitForTimeout(2500);
const refused = await page.locator('[role=alert]').allTextContents().catch(() => []);
record(refused.length === 0, `the graph still saves (${JSON.stringify(refused).slice(0, 160)})`);

/* ---- it sticks ---- */

await openEditor();
await selectNode(page, page.locator('.react-flow__node', { hasText: `${PREFIX} route` }).first(), 'the decision node');
await page.waitForSelector('[data-testid="decision-question"]', { timeout: 15_000 }).catch(() => undefined);
const kept = await page
  .locator('[data-testid="decision-question"] input[aria-label="Option name"]')
  .evaluateAll((all) => all.map((one) => one.value));
record(JSON.stringify(kept) === JSON.stringify(['billing']), `the question comes back as it was saved (${JSON.stringify(kept)})`);

await clean();
