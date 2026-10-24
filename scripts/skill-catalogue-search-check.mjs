/**
 * The skills page's search narrows the skills as you type, by name, by
 * description and by what the skill says - a plugin's catalogue as well as a
 * workspace's own. Issue #642.
 *
 * The box is the one at the top of the catalogue column, and it reads every
 * catalogue at once (1.2.0); `skill-search-global-check` is about that. This
 * one is about the matching rule, so each search is read twice: across every
 * catalogue, where it must find the skill in both, and narrowed to each in
 * turn by choosing it in the column.
 *
 * Both kinds of catalogue are stubbed: the fixture has no plugin loaded, and a
 * workspace catalogue of its own would be one to remove again. What is under
 * test is the page's filtering, so the skills it filters are drawn here, each
 * findable by exactly one of the three things the box reads.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1400, height: 900 } });

const skill = (name, description, content) => ({ name, description, content });
/** One found by its name, one by its description, one only by its content. */
const SKILLS = [
  skill('Angryman', 'Reviews a change as a hostile reader would.', '# Angryman\n\nFind the weakest claim first.'),
  skill('Box Debugging', 'Narrowing a failure inside a box.', '# Debugging\n\nReproduce before you read.'),
  skill('Agents', 'How agents are made and granted.', '# Agents\n\nA grant is a promise the zanzibar rules keep.'),
];

const PLUGIN = {
  name: 'search_check_plugin',
  key: 'search_check',
  plugin: 'Search Check',
  skills: SKILLS.map((one) => ({ ...one, key: one.name.toLowerCase().replace(/ /g, '_') })),
};
const CATALOG = { id: '990001', workspaceId: WORKSPACE, name: 'Search check', skillCount: SKILLS.length, createdAt: '2026-10-23T00:00:00Z', createdBy: 'alice' };
const WORKSPACE_SKILLS = SKILLS.map((one, i) => ({
  id: String(990100 + i),
  workspaceId: WORKSPACE,
  catalogId: CATALOG.id,
  key: one.name.toLowerCase().replace(/ /g, '_'),
  enabled: true,
  lastModifiedAt: '2026-10-23T00:00:00Z',
  lastModifiedBy: 'alice',
  ...one,
}));

await page.route('**/graphql', async (route) => {
  const query = route.request().postDataJSON()?.query ?? '';
  if (query.includes('pluginSkillCatalogs')) return route.fulfill({ json: { data: { pluginSkillCatalogs: [PLUGIN] } } });
  if (query.includes('skillCatalogs(')) return route.fulfill({ json: { data: { skillCatalogs: [CATALOG] } } });
  if (query.includes('workspaceSkills(')) {
    // One catalogue holds them all, so the whole workspace and that catalogue answer alike.
    return route.fulfill({
      json: { data: { workspaceSkills: { content: WORKSPACE_SKILLS, page: 0, size: 50, totalElements: SKILLS.length, totalPages: 1 } } },
    });
  }
  return route.continue();
});

/** The names of the cards drawn, in order, under one search group or in the whole panel. */
const cards = (within = '') =>
  page.locator(`${within} [data-skill-card]`.trim()).evaluateAll((items) => items.map((item) => item.dataset.skillCard));

const box = page.locator('[data-skill-search]');

/** Types into the box and reads what is left across every catalogue, group by group. */
async function searched(text) {
  // A new search starts across every catalogue, whichever was narrowed to before.
  await box.fill('');
  await box.fill(text);
  // Every skill is read when a search starts; the groups, or the one line saying there are none, are what arrive.
  await page.locator('[data-search-group], [data-search-empty]').first().waitFor({ timeout: 10_000 });
  await page.waitForTimeout(200);
  return {
    workspace: await cards(`[data-search-group="${CATALOG.name}"]`),
    plugin: await cards(`[data-search-group="${PLUGIN.name}"]`),
  };
}

/** The same search, narrowed to one catalogue by choosing it in the column. */
async function narrowedTo(name) {
  await page.locator(`[data-catalog-row="${name}"]`).click();
  await page.waitForTimeout(200);
  return cards();
}

await page.goto(`${BASE}/workspace/${WORKSPACE}/skills?catalog=${CATALOG.id}`, { waitUntil: 'domcontentloaded' });
await box.waitFor({ timeout: 30_000 });
await page.locator('[data-skill-card]').first().waitFor({ timeout: 30_000 });
record(await box.isVisible(), 'the page has a search box');
{
  // At the top of the catalogue column: above every catalogue it reads.
  const at = await box.boundingBox();
  const first = await page.locator('[data-catalog-row]').first().boundingBox();
  record(
    at !== null && first !== null && at.y + at.height <= first.y && Math.abs(at.x - first.x) < 40,
    `the box is above the catalogues in their column (${Math.round(at?.y ?? -1)} over ${Math.round(first?.y ?? -1)})`,
  );
}
record((await page.locator('[data-skill-search]').count()) === 1, 'and there is only one');
record((await cards()).length === SKILLS.length, `every skill before anything is typed (${(await cards()).join(', ')})`);

for (const [what, text, wanted] of [
  ['part of its name, any case', 'angry', 'Angryman'],
  ['its description', 'NARROWING', 'Box Debugging'],
  ['what it says, though no card shows it', 'zanzibar', 'Agents'],
]) {
  const found = await searched(text);
  record(
    JSON.stringify(found.workspace) === JSON.stringify([wanted]) && JSON.stringify(found.plugin) === JSON.stringify([wanted]),
    `found by ${what}, in the workspace's catalogue and the plugin's (${found.workspace.join(', ')} | ${found.plugin.join(', ')})`,
  );
  const inPlugin = await narrowedTo(PLUGIN.name);
  record(JSON.stringify(inPlugin) === JSON.stringify([wanted]), `narrowed to the plugin's catalogue, found by ${what} (${inPlugin.join(', ')})`);
  const inWorkspace = await narrowedTo(CATALOG.name);
  record(JSON.stringify(inWorkspace) === JSON.stringify([wanted]), `narrowed to the workspace's catalogue, found by ${what} (${inWorkspace.join(', ')})`);
}

await searched('nothing will match this');
record((await cards()).length === 0, `a search matching nothing draws no card (${(await cards()).length})`);
record(
  (await page.getByText('Nothing anywhere matches that.').count()) === 1,
  'and says so once',
);

await box.fill('');
await page.waitForTimeout(200);
const cleared = await cards();
record(cleared.length === SKILLS.length, `cleared, every skill is back (${cleared.length})`);

await finish(browser);
