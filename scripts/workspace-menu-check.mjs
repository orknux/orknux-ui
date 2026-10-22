/**
 * The workspace menu in the top bar, drawn by the application rather than by
 * the operating system.
 *
 * It replaced a native select whose dropped list Windows painted itself: a
 * pale highlight on the dark page, the name in it washed out. What is asserted
 * is what that got wrong and what a listbox owes a keyboard - the highlighted
 * row is readable, the current workspace is the ticked one, the arrows and
 * Enter move to another, and Escape closes without moving.
 */
import { BASE, WORKSPACE, open, record, drawn, finish, WORKSPACE_MENU, workspaceShown } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });

/** WCAG's relative luminance of an rgb() string. */
function luminance(rgb) {
  const [r, g, b] = (rgb.match(/[\d.]+/g) ?? ['0', '0', '0']).slice(0, 3).map((one) => {
    const c = Number(one) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const { workspaces } = await graphql('query { workspaces(page: 0, size: 200) { content { id } } }');
const ids = workspaces.content.map((one) => one.id);

await page.goto(`${BASE}/workspace/${WORKSPACE}/integrations`, { waitUntil: 'domcontentloaded' });
await drawn(page, 'the integrations page');
const menu = page.locator(WORKSPACE_MENU);
await menu.waitFor({ timeout: 20_000 });
record((await workspaceShown(page)) === String(WORKSPACE), 'the top bar names the workspace one is in');

await menu.click();
const options = page.locator('[role="listbox"] [role="option"]');
await options.first().waitFor({ timeout: 5000 });
record((await options.count()) === ids.length, `the menu lists every workspace (${await options.count()} of ${ids.length})`);
const ticked = await page.locator('[role="option"][aria-selected="true"]').getAttribute('data-workspace-id');
record(ticked === String(WORKSPACE), `the one we are in is the ticked one (${ticked})`);

// The row under the keys is readable: its text stands out from its own background.
const at = await page.evaluate(() => {
  const row = document.querySelector('[role="option"][class*="optionAt"]');
  if (row === null) return null;
  let paint = row;
  let background = getComputedStyle(paint).backgroundColor;
  while (paint !== null && (background === 'rgba(0, 0, 0, 0)' || background === 'transparent')) {
    paint = paint.parentElement;
    background = paint === null ? 'rgb(0, 0, 0)' : getComputedStyle(paint).backgroundColor;
  }
  return { text: getComputedStyle(row).color, background };
});
const ratio = at === null ? 0 : contrast(at.text, at.background);
record(ratio >= 4.5, `the highlighted row reads at ${ratio.toFixed(1)}:1, at least 4.5:1`);

// Escape closes, and nothing moved.
await page.keyboard.press('Escape');
record((await options.count()) === 0, 'Escape closes the menu');
record(new URL(page.url()).pathname.includes(`/workspace/${WORKSPACE}`), 'and leaves us where we were');

// The keyboard alone moves to another workspace.
if (ids.length > 1) {
  await menu.focus();
  await page.keyboard.press('ArrowDown');
  await options.first().waitFor({ timeout: 5000 });
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  const now = await workspaceShown(page);
  record(now !== null && now !== String(WORKSPACE), `arrows and Enter move to another workspace (${now})`);
  // And back, so the workspace this run started in is where it ends.
  await menu.click();
  await page.locator(`[role="option"][data-workspace-id="${WORKSPACE}"]`).click();
}

await finish(browser);
