/**
 * A decision model asked for real, and the run going the way it answered.
 * Issue #577, the half that needs a model.
 *
 * The server half is `DecisionNodeTest`, on both engines over a stub on the
 * loopback: the request is TypeSafe's documented one, a sure choice leaves by
 * its option, an unsure one by the unsure line. What no server test can say is
 * whether a person can set it up and see it - whether the Providers form will
 * save a keyless Jev-format server and check it, and whether the run's page says which
 * option the run went by and draws the other branch as not taken.
 *
 * **It needs a decision model the server can reach**, which is why it is not in
 * CI, for the reason `image-model-check` gives: the question is asked by the
 * server, and a stub in the page would be a check of the stub. Run
 * `python scripts/suite/decision-stub.py 8197` on the host and say where it is,
 * as the server sees it, in ORKNUX_DECISION_STUB. The stub picks the first
 * option named in the state, so a state about a refund picks `returns`.
 *
 * Makes its own provider, model and workflow, and removes them.
 */
import { BASE, WORKSPACE, open, record, drawn, finish, selectNode } from './suite/harness.mjs';

const PREFIX = 'zzDecisionRun';
const STAMP = Date.now();
const STUB = process.env.ORKNUX_DECISION_STUB ?? 'http://localhost:8197';

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 1000 } });

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

/* ---- a provider with no key, made and checked on the form ---- */

const NAME = `${PREFIX} decision server ${STAMP}`;
await page.goto(`${BASE}/workspace/${WORKSPACE}/models/providers/new`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#provider-type', { timeout: 30_000 });
await page.locator('#provider-type').selectOption('SYSTEM_ONE', { timeout: 5_000 }).catch(() => undefined);
await page.locator('#provider-name').fill(NAME);
await page.locator('#provider-endpoint').fill(STUB);
await page.getByRole('button', { name: /test connection/i }).click();
await page
  .getByText(/connected; 1 model listed/i)
  .first()
  .waitFor({ timeout: 20_000 })
  .catch(() => undefined);
const said = (await page.locator('[class*="statusConnected"], [class*="statusFailed"]').allTextContents()).join(' ');
record(/connected; 1 model listed/i.test(said), `a keyless decision provider checks as connected (${JSON.stringify(said)})`);

const { modelProviders } = await graphql(`query($w: ID!) { modelProviders(workspaceId: $w) { id name } }`, {
  w: WORKSPACE,
});
const provider = modelProviders.find((one) => one.name === NAME);
if (provider === undefined) {
  record(false, 'the form saved the provider it checked');
  await clean();
}

/* ---- a model, and a graph that branches on it ---- */

const model = await graphql(`mutation($input: CreateModelInput!) { createModel(input: $input) { id } }`, {
  input: { providerId: provider.id, name: `${PREFIX} model ${STAMP}`, modelId: 'jev-latest', kind: 'DECISION' },
});
const made = await graphql(`mutation($input: CreateWorkflowInput!) { createWorkflow(input: $input) { workflowId } }`, {
  input: { workspaceId: WORKSPACE, name: `${PREFIX} ${STAMP}`, description: 'Made by decision-run-check.' },
});
const WORKFLOW = made.createWorkflow.workflowId;
await graphql(
  `mutation($w: ID!, $f: ID!, $input: WorkflowGraphInput!) { saveWorkflowGraph(workspaceId: $w, workflowId: $f, input: $input) { nodes { key } } }`,
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
          outputName: 'decision',
          decisionModelId: model.createModel.id,
          decisionBranchQuestion: 'department',
          decisionThreshold: 0.8,
          decisionQuestions: [
            { key: 'department', kind: 'CHOICE', instructions: 'Which team?', options: [{ name: 'billing' }, { name: 'returns' }] },
          ],
          mappings: [{ name: 'state', expression: 'I would like returns and a refund for my shoes', mode: 'VALUE' }],
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

const started = await graphql(`mutation($w: ID!, $f: ID!) { startExecution(workspaceId: $w, workflowId: $f) { id } }`, {
  w: WORKSPACE,
  f: WORKFLOW,
});

/* ---- the run's page ---- */

await page.goto(`${BASE}/workspace/${WORKSPACE}/executions/${started.startExecution.id}`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.react-flow__node', { timeout: 30_000 });
if (!(await drawn(page, 'the run', { within: 30_000 }))) await clean();

const outcome = async (name) =>
  (await page.locator('.react-flow__node', { hasText: name }).first().locator('[class*="outcomeLabel"]').textContent().catch(() => '')) ?? '';
const refund = await outcome(`${PREFIX} refund`);
const bill = await outcome(`${PREFIX} bill`);
record(refund.trim() === 'Ran', `the option the model picked is the branch that ran (${JSON.stringify(refund)})`);
record(bill.trim() === 'Skipped', `and the other option's branch did not (${JSON.stringify(bill)})`);

await selectNode(page, page.locator('.react-flow__node', { hasText: `${PREFIX} route` }).first(), 'the decision step');
await page.waitForTimeout(600);
const branch = await page
  .locator('[class*="panelField"]', { has: page.locator('[class*="panelLabel"]', { hasText: /^Branch$/ }) })
  .locator('[class*="panelValue"]')
  .textContent()
  .catch(() => '');
record((branch ?? '').trim() === 'returns', `the step says which option it went by (${JSON.stringify(branch)})`);

await clean();
