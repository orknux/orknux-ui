/**
 * An agent node offers "Send messages as they are written", on by default, and
 * saving it off is what the server keeps.
 *
 * What an agent wrote beside its tool calls reached the reply node after it only
 * when the step ended. On, each message is handed on as it is written; off, the
 * agent finishes before anything after it runs.
 */
import { BASE, WORKSPACE, WORKFLOW, open, record, selectNode, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });

const read = async () =>
  (await graphql(
    'query($w: ID!, $f: ID!) { workflowGraph(workspaceId: $w, workflowId: $f) { nodes { key name kind streamOutput } } }',
    { w: WORKSPACE, f: WORKFLOW },
  )).workflowGraph.nodes;
const node = (await read()).find((one) => one.kind === 'AGENT');
record(node !== undefined, `the workflow has an agent node (${node?.name})`);

if (node !== undefined) {
  record(node.streamOutput === true, 'it streams unless told otherwise');
  await page.goto(`${BASE}/workspace/${WORKSPACE}/workflows/${WORKFLOW}/editor`, { waitUntil: 'domcontentloaded' });
  await page.locator('.react-flow__node').first().waitFor({ timeout: 20_000 }).catch(() => undefined);
  await selectNode(page, page.locator('.react-flow__node').filter({ hasText: node.name }).first(), node.name);
  const box = page.locator('[data-stream-output]');
  await box.waitFor({ timeout: 10_000 }).catch(() => undefined);
  record((await box.count()) === 1, 'the agent panel offers the switch');
  record(await box.isChecked().catch(() => false), 'ticked, as the node is');

  try {
    await box.uncheck();
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(2000);
    const saved = (await read()).find((one) => one.key === node.key);
    record(saved?.streamOutput === false, `unticked and saved, the server keeps it off (${saved?.streamOutput})`);
  } finally {
    await box.check().catch(() => undefined);
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(2000);
  }
  const back = (await read()).find((one) => one.key === node.key);
  record(back?.streamOutput === true, 'and it is put back as it was');
}

await finish(browser);
