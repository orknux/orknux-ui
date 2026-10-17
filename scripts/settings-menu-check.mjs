/**
 * The two long settings pages have their sections down the side.
 *
 * Both pages grew past a screen a long time ago - eighteen sections on the
 * admin one - and finding a setting meant scrolling and reading headings. The
 * menu is read off the page's own `h2[id]` headings, so what is asserted is
 * that agreement: one entry per heading, in order; pressing the last entry
 * brings that heading to the top of the frame; and the entry for the section
 * under the reader's eye is the one marked current.
 */
import { BASE, WORKSPACE, open, drawn, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1500, height: 900 } });

for (const [where, path, settle] of [
  ['admin settings', '/admin/settings', 'Server updates'],
  ['workspace settings', `/workspace/${WORKSPACE}/settings`, 'Quick Chat'],
]) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await drawn(page, settle);
  const menu = page.getByTestId('section-menu');
  await menu.waitFor({ timeout: 10_000 });
  const agreement = await page.evaluate(() => {
    const headings = [...document.querySelectorAll('main h2[id]')].map((one) => one.id);
    const entries = [...document.querySelectorAll('[data-testid="section-menu"] a')].map((one) => one.getAttribute('href')?.slice(1));
    return { headings, entries };
  });
  record(
    agreement.headings.length >= 2 && JSON.stringify(agreement.headings) === JSON.stringify(agreement.entries),
    `${where}: one entry per heading, in order (${agreement.entries.length})`,
  );

  const sticky = await menu.evaluate((one) => getComputedStyle(one).position);
  record(sticky === 'sticky', `${where}: the menu stays with the frame (${sticky})`);

  // A middle entry: the last section may be too short to reach the top of the frame.
  const last = agreement.headings[Math.floor(agreement.headings.length / 2)];
  await menu.locator(`a[href="#${last}"]`).click();
  await page.waitForTimeout(400);
  const landed = await page.evaluate((id) => {
    const top = document.getElementById(id)?.getBoundingClientRect().top ?? -1;
    const current = document.querySelector('[data-testid="section-menu"] a[aria-current]')?.getAttribute('href')?.slice(1);
    const menuTop = document.querySelector('[data-testid="section-menu"]')?.getBoundingClientRect().top ?? -1;
    return { top, current, menuTop };
  }, last);
  record(landed.top >= 0 && landed.top < 120, `${where}: pressing an entry brings its heading up (${Math.round(landed.top)}px from the top)`);
  record(landed.current === last, `${where}: and that entry is marked current (${landed.current})`);
  record(landed.menuTop >= 0 && landed.menuTop < 200, `${where}: the menu is still in view after the scroll (${Math.round(landed.menuTop)}px)`);
}

await finish(browser);
