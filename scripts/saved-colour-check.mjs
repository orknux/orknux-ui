/**
 * "Saved." is the same green on every settings page.
 *
 * Reported: Workspace Settings drew it in the muted grey its "Not saved yet."
 * uses, beside pages where it is green. Measured as the computed colour of the
 * note after a save, against the success token the rest of the pages use.
 */
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1500, height: 1000 } });

const success = async () =>
  page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--color-success)';
    document.body.append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  });

await page.goto(`${BASE}/workspace/${WORKSPACE}/settings`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'workspace settings'), 'workspace settings is on screen');
const save = page.getByRole('button', { name: /^Save Changes/ }).first();
await save.waitFor({ timeout: 20_000 });
// Nothing to save until something changes: change the name, and put it back afterwards.
const name = page.locator('input[type="text"]').first();
const was = await name.inputValue();
await name.fill(`${was}.`);
await save.click();
const note = page.getByText('Saved.', { exact: true }).first();
const shown = await note.waitFor({ timeout: 10_000 }).then(() => true).catch(() => false);
record(shown, 'the page says Saved.');
if (shown) {
  const drawnColour = await note.evaluate((el) => getComputedStyle(el).color);
  const green = await success();
  record(drawnColour === green, `and it is the success green (${drawnColour}, wanted ${green})`);
}

await name.fill(was);
await save.click().catch(() => undefined);
await page.waitForTimeout(1000);
await finish(browser);
