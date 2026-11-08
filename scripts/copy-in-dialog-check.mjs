/**
 * A copy button inside a modal dialog puts its text on the clipboard over plain
 * http - not merely says "Copied".
 *
 * On an installation reached as http://192.168.x.y the clipboard API is
 * withheld, and copying falls back to selecting a hidden textarea and running
 * the copy command. While a dialog is shown with showModal() everything outside
 * it is inert: a textarea put on the page body could not take the focus, the
 * copy command copied the empty selection and still reported success, and the
 * button said "Copied" over a clipboard holding nothing. Found pasting the
 * Claude Code guide's pairing sentence.
 *
 * So the check reads what the copy carried, from inside the copy event, rather
 * than what the button said. Meaningful against a server reached over plain
 * http on an address that is not localhost; elsewhere the clipboard API does
 * the work, and it says so.
 */
import { BASE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 900 } });
await page.goto(`${BASE}/preferences`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="device-claude"]', { timeout: 20_000 });
const secure = await page.evaluate(() => window.isSecureContext);
record(true, secure ? 'NOTE: a secure origin, so the fallback is not what is being tested' : 'not a secure origin, so copying takes the fallback');

// What a copy would put on the clipboard: the selected part of the focused text box, read as it happens.
await page.evaluate(() => {
  window.__copied = [];
  document.addEventListener('copy', () => {
    const at = document.activeElement;
    const text = at instanceof HTMLTextAreaElement ? at.value.slice(at.selectionStart, at.selectionEnd) : String(document.getSelection() ?? '');
    window.__copied.push(text);
  }, true);
});

await page.click('[data-testid="device-claude"]');
await page.waitForSelector('[data-testid="claude-code-guide"][open]', { timeout: 5_000 });
await page.click('[data-testid="claude-code-guide"] [data-testid="client-pairing-start"]');
const sentence = (await page.textContent('[data-testid="client-pairing-link"]', { timeout: 10_000 }))?.trim() ?? '';
await page.locator('[data-testid="client-pairing-link"]').locator('xpath=..').locator('button').click();
await page.waitForTimeout(300);
const carried = await page.evaluate(() => window.__copied.at(-1) ?? null);
record(carried === sentence, `the pairing sentence in the guide is what the copy carries: ${JSON.stringify(carried)}`);

await browser.close();
finish();
