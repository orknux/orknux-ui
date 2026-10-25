/**
 * An editor opened on something that is not there says so and links back to
 * its list - it was a sentence on an empty page with nowhere to go.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1200, height: 800 } });
for (const [path, list] of [
  ['design/wireframes/987654321', 'design/wireframes'],
  ['design/documents/987654321', 'design/documents'],
  ['design/documents/987654321/view', 'design/documents'],
  ['explore/diagrams/987654321', 'explore/diagrams'],
]) {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/${path}`, { waitUntil: 'domcontentloaded' });
  const back = page.getByTestId('missing-back');
  await back.waitFor({ timeout: 15_000 }).catch(() => undefined);
  const href = await back.getAttribute('href').catch(() => null);
  record(href === `/workspace/${WORKSPACE}/${list}`, `${path}: the missing page links back to ${list} (${href})`);
}
await finish(browser);
