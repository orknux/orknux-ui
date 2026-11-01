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
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });

const name = `zzDates ${Date.now()}`;
/*
 * Its own two, published from an agent: this used to read what other checks
 * happened to leave behind, and they all tidy up after themselves. Two, so that
 * there is an order to sort into, and the second is the newer.
 */
const { workspaceAgents } = await graphql(
  'query($w: ID!) { workspaceAgents(workspaceId: $w, page: 0, size: 1) { content { id } } }',
  { w: WORKSPACE },
);
const publish = async (suffix) =>
  (await graphql(
    `mutation($w: ID!, $id: ID!, $input: ComponentTemplateInput!) {
       saveComponentAsTemplate(workspaceId: $w, kind: AGENT, id: $id, input: $input) { id }
     }`,
    { w: WORKSPACE, id: workspaceAgents.content[0].id, input: { name: `${name} ${suffix}` } },
  )).saveComponentAsTemplate.id;
const remove = async () => {
  for (const id of mine) await graphql('mutation($id: ID!) { deleteComponentTemplate(id: $id) }', { id }).catch(() => undefined);
};
const mine = [await publish('older')];
await page.waitForTimeout(1100); // A second apart, or the two dates are the same to whatever orders them.
mine.push(await publish('newer'));

await page.goto(`${BASE}/admin/templates`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the templates list'), 'the templates list opens');

const created = page.getByRole('button', { name: /^Created/ });
const updated = page.getByRole('button', { name: /^Updated/ });
const headed = await updated
  .waitFor({ timeout: 20_000 })
  .then(() => true)
  .catch(() => false);
record(headed && (await created.count()) === 1, 'the list has Created and Updated columns');
if (!headed) {
  await remove();
  await finish(browser);
}

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

await remove();
await finish(browser);
