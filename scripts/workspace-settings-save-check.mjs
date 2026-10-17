/**
 * The workspace settings page saves from the strip floating at the foot of
 * the window, not from its header or from a footer at the end of the page.
 *
 * The page is several screens of cards. A Save at the end of it is one
 * somebody scrolls past on the way out, and one in the header is one they
 * scroll away from with the field they changed at the bottom - so the one Save
 * Changes is in the strip that floats over the page's foot, in view wherever
 * the reader is, with the note that says which state the page is in beside
 * it. Nothing at the end of the page is a bar of buttons of its own.
 *
 * Changes nothing: it types into a field, reads the note, and puts the field
 * back without saving.
 */
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 900 } });

await page.goto(`${BASE}/workspace/${WORKSPACE}/settings`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the workspace settings page'), 'the workspace settings page is on screen');
await page.waitForSelector('h1', { timeout: 20_000 });

const save = page.getByRole('button', { name: /^Save Changes$/ });
record((await save.count()) === 1, `there is one Save Changes on the page (${await save.count()})`);

/* In the strip at the foot of the window, on screen without scrolling. */
const inStrip = await save.first().evaluate((button) => {
  const strip = button.closest('[data-testid="save-bar"]');
  return strip !== null && button.getBoundingClientRect().bottom <= innerHeight;
});
record(inStrip, 'and it sits in the strip at the foot of the window, on screen');

/* The note is beside it, and says nothing until something is changed. */
const stripText = () => page.evaluate(() => document.querySelector('[data-testid="save-bar"]')?.innerText ?? '');
const quiet = await stripText();
record(!quiet.includes('Not saved yet'), 'with nothing to say while the page is as it was saved');

const marker = page.locator('#workspace-description');
if ((await marker.count()) === 1) {
  const was = await marker.inputValue();
  await marker.fill(`${was} zz`);
  await page.waitForTimeout(400);
  const busy = await stripText();
  record(busy.includes('Not saved yet'), 'a change says so in the strip, beside the button');
  await marker.fill(was);
} else {
  record(false, 'the description box, which this uses to make a change');
}

/* And no Save Changes anywhere but the strip. */
const elsewhere = await page.evaluate(() => {
  const saves = Array.from(document.querySelectorAll('button')).filter(
    (one) => one.textContent?.trim() === 'Save Changes',
  );
  return saves.filter((one) => one.closest('[data-testid="save-bar"]') === null).length;
});
record(elsewhere === 0, `no Save Changes outside the strip (${elsewhere})`);

await finish(browser);
