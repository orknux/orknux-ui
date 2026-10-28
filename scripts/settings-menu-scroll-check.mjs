/**
 * Admin Settings' section menu scrolls on its own, and ends above the Save bar.
 *
 * The menu is sticky and has more entries than a window is tall; it used to run
 * on under the floating Save bar with no scroll of its own, so its last entries
 * could only be reached by scrolling the whole page. Measured: the menu's
 * bottom is above the bar, the wheel over it moves the menu and not the page,
 * and its last entry can be brought into view that way.
 */
import { BASE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1600, height: 900 } });

await page.goto(`${BASE}/admin/settings`, { waitUntil: 'domcontentloaded' });
const menu = page.locator('[data-testid="section-menu"]');
await menu.waitFor({ timeout: 20_000 });
await page.waitForTimeout(1500);

const state = () => page.evaluate(() => {
  const nav = document.querySelector('[data-testid="section-menu"]');
  const bar = document.querySelector('[data-save-bar]');
  const last = [...nav.querySelectorAll('a')].pop();
  return {
    menuBottom: nav.getBoundingClientRect().bottom,
    barTop: bar ? bar.getBoundingClientRect().top : window.innerHeight,
    menuScroll: nav.scrollTop,
    menuRoom: nav.scrollHeight - nav.clientHeight,
    pageScroll: document.querySelector('main')?.scrollTop ?? 0,
    lastBottom: last.getBoundingClientRect().bottom,
  };
});

const before = await state();
record(before.menuBottom <= before.barTop, `the menu ends above the Save bar (${Math.round(before.menuBottom)} vs ${Math.round(before.barTop)})`);
if (before.menuRoom <= 0) {
  record(true, 'every entry fits; nothing to scroll');
} else {
  const box = await menu.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 60);
  for (let i = 0; i < 12; i += 1) {
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(300);
  const after = await state();
  record(after.menuScroll > before.menuScroll, `the wheel over the menu scrolls the menu (${before.menuScroll} -> ${after.menuScroll})`);
  record(after.pageScroll === before.pageScroll, `and leaves the page where it was (${before.pageScroll} -> ${after.pageScroll})`);
  record(after.lastBottom <= after.barTop, `the last entry comes up above the bar (${Math.round(after.lastBottom)} vs ${Math.round(after.barTop)})`);
}

await finish(browser);
