/**
 * A part's Used by panel offers its dependency graph: a dialog drawing that
 * part and its chain - what uses it and what it uses, on down both ways -
 * and nothing outside it, with the part chosen and a link that opens it.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, context, page } = await open({ viewport: { width: 1500, height: 1000 } });

async function gql(query, variables = {}) {
  const response = await context.request.post(`${BASE}/graphql`, { data: { query, variables } });
  const body = await response.json();
  if (body.errors !== undefined) throw new Error(JSON.stringify(body.errors));
  return body.data;
}

const { workspaceDependencyGraph: graph } = await gql(
  `query($workspaceId: ID!) { workspaceDependencyGraph(workspaceId: $workspaceId) { nodes { key kind id name } edges { from to } } }`,
  { workspaceId: WORKSPACE },
);
// A model something uses: its chain reaches past it both ways, and it is not the whole workspace.
const model = graph.nodes.find((node) => node.kind === 'MODEL' && graph.edges.some((edge) => edge.to === node.key));
record(model !== undefined, `the fixture has a model something uses (${model?.name})`);

const chain = new Set([model.key]);
for (const forward of [true, false]) {
  const queue = [model.key];
  while (queue.length > 0) {
    const at = queue.pop();
    for (const edge of graph.edges) {
      const [from, to] = forward ? [edge.from, edge.to] : [edge.to, edge.from];
      if (from === at && !chain.has(to)) {
        chain.add(to);
        queue.push(to);
      }
    }
  }
}

await page.goto(`${BASE}/workspace/${WORKSPACE}/models/${model.id}`, { waitUntil: 'domcontentloaded' });
const button = page.locator('[data-dependency-graph-open]');
await button.waitFor({ timeout: 30_000 });
record(await button.isVisible(), 'the Used by panel offers the dependency graph');

await button.click();
const dialog = page.getByTestId('dependency-graph-dialog');
await dialog.getByTestId('dependency-graph').waitFor({ timeout: 30_000 });
await page.waitForTimeout(1500);

const drawn = await dialog.locator('[data-part-name]').count();
record(drawn === chain.size, `it draws the part's chain and nothing else (${drawn} boxes, chain of ${chain.size})`);
record(drawn < graph.nodes.length, `which is less than the workspace (${graph.nodes.length})`);
const lines = await dialog.locator('.react-flow__edge-path').count();
record(lines > 0, `with what uses what as lines (${lines})`);

// No line runs behind a box: two ends on one row never have a third box between them.
const boxes = new Map();
for (const part of await dialog.locator('[data-part-name]').all()) {
  boxes.set(await part.getAttribute('data-part-name'), await part.boundingBox());
}
const nameOf = new Map(graph.nodes.map((node) => [node.key, node.name]));
const hidden = graph.edges
  .filter((edge) => chain.has(edge.from) && chain.has(edge.to))
  .filter((edge) => {
    const [a, b] = [boxes.get(nameOf.get(edge.from)), boxes.get(nameOf.get(edge.to))];
    if (a === undefined || b === undefined || Math.abs(a.y - b.y) > 1) return false;
    const [left, right] = [Math.min(a.x, b.x), Math.max(a.x, b.x)];
    return [...boxes.values()].some((box) => box !== a && box !== b && Math.abs(box.y - a.y) <= 1 && box.x > left && box.x < right);
  });
record(hidden.length === 0, `no line runs behind another box (${hidden.map((edge) => `${nameOf.get(edge.from)} -> ${nameOf.get(edge.to)}`).join(', ') || 'none'})`);
const focusBox = boxes.get(model.name);
const users = graph.edges.filter((edge) => edge.to === model.key).map((edge) => boxes.get(nameOf.get(edge.from)));
record(users.every((box) => box.x < focusBox.x), 'what uses it stands to its left');

const selection = dialog.getByTestId('dependency-selection');
record((await selection.innerText()).includes(model.name), 'the part itself is the one chosen');
const href = await selection.getByRole('link').getAttribute('href');
record(href === `/workspace/${WORKSPACE}/models/${model.id}`, `with a link that opens it (${href})`);

await page.screenshot({ path: '/tmp/used-by-graph.png' });
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
record(!(await dialog.isVisible()), 'Escape closes it');

await finish(browser);
