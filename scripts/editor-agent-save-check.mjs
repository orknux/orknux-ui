/**
 * An agent edited in the panel beside the workflow canvas is saved by the
 * editor's own Save.
 *
 * Reported: renamed in Agent Settings and the workflow saved, the agent kept
 * its old name everywhere else - the panel's edit was never sent, because the
 * Save pressed was the workflow's, and the panel has a Save of its own at its
 * foot. Now the editor's Save sends both, and the node's picker names the
 * agent by its new name.
 */
import { BASE, WORKSPACE, open, record, drawn, finish, selectNode } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 1000 } });
const stamp = Date.now();
const NAME = `zzPanelAgent ${stamp}`;
const RENAMED = `zzPanelAgent renamed ${stamp}`;

const agent = (
  await graphql(`mutation($input: CreateAgentInput!) { createAgent(input: $input) { id } }`, {
    input: { workspaceId: WORKSPACE, name: NAME, type: 'LLM' },
  })
).createAgent;
const workflow = (
  await graphql(`mutation($input: CreateWorkflowInput!) { createWorkflow(input: $input) { workflowId } }`, {
    input: { workspaceId: WORKSPACE, name: `zzPanelAgentFlow ${stamp}` },
  })
).createWorkflow.workflowId;

try {
  await graphql(
    `mutation($w: ID!, $f: ID!, $input: WorkflowGraphInput!) { saveWorkflowGraph(workspaceId: $w, workflowId: $f, input: $input) { workflowId } }`,
    { w: WORKSPACE, f: workflow, input: { nodes: [{ key: 'ask', kind: 'AGENT', name: 'Asks', x: 0, y: 0, agentId: agent.id, mappings: [] }], edges: [] } },
  );

  await page.goto(`${BASE}/workspace/${WORKSPACE}/workflows/${workflow}/editor`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.react-flow__node', { timeout: 30_000 });
  await drawn(page, 'the editor', { within: 30_000, still: 0 });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(800);

  await selectNode(page, page.locator('.react-flow__node', { hasText: 'Asks' }).first(), 'Asks');
  await page.getByRole('link', { name: "Open the agent's definition" }).click();
  const name = page.locator('#agent-name');
  await name.waitFor({ timeout: 10_000 });
  await name.fill(RENAMED);

  // The editor's Save, not the panel's.
  await page.keyboard.press('Control+s');
  await page.waitForTimeout(2500);

  const { agent: saved } = await graphql('query ($id: ID!) { agent(id: $id) { name } }', { id: agent.id });
  record(saved?.name === RENAMED, `the editor's Save saved the agent open beside it (${saved?.name})`);
  const picker = ((await page.locator('#node-agent').textContent().catch(() => '')) ?? '').trim();
  record(picker.includes(RENAMED), `and the node names it by its new name (${picker})`);
} finally {
  await graphql('mutation($id: ID!) { removeWorkflow(id: $id) }', { id: workflow }).catch(() => undefined);
  await graphql('mutation($id: ID!) { deleteAgent(id: $id) }', { id: agent.id }).catch(() => undefined);
}

await finish(browser);
