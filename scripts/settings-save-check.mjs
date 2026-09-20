/**
 * The settings page has one Save, and it is at the top.
 *
 * It had five - one beside each number - and five buttons for one verb is five
 * decisions about when to press: somebody changing two numbers had to notice
 * that the first one had its own button, and a page that long hides the second
 * below the fold.
 *
 * The switches keep none, deliberately. A switch that needs saving is a switch
 * that lies about what it is showing, so those take effect as they are
 * flipped - which is why this counts buttons rather than controls.
 */
import { BASE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1500, height: 1000 } });

await page.goto(`${BASE}/admin/settings`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#plugin-timeout-seconds', { timeout: 20_000 });
await page.waitForTimeout(400);

/** Every Save on the page, and where the one is. */
const saves = () =>
  page.evaluate(() => {
    const all = [...document.querySelectorAll('button')].filter(
      (one) => one.textContent.trim() === 'Save',
    );
    const card = document.querySelector('section header');
    return {
      count: all.length,
      inTheHeader: all.filter((one) => card?.contains(one) === true).length,
      enabled: all.filter((one) => !one.disabled).length,
      saidSaved: document.body.innerText.includes('Saved.'),
    };
  });

const opened = await saves();
record(opened.count === 1, `one Save on the page (${opened.count})`);
record(opened.inTheHeader === 1, 'and it is in the page\'s own header, beside the title');
record(
  opened.enabled === 0,
  'quiet until something differs from what the server holds',
);

/* -------------------------------------------------- changing one, then two */

const wait = page.locator('#plugin-timeout-seconds');
const held = await wait.inputValue();
await wait.fill(String(Number(held) + 15));
await page.waitForTimeout(250);
record((await saves()).enabled === 1, 'a changed number wakes it');

await wait.fill(held);
await page.waitForTimeout(250);
record(
  (await saves()).enabled === 0,
  'and typing the old number back puts it to sleep again, rather than saving what did not change',
);

/*
 * Two at once, which is what one button is for: the old page saved the first
 * and left the second sitting in its box.
 */
const size = page.locator('#plugin-max-source-kb');
const heldSize = await size.inputValue();
await wait.fill(String(Number(held) + 15));
await size.fill(String(Number(heldSize) + 512));
await page.waitForTimeout(250);
await page.getByRole('button', { name: 'Save the settings on this page' }).click();
await page.waitForTimeout(1500);

const after = await saves();
record(after.saidSaved, 'pressing it says so');
record(after.enabled === 0, 'and goes quiet, because the page now agrees with the server');

await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('#plugin-timeout-seconds', { timeout: 20_000 });
await page.waitForTimeout(500);
const back = {
  wait: await page.locator('#plugin-timeout-seconds').inputValue(),
  size: await page.locator('#plugin-max-source-kb').inputValue(),
};
record(
  back.wait === String(Number(held) + 15) && back.size === String(Number(heldSize) + 512),
  `both numbers were stored, not just the first (${JSON.stringify(back)})`,
);

// Put the installation back the way it was found.
await page.locator('#plugin-timeout-seconds').fill(held);
await page.locator('#plugin-max-source-kb').fill(heldSize);
await page.getByRole('button', { name: 'Save the settings on this page' }).click();
await page.waitForTimeout(1200);

await finish(browser);
