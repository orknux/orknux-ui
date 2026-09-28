/**
 * Text to speech, from the editor's Add menu, gives a node that speaks.
 *
 * Reported: pressing it just made an Action node. A workflow speaks through an
 * Action whose subtype is Speak, and the button pointed the node at the
 * workspace's Speak action only where one existed - otherwise it added a bare
 * node titled Action and left the rest to whoever pressed it. It makes a Speak
 * action where there is none now, and names the node Text to speech.
 *
 * The workflow is its own and removed afterwards; a Speak action this check
 * had to make is removed too.
 */
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });
const PREFIX = 'zzSpeechNode';

const speakActions = async () =>
  (await graphql(`query($w: ID!) { workspaceActions(workspaceId: $w, page: 0, size: 500) { content { id name subtype } } }`, { w: WORKSPACE }))
    .workspaceActions.content.filter((one) => one.subtype === 'SPEAK');
const sweep = async () => {
  const { workspaceWorkflows } = await graphql(
    `query($w: ID!) { workspaceWorkflows(workspaceId: $w, size: 200) { content { id name } } }`,
    { w: WORKSPACE },
  );
  for (const old of workspaceWorkflows.content.filter((one) => one.name.startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { removeWorkflow(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
};
await sweep();

const before = new Set((await speakActions()).map((one) => one.id));
const made = await graphql(`mutation($input: CreateWorkflowInput!) { createWorkflow(input: $input) { workflowId } }`, {
  input: { workspaceId: WORKSPACE, name: `${PREFIX} ${Date.now()}` },
});
const WORKFLOW = made.createWorkflow.workflowId;

await page.goto(`${BASE}/workspace/${WORKSPACE}/workflows/${WORKFLOW}/editor`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the editor'), 'the editor is on screen');
await page.getByRole('button', { name: /^Add node/ }).click();
await page.getByRole('menuitem', { name: 'Text to speech', exact: true }).click();

const node = page.locator('.react-flow__node', { hasText: 'Text to speech' });
record(await node.first().waitFor({ timeout: 10_000 }).then(() => true).catch(() => false), 'a node named Text to speech is on the canvas');

const after = await speakActions();
record(after.length > 0, `and there is a Speak action for it to run (${after.map((one) => one.name).join(', ') || 'none'})`);

/* Saved, the node points at that action. */
await page.keyboard.press('Control+s');
await page.waitForTimeout(1500);
const graph = await graphql(`query($w: ID!, $f: ID!) { workflowGraph(workspaceId: $w, workflowId: $f) { nodes { name kind actionId } } }`, {
  w: WORKSPACE,
  f: WORKFLOW,
}).catch(() => null);
const saved = graph?.workflowGraph?.nodes?.find((one) => one.name === 'Text to speech') ?? null;
record(
  saved !== null && saved.kind === 'ACTION' && after.some((one) => one.id === saved.actionId),
  `saved, it is an Action node on the Speak action (${JSON.stringify(saved)})`,
);

await sweep();
for (const one of after.filter((action) => !before.has(action.id))) {
  await graphql(`mutation($id: ID!) { deleteAction(id: $id) }`, { id: one.id }).catch(() => undefined);
}
await finish(browser);
