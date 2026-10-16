/**
 * A node's parameter can be pointed at one of the workspace's variables.
 *
 * The Reference picker offered what earlier nodes produced and nothing else, so
 * a value kept as a workspace variable - a project key, a channel - reached a
 * node only through a function written to hand it on. The picker now has a
 * Workspace variables group; a reference is stored as `variables.<id>` and read
 * when the step runs. Secrets are not offered: a parameter is handed on as
 * text, and a secret referenced into a message would be published.
 *
 * Makes a function, an action, a workflow and two variables, and removes them.
 */
import { BASE, WORKSPACE, open, drawn, record, finish, selectNode } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });

const STAMP = Date.now();
const made = { functionId: null, actionId: null, workflowId: null, catalogId: null };

async function cleanUp() {
  if (made.workflowId !== null) {
    const { workspaceWorkflows } = await graphql(
      `query($w: ID!) { workspaceWorkflows(workspaceId: $w, size: 500) { content { id workflowId } } }`,
      { w: WORKSPACE },
    ).catch(() => ({ workspaceWorkflows: { content: [] } }));
    const held = workspaceWorkflows.content.find((one) => one.workflowId === made.workflowId);
    if (held) await graphql(`mutation($id: ID!) { removeWorkflow(id: $id) }`, { id: held.id }).catch(() => undefined);
  }
  if (made.actionId !== null) await graphql(`mutation($id: ID!) { deleteAction(id: $id) }`, { id: made.actionId }).catch(() => undefined);
  if (made.functionId !== null) await graphql(`mutation($id: ID!) { deleteFunction(id: $id) }`, { id: made.functionId }).catch(() => undefined);
  // Its variables first: a catalog that still holds any is not deleted.
  const { workspaceVariables } = await graphql(
    `query($w: ID!) { workspaceVariables(workspaceId: $w, size: 500) { content { id name } } }`,
    { w: WORKSPACE },
  ).catch(() => ({ workspaceVariables: { content: [] } }));
  for (const old of workspaceVariables.content.filter((one) => /^(projectKey|apiToken)\d+$/.test(one.name))) {
    await graphql(`mutation($id: ID!) { deleteVariable(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
  const { variableCatalogs } = await graphql(
    `query($w: ID!) { variableCatalogs(workspaceId: $w) { id name } }`,
    { w: WORKSPACE },
  ).catch(() => ({ variableCatalogs: [] }));
  for (const old of variableCatalogs.filter((one) => /^Var ref \d+$/.test(one.name))) {
    await graphql(`mutation($id: ID!) { deleteVariableCatalog(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
}

try {
  const name = `zzVarRef${STAMP}`;
  made.functionId = (await graphql(
    `mutation($input: CreateFunctionInput!) { createFunction(input: $input) { id } }`,
    { input: {
      workspaceId: WORKSPACE, name, returnType: 'STRING', params: [{ name: 'project', type: 'STRING' }],
      typescript: `export default function ${name}(project: string): string {\n  return project;\n}\n`,
      source: `export default function ${name}(project) {\n  return project;\n}\n`,
    } },
  )).createFunction.id;
  made.actionId = (await graphql(
    `mutation($input: CreateActionInput!) { createAction(input: $input) { id } }`,
    { input: { workspaceId: WORKSPACE, name: `Var ref ${STAMP}`, type: 'EXECUTE', subtype: 'FUNCTION', functionId: made.functionId } },
  )).createAction.id;
  made.workflowId = (await graphql(
    `mutation($input: CreateWorkflowInput!) { createWorkflow(input: $input) { workflowId } }`,
    { input: { workspaceId: WORKSPACE, name: `Var ref ${STAMP}` } },
  )).createWorkflow.workflowId;
  await graphql(
    `mutation($w: ID!, $f: ID!, $input: WorkflowGraphInput!) { saveWorkflowGraph(workspaceId: $w, workflowId: $f, input: $input) { workflowId } }`,
    { w: WORKSPACE, f: made.workflowId, input: {
      nodes: [{ key: 'run', kind: 'ACTION', name: 'Use the project', actionId: made.actionId, x: 200, y: 200 }],
      edges: [],
    } },
  );
  made.catalogId = (await graphql(
    `mutation($w: ID!, $n: String!) { createVariableCatalog(workspaceId: $w, name: $n) { id } }`,
    { w: WORKSPACE, n: `Var ref ${STAMP}` },
  )).createVariableCatalog.id;
  const plain = `projectKey${STAMP}`;
  const secret = `apiToken${STAMP}`;
  for (const [n, kind] of [[plain, 'VALUE'], [secret, 'SECRET']]) {
    await graphql(
      `mutation($input: CreateVariableInput!) { createVariable(input: $input) { id } }`,
      { input: { workspaceId: WORKSPACE, catalogId: made.catalogId, name: n, type: 'STRING', kind, value: 'x' } },
    );
  }

  await page.goto(`${BASE}/workspace/${WORKSPACE}/workflows/${made.workflowId}/editor`, { waitUntil: 'domcontentloaded' });
  record(await drawn(page, 'the workflow editor'), 'the editor opens');
  await selectNode(page, page.locator('.react-flow__node', { hasText: 'Use the project' }).first(), 'the action node');
  await page.waitForTimeout(800);

  await page.getByRole('button', { name: 'Reference', exact: true }).first().click();
  await page.waitForTimeout(300);
  const closed = page.getByText('Choose a field…', { exact: true }).first();
  await closed.click({ timeout: 10_000 });
  await page.waitForTimeout(400);

  const groups = await page.locator('[role="listbox"] [role="group"]').evaluateAll((all) =>
    all.map((group) => ({
      name: group.querySelector('[class*="_groupName_"]')?.textContent?.trim() ?? '',
      fields: [...group.querySelectorAll('[role="option"] [class*="_optionField_"]')].map((one) => one.textContent?.trim()),
    })),
  );
  console.log(JSON.stringify(groups));
  const variables = groups.find((one) => /workspace variables/i.test(one.name));
  record(variables !== undefined, 'the picker has a Workspace variables group');
  record(variables?.fields.includes(plain) === true, `a plain variable is offered (${plain})`);
  record(!(variables?.fields ?? []).includes(secret), 'and a secret is not');

  await page.locator('[role="option"]', { hasText: plain }).first().click();
  await page.waitForTimeout(400);
  const chosen = (await page.locator('aside, [class*="_panel_"]').filter({ hasText: 'PARAMETERS' }).first().innerText().catch(() => '')).replace(/\s+/g, ' ');
  record(chosen.includes(plain), `choosing it fills the parameter (${chosen})`);
} finally {
  await cleanUp();
}

await finish(browser);
