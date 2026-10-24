/**
 * The workspace's Search section on the administrator's copy of its settings.
 * Issue #510.
 *
 * The key is a secret field like every other: masked once stored, so the value
 * is nowhere in the page and nowhere in the query until somebody presses Show,
 * which fetches it through the recorded reveal. And it is part of the page's
 * draft: typing one marks the page unsaved, and Save Changes stores it.
 */
import { BASE, WORKSPACE, open, record, finish, chosenOption, chosenLabel } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1280, height: 1000 } });

/*
 * The fixture's workspace, as every other check uses, rather than whichever the
 * installation lists first: a sharded run hands each worker a workspace of its
 * own, and this writes to the one it is given.
 */
const workspaceId = WORKSPACE;

// What it holds now, so it can be put back exactly - its own key or a reference.
const before = (await graphql(
  'query ($id: ID!) { workspaceSearch(workspaceId: $id) { keySet apiKeyVariableId } }',
  { id: workspaceId },
)).workspaceSearch;
const original = before.keySet
  ? (await graphql('mutation ($id: ID!) { revealWorkspaceSearchKey(workspaceId: $id) }', { id: workspaceId })).revealWorkspaceSearchKey
  : null;

try {
  /* Set a key through the API, then reload and check the page masks it. */
  const secret = `zz-not-a-real-key-${Date.now()}`;
  await graphql(
    'mutation ($id: ID!, $k: String) { setWorkspaceSearch(workspaceId: $id, apiKey: $k) { keySet } }',
    { id: workspaceId, k: secret },
  );

  await page.goto(`${BASE}/admin/workspaces/${workspaceId}/settings`);
  await page.waitForLoadState('networkidle');

  const heading = page.locator('h2', { hasText: 'Search' }).first();
  record(await heading.isVisible().catch(() => false), 'the Search section is on the workspace settings page');

  const engine = page.locator('#search-engine');
  record(await engine.isVisible().catch(() => false), 'the engine can be chosen');
  const value = await chosenOption(page, engine).catch(() => '');
  const label = await chosenLabel(page, engine).catch(() => '');
  record(['tavily', 'brave'].includes(value) && label === value.charAt(0).toUpperCase() + value.slice(1), `the engine is stored as ${value} and named ${label}`);

  /*
   * The page has to have actually drawn the field before "the key is not in
   * it" means anything - a page that failed to load contains no key either,
   * and would pass this for the worst possible reason.
   */
  const drew = await page.locator('#search-key').isVisible().catch(() => false);
  record(drew && !(await page.content()).includes(secret), 'a stored key is masked: nowhere in the page until Show');

  const asked = await graphql(
    'query ($id: ID!) { workspaceSearch(workspaceId: $id) { engine keySet composeAnswer } }',
    { id: workspaceId },
  );
  record(asked.workspaceSearch.keySet === true && !JSON.stringify(asked).includes(secret), 'the query says a key is set and never answers with it');

  const section = page.locator('section', { has: page.locator('h2#search') });
  await section.getByRole('button', { name: 'Show API key' }).click().catch(() => undefined);
  await page.waitForTimeout(500);
  record(await page.locator('#search-key').inputValue().catch(() => '') === secret, 'Show reveals the stored key');
  record(await section.getByRole('button', { name: 'Save key' }).count() === 0, 'there is no Save key button of its own');

  /* Typed in on the page, the key waits for the page's Save Changes. */
  const typed = `zz-typed-${Date.now()}`;
  await page.locator('#search-key').fill(typed);
  const save = page.getByRole('button', { name: 'Save Changes' });
  record(await save.isEnabled(), 'typing a key enables Save Changes');
  await save.click();
  await page.getByText('Saved.').first().waitFor({ timeout: 15_000 }).catch(() => undefined);
  const stored = (await graphql('mutation ($id: ID!) { revealWorkspaceSearchKey(workspaceId: $id) }', { id: workspaceId })).revealWorkspaceSearchKey;
  record(stored === typed, 'Save Changes stores the typed key');
} finally {
  await graphql(
    'mutation ($id: ID!, $k: String, $v: ID) { setWorkspaceSearch(workspaceId: $id, apiKey: $k, apiKeyVariableId: $v) { keySet } }',
    before.apiKeyVariableId !== null ? { id: workspaceId, v: before.apiKeyVariableId } : { id: workspaceId, k: original ?? '' },
  ).catch((cause) => console.log(`the key could not be put back: ${cause}`));
}

await finish(browser);
