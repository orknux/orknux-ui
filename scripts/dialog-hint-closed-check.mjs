/**
 * A dialog opened with the mouse does not open the note beside its title.
 *
 * Opening a dialog focuses the first control in it, and a hint opened on
 * focus - so where that control was the (?) beside the title, the note sat
 * over the dialog as it appeared: Use a template, Harmonize. A focus from the
 * keyboard still opens it, because that is how somebody who cannot hover asks.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1400, height: 1000 } });

await page.goto(`${BASE}/workspace/${WORKSPACE}/agents`, { waitUntil: 'domcontentloaded' });
const use = page.getByRole('button', { name: 'Use template' }).first();
await use.waitFor({ timeout: 20_000 }).catch(() => undefined);
record((await use.count()) === 1, 'the agents list offers Use template');

if ((await use.count()) === 1) {
  await use.click();
  const dialog = page.locator('dialog[open]');
  await dialog.waitFor({ timeout: 10_000 }).catch(() => undefined);
  await page.waitForTimeout(600);
  const notes = () => dialog.locator('[role="note"]').count();
  record((await notes()) === 0, `opened with the mouse, no note is open over it (${await notes()})`);

  // Tabbing back onto the (?) is a keyboard's focus, and that still shows it.
  const hint = dialog.locator('[data-hint]').first();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  const focused = await hint.evaluate((one) => one === document.activeElement).catch(() => false);
  if (!focused) await hint.focus();
  await page.waitForTimeout(300);
  record((await notes()) > 0, 'focused from the keyboard, it shows the note');
}

await finish(browser);
