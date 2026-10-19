/**
 * A run's step says what it was handed for its parameters - an agent's prompt,
 * an action's arguments - above its input, which is only what the run carried.
 *
 * Read off a real run of the workspace, with the server's own answer; the run
 * is the newest whose steps were handed anything.
 */
import { BASE, WORKSPACE, open, record, selectNode, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });

const { workspaceExecutions } = await graphql(
  `query($w: ID!) { workspaceExecutions(workspaceId: $w, page: 0, size: 25) { content { id } } }`,
  { w: WORKSPACE },
).catch(() => ({ workspaceExecutions: { content: [] } }));

let run = null;
for (const { id } of workspaceExecutions?.content ?? []) {
  const { execution } = await graphql(`query($id: ID!) { execution(id: $id) { id steps { key name } parameters { nodeKey name value } } }`, { id })
    .catch(() => ({ execution: null }));
  const handed = execution?.parameters?.find((one) => one.value !== '');
  if (handed) {
    run = { id, step: execution.steps.find((step) => step.key === handed.nodeKey), parameter: handed };
    break;
  }
}
record(run !== null, `a run whose steps were handed parameters (${run?.id} / ${run?.step?.name} / ${run?.parameter?.name})`);

if (run !== null) {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/executions/${run.id}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.react-flow__node').first().waitFor({ timeout: 20_000 }).catch(() => undefined);
  const node = page.locator('.react-flow__node').filter({ hasText: run.step.name }).first();
  await selectNode(page, node, run.step.name);
  const section = page.locator('[data-step-parameters]');
  await section.waitFor({ timeout: 10_000 }).catch(() => undefined);
  const said = await section.innerText().catch(() => '');
  record(said.includes(run.parameter.name), `the step's panel lists its parameters (${JSON.stringify(said.slice(0, 120))})`);
  record(said.includes(run.parameter.value.slice(0, 40)), 'with what each came to');
  const order = await page.evaluate(() => {
    const parameters = document.querySelector('[data-step-parameters]');
    const input = document.querySelector('#run-step-input');
    return parameters && input ? Boolean(parameters.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING) : null;
  });
  record(order === true, 'above the input, which is only what the run was carrying');
}

await finish(browser);
