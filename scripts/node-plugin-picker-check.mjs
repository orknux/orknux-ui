/**
 * A node's Action and Condition pickers offer what the loaded plugins bring.
 *
 * A plugin's action or function was reachable only through Custom..., then the
 * right subtype, then the plugin's entry. The pickers now list them beside the
 * workspace's own, each marked with the plugin it comes from; picking one makes
 * the node's own definition around it. A condition offers only the functions
 * that answer yes or no.
 *
 * Loads a plugin of its own with one function that answers yes or no and one
 * that answers text, and unloads it; makes a workflow, whose own definitions
 * go with it.
 */
import { BASE, WORKSPACE, open, drawn, record, finish, selectNode } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });
const NAME = `zz plugin picker ${Date.now()}`;
let workflowId = null;

const KEY = 'zzNodePicker';
const SOURCE = `
export default class Picked extends OrknuxPlugin {
  id() { return '${KEY}'; }
  apiVersion() { return 1; }
  functions() {
    return [
      new OrknuxFunction({ name: 'isQuiet', description: 'Whether it is quiet.', params: [{ name: 'text', type: 'string' }], returnType: 'boolean', run: (text) => text === '' }),
      new OrknuxFunction({ name: 'shout', description: 'The text, louder.', params: [{ name: 'text', type: 'string' }], returnType: 'string', run: (text) => String(text).toUpperCase() }),
    ];
  }
}
`;
const unload = async () => {
  const { plugins } = await graphql(`query { plugins { id key } }`, {});
  for (const old of plugins.filter((one) => one.key === KEY)) {
    await graphql(`mutation($id: ID!) { unloadPlugin(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
};
await unload();
const loaded = await page.request.post(`${BASE}/api/plugins`, {
  multipart: { file: { name: `${KEY}.js`, mimeType: 'text/javascript', buffer: Buffer.from(SOURCE, 'utf8') } },
});
record(loaded.ok(), `a plugin with two functions loads (${loaded.status()})`);

const rows = async () => (await page.locator('[role="option"]').allInnerTexts()).map((one) => one.replace(/\s+/g, ' ').trim());

try {
  workflowId = (await graphql(
    `mutation($input: CreateWorkflowInput!) { createWorkflow(input: $input) { workflowId } }`,
    { input: { workspaceId: WORKSPACE, name: NAME } },
  )).createWorkflow.workflowId;
  await graphql(
    `mutation($w: ID!, $f: ID!, $input: WorkflowGraphInput!) { saveWorkflowGraph(workspaceId: $w, workflowId: $f, input: $input) { workflowId } }`,
    { w: WORKSPACE, f: workflowId, input: { nodes: [
      { key: 'act', kind: 'ACTION', name: 'Do the plugin thing', x: 100, y: 200 },
      { key: 'ask', kind: 'CONDITION', name: 'Ask the plugin', x: 500, y: 200 },
    ], edges: [] } },
  );

  await page.goto(`${BASE}/workspace/${WORKSPACE}/workflows/${workflowId}/editor`, { waitUntil: 'domcontentloaded' });
  record(await drawn(page, 'the workflow editor'), 'the editor opens');

  /* ---- the action picker ---- */
  await selectNode(page, page.locator('.react-flow__node', { hasText: 'Do the plugin thing' }).first(), 'the action node');
  await page.waitForTimeout(800);
  // The plugin lists arrive with the rest of the catalogues; give them the moment they take.
  await page.waitForTimeout(2500);
  await page.getByText('Choose an action…', { exact: true }).first().click();
  await page.waitForTimeout(600);
  const offered = await rows();
  const pluginRows = offered.filter((one) => /plugin (action|function)$/i.test(one));
  console.log(JSON.stringify(pluginRows.slice(0, 6)));
  record(pluginRows.length > 0, `the action picker lists plugin actions and functions (${pluginRows.length})`);
  const post = page.locator('[role="option"]').filter({ has: page.getByText('zzNodePicker_shout', { exact: true }) }).first();
  await post.click();
  await page.waitForTimeout(1500);
  const actionNow = (await page.locator('[class*="_inspector_"], aside').filter({ hasText: 'PARAMETERS' }).first().innerText().catch(() => '')).replace(/\s+/g, ' ');
  record(/Custom/.test(actionNow) && /zzNodePicker_shout/.test(actionNow), 'picking a plugin function points the node at its own definition of it');

  /* ---- the condition picker ---- */
  await selectNode(page, page.locator('.react-flow__node', { hasText: 'Ask the plugin' }).first(), 'the condition node');
  await page.waitForTimeout(800);
  await page.getByText('Choose a condition…', { exact: true }).first().click();
  await page.waitForTimeout(400);
  const conditions = (await rows()).filter((one) => /plugin function$/i.test(one));
  console.log(JSON.stringify(conditions));
  record(conditions.some((one) => one.startsWith('zzNodePicker_isQuiet')), 'the condition picker lists a plugin function that answers yes or no');
  record(!conditions.some((one) => one.startsWith('zzNodePicker_shout')), 'and not one that answers anything else');
  await page.locator('[role="option"]').filter({ has: page.getByText('zzNodePicker_isQuiet', { exact: true }) }).first().click();
  await page.waitForTimeout(1500);
  const { workflowOwnedConditions } = await graphql(
    `query($w: ID!, $f: ID!) { workflowOwnedConditions(workspaceId: $w, workflowId: $f) { name type } }`,
    { w: WORKSPACE, f: workflowId },
  );
  record(
    workflowOwnedConditions.some((one) => one.name === 'zzNodePicker_isQuiet' && one.type === 'FUNCTION'),
    `picking it makes the node's own function condition (${JSON.stringify(workflowOwnedConditions)})`,
  );
} finally {
  await unload();
  const { workspaceWorkflows } = await graphql(
    `query($w: ID!) { workspaceWorkflows(workspaceId: $w, size: 500) { content { id name } } }`,
    { w: WORKSPACE },
  ).catch(() => ({ workspaceWorkflows: { content: [] } }));
  for (const old of workspaceWorkflows.content.filter((one) => one.name.startsWith('zz plugin picker'))) {
    await graphql(`mutation($id: ID!) { removeWorkflow(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
}

await finish(browser);
