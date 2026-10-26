/**
 * The attribution strip ends short of the Ask AI launcher, at any width.
 *
 * The strip kept a fixed 112px clear on the right, and the launcher - its
 * label added later - reaches about 160px in, so "Source" ran under it. Every
 * line the strip's words are drawn on must end left of the launcher, read off
 * the text's own line boxes rather than the strip's padding.
 */
import { BASE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 900 } });

async function measure(width) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.locator('[class*="_attributionBar_"]').first().waitFor({ timeout: 20_000 });
  await page.waitForTimeout(500);
  return page.evaluate(() => {
    const bar = document.querySelector('[class*="_attributionBar_"]');
    const launcher = document.querySelector('[class*="_launcher_"]');
    if (!bar || !launcher) return null;
    const range = document.createRange();
    range.selectNodeContents(bar);
    const rects = [...range.getClientRects()].filter((rect) => rect.width > 0);
    const textRight = Math.max(...rects.map((rect) => rect.right));
    const textBottom = Math.max(...rects.map((rect) => rect.bottom));
    const button = launcher.getBoundingClientRect();
    // Only text level with the launcher can be under it.
    const level = rects.filter((rect) => rect.bottom > button.top && rect.top < button.bottom);
    const levelRight = level.length ? Math.max(...level.map((rect) => rect.right)) : null;
    return { textRight: Math.round(textRight), levelRight: levelRight && Math.round(levelRight), launcherLeft: Math.round(button.left), textBottom: Math.round(textBottom) };
  });
}

for (const width of [640, 1024, 1440]) {
  const drawn = await measure(width);
  record(
    drawn !== null && (drawn.levelRight === null || drawn.levelRight <= drawn.launcherLeft),
    `at ${width}px the strip's words end left of Ask AI (${JSON.stringify(drawn)})`,
  );
}

await finish(browser);
