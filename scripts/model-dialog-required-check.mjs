/**
 * Add Model marks the fields it cannot be sent without.
 *
 * The form refuses to add a model without a name and a model id, and without a
 * provider - or, for speech and transcription, a server URL. Those labels carry
 * the red star the product marks a required field with; the rest - limits,
 * prices, a voice, an optional key - carry none.
 */
import { BASE, WORKSPACE, open, record, finish, chooseOption } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 1000 } });

await page.goto(`${BASE}/workspace/${WORKSPACE}/models`, { waitUntil: 'domcontentloaded' });
await page.getByRole('button', { name: '+ Add Model' }).click({ timeout: 20_000 });
const dialog = page.locator('dialog[open]');
await dialog.locator('#model-kind').waitFor({ timeout: 10_000 }).catch(() => undefined);

/** The labels carrying a star, by their own words; and that the star is drawn in red. */
const starred = () =>
  dialog.evaluate((one) =>
    [...one.querySelectorAll('label')]
      .filter((label) => label.textContent.trim().endsWith('*'))
      .map((label) => ({
        text: label.textContent.replace('*', '').trim(),
        colour: getComputedStyle(label.querySelector('span')).color,
      })),
  );

const chat = await starred();
record(JSON.stringify(chat.map((one) => one.text)) === JSON.stringify(['Provider', 'Name', 'Model ID']),
  `a chat model marks Provider, Name and Model ID as required, and nothing else (${JSON.stringify(chat.map((one) => one.text))})`);
record(chat.every((one) => /^rgb\((2[0-9]{2}), \d+, \d+\)$/.test(one.colour) && Number(one.colour.match(/\d+/)[0]) > 150),
  `in red (${JSON.stringify(chat.map((one) => one.colour))})`);

await chooseOption(page, dialog.locator('#model-kind'), 'SPEECH');
await page.waitForTimeout(200);
const speech = (await starred()).map((one) => one.text);
record(JSON.stringify(speech) === JSON.stringify(['Server URL', 'Name', 'Model ID']),
  `a speech model marks Server URL instead of a provider, and leaves the key unmarked (${JSON.stringify(speech)})`);

await finish(browser);
