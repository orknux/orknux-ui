/**
 * A workspace variable written into a node's value: `Hello {{variables.<id>}}`.
 *
 * Typing `{{` and part of a variable's name offers it by that name, under the
 * heading the reference picker files it under; picking it writes
 * `{{ variables.<id> }}`, and the chip under the value names the variable rather
 * than the id. A secret is never offered. Nothing is drawn red, the save is
 * accepted, and a run of the workflow hands the function what the variable
 * holds.
 *
 * Makes a catalog with a plain variable and a secret, a scheduled trigger, a
 * function taking `order`, an action and a workflow wiring them; removes them.
 */
import { BASE, WORKSPACE, open, drawn, record, finish, selectNode } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });
const STAMP = Date.now();
const made = { workflowId: null, functionId: null, actionId: null, triggerId: null, catalogId: null, variables: [] };

try {
  made.catalogId = (await graphql(
    `mutation($w: ID!, $name: String!) { createVariableCatalog(workspaceId: $w, name: $name) { id } }`,
    { w: WORKSPACE, name: `zz placeholder vars ${STAMP}` },
  )).createVariableCatalog.id;
  const variable = async (name, value, kind) => {
    const id = (await graphql(
      `mutation($input: CreateVariableInput!) { createVariable(input: $input) { id } }`,
      { input: { workspaceId: WORKSPACE, catalogId: made.catalogId, name, type: 'STRING', kind, value } },
    )).createVariable.id;
    made.variables.push(id);
    return id;
  };
  const greetee = `zzGreetee${STAMP}`;
  const greeteeId = await variable(greetee, 'Ada', 'VALUE');
  const secretId = await variable(`zzGreeteeToken${STAMP}`, 'sk-never-shown', 'SECRET');

  made.triggerId = (await graphql(
    `mutation($input: CreateTriggerInput!) { createTrigger(input: $input) { id } }`,
    { input: { workspaceId: WORKSPACE, name: `zz placeholder vars clock ${STAMP}`, type: 'SCHEDULED', cron: '0 2 * * *', payload: '{"user":"alice","a":1,"b":2,"c":3,"d":4,"e":5,"f":6,"g":7,"h":8}' } },
  )).createTrigger.id;
  const fname = `zzPlaceholderVars${STAMP}`;
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
    { input: { workspaceId: WORKSPACE, name: `Placeholder vars ${STAMP}`, type: 'EXECUTE', subtype: 'FUNCTION', functionId: made.functionId } },
  )).createAction.id;
  made.workflowId = (await graphql(
    `mutation($input: CreateWorkflowInput!) { createWorkflow(input: $input) { workflowId } }`,
    { input: { workspaceId: WORKSPACE, name: `zz placeholder vars ${STAMP}` } },
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
  await page.locator('[data-mapping-name="order"]').getByRole('button', { name: 'Value', exact: true }).click();
  await page.waitForTimeout(300);
  const value = page.locator('#node-mapping-order');
  // Reported: with nothing typed after {{, a trigger's own fields filled the list and the variables were cut off.
  await value.fill('');
  await value.pressSequentially('{{');
  await page.waitForTimeout(400);
  const bare = await page.getByTestId('placeholder-suggestions').getByRole('option').evaluateAll((all) => all.map((one) => one.getAttribute('data-expression')));
  record(bare.includes(`variables.${greeteeId}`) && bare.filter((one) => one.startsWith('trigger.')).length >= 9,
    `{{ alone offers the variables as well as every trigger field (${bare.length} offered)`);
  await value.press('Escape');

  await value.fill('Hello ');
  await value.press('End');
  await value.pressSequentially('{{zzGreetee');
  await page.waitForTimeout(400);

  const offered = await page.getByTestId('placeholder-suggestions').getByRole('option').evaluateAll((all) =>
    all.map((one) => ({ expression: one.getAttribute('data-expression'), text: one.textContent.trim() })));
  const row = offered.find((one) => one.expression === `variables.${greeteeId}`);
  record(row !== undefined && row.text.includes(greetee) && row.text.includes('Workspace variables'),
    `typing {{ and its name offers the variable by name, under Workspace variables (${JSON.stringify(row)})`);
  record(!offered.some((one) => one.expression === `variables.${secretId}`), `a secret is not offered (${JSON.stringify(offered)})`);

  await page.getByTestId('placeholder-suggestions').locator(`[data-expression="variables.${greeteeId}"]`).click();
  await page.waitForTimeout(300);
  const written = await value.inputValue();
  record(written === `Hello {{ variables.${greeteeId} }}`, `picking it writes the variable by id (${JSON.stringify(written)})`);

  const chips = await page.getByTestId('placeholder-chips').locator('[data-placeholder]').evaluateAll((all) =>
    all.map((one) => ({ field: one.getAttribute('data-placeholder'), ok: one.hasAttribute('data-placeholder-ok'), text: one.textContent.trim() })));
  const chip = chips.find((one) => one.field === `variables.${greeteeId}`);
  record(chip?.ok === true && chip.text.includes(greetee) && !chip.text.includes(`variables.${greeteeId}`),
    `the chip under the value names the variable, not its id (${JSON.stringify(chips)})`);
  const red = await page.locator('[data-placeholder-wrong], mark[data-mark="unanswered"]').count();
  record(red === 0, `nothing is drawn as a placeholder problem (${red})`);

  await page.keyboard.press('Control+s');
  await page.waitForTimeout(2500);
  const alerts = (await page.locator('[role="alert"]').allInnerTexts()).filter((one) => one.includes('{{'));
  record(alerts.length === 0, `the save is not refused (${JSON.stringify(alerts)})`);

  const { workflowGraph } = await graphql(
    'query($w: ID!, $f: ID!) { workflowGraph(workspaceId: $w, workflowId: $f) { nodes { key mappings { name expression mode } } } }',
    { w: WORKSPACE, f: made.workflowId },
  );
  const order = workflowGraph.nodes.find((node) => node.key === 'use')?.mappings.find((one) => one.name === 'order');
  record(order?.mode === 'VALUE' && new RegExp(`^Hello \\{\\{\\s*variables\\.${greeteeId}\\s*\\}\\}$`).test(order?.expression ?? ''),
    `the saved mapping holds {{variables.${greeteeId}}} (${JSON.stringify(order)})`);

  // A run hands the function what the variable holds.
  const runId = (await graphql(
    `mutation($w: ID!, $id: ID!) { startExecution(workspaceId: $w, workflowId: $id) { id } }`,
    { w: WORKSPACE, id: made.workflowId },
  )).startExecution.id;
  let run = null;
  for (let waited = 0; waited < 30_000; waited += 1000) {
    run = (await graphql(`query($id: ID!) { execution(id: $id) { id status steps { key status output } } }`, { id: runId })).execution;
    if (run.status !== 'RUNNING' && run.status !== 'PENDING') break;
    await page.waitForTimeout(1000);
  }
  const step = run?.steps.find((one) => one.key === 'use');
  record(run?.status === 'COMPLETED' && (step?.output ?? '').includes('Hello Ada'),
    `the run's step was handed what the variable holds (${run?.status}, ${JSON.stringify(step?.output)})`);
} finally {
  const { workspaceWorkflows } = await graphql(
    `query($w: ID!) { workspaceWorkflows(workspaceId: $w, size: 500) { content { id name } } }`,
    { w: WORKSPACE },
  ).catch(() => ({ workspaceWorkflows: { content: [] } }));
  for (const old of workspaceWorkflows.content.filter((one) => one.name.startsWith('zz placeholder vars'))) {
    await graphql(`mutation($id: ID!) { removeWorkflow(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
  if (made.actionId !== null) await graphql(`mutation($id: ID!) { deleteAction(id: $id) }`, { id: made.actionId }).catch(() => undefined);
  if (made.triggerId !== null) await graphql(`mutation($id: ID!) { deleteTrigger(id: $id) }`, { id: made.triggerId }).catch(() => undefined);
  if (made.functionId !== null) await graphql(`mutation($id: ID!) { deleteFunction(id: $id) }`, { id: made.functionId }).catch(() => undefined);
  for (const id of made.variables) await graphql(`mutation($id: ID!) { deleteVariable(id: $id) }`, { id }).catch(() => undefined);
  if (made.catalogId !== null) await graphql(`mutation($id: ID!) { deleteVariableCatalog(id: $id) }`, { id: made.catalogId }).catch(() => undefined);
}

await finish(browser);
