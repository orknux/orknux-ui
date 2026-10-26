/**
 * A long role under the account name does not crowd the top bar.
 *
 * A directory group can be one long word - "Eec_defender365_policies_vip" - and
 * at its full width it widened the corner until the search box in the middle was
 * a magnifier, its list of results a column one letter across, and the
 * workspace button sat on top of the sections. What is asserted is what was
 * drawn wrong: the role is cut short, nothing in the bar overlaps, and the
 * results open wide enough to read.
 */
import { BASE, open, record, drawn, finish, WORKSPACE_MENU } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1100, height: 900 } });

await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
await drawn(page, 'the admin page');
const role = page.locator('[class*="userRole"]').first();
await role.waitFor({ timeout: 20_000 });
await page.locator(WORKSPACE_MENU).waitFor({ timeout: 20_000 });
// The role is the directory's to name; written straight in, as a long one would arrive.
await page.evaluate(() => {
  document.querySelector('[class*="userRole"]').textContent = 'Eec_defender365_policies_vip';
});
await page.waitForTimeout(200);

const bar = await page.evaluate((menu) => {
  const box = (selector) => document.querySelector(selector)?.getBoundingClientRect();
  const links = [...document.querySelectorAll('nav[class*="navLinks"] a, nav[class*="navLinks"] span[aria-disabled]')];
  const role = document.querySelector('[class*="userRole"]');
  return {
    sections: Math.max(...links.map((one) => one.getBoundingClientRect().right)),
    palette: box('[class*="palette"]'),
    workspace: box(menu),
    role: { width: role.getBoundingClientRect().width, cut: role.scrollWidth > role.clientWidth },
  };
}, WORKSPACE_MENU);

record(bar.role.width <= 180 && bar.role.cut, `the long role is cut short (${Math.round(bar.role.width)}px, cut: ${bar.role.cut})`);
record(bar.palette.left >= bar.sections, `the search box starts after the sections (${Math.round(bar.palette.left)} >= ${Math.round(bar.sections)})`);
record(bar.workspace.left >= bar.palette.right, `the workspace button starts after the search box (${Math.round(bar.workspace.left)} >= ${Math.round(bar.palette.right)})`);

// A keycap cut down the middle by the edge of the box reminds nobody of anything.
const keycap = await page.evaluate(() => {
  const key = document.querySelector('[class*="palette"] [class*="shortcut"]');
  const box = document.querySelector('[class*="palette"]').getBoundingClientRect();
  if (key === null || key.getBoundingClientRect().width === 0) return 'hidden';
  return key.getBoundingClientRect().right <= box.right ? 'whole' : 'cut';
});
record(keycap !== 'cut', `the shortcut keycap is whole or not drawn (${keycap})`);

await page.locator('[class*="palette"] input').first().click();
await page.keyboard.type('a');
const results = page.locator('[class*="palette"] [role="listbox"]').first();
await results.waitFor({ timeout: 5000 });
const width = (await results.boundingBox())?.width ?? 0;
record(width >= 260, `the results open wide enough to read (${Math.round(width)}px)`);

await finish(browser);
