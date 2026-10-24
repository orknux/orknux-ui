/**
 * The memory page's search reads every catalogue, not the one that is open.
 *
 * The same move as the skills page's (1.2.0): one box at the top of the
 * catalogue column; while something is typed the panel shows the first
 * matches in every catalogue, grouped under each one's name, with "Show all"
 * where a catalogue has more than fit; the column counts each catalogue's
 * matches and dims the ones with none; choosing a catalogue narrows to it;
 * clearing the box goes back to the catalogue that was open.
 *
 * The search is the server's, a catalogue at a time, so the stub answers the
 * `memories` query the way the server does - filtered by the text, paged.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1400, height: 900 } });

const catalog = (id, name, memoryCount) => ({
  id,
  workspaceId: WORKSPACE,
  name,
  memoryCount,
  isDefault: false,
  createdAt: '2026-10-24T00:00:00Z',
  createdBy: 'alice',
});
/** Open on this one; nothing in it is about GitHub. */
const OPEN = catalog('990401', 'Memory search open', 1);
/** Holds seven matches, more than a group shows. */
const OTHER = catalog('990402', 'Memory search other', 8);

const memory = (id, catalogId, title, content) => ({
  id,
  catalogId,
  title,
  content,
  createdAt: '2026-10-24T00:00:00Z',
  createdBy: 'alice',
  lastModifiedAt: '2026-10-24T00:00:00Z',
  lastModifiedBy: 'alice',
});
const MEMORIES = [
  memory('990411', OPEN.id, 'Kettle descaling', 'Vinegar, then rinse twice.'),
  ...Array.from({ length: 7 }, (_, i) => memory(String(990420 + i), OTHER.id, `Token ${i + 1}`, `The GitHub token number ${i + 1} rotates monthly.`)),
  memory('990430', OTHER.id, 'Lunch', 'Thursdays are pierogi.'),
];

await page.route('**/graphql', async (route) => {
  const body = route.request().postDataJSON() ?? {};
  const query = body.query ?? '';
  const vars = body.variables ?? {};
  if (query.includes('memoryCatalogs(')) return route.fulfill({ json: { data: { memoryCatalogs: [OPEN, OTHER] } } });
  if (query.includes('memoryAuthors(')) return route.fulfill({ json: { data: { memoryAuthors: ['alice'] } } });
  if (query.includes('memories(')) {
    const wanted = (vars.search ?? '').trim().toLowerCase();
    const all = MEMORIES.filter(
      (one) => one.catalogId === vars.catalogId && `${one.title}\n${one.content}`.toLowerCase().includes(wanted),
    );
    const size = vars.size ?? 5;
    const at = vars.page ?? 0;
    return route.fulfill({
      json: {
        data: {
          memories: {
            content: all.slice(at * size, (at + 1) * size),
            page: at,
            size,
            totalElements: all.length,
            totalPages: Math.ceil(all.length / size),
          },
        },
      },
    });
  }
  return route.continue();
});

const box = page.locator('[data-memory-search]');
const heading = () => page.locator('h1').first().innerText();
const cards = (within = '') =>
  page.locator(`${within} [data-memory-card]`.trim()).evaluateAll((items) => items.map((item) => item.dataset.memoryCard));
const groups = () =>
  page.locator('[data-search-group]').evaluateAll((items) => items.map((item) => item.dataset.searchGroup));
const row = (name) =>
  page.locator(`[data-catalog-row="${name}"]`).evaluate((item) => ({
    count: item.lastElementChild?.textContent ?? '',
    opacity: Number(getComputedStyle(item).opacity),
  }));

async function type(text) {
  await box.fill(text);
  // The page waits for the typing to stop before it asks every catalogue.
  await page.locator('[data-search-group], [data-search-empty]').first().waitFor({ timeout: 10_000 });
  await page.waitForTimeout(400);
}

await page.goto(`${BASE}/workspace/${WORKSPACE}/memory?catalog=${OPEN.id}`, { waitUntil: 'domcontentloaded' });
await box.waitFor({ timeout: 30_000 });
await page.locator('[data-memory-card]').first().waitFor({ timeout: 30_000 });
record((await page.locator('input[type="search"]').count()) === 1, 'the page has one search box');
{
  const at = await box.boundingBox();
  const first = await page.locator('[data-catalog-row]').first().boundingBox();
  record(
    at !== null && first !== null && at.y + at.height <= first.y && Math.abs(at.x - first.x) < 40,
    `it is above the catalogues in their column (${Math.round(at?.y ?? -1)} over ${Math.round(first?.y ?? -1)})`,
  );
}
record((await heading()).includes(OPEN.name), `opens on the catalogue the address names (${await heading()})`);

// ---- typed while one catalogue is open, it finds what is in another --------
await type('github');
record(
  JSON.stringify(await groups()) === JSON.stringify([OTHER.name]),
  `the matches are grouped under the catalogue they are in (${(await groups()).join(', ')})`,
);
const first = await cards(`[data-search-group="${OTHER.name}"]`);
record(first.length === 5 && first.every((title) => title.startsWith('Token')), `a group shows its first five (${first.join(', ')})`);
record(
  (await page.locator(`[data-search-group="${OTHER.name}"] [data-search-more]`).innerText()).includes('7'),
  'and offers the rest, saying how many',
);
record(
  (await page.locator(`[data-search-group="${OTHER.name}"] a[href$="/memory/990420"]`).count()) > 0,
  "a memory's card still opens its page from the search",
);
{
  const shut = await row(OPEN.name);
  const other = await row(OTHER.name);
  record(shut.count === '0' && shut.opacity < 1, `the open catalogue counts no matches and is dimmed (${shut.count}, ${shut.opacity})`);
  record(other.count === '7' && other.opacity === 1, `the other counts its seven and is not dimmed (${other.count}, ${other.opacity})`);
}

// ---- clearing goes back to the catalogue that was open --------------------
await box.fill('');
await page.waitForTimeout(400);
record((await groups()).length === 0, 'cleared, no search groups are left');
record((await heading()).includes(OPEN.name), `cleared, the panel is the open catalogue again (${await heading()})`);
record(JSON.stringify(await cards()) === JSON.stringify(['Kettle descaling']), `with its own memories (${(await cards()).join(', ')})`);

// ---- choosing a catalogue while searching narrows to it --------------------
await type('github');
await page.locator(`[data-catalog-row="${OTHER.name}"]`).click();
await page.waitForTimeout(400);
record((await groups()).length === 0, 'chosen in the column, the search is narrowed to that catalogue');
record((await heading()).includes(OTHER.name), `and the panel is that catalogue (${await heading()})`);
record((await box.inputValue()) === 'github', 'the search is kept');
const narrowed = await cards();
record(narrowed.length === 5 && !narrowed.includes('Lunch'), `showing its matches a page at a time (${narrowed.join(', ')})`);

// ---- nothing anywhere is said once ----------------------------------------
await page.locator('[data-search-everywhere]').click();
await box.fill('');
await type('nothing is called this');
record((await cards()).length === 0, 'a search matching nothing draws no card');
record((await page.getByText('Nothing anywhere matches that.').count()) === 1, 'and says so once');

await finish(browser);
