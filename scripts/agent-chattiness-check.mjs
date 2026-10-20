/**
 * How much an agent says while it works is chosen on its page, and a workflow
 * node can choose otherwise for itself.
 */
import { BASE, WORKSPACE, WORKFLOW, open, record, selectNode, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });

const { workspaceAgents } = await graphql(
  'query($w: ID!) { workspaceAgents(workspaceId: $w, page: 0, size: 1) { content { id chattiness } } }',
  { w: WORKSPACE },
);
const agent = workspaceAgents.content[0];
const was = agent.chattiness;
const read = async () => (await graphql('query($id: ID!) { agent(id: $id) { chattiness } }', { id: agent.id })).agent.chattiness;

await page.goto(`${BASE}/workspace/${WORKSPACE}/agents/${agent.id}/settings`, { waitUntil: 'domcontentloaded' });
const level = page.locator('#agent-chattiness-level');
await level.waitFor({ timeout: 20_000 });
record((await level.inputValue()) === was, `the agent page shows its level (${was})`);
// Beside its name, not across the form from it.
const gap = await page.evaluate(() => {
  const label = document.querySelector('label[for="agent-chattiness-level"]')?.getBoundingClientRect();
  const box = document.querySelector('#agent-chattiness-level')?.getBoundingClientRect();
  return label && box ? Math.round(box.left - label.right) : null;
});
record(gap !== null && gap < 80, `the choice sits beside its name (${gap}px after it)`);
const other = was === 'NONE' ? 'HIGH' : 'NONE';
try {
  await level.selectOption(other);
  await page.getByRole('button', { name: 'Save Changes' }).first().click();
  await page.waitForTimeout(1500);
  record((await read()) === other, `chosen and saved, the agent keeps it (${await read()})`);
} finally {
  await level.selectOption(was).catch(() => undefined);
  await page.getByRole('button', { name: 'Save Changes' }).first().click().catch(() => undefined);
  await page.waitForTimeout(1500);
}
record((await read()) === was, 'and it is put back');

// The node's own choice.
const nodes = async () => (await graphql(
  'query($w: ID!, $f: ID!) { workflowGraph(workspaceId: $w, workflowId: $f) { nodes { key name kind mappings { name expression } } } }',
  { w: WORKSPACE, f: WORKFLOW },
)).workflowGraph.nodes;
const node = (await nodes()).find((one) => one.kind === 'AGENT');
if (node !== undefined) {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/workflows/${WORKFLOW}/editor`, { waitUntil: 'domcontentloaded' });
  await page.locator('.react-flow__node').first().waitFor({ timeout: 20_000 }).catch(() => undefined);
  await selectNode(page, page.locator('.react-flow__node').filter({ hasText: node.name }).first(), node.name);
  const choice = page.locator('[data-node-chattiness]');
  await choice.waitFor({ timeout: 10_000 }).catch(() => undefined);
  record((await choice.count()) === 1, 'the agent node offers its own level');
  record((await page.locator('[data-mapping-name="chattiness"]').count()) === 0, 'and not as a raw parameter row as well');
  try {
    await choice.selectOption('HIGH');
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(2000);
    const saved = (await nodes()).find((one) => one.key === node.key);
    const held = saved?.mappings.find((one) => one.name === 'chattiness')?.expression;
    record(held === 'HIGH', `saved, the node holds it (${held})`);
  } finally {
    await choice.selectOption('').catch(() => undefined);
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(2000);
  }
  const back = (await nodes()).find((one) => one.key === node.key);
  record(!back?.mappings.some((one) => one.name === 'chattiness'), 'and set back to the agent\'s, it holds none');
}

await finish(browser);
