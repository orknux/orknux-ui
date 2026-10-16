/**
 * Creating a workflow opens its editor.
 *
 * A new workflow is an empty graph, and drawing it is the next thing anybody
 * does - but Create closed the dialog and left the list, so the new row had to
 * be found and opened. Duplicate already went straight to the editor; Create
 * does the same now.
 *
 * Makes a workflow and removes it.
 */
import { BASE, WORKSPACE, open, drawn, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });
const NAME = `zz create opens editor ${Date.now()}`;

try {
  await page.goto(`${BASE}/workspace/${WORKSPACE}`, { waitUntil: 'domcontentloaded' });
  record(await drawn(page, 'the workflows page'), 'the workflows page opens');
  await page.getByRole('button', { name: /Create Workflow/i }).first().click();
  await page.fill('#create-workflow-name', NAME);
  await page.getByRole('button', { name: 'Create', exact: true }).click();

  const arrived = await page
    .waitForURL(/\/workflows\/\d+\/editor$/, { timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  record(arrived, `creating it opens the editor (${page.url().replace(BASE, '')})`);
  const opened = /\/workflows\/(\d+)\/editor$/.exec(page.url())?.[1] ?? null;
  const graph = opened === null ? null : await graphql(
    `query($w: ID!, $f: ID!) { workflowGraph(workspaceId: $w, workflowId: $f) { name } }`,
    { w: WORKSPACE, f: opened },
  ).catch(() => null);
  record(graph?.workflowGraph?.name === NAME, `on the workflow just made (${graph?.workflowGraph?.name ?? null})`);
} finally {
  const { workspaceWorkflows } = await graphql(
    `query($w: ID!) { workspaceWorkflows(workspaceId: $w, size: 500) { content { id name } } }`,
    { w: WORKSPACE },
  ).catch(() => ({ workspaceWorkflows: { content: [] } }));
  for (const old of workspaceWorkflows.content.filter((one) => one.name.startsWith('zz create opens editor'))) {
    await graphql(`mutation($id: ID!) { removeWorkflow(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
}

await finish(browser);
