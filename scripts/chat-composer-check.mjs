/**
 * The chat's composer and list, drawn as they should be.
 *
 * - A picture pasted into the box is attached the way an uploaded one is. It
 *   could only be uploaded through the menu, so a screenshot had to be saved to
 *   a file first.
 * - The "+" menu opens above the button on one line. A sweep for the 32px row
 *   button had restyled it by its shape, and "Upload files" wrapped inside a
 *   32px box hanging over the input.
 * - A chat's row in the list is its title. The same speech bubble on every row
 *   said nothing and cost the title its room.
 *
 * The upload is stubbed, so nothing is stored.
 */
import { BASE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 1000 } });

const uploads = [];
await page.route('**/api/workspaces/*/attachments', async (route) => {
  if (route.request().method() !== 'POST') return route.continue();
  uploads.push(route.request().postDataBuffer()?.length ?? 0);
  const n = uploads.length;
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ attachments: [{ id: `pasted-${n}`, filename: `pasted-${n}.png`, contentType: 'image/png', sizeBytes: 68 }] }),
  });
});

await page.goto(`${BASE}/chat`, { waitUntil: 'domcontentloaded' });
const composer = page.locator('#chat-composer');
await composer.waitFor({ state: 'visible', timeout: 20_000 });
await page.waitForTimeout(800);

/* ---- the list ---- */
const rows = await page.evaluate(() =>
  [...document.querySelectorAll('[class*="_sessionButton_"]')].slice(0, 8).map((button) => {
    const title = button.querySelector('[class*="_sessionTitle_"]');
    return {
      images: button.querySelectorAll('img, svg').length,
      offset: title ? Math.round(title.getBoundingClientRect().left - button.getBoundingClientRect().left) : null,
      height: Math.round(button.getBoundingClientRect().height),
    };
  }),
);
record(rows.length > 0 && rows.every((one) => one.images === 0), `a chat's row draws no icon (${JSON.stringify(rows.map((one) => one.images))})`);
record(
  rows.length > 0 && rows.every((one) => one.offset !== null && one.offset <= 16),
  `and its title starts at the row's padding (${JSON.stringify(rows.map((one) => one.offset))})`,
);

/* ---- the "+" menu ---- */
const add = page.getByRole('button', { name: 'Add to this message' });
if ((await add.count()) === 0) {
  record(false, 'the open chat offers no "+" - attachments are off for its model, so nothing here can be checked');
  await finish(browser);
}
const centres = await page.evaluate(() => {
  const button = document.querySelector('button[aria-label="Add to this message"]');
  const input = document.querySelector('#chat-composer');
  const a = button.getBoundingClientRect();
  const b = input.getBoundingClientRect();
  return { button: a.top + a.height / 2, input: b.top + b.height / 2 };
});
record(Math.abs(centres.button - centres.input) <= 2, `the "+" sits level with the box (${JSON.stringify(centres)})`);
await add.click();
const item = page.getByRole('menuitem', { name: 'Upload files' });
await item.waitFor({ timeout: 3_000 }).catch(() => {});
const menu = await page.evaluate(() => {
  const item = [...document.querySelectorAll('[role="menuitem"]')].find((one) => one.textContent?.trim() === 'Upload files');
  const button = document.querySelector('button[aria-label="Add to this message"]');
  if (!item || !button) return null;
  const a = item.getBoundingClientRect();
  const b = button.getBoundingClientRect();
  return { height: Math.round(a.height), bottom: Math.round(a.bottom), buttonTop: Math.round(b.top) };
});
record(menu !== null && menu.height < 40, `"Upload files" is one line (${menu?.height}px tall)`);
record(menu !== null && menu.bottom <= menu.buttonTop, `and the menu opens above the button, clear of the box (${JSON.stringify(menu)})`);
await page.keyboard.press('Escape');
await add.click().catch(() => {});

/* ---- pasting a picture ---- */
const before = await page.locator('[class*="_attachment_"]').count();
await composer.click();
await composer.evaluate((box) => {
  // A 1x1 PNG.
  const bytes = Uint8Array.from(
    atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='),
    (c) => c.charCodeAt(0),
  );
  const transfer = new DataTransfer();
  transfer.items.add(new File([bytes], 'screenshot.png', { type: 'image/png' }));
  transfer.items.add(new File([bytes], 'second.png', { type: 'image/png' }));
  box.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
});
await page.waitForTimeout(1_000);
const after = await page.locator('[class*="_attachment_"]').count();
record(uploads.length === 1, `a pasted picture is uploaded, both in one request (${uploads.length} requests)`);
record(after > before, `and it is drawn as an attachment, as an uploaded one is (${before} then ${after})`);

/* A picture on its own is a message: Send is offered with nothing typed. */
await composer.fill('');
const send = page.locator('form:has(#chat-composer) button[type="submit"]');
record((await composer.inputValue()) === '' && (await send.isEnabled()), 'with only an attachment and no text, Send can be pressed');

/* Pasting text is still pasting text. */
const draft = await composer.inputValue();
await composer.evaluate((box) => {
  const transfer = new DataTransfer();
  transfer.setData('text/plain', 'just words');
  box.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
});
await page.waitForTimeout(300);
record(uploads.length === 1, `pasting text uploads nothing (${uploads.length} requests)`);
record((await composer.inputValue()) === draft, 'and the page does not take it over');

await finish(browser);
