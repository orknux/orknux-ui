/**
 * The workspace's Search section. Issue #510.
 *
 * What is pinned is the part that would be a security fault rather than a
 * cosmetic one: the key is write-only. The server answers whether one is set
 * and never what it is, so no request this page makes may ever carry the value
 * back - and a page that drew it into an input would undo the point of
 * encrypting the column.
 */
import { BASE, WORKSPACE, open, record, finish, chosenOption } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1280, height: 1000 } });

/*
 * The fixture's workspace, as every other check uses, rather than whichever the
 * installation lists first: a sharded run hands each worker a workspace of its
 * own, and this writes to the one it is given.
 */
const workspaceId = WORKSPACE;

/*
 * The key is write-only, so one already set cannot be put back once this has
 * written its own and cleared it. Somebody's real key is not a fixture: where
 * there is one, only the half that reads is run, and it says so.
 */
const before = await graphql('query ($id: ID!) { workspaceSearch(workspaceId: $id) { keySet } }', { id: workspaceId });
const keyWasSet = before.workspaceSearch.keySet === true;

await page.goto(`${BASE}/admin/workspaces/${workspaceId}/settings`);
await page.waitForLoadState('networkidle');

const section = page.locator('h2', { hasText: 'Search' }).first();
record(await section.isVisible().catch(() => false), 'the Search section is on the workspace settings page');

const engine = page.locator('#search-engine');
record(await engine.isVisible().catch(() => false), 'the engine can be chosen');
record((await chosenOption(page, engine).catch(() => '')) === 'tavily', 'and tavily is the one it starts on');

if (keyWasSet) {
  console.log(`NOTE: workspace ${workspaceId} already holds a search key, which this will not overwrite; the write half is not run`);
  record(await page.locator('text=A key is set').first().isVisible().catch(() => false), 'the page says a key is set');
  await finish(browser);
}

/* Set a key through the API, then reload and check the page never shows it. */
const secret = `zz-not-a-real-key-${Date.now()}`;
await graphql(
  'mutation ($id: ID!, $k: String) { setWorkspaceSearch(workspaceId: $id, apiKey: $k) { keySet } }',
  { id: workspaceId, k: secret },
);

await page.reload();
await page.waitForLoadState('networkidle');

const shown = await page.content();
/*
 * The page has to have actually drawn the section before "the key is not in
 * it" means anything - a page that failed to load contains no key either, and
 * would pass this for the worst possible reason.
 */
const drew = await page.locator('#search-engine').isVisible().catch(() => false);
record(drew, 'the section is drawn before the key is looked for');
record(drew && !shown.includes(secret), 'the key is nowhere in the page after it is set');
record(
  await page.locator('text=A key is set').first().isVisible().catch(() => false),
  'and the page says one is set instead',
);

/* And the query itself will not answer with it, whatever a caller asks for. */
const asked = await graphql(
  'query ($id: ID!) { workspaceSearch(workspaceId: $id) { engine keySet composeAnswer } }',
  { id: workspaceId },
);
record(asked.workspaceSearch.keySet === true, 'the api reports a key is set');
record(!JSON.stringify(asked).includes(secret), 'and the api never returns the key itself');

await graphql('mutation ($id: ID!) { setWorkspaceSearch(workspaceId: $id, apiKey: "") { keySet } }', { id: workspaceId });

await finish(browser);
