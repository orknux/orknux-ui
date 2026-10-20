/**
 * Save as a template: the description box is as tall as the rows it asks for.
 *
 * It stood in its field without the wrapper row the shared input style sizes
 * itself in, so it drew one cropped line - the placeholder cut through the
 * middle - whatever its rows said. Opened from the agents list, and measured.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1400, height: 1000 } });

await page.goto(`${BASE}/workspace/${WORKSPACE}/agents`, { waitUntil: 'domcontentloaded' });
const button = page.locator('button[aria-label^="Save "][aria-label$=" as a template"]').first();
await button.waitFor({ timeout: 20_000 }).catch(() => undefined);
record((await button.count()) === 1, 'an agent offers to be saved as a template');

if ((await button.count()) === 1) {
  await button.click();
  const dialog = page.locator('dialog[open]');
  const box = dialog.locator('[data-template-description]');
  await box.waitFor({ timeout: 10_000 }).catch(() => undefined);
  const measured = await box.evaluate((one) => {
    const style = getComputedStyle(one);
    return { height: one.getBoundingClientRect().height, line: parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5 };
  }).catch(() => null);
  record(
    measured !== null && measured.height >= measured.line * 2.5,
    `the description box shows its three rows, not one cropped line (${JSON.stringify(measured)})`,
  );

  /*
   * And a choice shows as chosen. Every row mounts its own dialog, and the
   * radios shared one name across the page, so the open dialog's dot stayed
   * empty whichever was picked.
   */
  const radios = dialog.locator('input[type="radio"]');
  await radios.nth(1).click();
  const picked = await radios.evaluateAll((all) => all.map((one) => one.checked));
  record(JSON.stringify(picked) === '[false,true]', `the choice clicked is the one checked (${JSON.stringify(picked)})`);
}

await finish(browser);
