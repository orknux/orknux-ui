/**
 * A node's written value may hold {{field}} placeholders, each one answered.
 *
 * Under the value, each placeholder is drawn as the reference it is - the node
 * it reads and the field - when the graph produces it, and in red with why as
 * soon as it is typed when nothing does. A save holding one nothing answers is
 * refused with the reason; once every one is answered it saves.
 *
 * Makes a scheduled trigger carrying `user`, a function taking `order`, an
 * action and a workflow wiring them; removes them.
 */
import { BASE, WORKSPACE, open, drawn, record, finish, selectNode } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });
const STAMP = Date.now();
const made = { workflowId: null, functionId: null, actionId: null, triggerId: null };

try {
  made.triggerId = (await graphql(
    `mutation($input: CreateTriggerInput!) { createTrigger(input: $input) { id } }`,
    { input: { workspaceId: WORKSPACE, name: `zz placeholder clock ${STAMP}`, type: 'SCHEDULED', cron: '0 2 * * *', payload: '{"user":"alice"}' } },
  )).createTrigger.id;
  const fname = `zzPlaceholder${STAMP}`;
  made.functionId = (await graphql(
    `mutation($input: CreateFunctionInput!) { createFunction(input: $input) { id } }`,
    { input: {
      workspaceId: WORKSPACE, name: fname, returnType: 'STRING', params: [{ name: 'order', type: 'STRING' }],
      typescript: `export default function ${fname}(order: string): string {\n  return order;\n}\n`,
      source: `export default function ${fname}(order) {\n  return order;\n}\n`,
    } },
  )).createFunction.id;
  made.actionId = (await graphql(
    `mutation($input: CreateActionInput!) { createAction(input: $input) { id } }`,
    { input: { workspaceId: WORKSPACE, name: `Placeholder ${STAMP}`, type: 'EXECUTE', subtype: 'FUNCTION', functionId: made.functionId } },
  )).createAction.id;
  made.workflowId = (await graphql(
    `mutation($input: CreateWorkflowInput!) { createWorkflow(input: $input) { workflowId } }`,
    { input: { workspaceId: WORKSPACE, name: `zz placeholders ${STAMP}` } },
  )).createWorkflow.workflowId;
  await graphql(
    `mutation($w: ID!, $f: ID!, $input: WorkflowGraphInput!) { saveWorkflowGraph(workspaceId: $w, workflowId: $f, input: $input) { workflowId } }`,
    { w: WORKSPACE, f: made.workflowId, input: {
      nodes: [
        { key: 'clock', kind: 'TRIGGER', name: 'Nightly', triggerId: made.triggerId, x: 100, y: 200 },
        { key: 'use', kind: 'ACTION', name: 'Greet', actionId: made.actionId, x: 500, y: 200 },
      ],
      edges: [{ source: 'clock', target: 'use' }],
    } },
  );

  await page.goto(`${BASE}/workspace/${WORKSPACE}/workflows/${made.workflowId}/editor`, { waitUntil: 'domcontentloaded' });
  record(await drawn(page, 'the workflow editor'), 'the editor opens');
  await selectNode(page, page.locator('.react-flow__node', { hasText: 'Greet' }).first(), 'the action node');
  await page.waitForTimeout(800);
  // A parameter may arrive as a reference; a placeholder lives in a written value.
  await page.locator('[data-mapping-name="order"]').getByRole('button', { name: 'Value', exact: true }).click();
  await page.waitForTimeout(300);
  const value = page.locator('#node-mapping-order');
  await value.fill('Hi {{ trigger.user }}, see {{nowhere}}');
  await page.waitForTimeout(300);

  const chips = await page.getByTestId('placeholder-chips').locator('[data-placeholder]').evaluateAll((all) =>
    all.map((one) => ({ field: one.getAttribute('data-placeholder'), ok: one.hasAttribute('data-placeholder-ok'), text: one.textContent.trim() })));
  const answered = chips.find((one) => one.field === 'trigger.user');
  const unanswered = chips.find((one) => one.field === 'nowhere');
  record(answered?.ok === true && answered.text.includes('Nightly'), `an answered placeholder is drawn as the reference it is, naming its node (${JSON.stringify(answered)})`);
  record(unanswered?.ok === false && unanswered.text.includes('nothing in this workflow produces it'), `one nothing answers is red with why, as it is typed (${JSON.stringify(unanswered)})`);

  // A trigger's field written bare is pointed at the way it is read.
  await value.fill('Hi {{user}}');
  await page.waitForTimeout(300);
  const bare = (await page.getByTestId('placeholder-chips').innerText().catch(() => '')).trim();
  record(bare.includes('write {{trigger.user}}'), `a trigger's field written bare says to write {{trigger.user}} (${bare})`);
  await value.fill('Hi {{ trigger.user }}, see {{nowhere}}');
  await page.waitForTimeout(300);

  await page.keyboard.press('Control+s');
  await page.waitForTimeout(2000);
  const refusal = await page.locator('[role="alert"]').allInnerTexts();
  record(refusal.some((one) => one.includes('{{nowhere}}') && one.includes('nothing in this workflow produces')),
    `saving it is refused with the reason (${JSON.stringify(refusal.filter((one) => one.includes('{{')))})`);

  await value.fill('Hi {{ trigger.user }}');
  await page.waitForTimeout(300);
  await page.keyboard.press('Control+s');
  await page.waitForTimeout(2500);
  const { workflowGraph } = await graphql(
    'query($w: ID!, $f: ID!) { workflowGraph(workspaceId: $w, workflowId: $f) { nodes { key mappings { name expression mode } } } }',
    { w: WORKSPACE, f: made.workflowId },
  );
  const order = workflowGraph.nodes.find((node) => node.key === 'use')?.mappings.find((one) => one.name === 'order');
  record(order?.mode === 'VALUE' && order?.expression === 'Hi {{ trigger.user }}', `answered, it saves (${JSON.stringify(order)})`);
} finally {
  const { workspaceWorkflows } = await graphql(
    `query($w: ID!) { workspaceWorkflows(workspaceId: $w, size: 500) { content { id name } } }`,
    { w: WORKSPACE },
  ).catch(() => ({ workspaceWorkflows: { content: [] } }));
  for (const old of workspaceWorkflows.content.filter((one) => one.name.startsWith('zz placeholders'))) {
    await graphql(`mutation($id: ID!) { removeWorkflow(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
  if (made.actionId !== null) await graphql(`mutation($id: ID!) { deleteAction(id: $id) }`, { id: made.actionId }).catch(() => undefined);
  if (made.triggerId !== null) await graphql(`mutation($id: ID!) { deleteTrigger(id: $id) }`, { id: made.triggerId }).catch(() => undefined);
  if (made.functionId !== null) await graphql(`mutation($id: ID!) { deleteFunction(id: $id) }`, { id: made.functionId }).catch(() => undefined);
}

await finish(browser);
