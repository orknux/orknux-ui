/**
 * A skill catalogue's page has a search box that narrows its skills as you
 * type, by name, by description and by what the skill says - a plugin's
 * catalogue as well as a workspace's own. Issue #642.
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
    return route.fulfill({
      json: { data: { workspaceSkills: { content: WORKSPACE_SKILLS, page: 0, size: 50, totalElements: SKILLS.length, totalPages: 1 } } },
    });
  }
  return route.continue();
});

/** The names of the cards drawn, in order. */
const cards = () => page.locator('[data-skill-card]').evaluateAll((items) => items.map((item) => item.dataset.skillCard));

/** Types into the box and reads what is left, the way a person would. */
async function searched(text) {
  await page.locator('[data-skill-search]').fill(text);
  await page.waitForTimeout(200);
  return cards();
}

for (const [label, address] of [
  ["a plugin's catalogue", `catalog=${encodeURIComponent(`plugin:${PLUGIN.name}`)}`],
  ["a workspace's own catalogue", `catalog=${CATALOG.id}`],
]) {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/skills?${address}`, { waitUntil: 'domcontentloaded' });
  const box = page.locator('[data-skill-search]');
  await box.waitFor({ timeout: 30_000 });
  await page.locator('[data-skill-card]').first().waitFor({ timeout: 30_000 });
  record(await box.isVisible(), `${label} has a search box`);
  {
    // At the top: above every card it narrows.
    const at = await box.boundingBox();
    const first = await page.locator('[data-skill-card]').first().boundingBox();
    record(at !== null && first !== null && at.y + at.height <= first.y, `${label}: the box is above the cards (${Math.round(at?.y ?? -1)} over ${Math.round(first?.y ?? -1)})`);
  }
  record((await cards()).length === SKILLS.length, `${label} shows every skill before anything is typed (${(await cards()).join(', ')})`);

  const byName = await searched('angry');
  record(JSON.stringify(byName) === JSON.stringify(['Angryman']), `${label}: found by part of its name, any case (${byName.join(', ')})`);
  const byDescription = await searched('NARROWING');
  record(JSON.stringify(byDescription) === JSON.stringify(['Box Debugging']), `${label}: found by its description (${byDescription.join(', ')})`);
  const byContent = await searched('zanzibar');
  record(JSON.stringify(byContent) === JSON.stringify(['Agents']), `${label}: found by what it says, though no card shows it (${byContent.join(', ')})`);

  const none = await searched('nothing will match this');
  record(none.length === 0, `${label}: a search matching nothing draws no card (${none.length})`);
  record(await page.getByText('Nothing here matches that.').isVisible(), `${label}: and says nothing matches`);

  const cleared = await searched('');
  record(cleared.length === SKILLS.length, `${label}: cleared, every skill is back (${cleared.length})`);
}

await finish(browser);
