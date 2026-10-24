/**
 * The skills page's search reads every catalogue, not the one that is open.
 *
 * Reported on 1.2.0: with the workspace's own catalogue open, "github" answered
 * "Nothing here matches that" while github_plugin held skills that matched -
 * the box lived inside the catalogue's panel and searched only that one. Now
 * it is one box at the top of the catalogue column, and while something is
 * typed the panel shows the matches in every catalogue, grouped under each
 * one's name; the column counts each catalogue's matches and dims the ones
 * with none; choosing a catalogue narrows to it; clearing the box goes back to
 * the catalogue that was open.
 *
 * Everything is stubbed - two workspace catalogues and a plugin's - so the
 * answer does not depend on what a fixture or a loaded plugin holds.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1400, height: 900 } });

const catalog = (id, name, skillCount) => ({ id, workspaceId: WORKSPACE, name, skillCount, createdAt: '2026-10-24T00:00:00Z', createdBy: 'alice' });
/** Open on this one; nothing in it is about GitHub. */
const OPEN = catalog('990301', 'Global search open', 1);
/** Another of the workspace's own, holding one match. */
const OTHER = catalog('990302', 'Global search other', 2);

const skill = (id, catalogId, name, description, content) => ({
  id,
  workspaceId: WORKSPACE,
  catalogId,
  name,
  key: name.toLowerCase().replace(/ /g, '_'),
  description,
  content,
  enabled: true,
  lastModifiedAt: '2026-10-24T00:00:00Z',
  lastModifiedBy: 'alice',
});
const SKILLS = [
  skill('990311', OPEN.id, 'Kettle descaling', 'Vinegar, then rinse twice.', '# Kettle\n\nNothing about source control.'),
  skill('990312', OTHER.id, 'Review a pull request', 'Before approving one on GitHub.', '# Review\n\nRead the diff first.'),
  skill('990313', OTHER.id, 'Release notes', 'What a changelog entry says.', '# Notes\n\nWritten before the tag.'),
];

const PLUGIN = {
  name: 'global_search_plugin',
  key: 'global_search',
  plugin: 'Global Search',
  skills: [
    { name: 'Open an issue', key: 'open_an_issue', description: 'Files one with the github API.', content: '# Issues' },
    { name: 'Weather', key: 'weather', description: 'Asks what it is like outside.', content: '# Weather' },
  ],
};

await page.route('**/graphql', async (route) => {
  const body = route.request().postDataJSON() ?? {};
  const query = body.query ?? '';
  if (query.includes('pluginSkillCatalogs')) return route.fulfill({ json: { data: { pluginSkillCatalogs: [PLUGIN] } } });
  if (query.includes('skillCatalogs(')) return route.fulfill({ json: { data: { skillCatalogs: [OPEN, OTHER] } } });
  if (query.includes('workspaceSkills(')) {
    // A catalogue when one is named, and the whole workspace when none is - which is what a search reads.
    const wanted = body.variables?.catalogId ?? null;
    const content = SKILLS.filter((one) => wanted === null || one.catalogId === wanted);
    return route.fulfill({
      json: { data: { workspaceSkills: { content, page: 0, size: 100, totalElements: content.length, totalPages: 1 } } },
    });
  }
  return route.continue();
});

const box = page.locator('[data-skill-search]');
const heading = () => page.locator('h1').first().innerText();
const cards = (within = '') =>
  page.locator(`${within} [data-skill-card]`.trim()).evaluateAll((items) => items.map((item) => item.dataset.skillCard));
const groups = () =>
  page.locator('[data-search-group]').evaluateAll((items) => items.map((item) => item.dataset.searchGroup));
/** What the column says about one catalogue while searching: its badge, and whether it is dimmed. */
const row = (name) =>
  page.locator(`[data-catalog-row="${name}"]`).evaluate((item) => ({
    count: item.lastElementChild?.textContent ?? '',
    opacity: Number(getComputedStyle(item).opacity),
  }));

async function type(text) {
  await box.fill(text);
  await page.locator('[data-search-group], [data-search-empty]').first().waitFor({ timeout: 10_000 });
  await page.waitForTimeout(200);
}

await page.goto(`${BASE}/workspace/${WORKSPACE}/skills?catalog=${OPEN.id}`, { waitUntil: 'domcontentloaded' });
await box.waitFor({ timeout: 30_000 });
await page.locator('[data-skill-card]').first().waitFor({ timeout: 30_000 });
record((await heading()).includes(OPEN.name), `opens on the catalogue the address names (${await heading()})`);

