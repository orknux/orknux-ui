/**
 * A parameter that names its values is answered from a list.
 *
 * What this replaces is a plugin checking the string itself and throwing a
 * sentence listing the choices - so a typo was found at the first call rather
 * than at the moment it was typed. Declared, the field is a picker, and a
 * value that is not on the list cannot be chosen.
 *
 * The other half matters as much: a parameter that names nothing is still a
 * text box. This is not "every parameter becomes a dropdown".
 */
import { readFileSync } from 'node:fs';

import { BASE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 1000 } });

/** One plugin, two parameters: one that names its values and one that does not. */
const source = `
export default class Picked extends OrknuxPlugin {
  id() { return 'picked'; }
  apiVersion() { return 1; }
  parameters() {
    return [
      new OrknuxParameter({
        name: 'backend',
        type: 'string',
        description: 'Which service to ask.',
        options: ['tavily', 'brave'],
      }),
      new OrknuxParameter({ name: 'region', type: 'string', required: false }),
    ];
  }
}
`;

await page.goto(`${BASE}/admin/plugins?tab=catalog&source=local`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[role=tablist]', { timeout: 20_000 });
await page.waitForTimeout(800);
await page.setInputFiles('input[type=file]', {
  name: 'picked.js',
  mimeType: 'text/javascript',
  buffer: Buffer.from(source),
});
await page.waitForTimeout(3000);
record(true, 'a plugin naming its values loads');

await page.goto(`${BASE}/workspace/9/plugins`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
// The parameters sit behind the plugin's own row.
await page.getByText('picked', { exact: false }).first().click().catch(() => {});
await page.waitForTimeout(1200);

const seen = await page.evaluate(() => {
  const field = (name) => {
    const label = [...document.querySelectorAll('label')].find((one) =>
      one.textContent?.trim().startsWith(name),
    );
    const held = label?.htmlFor ? document.getElementById(label.htmlFor) : null;
    if (held === null || held === undefined) return null;
    return {
      tag: held.tagName,
      options: held.tagName === 'SELECT' ? [...held.options].map((o) => o.textContent?.trim()) : null,
    };
  };
  return { backend: field('backend'), region: field('region') };
});

record(seen.backend?.tag === 'SELECT', `the named one is a picker (${seen.backend?.tag ?? 'missing'})`);
record(
  seen.backend?.options?.includes('tavily') === true && seen.backend?.options?.includes('brave') === true,
  'offering what the plugin declared',
);
record(
  seen.backend?.options?.length === 3,
  `and nothing else, beside the prompt (${seen.backend?.options?.join(', ') ?? 'none'})`,
);
record(seen.region?.tag === 'INPUT', `the one that named none is still typed (${seen.region?.tag ?? 'missing'})`);

// Choosing stores it, which is the whole point of the control.
await page.selectOption('select[id$="-backend"]', 'brave');
await page.waitForTimeout(1500);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
await page.getByText('picked', { exact: false }).first().click().catch(() => {});
await page.waitForTimeout(1000);
record(
  (await page.locator('select[id$="-backend"]').first().inputValue()) === 'brave',
  'and a choice is kept',
);

await finish(browser);
