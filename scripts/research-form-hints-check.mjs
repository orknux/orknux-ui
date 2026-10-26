/**
 * Every field of New research has a (?) that says what it does, behind the
 * mark rather than printed under the field.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const FIELDS = ['Question', 'Mode', 'Planner', 'Writer', 'Reviewer', 'Use web search', 'Include images', 'Review', 'Follow-up questions', 'Websites', 'Documents', 'Language', 'Output'];

const { browser, page } = await open({ viewport: { width: 1440, height: 1000 } });
await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/research`, { waitUntil: 'domcontentloaded' });
await page.getByRole('button', { name: 'New research' }).click({ timeout: 20_000 });
await page.locator('#research-question').waitFor({ timeout: 10_000 });
await page.waitForTimeout(300);

const hinted = await page.evaluate(() => [...document.querySelectorAll('form:has(#research-question) button[data-hint]')].map((one) => one.getAttribute('data-hint')));
// Reviewer is drawn only while Review is ticked.
const reviewerShown = (await page.locator('#research-reviewer').count()) > 0;
const missing = FIELDS.filter((field) => field !== 'Reviewer' || reviewerShown).filter((field) => !hinted.includes(field));
record(missing.length === 0, `every field has a (?) (missing: ${JSON.stringify(missing)}; found ${JSON.stringify(hinted)})`);

// A box's (?) sits by its words, not a whole gap away.
const near = await page.evaluate(() => ['Use web search', 'Include images', 'Review'].map((name) => {
  const hint = document.querySelector(`form:has(#research-question) button[data-hint="${name}"]`);
  const label = hint?.closest('[class*="_check_"]')?.querySelector('label');
  return label && hint ? Math.round(hint.getBoundingClientRect().left - label.getBoundingClientRect().right) : null;
}));
record(near.every((gap) => gap !== null && gap <= 8), `each box's (?) sits by its words (${JSON.stringify(near)}px)`);

// One of them, opened: it says something, and the form printed none of it.
await page.locator('form:has(#research-question) button[data-hint="Planner"]').first().click().catch(() => {});
await page.waitForTimeout(300);
const note = await page.evaluate(() => document.querySelector('[class*="_popover_"]')?.textContent ?? '');
record(/searches/i.test(note), `the Planner's (?) says what the Planner does (${JSON.stringify(note.slice(0, 80))})`);

await finish(browser);
