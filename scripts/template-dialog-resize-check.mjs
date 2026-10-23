/**
 * Use a template can be made bigger by dragging its corner.
 *
 * The plan it shows lists a dozen rows in a box 420px wide. The dialog stays
 * centred, so a drag of its corner grows it to both sides and both ways.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1400, height: 1000 } });

await page.goto(`${BASE}/workspace/${WORKSPACE}/agents`, { waitUntil: 'domcontentloaded' });
const use = page.getByRole('button', { name: 'Use template' }).first();
await use.waitFor({ timeout: 20_000 }).catch(() => undefined);
await use.click().catch(() => undefined);
const dialog = page.locator('dialog[open]');
await dialog.waitFor({ timeout: 10_000 }).catch(() => undefined);
await page.waitForTimeout(500);

const before = await dialog.boundingBox();
record(before !== null, 'Use a template opens');
if (before !== null) {
  // The bottom-right corner's own handle, at its middle: its outermost pixels are outside the rounded corner.
  const grip = await dialog.locator('[data-edge="se"]').boundingBox();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width + 200, before.y + before.height + 150, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const after = await dialog.boundingBox();
  record(after !== null && after.width > before.width + 100, `dragging its corner makes it wider (${before.width} -> ${after?.width})`);
  record(after !== null && after.height > before.height + 50, `and taller (${before.height} -> ${after?.height})`);
  record(after !== null && after.x === before.x && after.y === before.y, `the left and top edges stay where they were (${before.x} -> ${after?.x})`);
}

await finish(browser);
