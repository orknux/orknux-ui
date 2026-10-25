/**
 * The perspectives in the top bar sit closer together below 1920px.
 *
 * Each link is a pill with its own padding, and the row put 16px between the
 * pills as well - 40px of air between two words, which on a laptop pushed the
 * row into the box in the middle. The gap goes below the widest screens; the
 * pills keep their padding, so each is as easy to hit.
 */
import { BASE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 900 } });

const measure = async () => {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  const links = page.locator('header nav a');
  await links.first().waitFor({ timeout: 20_000 });
  // Workspace comes in with the workspace list, after the rest.
  await page.locator('header nav a', { hasText: 'Workspace' }).waitFor({ timeout: 20_000 });
  const drawn = await links.evaluateAll((all) =>
    all.map((one) => ({ name: one.textContent, left: one.getBoundingClientRect().left, right: one.getBoundingClientRect().right })),
  );
  const boxes = drawn.filter((one) => one.right > one.left);
  const row = await page.locator('header nav').first().evaluate((nav) => getComputedStyle(nav).columnGap);
  return { count: boxes.length, row, gaps: boxes.slice(1).map((box, index) => Math.round(box.left - boxes[index].right)) };
};

const laptop = await measure();
record(laptop.count >= 5, `the top bar draws the perspectives (${laptop.count})`);
record(laptop.gaps.every((gap) => gap <= 4), `at 1440px the pills stand 4px apart or less (${laptop.gaps.join(', ')}px)`);

await page.setViewportSize({ width: 2200, height: 900 });
const wide = await measure();
// Measured on the row, not between links: at this width Chat gives its place to the box in the middle.
record(wide.row === '16px', `on a wide screen the row keeps its 16px (${wide.row})`);

await finish(browser);
