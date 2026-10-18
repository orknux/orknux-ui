/**
 * The quick-actions shortcut closes the box it opened.
 *
 * Ctrl+Q opened the quick actions and pressing it again left them open, so the
 * only way back was Escape or a click somewhere else. The same keys now put the
 * box away; pressed while it is on the other list (recently opened), they
 * switch lists rather than closing.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 900 } });

await page.goto(`${BASE}/workspace/${WORKSPACE}/workflows`, { waitUntil: 'domcontentloaded' });
await page.getByPlaceholder(/Quick actions/).waitFor({ timeout: 20_000 });
await page.waitForTimeout(1500);
record((await page.locator('[role="option"]').count()) === 0, 'the quick actions start closed');

const listed = () => page.locator('[role="listbox"], [role="option"]').count();

await page.keyboard.press('Control+q');
await page.waitForTimeout(250);
record((await listed()) > 0, 'Ctrl+Q opens the quick actions');

await page.keyboard.press('Control+q');
await page.waitForTimeout(250);
record((await listed()) === 0, `Ctrl+Q again puts them away (${await listed()} options left)`);

await page.keyboard.press('Control+q');
await page.waitForTimeout(250);
record((await listed()) > 0, 'and opens them again after');

await finish(browser);
