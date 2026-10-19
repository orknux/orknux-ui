/**
 * A new function's Create button waits for something to create.
 *
 * Opened, the page holds the starter - a name and a stub - which is not a
 * function anybody wrote, so Create Function is off, as Save Changes is on a
 * function with nothing changed. Typing into the code turns it on; Discard
 * would then have something to throw away.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1600, height: 1000 } });

await page.goto(`${BASE}/workspace/${WORKSPACE}/functions/new`, { waitUntil: 'domcontentloaded' });
const create = page.getByRole('button', { name: 'Create Function' });
await create.waitFor({ timeout: 20_000 });
await page.waitForTimeout(2000);
record(await create.isDisabled(), 'a new function, untouched, cannot be created yet');

await page.locator('.monaco-editor .view-lines').first().click();
await page.keyboard.press('Control+End');
await page.keyboard.type('// written here');
await page.waitForTimeout(500);
record(await create.isEnabled(), 'typing into it turns Create Function on');

await finish(browser);