// ---- typed while one catalogue is open, it finds what is in the others ------
await type('github');
const found = await groups();
record(
  JSON.stringify(found) === JSON.stringify([OTHER.name, PLUGIN.name]),
  `the matches are grouped under the catalogues they are in, the open one having none (${found.join(', ')})`,
);
record(
  JSON.stringify(await cards(`[data-search-group="${OTHER.name}"]`)) === JSON.stringify(['Review a pull request']),
  `under ${OTHER.name}: its match, by description (${(await cards(`[data-search-group="${OTHER.name}"]`)).join(', ')})`,
);
record(
  JSON.stringify(await cards(`[data-search-group="${PLUGIN.name}"]`)) === JSON.stringify(['Open an issue']),
  `under the plugin's catalogue: its match (${(await cards(`[data-search-group="${PLUGIN.name}"]`)).join(', ')})`,
);
record(
  (await page.locator(`[data-search-group="${PLUGIN.name}"] [data-plugin-marker]`).count()) === 1 &&
    (await page.locator(`[data-search-group="${OTHER.name}"] [data-plugin-marker]`).count()) === 0,
  "the plugin's group carries the plugin marker, and the workspace's does not",
);
record(
  (await page.locator(`[data-search-group="${OTHER.name}"] a[href$="/skills/990312"]`).count()) > 0,
  "a workspace skill's card still opens its page from the search",
);
{
  const shut = await row(OPEN.name);
  const other = await row(OTHER.name);
  const plugin = await row(PLUGIN.name);
  record(shut.count === '0' && shut.opacity < 1, `the open catalogue counts no matches and is dimmed (${shut.count}, ${shut.opacity})`);
  record(other.count === '1' && other.opacity === 1, `${OTHER.name} counts its one match and is not dimmed (${other.count}, ${other.opacity})`);
  record(plugin.count === '1' && plugin.opacity === 1, `the plugin's catalogue counts its one match (${plugin.count}, ${plugin.opacity})`);
}

// ---- clearing goes back to the catalogue that was open --------------------
await box.fill('');
await page.waitForTimeout(300);
record((await groups()).length === 0, 'cleared, no search groups are left');
record((await heading()).includes(OPEN.name), `cleared, the panel is the open catalogue again (${await heading()})`);
record(JSON.stringify(await cards()) === JSON.stringify(['Kettle descaling']), `with its own skills (${(await cards()).join(', ')})`);
record((await row(OTHER.name)).count === '2', `and the column counts what each catalogue holds (${(await row(OTHER.name)).count})`);

// ---- choosing a catalogue while searching narrows to it --------------------
await type('github');
await page.locator(`[data-catalog-row="${PLUGIN.name}"]`).click();
await page.waitForTimeout(300);
record((await groups()).length === 0, 'chosen in the column, the search is narrowed to that catalogue');
record((await heading()).includes(PLUGIN.name), `and the panel is that catalogue (${await heading()})`);
record(JSON.stringify(await cards()) === JSON.stringify(['Open an issue']), `showing only its match (${(await cards()).join(', ')})`);
await page.locator('[data-search-everywhere]').click();
await page.waitForTimeout(300);
record((await groups()).length === 2, 'All catalogs in the column widens it again');

// ---- nothing anywhere is said once ----------------------------------------
await type('nothing is called this');
record((await cards()).length === 0, 'a search matching nothing draws no card');
record((await page.getByText('Nothing anywhere matches that.').count()) === 1, 'and says so once');

// ---- ?q= opens the search across every catalogue --------------------------
await page.goto(
  `${BASE}/workspace/${WORKSPACE}/skills?catalog=${encodeURIComponent(`plugin:${PLUGIN.name}`)}&q=${encodeURIComponent('github')}`,
  { waitUntil: 'domcontentloaded' },
);
await page.locator('[data-search-group]').first().waitFor({ timeout: 30_000 });
record((await box.inputValue()) === 'github', `?q= is put in the box (${await box.inputValue()})`);
record(
  JSON.stringify(await groups()) === JSON.stringify([OTHER.name, PLUGIN.name]),
  `and searches every catalogue, not only the one the address names (${(await groups()).join(', ')})`,
);

await finish(browser);
