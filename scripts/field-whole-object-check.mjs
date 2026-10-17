/**
 * The row that hands on a whole object stands apart from the object's fields.
 *
 * A reference picker lists an object (`ticket`) and then each of its fields
 * (`ticket.title`, `ticket.priority`) in the same type, so the one row that
 * passes all of it was easy to scroll past. It is marked "whole object" now,
 * and its fields are drawn under it with the object's name dimmed.
 *
 * Makes a shape, a workflow drawing one object node and an action node, and
 * removes them.
 */
import { BASE, WORKSPACE, open, drawn, record, finish, selectNode } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });
const STAMP = Date.now();
const made = { objectId: null, workflowId: null, functionId: null, actionId: null };

try {
  made.objectId = (await graphql(
    `mutation($input: CreateObjectInput!) { createObject(input: $input) { id } }`,
    { input: { workspaceId: WORKSPACE, name: `Ticket${STAMP}`, properties: [
      { name: 'title', kind: 'STRING' }, { name: 'priority', kind: 'NUMBER' },
    ] } },
  )).createObject.id;
  const fname = `zzWhole${STAMP}`;
  made.functionId = (await graphql(
    `mutation($input: CreateFunctionInput!) { createFunction(input: $input) { id } }`,
    { input: {
      workspaceId: WORKSPACE, name: fname, returnType: 'STRING', params: [{ name: 'input', type: 'MAP' }],
      typescript: `export default function ${fname}(input: Record<string, unknown>): string {\n  return String(input);\n}\n`,
      source: `export default function ${fname}(input) {\n  return String(input);\n}\n`,
    } },
  )).createFunction.id;
  made.actionId = (await graphql(
    `mutation($input: CreateActionInput!) { createAction(input: $input) { id } }`,
    { input: { workspaceId: WORKSPACE, name: `Whole ${STAMP}`, type: 'EXECUTE', subtype: 'FUNCTION', functionId: made.functionId } },
  )).createAction.id;
  made.workflowId = (await graphql(
    `mutation($input: CreateWorkflowInput!) { createWorkflow(input: $input) { workflowId } }`,
    { input: { workspaceId: WORKSPACE, name: `zz whole object ${STAMP}` } },
  )).createWorkflow.workflowId;
  await graphql(
    `mutation($w: ID!, $f: ID!, $input: WorkflowGraphInput!) { saveWorkflowGraph(workspaceId: $w, workflowId: $f, input: $input) { workflowId } }`,
    { w: WORKSPACE, f: made.workflowId, input: {
      nodes: [
        { key: 'held', kind: 'OBJECT', name: 'Make the ticket', objectId: made.objectId, outputName: 'ticket', x: 100, y: 200 },
        { key: 'use', kind: 'ACTION', name: 'Use the ticket', actionId: made.actionId, x: 500, y: 200 },
      ],
      edges: [{ source: 'held', target: 'use' }],
    } },
  );

  await page.goto(`${BASE}/workspace/${WORKSPACE}/workflows/${made.workflowId}/editor`, { waitUntil: 'domcontentloaded' });
  record(await drawn(page, 'the workflow editor'), 'the editor opens');
  await selectNode(page, page.locator('.react-flow__node', { hasText: 'Use the ticket' }).first(), 'the action node');
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'Reference', exact: true }).first().click();
  await page.waitForTimeout(300);
  await page.getByText('Choose a field…', { exact: true }).first().click();
  await page.waitForTimeout(500);

  const seen = await page.locator('[data-field-option]').evaluateAll((all) =>
    all
      .filter((one) => (one.getAttribute('data-field-option') ?? '').startsWith('ticket'))
      .map((one) => ({
        field: one.getAttribute('data-field-option'),
        whole: one.querySelector('[data-field-whole]') !== null,
        indent: Math.round(parseFloat(getComputedStyle(one).paddingLeft)),
      })),
  );
  console.log(JSON.stringify(seen));
  const object = seen.find((one) => one.field === 'ticket');
  const part = seen.find((one) => one.field === 'ticket.title');
  record(object?.whole === true, 'the object row is marked as the whole object');
  record(part !== undefined && part.whole === false, 'and its fields are not');
  record(part !== undefined && object !== undefined && part.indent > object.indent, `its fields are drawn under it, indented (${object?.indent} -> ${part?.indent})`);
  await page.screenshot({ path: '/tmp/whole-object.png' });
} finally {
  const { workspaceWorkflows } = await graphql(
    `query($w: ID!) { workspaceWorkflows(workspaceId: $w, size: 500) { content { id name } } }`,
    { w: WORKSPACE },
  ).catch(() => ({ workspaceWorkflows: { content: [] } }));
  for (const old of workspaceWorkflows.content.filter((one) => one.name.startsWith('zz whole object'))) {
    await graphql(`mutation($id: ID!) { removeWorkflow(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
  if (made.actionId !== null) await graphql(`mutation($id: ID!) { deleteAction(id: $id) }`, { id: made.actionId }).catch(() => undefined);
  if (made.functionId !== null) await graphql(`mutation($id: ID!) { deleteFunction(id: $id) }`, { id: made.functionId }).catch(() => undefined);
  if (made.objectId !== null) await graphql(`mutation($id: ID!) { deleteObject(id: $id) }`, { id: made.objectId }).catch(() => undefined);
}

await finish(browser);
