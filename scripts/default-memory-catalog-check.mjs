/**
 * Every workspace has one memory catalog, and it stays.
 *
 * A catalog is what an agent is granted and what a memory is filed into, so a
 * workspace with none has nowhere for either: `memory_save` refuses because
 * there is nothing to write to, and the two memory tools are not offered to an
 * agent at all. The first thing anybody had to do before an agent could remember
 * anything was therefore a piece of setup nobody is told about.
 *
 * So a workspace arrives with one and cannot be left without it. What is
 * measured here is the screen rather than the rule - the rule is pinned in
 * DefaultMemoryCatalogTest, which can make a workspace and read the row back.
 * On screen the question is narrower and easy to get wrong: the catalog that
 * cannot be deleted must not be drawn with a Delete beside it, and Rename must
 * still be there, because renaming is the whole way out of a name nobody likes.
 *
 * Reads this workspace's own catalogs. Makes nothing and removes nothing.
 */
import { BASE, WORKSPACE, open, drawn, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

/* ------------------------------------------------ which one it is --------- */

const { memoryCatalogs } = await graphql(
  `query($w: ID!) { memoryCatalogs(workspaceId: $w) { id name isDefault } }`,
  { w: WORKSPACE },
);
console.log(`catalogs: ${JSON.stringify(memoryCatalogs)}`);

const standing = memoryCatalogs.filter((one) => one.isDefault);
record(standing.length === 1, `this workspace has exactly one catalog that stays (${standing.length})`);
if (standing.length !== 1) await finish(browser);

const ordinary = memoryCatalogs.find((one) => !one.isDefault) ?? null;

/* ---------------------------------------------- what the screen draws ----- */

await page.goto(`${BASE}/workspace/${WORKSPACE}/memory`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the memory page'), 'the memory page is on screen');

/** Opens one catalog by name and answers with the controls its header carries. */
const controls = async (name) => {
  await page.locator('button', { hasText: new RegExp(`^${name}`) }).first().click();
  await page
    .locator('h1', { hasText: name })
    .first()
    .waitFor({ timeout: 20_000 })
    .catch(() => undefined);
  return page.evaluate(
    (wanted) =>
      [...document.querySelectorAll('button[aria-label]')]
        .map((one) => one.getAttribute('aria-label'))
        .filter((label) => label !== null && label.includes(wanted)),
    name,
  );
};

const onStanding = await controls(standing[0].name);
console.log(`${standing[0].name}: ${JSON.stringify(onStanding)}`);
record(
  onStanding.some((one) => one.startsWith('Rename')),
  'the one that stays can still be renamed, which is the way out of its name',
);
record(
  !onStanding.some((one) => one.startsWith('Delete')),
  'and carries no Delete, rather than one that argues back when pressed',
);

if (ordinary !== null) {
  const onOrdinary = await controls(ordinary.name);
  console.log(`${ordinary.name}: ${JSON.stringify(onOrdinary)}`);
  record(
    onOrdinary.some((one) => one.startsWith('Delete')),
    'an ordinary catalog beside it still has one, so the rule is about that catalog and not the page',
  );
} else {
  console.log('no ordinary catalog in this workspace, so the other half was not measured on this run');
}

/* ---------------------------------- and the server refuses it as well ----- */

/*
 * Asked of the server rather than by pressing, because there is nothing to
 * press: the button is gone, and the bound that matters is the one behind the
 * screen - the same mutation is reachable from the API.
 */
const refused = await graphql(`mutation($id: ID!) { deleteMemoryCatalog(id: $id) }`, {
  id: standing[0].id,
}).then(
  () => null,
  (cause) => String(cause?.message ?? cause),
);
console.log(`refusal: ${refused}`);
record(
  refused !== null && refused.includes('cannot be deleted'),
  'and the server refuses it too, because a screen is not a boundary',
);
record(
  refused !== null && refused.includes('renamed'),
  'saying what can be done instead rather than only what cannot',
);

/* It is still there, which is the whole of what this is for. */
const after = await graphql(`query($w: ID!) { memoryCatalogs(workspaceId: $w) { id isDefault } }`, {
  w: WORKSPACE,
});
record(
  after.memoryCatalogs.filter((one) => one.isDefault).length === 1,
  'the workspace still has it',
);

await finish(browser);
