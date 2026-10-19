/**
 * Two Custom actions in one workflow keep their own parameters in the panel.
 *
 * Reported: with two Custom actions, moving from one node to the other left the
 * panel showing a mix of the two actions' parameters. Each node here points at
 * a workflow-owned action calling a different function, with different
 * parameters; clicking one and then the other must show exactly that one's.
 *
 * Makes its own functions, workflow and actions, and removes them.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });
const STAMP = Date.now();
const PREFIX = 'zzCustomSwitch';

const fn = async (name, params) => (await graphql(
  `mutation($input: CreateFunctionInput!) { createFunction(input: $input) { id } }`,
  { input: { workspaceId: WORKSPACE, name,
    source: `export default async function ${name}(${params.join(', ')}) { return {}; }`,
    typescript: `export default async function ${name}(${params.map((one) => `${one}: string`).join(', ')}) { return {}; }`,
    params: params.map((one) => ({ name: one, type: 'STRING' })) } },
)).createFunction.id;

const made = { functions: [], workflow: null };
try {
  made.functions.push(await fn(`zzSwitchA${STAMP}`, ['alpha', 'beta']));
  made.functions.push(await fn(`zzSwitchB${STAMP}`, ['gamma']));
  made.workflow = (await graphql(`mutation($input: CreateWorkflowInput!) { createWorkflow(input: $input) { workflowId } }`, {
    input: { workspaceId: WORKSPACE, name: `${PREFIX} ${STAMP}`, description: 'Made by custom-action-switch-check.' },
  })).createWorkflow.workflowId;
  const action = async (name, functionId) => (await graphql(
    `mutation($input: CreateActionInput!) { createAction(input: $input) { id } }`,
    { input: { workspaceId: WORKSPACE, workflowId: made.workflow, name, type: 'EXECUTE', subtype: 'FUNCTION', functionId } },
  )).createAction.id;
  const first = await action(`${PREFIX} first`, made.functions[0]);
  const second = await action(`${PREFIX} second`, made.functions[1]);
  await graphql(
    `mutation($w: ID!, $f: ID!, $input: WorkflowGraphInput!) { saveWorkflowGraph(workspaceId: $w, workflowId: $f, input: $input) { nodes { key } } }`,
    { w: WORKSPACE, f: made.workflow, input: { nodes: [
      { key: 'one', kind: 'ACTION', name: 'First', x: 160, y: 160, actionId: first },
      { key: 'two', kind: 'ACTION', name: 'Second', x: 760, y: 160, actionId: second },
    ], edges: [] } },
  );

  await page.goto(`${BASE}/workspace/${WORKSPACE}/workflows/${made.workflow}/editor`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.react-flow__node', { timeout: 20_000 });
  /** The parameter rows the node's panel shows, by name. */
  const shown = async () => {
    await page.waitForTimeout(1200);
    return page.evaluate(() => [...document.querySelectorAll('[data-testid="mapping-name"], [data-mapping-name]')]
      .map((one) => one.getAttribute('data-mapping-name') ?? one.textContent.trim()));
  };
  const open = (name) => page.locator('.react-flow__node', { hasText: name }).first().click();

  await open('First');
  const a = await shown();
  await open('Second');
  const b = await shown();
  await open('First');
  const c = await shown();
  record(JSON.stringify(a) === JSON.stringify(['alpha', 'beta']), `the first node shows its own parameters (${JSON.stringify(a)})`);
  record(JSON.stringify(b) === JSON.stringify(['gamma']), `moving to the second shows only its own (${JSON.stringify(b)})`);
  record(JSON.stringify(c) === JSON.stringify(['alpha', 'beta']), `and back to the first, only the first's (${JSON.stringify(c)})`);

  /*
   * Edited, and left before the form's own save lands. The save then finishes
   * with the other node selected, and must still write into the node it was
   * made on: written into the selected one, the second node took the first's
   * action and showed its parameters.
   */
  await open('First');
  await page.waitForTimeout(800);
  const description = page.locator('textarea').filter({ hasNot: page.locator('[disabled]') }).first();
  await description.fill(`zz edited ${STAMP}`);
  await open('Second');
  const d = await shown();
  await page.waitForTimeout(2500);
  const e = await shown();
  record(JSON.stringify(d) === JSON.stringify(['gamma']) && JSON.stringify(e) === JSON.stringify(['gamma']),
    `a save landing after moving on leaves the second node its own parameters (${JSON.stringify({ d, e })})`);
  const graph = await graphql(
    'query($w: ID!, $f: ID!) { workflowGraph(workspaceId: $w, workflowId: $f) { nodes { key actionId } } }',
    { w: WORKSPACE, f: made.workflow },
  );
  const ids = Object.fromEntries((graph.workflowGraph?.nodes ?? []).map((node) => [node.key, String(node.actionId)]));
  await page.waitForTimeout(3000);
  const later = await graphql(
    'query($w: ID!, $f: ID!) { workflowGraph(workspaceId: $w, workflowId: $f) { nodes { key actionId } } }',
    { w: WORKSPACE, f: made.workflow },
  );
  const after = Object.fromEntries((later.workflowGraph?.nodes ?? []).map((node) => [node.key, String(node.actionId)]));
  record(after.one === String(first) && after.two === String(second),
    `and each node still points at its own action (${JSON.stringify({ before: ids, after, first, second })})`);
} finally {
  if (made.workflow !== null) await graphql('mutation($id: ID!) { removeWorkflow(id: $id) }', { id: made.workflow }).catch(() => undefined);
  for (const id of made.functions) await graphql('mutation($id: ID!) { deleteFunction(id: $id) }', { id }).catch(() => undefined);
}

await finish(browser);
