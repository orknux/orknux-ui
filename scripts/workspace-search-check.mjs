/**
 * A workspace's web search is set on its own Settings page, not only on the
 * administrator's copy of it: Research and the search tools read it, and the
 * person running the workspace is the one who goes looking. The side menu's
 * search finds it, and the engine and key are there to be set.
 *
 * The key is a secret field like every other: the shared Show control and the
 * Value / Reference tabs, no "Save key" button of its own, and typing one marks
 * the page unsaved until the page's Save Changes stores it.
 */
import { BASE, WORKSPACE, open, record, finish, chosenLabel } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

// What the workspace searches with now, so the check can put it back as it found it.
const before = (await graphql(
  'query ($w: ID!) { workspaceSearch(workspaceId: $w) { keySet apiKeyVariableId } }',
  { w: WORKSPACE },
)).workspaceSearch;
const original = before.keySet
  ? (await graphql('mutation ($w: ID!) { revealWorkspaceSearchKey(workspaceId: $w) }', { w: WORKSPACE })).revealWorkspaceSearchKey
  : null;

try {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/settings`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('section-menu').waitFor({ timeout: 30_000 }).catch(() => undefined);
  await page.locator('h2#search').waitFor({ timeout: 20_000 }).catch(() => undefined);

  const entries = await page.getByTestId('section-menu').locator('a, button').allInnerTexts().catch(() => []);
  record(entries.map((one) => one.trim()).includes('Search'), `the side menu lists Search (${entries.map((one) => one.trim()).join(', ')})`);

  await page.getByPlaceholder('Search settings…').fill('sear');
  await page.waitForTimeout(400);
  const found = await page.evaluate(() => {
    const heading = document.querySelector('h2#search');
    const box = heading?.getBoundingClientRect();
    return { shown: heading !== null && box !== undefined && box.height > 0, nothing: document.body.innerText.includes('No setting matches.') };
  });
  record(found.shown && !found.nothing, `searching "sear" keeps the Search section on the page (${JSON.stringify(found)})`);

  await page.getByPlaceholder('Search settings…').fill('');
  const section = page.locator('section', { has: page.locator('h2#search') });
  record(await page.locator('#search-engine').count() === 1, 'the section offers the search engine');

  const engineLabel = await chosenLabel(page, page.locator('#search-engine')).catch(() => '');
  record(['Tavily', 'Brave'].includes(engineLabel), `the engine is named with a capital (${engineLabel})`);

  const tabs = section.getByRole('tablist', { name: 'Where the API key comes from' });
  record(await tabs.getByRole('tab', { name: 'Reference' }).count() === 1, 'the key offers to be read from a workspace secret');
  record(await section.getByRole('button', { name: 'Save key' }).count() === 0, 'there is no Save key button of its own');

  // Its own value, typed in.
  if (before.apiKeyVariableId !== null) await tabs.getByRole('tab', { name: 'Value' }).click();
  const typed = `tvly-check-${Date.now()}`;
  await page.locator('#search-key').fill(typed);
  record(await section.getByRole('button', { name: 'Show API key' }).count() === 1, 'the key field has the shared Show control');

  const save = page.getByRole('button', { name: 'Save Changes' });
  const unsaved = await page.getByText('Not saved yet.').count();
  record(unsaved > 0 && await save.isEnabled(), `typing a key marks the page unsaved (note ${unsaved}, Save enabled ${await save.isEnabled()})`);

  await save.click();
  await page.getByText('Saved.').first().waitFor({ timeout: 15_000 }).catch(() => undefined);
  const stored = (await graphql('mutation ($w: ID!) { revealWorkspaceSearchKey(workspaceId: $w) }', { w: WORKSPACE })).revealWorkspaceSearchKey;
  record(stored === typed, `Save Changes stores the key (${stored === typed ? 'the typed key' : stored})`);

  // Back on the page it is masked, and Show fetches it.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('#search-key').waitFor({ timeout: 20_000 }).catch(() => undefined);
  const masked = await page.locator('#search-key').inputValue().catch(() => '');
  await section.getByRole('button', { name: 'Show API key' }).click().catch(() => undefined);
  await page.waitForTimeout(500);
  const shown = await page.locator('#search-key').inputValue().catch(() => '');
  record(masked !== typed && shown === typed, `a stored key is masked and Show reveals it (masked ${masked !== typed}, shown ${shown === typed})`);
} finally {
  await graphql(
    'mutation ($w: ID!, $k: String, $v: ID) { setWorkspaceSearch(workspaceId: $w, apiKey: $k, apiKeyVariableId: $v) { keySet } }',
    before.apiKeyVariableId !== null ? { w: WORKSPACE, v: before.apiKeyVariableId } : { w: WORKSPACE, k: original ?? '' },
  ).catch((cause) => console.log(`the key could not be put back: ${cause}`));
}

await finish(browser);
