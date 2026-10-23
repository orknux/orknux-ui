/**
 * A part's Used by panel draws its dependency tree: what uses it branching out
 * to the left and what it uses to the right, a column per step, each part
 * followed once and met again as a marked box, a loop ended rather than
 * followed, and a box chosen opening its part.
 *
 * The page is a real model's; the graph it is handed is drawn here, because a
 * fixture's graph has no part reached two ways and no loop, and those are the
 * two things that make a graph not a tree.
 */
import { BASE, WORKSPACE, WORKFLOW, open, record, finish } from './suite/harness.mjs';

const { browser, context, page } = await open({ viewport: { width: 1500, height: 1000 } });

const { data } = await (
  await context.request.post(`${BASE}/graphql`, {
    data: { query: `query($workspaceId: ID!) { models(workspaceId: $workspaceId) { id name } }`, variables: { workspaceId: WORKSPACE } },
  })
).json();
const model = data?.models?.[0];
record(model !== undefined, `the fixture has a model to open (${model?.name})`);

const node = (kind, id, name) => ({ key: `${kind}:${id}`, kind, id: String(id), name, published: false, section: null });
const ROOT = node('MODEL', model.id, model.name);
const PROVIDER = node('MODEL_PROVIDER', 9001, 'Provider P');
const SECRET = node('VARIABLE', 9002, 'Key K');
const AGENT_A = node('AGENT', 9003, 'Agent A');
const AGENT_B = node('AGENT', 9004, 'Agent B');
const FLOW = node('WORKFLOW', 9005, 'Flow F');
const use = (from, to) => ({ from: from.key, to: to.key });
const GRAPH = {
  nodes: [ROOT, PROVIDER, SECRET, AGENT_A, AGENT_B, FLOW],
  edges: [
    use(ROOT, PROVIDER), // uses, two levels deep
    use(PROVIDER, SECRET),
    use(AGENT_A, ROOT), // used by two agents ...
    use(AGENT_B, ROOT),
    use(FLOW, AGENT_A), // ... which one workflow runs both of: Flow F is reached twice
    use(FLOW, AGENT_B),
    use(SECRET, AGENT_A), // and a loop: the key the model's provider reads leads to Agent A, which uses the model
  ],
};

let held = false;
await page.route('**/graphql', async (route) => {
  if (!(route.request().postDataJSON()?.query ?? '').includes('workspaceDependencyGraph')) return route.continue();
  // Held back a moment the first time, so the wait is visible.
  if (!held) await new Promise((done) => setTimeout(done, 1500));
  held = true;
  return route.fulfill({ json: { data: { workspaceDependencyGraph: GRAPH } } });
});

await page.goto(`${BASE}/workspace/${WORKSPACE}/models/${model.id}`, { waitUntil: 'domcontentloaded' });
const button = page.locator('[data-dependency-tree-open]');
await button.waitFor({ timeout: 30_000 });
record(await button.isVisible(), 'the Used by panel offers the dependency tree');

await button.click();
const dialog = page.getByTestId('dependency-tree-dialog');
await page.waitForTimeout(300);
record(await dialog.getByTestId('dependency-tree-loading').locator('[role="status"]').isVisible().catch(() => false), 'while it is fetched, the loader is drawn at once');

await dialog.getByTestId('dependency-tree').waitFor({ timeout: 30_000 });
await page.waitForTimeout(800);
record((await dialog.locator('[data-tree-side="root"]').innerText()).includes(model.name), 'the part is in the middle of its tree');
const boxes = await dialog.locator('[data-tree-name]').evaluateAll((items) =>
  items.map((item) => {
    const box = item.getBoundingClientRect();
    return { name: item.dataset.treeName, side: item.dataset.treeSide, repeat: item.dataset.treeRepeat !== undefined, x: box.x, y: box.y, w: box.width, h: box.height };
  }),
);
const middle = boxes.find((box) => box.side === 'root');
const step = Math.min(...boxes.filter((box) => box.side !== 'root').map((box) => Math.abs(box.x - middle.x)));
/** The boxes of one side, as "depth name" sorted, a repeat starred. */
const levels = (side) =>
  boxes
    .filter((box) => box.side === side)
    .map((box) => `${Math.round(Math.abs(box.x - middle.x) / step)} ${box.name}${box.repeat ? '*' : ''}`)
    .sort();
const right = levels('uses');
record(
  JSON.stringify(right) === JSON.stringify(['1 Provider P', '2 Key K', '3 Agent A', `4 ${model.name}*`]),
  `what it uses branches out to the right, a column per step (${right.join(' | ')})`,
);
const left = levels('used-by');
record(
  JSON.stringify(left) === JSON.stringify(['1 Agent A', '1 Agent B', '2 Flow F', '2 Flow F*', '2 Key K', '3 Provider P', `4 ${model.name}*`]),
  `what uses it branches out to the left, a part met again a marked box (${left.join(' | ')})`,
);
record(
  boxes.filter((box) => box.side === 'uses').every((box) => box.x > middle.x) &&
    boxes.filter((box) => box.side === 'used-by').every((box) => box.x < middle.x),
  'used by on the left of the part, uses on the right',
);
const lines = await dialog.locator('.react-flow__edge-path').count();
record(lines === boxes.length - 1, `a tree: one line into every box but the part (${lines} lines, ${boxes.length} boxes)`);
const overlap = boxes.some((one, i) =>
  boxes.some((two, j) => j > i && one.x < two.x + two.w - 1 && two.x < one.x + one.w - 1 && one.y < two.y + two.h - 1 && two.y < one.y + one.h - 1),
);
record(!overlap, 'no two boxes overlap');

await dialog.locator('[data-tree-name="Provider P"]').first().click();
const href = await dialog.getByTestId('dependency-tree-selection').getByRole('link').getAttribute('href');
record(href === `/workspace/${WORKSPACE}/models/providers/9001`, `a box chosen opens its part (${href})`);

// Show graph: the chosen part becomes the middle of its own graph.
await dialog.getByTestId('dependency-tree-follow').click();
await page.waitForTimeout(800);
record((await dialog.locator('[data-tree-side="root"]').innerText()).includes('Provider P'), 'Show graph draws the chosen part in the middle');

// Dragged bigger from its corner, the canvas grows with it.
const before = await dialog.getByTestId('dependency-tree').boundingBox();
const corner = await dialog.locator('[data-edge="se"]').boundingBox();
await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2);
await page.mouse.down();
await page.mouse.move(corner.x + 120, corner.y + 60, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(300);
const after = await dialog.getByTestId('dependency-tree').boundingBox();
record(after.width > before.width + 50 && after.height > before.height + 20, `dragging the corner makes it bigger (${Math.round(before.width)}x${Math.round(before.height)} to ${Math.round(after.width)}x${Math.round(after.height)})`);

await page.screenshot({ path: '/tmp/dependency-tree.png' });
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
record(!(await dialog.isVisible()), 'Escape closes it');

// A workflow's own settings page says what uses it, with the same way into the graph.
await page.unroute('**/graphql');
await page.goto(`${BASE}/workspace/${WORKSPACE}/workflows/${WORKFLOW}/settings`, { waitUntil: 'domcontentloaded' });
await page.locator('section[aria-label="Used by"]').waitFor({ timeout: 30_000 });
record(await page.locator('[data-dependency-tree-open]').isVisible(), "a workflow's settings page has Used by, with its dependency graph");

await finish(browser);
