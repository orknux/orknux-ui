/**
 * The wheel over a function's or a tool's code scrolls the page, so the end of
 * the code comes up above the floating Save bar.
 *
 * The editors on these pages grow to their code and never scroll themselves,
 * but Monaco kept every wheel event by default - so with the pointer over the
 * code the page did not move, and the last lines stayed under the Save bar that
 * floats at the foot of the window. The editor now passes the wheel on once it
 * has nothing of its own to scroll.
 *
 * Measured, on a tool's page and a function's: wheeling over the code moves the
 * page, and afterwards the code's card ends above the bar.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1600, height: 900 } });

const PAGES = [
  { what: 'a tool', path: `tools/${process.env.ORKNUX_TOOL ?? '13'}` },
  { what: 'a function', path: `functions/${process.env.ORKNUX_FUNCTION ?? '1'}` },
];

for (const one of PAGES) {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/${one.path}`, { waitUntil: 'domcontentloaded' });
  const there = await page.locator('.monaco-editor').first().waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
  record(there, `${one.what}'s editor opens`);
  if (!there) continue;
  await page.waitForTimeout(1500);
  const state = () => page.evaluate(() => {
    const main = document.querySelector('main');
    const bar = [...document.querySelectorAll('[class*="_bar_"]')].find((el) => getComputedStyle(el).position === 'fixed');
    const card = document.querySelector('.monaco-editor').closest('[class*="Card"], section, [class*="_editor"]') ?? document.querySelector('.monaco-editor');
    return {
      scrollTop: main?.scrollTop ?? 0,
      room: (main?.scrollHeight ?? 0) - (main?.clientHeight ?? 0),
      barTop: bar ? bar.getBoundingClientRect().top : null,
      codeBottom: card.getBoundingClientRect().bottom,
    };
  });
  const before = await state();
  // A page that fits the window runs its code down to the bar, one page gap above it - not the launcher's clearance too.
  if (before.barTop !== null && before.codeBottom <= before.barTop) {
    const gap = Math.round(before.barTop - before.codeBottom);
    record(gap <= 40, `${one.what}'s code runs down to the Save bar (${gap}px short of it)`);
  }
  if (before.room <= 0) {
    record(true, `${one.what}'s page fits the window; nothing to scroll`);
    continue;
  }
  const box = await page.locator('.monaco-editor').first().boundingBox();
  await page.mouse.move(box.x + box.width / 2, Math.min(box.y + 150, 700));
  for (let i = 0; i < 15; i += 1) {
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(400);
  const after = await state();
  record(after.scrollTop > before.scrollTop, `the wheel over ${one.what}'s code scrolls the page (${before.scrollTop} -> ${after.scrollTop})`);
  record(
    after.barTop !== null && after.codeBottom <= after.barTop + 1,
    `and the code ends above the Save bar (${Math.round(after.codeBottom)} vs ${Math.round(after.barTop ?? -1)})`,
  );
}

await finish(browser);
