/**
 * The admin list of templates says when each was published and last changed.
 *
 * The list said what a template holds and who published it, but not when -
 * so which of two templates of an agent was the current one, or whether one
 * had been brought up to date since, meant opening each. Created and Updated
 * are columns now, each sortable.
 *
 * Measured: both headings are drawn; every row has a date in each, under its
 * heading; and pressing Updated twice orders the rows newest first, read off
 * the server's own lastModifiedAt.
 */
import { BASE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });

const name = `zzDates ${Date.now()}`;
const { componentTemplates: before } = await graphql('{ componentTemplates { id } }');
if (before.length === 0) {
  // One to list, from a file of nothing would be refused; publish an agent instead where there are none.
  record(false, 'this installation has no templates to list; publish one first');
  await finish(browser);
}

await page.goto(`${BASE}/admin/templates`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the templates list'), 'the templates list opens');

const created = page.getByRole('button', { name: /^Created/ });
const updated = page.getByRole('button', { name: /^Updated/ });
const headed = await updated
  .waitFor({ timeout: 20_000 })
  .then(() => true)
  .catch(() => false);
record(headed && (await created.count()) === 1, 'the list has Created and Updated columns');
if (!headed) await finish(browser);

const rows = await page.locator('[data-template-name]').count();
const createdCells = page.locator('[data-template-created]');
const updatedCells = page.locator('[data-template-updated]');
record((await createdCells.count()) === rows && (await updatedCells.count()) === rows, `every row has both dates (${rows} rows)`);
const words = await updatedCells.allInnerTexts();
record(words.every((one) => /^[A-Z][a-z]{2} \d{1,2}, \d{4}$/.test(one.trim())), `each reads as a day (${words[0]?.trim()})`);

const head = await updated.boundingBox();
const lefts = await updatedCells.evaluateAll((all) => all.map((one) => one.getBoundingClientRect().left));
record(head !== null && lefts.every((left) => Math.abs(left - head.x) < 6), 'the dates sit under their heading');

/* Newest first: pressed until the server's newest is on top. */
const { componentTemplates } = await graphql('{ componentTemplates { name lastModifiedAt } }');
const newest = [...componentTemplates].sort((a, b) => b.lastModifiedAt.localeCompare(a.lastModifiedAt))[0].name;
let top = '';
for (let press = 0; press < 2 && top !== newest; press += 1) {
  await updated.click();
  await page.waitForTimeout(300);
  top = (await page.locator('[data-template-name]').first().innerText()).trim();
}
record(top === newest, `sorting by Updated puts the most recently changed first (${top})`);

void name;
await finish(browser);
