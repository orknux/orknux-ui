/**
 * Every report on Admin -> Reports says what it shows, with a (?) beside its name.
 *
 * The reports were a name and a table; what "Flags" or "Errors" counts, and
 * where it comes from, was left to whoever had built it. Each heading now
 * carries a one-line hint.
 *
 * Measured, for each of the four reports picked from the page's own menu: the
 * heading has a hint, on the heading's line.
 */
import { BASE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1500, height: 1000 } });

const REPORTS = [
  { kind: 'usage', heading: 'Tokens by person' },
  { kind: 'ratings', heading: 'Reviews' },
  { kind: 'errors', heading: 'Errors' },
  { kind: 'flags', heading: 'Flags' },
];

for (const report of REPORTS) {
  // The address names the report, as the page's own menu writes it.
  await page.goto(`${BASE}/admin/reports?report=${report.kind}`, { waitUntil: 'domcontentloaded' });
  const hint = page.locator(`h2 [data-hint="${report.heading}"]`);
  const there = await hint.first().waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
  record(there, `${report.heading} says what it shows`);
  if (!there) continue;
  const [hintBox, headingBox] = [await hint.first().boundingBox(), await hint.first().locator('xpath=ancestor::h2').boundingBox()];
  record(
    hintBox !== null && headingBox !== null && hintBox.y >= headingBox.y - 2 && hintBox.y + hintBox.height <= headingBox.y + headingBox.height + 2,
    `on the line of its name`,
  );
}

await finish(browser);
