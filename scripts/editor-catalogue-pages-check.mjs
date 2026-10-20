/**
 * The workflow editor's pickers hold every page of their catalogue.
 *
 * They held the first page alone - a hundred at most, the server's largest - so
 * a node pointing at an action past it opened on "Choose an action..." with its
 * parameters still under it, as though it pointed at nothing. Here the
 * workspace's action list is answered in two pages, and the node's own action
 * is on the second.
 */
import { BASE, WORKSPACE, WORKFLOW, open, record, selectNode, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });

// An action node of the workflow, and the action it points at.
const { workflowGraph } = await graphql(
  `query($w: ID!, $f: ID!) { workflowGraph(workspaceId: $w, workflowId: $f) { nodes { key name kind actionId } } }`,
  { w: WORKSPACE, f: WORKFLOW },
).catch(() => ({ workflowGraph: { nodes: [] } }));
const node = (workflowGraph?.nodes ?? []).find((one) => one.kind === 'ACTION' && one.actionId);
record(node !== undefined, `the workflow has an action node to open (${node?.name})`);

if (node !== undefined) {
  const asked = [];
  await page.route('**/graphql', async (route) => {
    const body = route.request().postDataJSON() ?? {};
    if (!(body.query ?? '').includes('workspaceActions(')) return route.continue();
    const wanted = body.variables?.page ?? 0;
    asked.push(wanted);
    // The whole list, answered as two pages with the node's action on the second.
    const answered = await route.fetch({ postData: JSON.stringify({ ...body, variables: { ...body.variables, page: 0, size: 100 } }) });
    const json = await answered.json();
    const all = json.data.workspaceActions.content;
    const theirs = all.filter((one) => one.id === node.actionId);
    const others = all.filter((one) => one.id !== node.actionId);
    const content = wanted === 0 ? others : theirs;
    return route.fulfill({
      json: { data: { workspaceActions: { ...json.data.workspaceActions, content, page: wanted, totalPages: 2, totalElements: all.length } } },
    });
  });

  await page.goto(`${BASE}/workspace/${WORKSPACE}/workflows/${WORKFLOW}/editor`, { waitUntil: 'domcontentloaded' });
  await page.locator('.react-flow__node').first().waitFor({ timeout: 20_000 }).catch(() => undefined);
  await page.waitForTimeout(1500);
  await selectNode(page, page.locator('.react-flow__node').filter({ hasText: node.name }).first(), node.name);
  await page.waitForTimeout(800);

  record(asked.includes(1), `the editor asks for the second page too (${JSON.stringify(asked)})`);
  const panel = await page.locator('aside, [class*="_panel_"]').filter({ hasText: 'Node Properties' }).first().innerText().catch(() => '');
  record(!panel.includes('Choose an action'), "the node's action is shown, not 'Choose an action...'");
}

await finish(browser);
