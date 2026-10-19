/**
 * A trigger held to a predefined object can be referenced whole.
 *
 * Reported: a parameter could be pointed at each field of the object a webhook
 * trigger is held to, but not at the object itself. `trigger` alone is the
 * event, which a run already reads, so the picker offers it first - marked as
 * the whole object, its fields under it - and choosing it stores `trigger`.
 *
 * Makes a shape, a webhook trigger held to it, a function taking a map, an
 * action, and a workflow wiring the trigger to the action; removes them.
 */
import { BASE, WORKSPACE, open, drawn, record, finish, selectNode } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });
const STAMP = Date.now();
const made = { objectId: null, workflowId: null, functionId: null, actionId: null, triggerId: null };

try {
  made.objectId = (await graphql(
    `mutation($input: CreateObjectInput!) { createObject(input: $input) { id } }`,
    { input: { workspaceId: WORKSPACE, name: `Order${STAMP}`, properties: [
      { name: 'sku', kind: 'STRING' }, { name: 'quantity', kind: 'NUMBER' },
    ] } },
  )).createObject.id;
  made.triggerId = (await graphql(
    `mutation($input: CreateTriggerInput!) { createTrigger(input: $input) { id } }`,
    { input: { workspaceId: WORKSPACE, name: `zz order hook ${STAMP}`, type: 'WEBHOOK', webhookPath: `zz-order-${STAMP}`, objectId: made.objectId } },
  )).createTrigger.id;
  const fname = `zzWholeTrigger${STAMP}`;
  made.functionId = (await graphql(
    `mutation($input: CreateFunctionInput!) { createFunction(input: $input) { id } }`,
    { input: {
      workspaceId: WORKSPACE, name: fname, returnType: 'STRING', params: [{ name: 'order', type: 'MAP' }],
      typescript: `export default function ${fname}(order: Record<string, unknown>): string {
  return String(order);
}
`,
      source: `export default function ${fname}(order) {
  return String(order);
}
`,
    } },
  )).createFunction.id;
  made.actionId = (await graphql(
    `mutation($input: CreateActionInput!) { createAction(input: $input) { id } }`,
    { input: { workspaceId: WORKSPACE, name: `Whole trigger ${STAMP}`, type: 'EXECUTE', subtype: 'FUNCTION', functionId: made.functionId } },
  )).createAction.id;
  made.workflowId = (await graphql(
    `mutation($input: CreateWorkflowInput!) { createWorkflow(input: $input) { workflowId } }`,
    { input: { workspaceId: WORKSPACE, name: `zz whole trigger ${STAMP}` } },
  )).createWorkflow.workflowId;
  await graphql(
    `mutation($w: ID!, $f: ID!, $input: WorkflowGraphInput!) { saveWorkflowGraph(workspaceId: $w, workflowId: $f, input: $input) { workflowId } }`,
    { w: WORKSPACE, f: made.workflowId, input: {
      nodes: [
        { key: 'hook', kind: 'TRIGGER', name: 'Order arrives', triggerId: made.triggerId, x: 100, y: 200 },
        { key: 'use', kind: 'ACTION', name: 'Use the order', actionId: made.actionId, x: 500, y: 200 },
      ],
      edges: [{ source: 'hook', target: 'use' }],
    } },
  );

  await page.goto(`${BASE}/workspace/${WORKSPACE}/workflows/${made.workflowId}/editor`, { waitUntil: 'domcontentloaded' });
  record(await drawn(page, 'the workflow editor'), 'the editor opens');
  await selectNode(page, page.locator('.react-flow__node', { hasText: 'Use the order' }).first(), 'the action node');
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'Reference', exact: true }).first().click();
  await page.waitForTimeout(300);
  await page.getByText('Choose a field…', { exact: true }).first().click();
  await page.waitForTimeout(500);

  const seen = await page.locator('[data-field-option]').evaluateAll((all) =>
    all
      .filter((one) => (one.getAttribute('data-field-expression') ?? '').startsWith('trigger'))
      .map((one) => ({
        field: one.getAttribute('data-field-option'),
        expression: one.getAttribute('data-field-expression'),
        whole: one.querySelector('[data-field-whole]') !== null,
      })),
  );
  const whole = seen.find((one) => one.expression === 'trigger');
  record(whole?.whole === true && seen[0]?.expression === 'trigger', `the trigger's object is offered first, as the whole object (${JSON.stringify(seen)})`);
  record(seen.some((one) => one.expression === 'trigger.sku' && !one.whole), 'beside its fields, which are not');

  await page.locator('[data-field-expression="trigger"]').first().click();
  await page.waitForTimeout(400);
  await page.keyboard.press('Control+s');
  await page.waitForTimeout(2500);
  const { workflowGraph } = await graphql(
    'query($w: ID!, $f: ID!) { workflowGraph(workspaceId: $w, workflowId: $f) { nodes { key mappings { name expression mode } } } }',
    { w: WORKSPACE, f: made.workflowId },
  );
  const order = workflowGraph.nodes.find((node) => node.key === 'use')?.mappings.find((one) => one.name === 'order');
  record(order?.mode === 'REFERENCE' && order?.expression === 'trigger', `choosing it stores a reference to the whole event (${JSON.stringify(order)})`);
} finally {
  const { workspaceWorkflows } = await graphql(
    `query($w: ID!) { workspaceWorkflows(workspaceId: $w, size: 500) { content { id name } } }`,
    { w: WORKSPACE },
  ).catch(() => ({ workspaceWorkflows: { content: [] } }));
  for (const old of workspaceWorkflows.content.filter((one) => one.name.startsWith('zz whole trigger'))) {
    await graphql(`mutation($id: ID!) { removeWorkflow(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
  if (made.actionId !== null) await graphql(`mutation($id: ID!) { deleteAction(id: $id) }`, { id: made.actionId }).catch(() => undefined);
  if (made.triggerId !== null) await graphql(`mutation($id: ID!) { deleteTrigger(id: $id) }`, { id: made.triggerId }).catch(() => undefined);
  if (made.functionId !== null) await graphql(`mutation($id: ID!) { deleteFunction(id: $id) }`, { id: made.functionId }).catch(() => undefined);
  if (made.objectId !== null) await graphql(`mutation($id: ID!) { deleteObject(id: $id) }`, { id: made.objectId }).catch(() => undefined);
}

await finish(browser);
