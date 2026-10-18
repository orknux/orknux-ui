/**
 * The chat list is dragged wider by its right edge, and stays as wide.
 *
 * Chat names were cut off at the shell's fixed sidebar width. The chat page's
 * sidebar now has a handle on its edge: dragged, the column follows; reloaded,
 * it is as wide as it was left; double-clicked, it is the shell's width again.
 * Other pages keep the fixed column.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 900 } });
const column = () => page.locator('[data-shell-sidebar]').boundingBox();

await page.goto(`${BASE}/chat`, { waitUntil: 'domcontentloaded' });
const handle = page.getByRole('separator', { name: 'Width of the sidebar' });
await handle.waitFor({ timeout: 20_000 });
await handle.dblclick();
await page.waitForTimeout(300);
const before = (await column()).width;

const grip = await handle.boundingBox();
await page.mouse.move(grip.x + grip.width / 2, grip.y + 200);
await page.mouse.down();
await page.mouse.move(grip.x + grip.width / 2 + 120, grip.y + 200, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(300);
const after = (await column()).width;
record(after > before + 100, `dragging the edge widens the chat list (${Math.round(before)} -> ${Math.round(after)}px)`);

await page.reload({ waitUntil: 'domcontentloaded' });
await handle.waitFor({ timeout: 20_000 });
await page.waitForTimeout(500);
const kept = (await column()).width;
record(Math.abs(kept - after) < 4, `and it is as wide after a reload (${Math.round(kept)}px)`);

await handle.dblclick();
await page.waitForTimeout(400);
record(Math.abs((await column()).width - before) < 4, 'double-clicking puts it back');

await page.goto(`${BASE}/workspace/${WORKSPACE}/workflows`, { waitUntil: 'domcontentloaded' });
await page.locator('[data-shell-sidebar]').waitFor({ timeout: 20_000 });
record((await page.getByRole('separator', { name: 'Width of the sidebar' }).count()) === 0, 'other pages keep the fixed column');

await finish(browser);
