/**
 * Pinning a chat shows at once.
 *
 * The pin itself took milliseconds, but the page then waited for the whole chat
 * list to come back - two or three seconds on a workspace with seventy chats -
 * before moving the row. The row moves now and the server is told behind it.
 * Pins one chat and unpins it, so the list is left as it was found.
 */
import { BASE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 900 } });
await page.goto(`${BASE}/chat`, { waitUntil: 'domcontentloaded' });
const rows = page.locator('[class*="_sessionRow_"]');
await rows.first().waitFor({ timeout: 20_000 }).catch(() => {});

/** Whether the chat called [name] is listed under Pinned. */
const underPinned = (name) =>
  page.evaluate((title) => {
    const header = [...document.querySelectorAll('button')].find((one) => /^\s*Pinned\s*$/.test(one.textContent ?? ''));
    const list = header?.nextElementSibling;
    return list ? [...list.querySelectorAll('[class*="_sessionTitle_"]')].some((one) => one.textContent?.trim() === title) : false;
  }, name);

const row = rows.last();
const title = (await row.locator('[class*="_sessionTitle_"]').innerText()).trim();
const wasPinned = await underPinned(title);
await row.hover();
await row.locator('[aria-label^="Actions for"]').click();
const started = Date.now();
await page.getByRole('menuitem', { name: wasPinned ? 'Unpin chat' : 'Pin chat' }).click();
let moved = -1;
for (let waited = 0; waited < 3000; waited += 25) {
  if ((await underPinned(title)) !== wasPinned) {
    moved = Date.now() - started;
    break;
  }
  await page.waitForTimeout(25);
}
record(moved >= 0 && moved < 500, `the chat moves as soon as it is pinned (${moved} ms)`);

/* Put it back. */
const back = page.locator('[class*="_sessionRow_"]', { hasText: title }).first();
await back.hover();
await back.locator('[aria-label^="Actions for"]').click();
await page.getByRole('menuitem', { name: wasPinned ? 'Pin chat' : 'Unpin chat' }).click().catch(() => {});
await page.waitForTimeout(800);
record((await underPinned(title)) === wasPinned, 'and goes back when the pin is undone');

await finish(browser);
