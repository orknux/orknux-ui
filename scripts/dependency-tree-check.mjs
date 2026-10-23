/**
 * A part's Used by panel opens its dependency tree: what it uses followed down
 * and what uses it followed up, each part drawn once and met again marked as
 * shown above, a loop ended rather than followed, a branch folding away, and
 * every row opening its part.
 *
 * The page is a real model's; the graph it is handed is drawn here, because a
 * fixture's graph has no part reached two ways and no loop, and those are the
 * two things that make a graph not a tree.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

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

await dialog.getByTestId('dependency-tree-root').waitFor({ timeout: 30_000 });
record((await dialog.getByTestId('dependency-tree-root').innerText()).includes(model.name), 'the part is at the top');

const rows = async (side) =>
  dialog.locator(`[data-tree-side="${side}"] [data-tree-name]`).evaluateAll((items) =>
    items.map((item) => {
      let depth = 0;
      for (let at = item.parentElement; at !== null && at.getAttribute('role') !== 'tree'; at = at.parentElement) {
        if (at.getAttribute('role') === 'group') depth += 1;
      }
      return `${'  '.repeat(depth)}${item.dataset.treeName}${item.dataset.treeRepeat !== undefined ? ' (shown above)' : ''}`;
    }),
  );

const uses = await rows('uses');
record(
  JSON.stringify(uses) === JSON.stringify(['Provider P', '  Key K', '    Agent A', `      ${model.name} (shown above)`]),
  `uses: followed down to the end, nesting by step (${uses.join(' | ')})`,
);
const usedBy = await rows('used-by');
record(
  JSON.stringify(usedBy) ===
    JSON.stringify(['Agent A', '  Flow F', '  Key K', '    Provider P', `      ${model.name} (shown above)`, 'Agent B', '  Flow F (shown above)']),
  `used by: a part reached twice is followed once and marked the second time (${usedBy.join(' | ')})`,
);
record(
  uses.concat(usedBy).filter((row) => row.trim().startsWith(model.name)).every((row) => row.endsWith('(shown above)')),
  'a loop back to the part is named and not followed into it again',
);

// A branch folds away and opens again.
const item = dialog.locator('[data-tree-side="uses"] [role="treeitem"][aria-expanded]').first();
await item.locator('button').first().click();
record((await item.getAttribute('aria-expanded')) === 'false' && (await rows('uses')).length === 1, 'a branch folds away');
await item.locator('button').first().click();
record((await rows('uses')).length === 4, 'and opens again');

const href = await dialog.locator('[data-tree-name="Provider P"] a').first().getAttribute('href');
record(href === `/workspace/${WORKSPACE}/models/providers/9001`, `a row opens its part (${href})`);

await page.screenshot({ path: '/tmp/dependency-tree.png' });
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
record(!(await dialog.isVisible()), 'Escape closes it');

await finish(browser);
