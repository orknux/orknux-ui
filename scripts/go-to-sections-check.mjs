/**
 * "Go to" reaches a part of a page, not only the page.
 *
 * Issue #361. The box could reach a page or one of the workspace's own named
 * things, and everything between the two was invisible: somebody after the
 * workspace's secrets had to know they live under Variables, somebody after the
 * marketplace had to know it is a tab of Plugins. Both are one keystroke away
 * once found and unfindable until then, which is the whole complaint.
 *
 * Two shapes, and both are measured because they arrive differently. A tab the
 * page already keeps in its address is a query and needs nothing new. A heading
 * on a page that draws all of them at once is a fragment - and a fragment is the
 * part that can go quietly wrong, because the browser only scrolls to one on a
 * full page load: a router navigation puts it in the address and leaves the page
 * exactly where it was, which reads as a control that did nothing.
 *
 * So what is asserted is where the page ended up, in pixels, and not that a row
 * appeared in a list.
 *
 * Makes nothing and changes nothing.
 */
import { BASE, WORKSPACE, open, drawn, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 900 } });

/** The palette, opened from the top bar and typed into. */
const ask = async (what) => {
  const box = page.locator('input[aria-label="Quick actions"]').first();
  await box.waitFor({ timeout: 20_000 });
  await box.fill('');
  await box.click();
  await box.fill(what);
  await page.waitForTimeout(600);
  return page.locator('[class*="_result_"]');
};

/* ------------------------------------------- the rows it offers now ------- */

await page.goto(`${BASE}/workspace/${WORKSPACE}/agents`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'a workspace page'), 'a workspace page is on screen to search from');

const rows = await ask('secrets');
const offered = await rows.allInnerTexts();
console.log(`typing "secrets": ${JSON.stringify(offered.slice(0, 6))}`);
record(
  offered.some((one) => one.includes('Variables') && one.includes('Secrets')),
  "typing what a section is called offers the section, named for the page it is in",
);

const market = await ask('marketplace').then((found) => found.allInnerTexts());
console.log(`typing "marketplace": ${JSON.stringify(market.slice(0, 4))}`);
record(
  market.some((one) => one.includes('Marketplace')),
  'and a tab of a page is offered by the name on the tab',
);

/* ------------------------------- a fragment actually lands on the part ---- */

/*
 * The ids are there to be named, checked on the page itself before anything is
 * pressed: a row that navigates correctly to a fragment naming nothing would
 * still leave somebody where they started, and the two failures look identical
 * from the outside.
 */
await page.goto(`${BASE}/workspace/${WORKSPACE}/variables`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the variables page'), 'the variables page is on screen');

const where = async (id) =>
  page.evaluate((one) => {
    const found = document.getElementById(one);
    return found === null ? null : Math.round(found.getBoundingClientRect().top);
  }, id);

record((await where('secrets')) !== null, 'its Secrets table carries the id a fragment names');
record((await where('values')) !== null, 'and its Values table carries one too');

/* --------------------------------- and the row itself goes there ---------- */

/*
 * Driven by pressing the row, which is the only navigation that matters: the
 * palette calls the router, and the browser does not scroll to a fragment the
 * router put in the address. A synthetic pushState would prove nothing about
 * that, since it is not what the palette does.
 */
for (const one of [
  { typed: 'mcp servers', row: 'MCP Servers', path: '/integrations', id: 'mcp-servers' },
  { typed: 'secrets', row: 'Variables - Secrets', path: '/variables', id: 'secrets' },
  /*
   * And one on a page long enough to have somewhere to scroll to. The two above
   * fit in the window on this installation, so the landing they measure is that
   * the section is on screen - true, and not the part that breaks. The settings
   * page runs well past a screenful, so a row that navigated and left the reader
   * at the top fails here and nowhere else.
   */
  { typed: 'run history', row: 'Settings - Run history', path: '/admin/settings', id: 'run-history' },
]) {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/agents`, { waitUntil: 'domcontentloaded' });
  const found = await ask(one.typed);
  const row = found.filter({ hasText: one.row }).first();
  const pressable = await row
    .waitFor({ timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  record(pressable, `${one.row} is offered as a row to press`);
  if (!pressable) continue;

  await row.click();
  const arrived = await page
    .waitForFunction(
      (wanted) => window.location.pathname.endsWith(wanted.path) && window.location.hash === `#${wanted.id}`,
      one,
      { timeout: 20_000 },
    )
    .then(() => true)
    .catch(() => false);
  console.log(`arrived at ${page.url()}`);
  record(arrived, `${one.row}: pressing it names the section on the address`);

  /*
   * Where the page ended up, in pixels.
   *
   * "At the top" only where there is room left to put it there. Two pages
   * cannot manage it and both are correct about that: the variables page fits in
   * a window with nothing to scroll at all, and the settings page runs out of
   * page before its last section reaches the top. So what is asserted is that
   * the section is on screen and that the page went as far as it could - which a
   * row that navigated and left the reader at the top still fails.
   */
  const seated = await page
    .waitForFunction(
      (wanted) => {
        const found = document.getElementById(wanted.id);
        if (found === null) return false;
        const top = Math.round(found.getBoundingClientRect().top);
        const scroller = document.scrollingElement;
        const left = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop;
        if (top < 300) return true;
        // Nothing left to scroll: as near the top as this page can put it, so
        // long as it is actually on screen.
        return left <= 1 && top >= 0 && top < window.innerHeight;
      },
      one,
      { timeout: 20_000 },
    )
    .then(() => true)
    .catch(() => false);
  console.log(
    `${one.id} sits at ${await page.evaluate((id) => {
      const el = document.getElementById(id);
      const scroller = document.scrollingElement;
      return el === null
        ? null
        : `${Math.round(el.getBoundingClientRect().top)}px, with ` +
          `${scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop}px of room left`;
    }, one.id)}`,
  );
  record(seated, `${one.row}: and the page lands on the section it named`);
}

await finish(browser);
