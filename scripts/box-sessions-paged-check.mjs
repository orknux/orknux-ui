/**
 * A box's page lists its sessions a page at a time, and every column orders
 * them.
 *
 * The list is up to two hundred sessions - what this installation recorded on
 * the box and what the box itself holds - and it was drawn whole, so a busy box
 * was a page you scrolled through to reach Delete. It now shows ten by default
 * under the pager the other lists have, with 5, 10 and 25 to choose from, and
 * each heading puts the sessions in its order: newest activity first to begin
 * with, a press on a heading for its own order, a second press for the other
 * way round.
 *
 * Canned: `boxSessions` is answered here with twelve sessions, on a scratch box
 * at an address under `.invalid` that the check makes and removes again.
 */
import { BASE, open, record, drawn, finish, chooseOption, optionsOffered } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });
const NAME = 'boxSessionsPagedScratch';
for (const old of (await graphql(`{ boxes { id name } }`)).boxes.filter((one) => one.name === NAME)) {
  await graphql(`mutation ($id: ID!) { deleteBox(id: $id) }`, { id: old.id }).catch(() => undefined);
}
const box = (await graphql(`mutation ($input: BoxInput!) { createBox(input: $input) { id } }`, {
  input: { name: NAME, label: 'box-sessions-paged', address: 'http://box-sessions-paged.invalid:8090', token: null },
})).createBox;

const AGENTS = ['Mira', 'Ada', 'Lin', 'Bo'];
const minutesAgo = (n) => new Date(Date.now() - n * 60_000).toISOString();
// ses_01 is the newest, ses_12 the oldest; agents and command counts run in other orders.
const SESSIONS = Array.from({ length: 12 }, (_, at) => ({
  id: `ses_${String(at + 1).padStart(2, '0')}`,
  status: at % 3 === 0 ? 'stopped' : 'ready',
  runtime: 'docker',
  image: at % 2 === 0 ? 'orknux/orkbox-toolchain:latest' : 'node:22',
  labels: '{}',
  createdAt: minutesAgo(100 + at),
  lastActivityAt: minutesAgo(at + 1),
  expiresAt: at % 3 === 0 ? null : new Date(Date.now() + (at + 1) * 3_600_000).toISOString(),
  runningExecutions: 0,
  totalExecutions: (at * 7) % 12,
  orknuxSessionId: null,
  orknuxSessionUrl: null,
  agentName: AGENTS[at % AGENTS.length],
  active: at % 3 !== 0,
}));

await page.route('**/graphql', async (route) => {
  const body = route.request().postDataJSON() ?? {};
  if (!(body.query ?? '').includes('boxSessions')) return route.continue();
  return route.fulfill({ json: { data: { boxSessions: SESSIONS } } });
});

await page.goto(`${BASE}/admin/boxes/${box.id}`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, "the box's page", { within: 60_000 }), "the box's page opens");
const card = page.locator('[data-box-sessions]');
const rows = card.locator('[data-box-session]');
await rows.first().waitFor({ timeout: 20_000 }).catch(() => undefined);
const ids = async () => rows.evaluateAll((all) => all.map((one) => one.getAttribute('data-box-session')));

record((await rows.count()) === 10, `ten of the twelve are shown at first (${await rows.count()})`);
const summary = (await card.innerText().catch(() => '')).replace(/\s+/g, ' ');
record(/Showing 1-10 of 12 sessions/.test(summary), 'under the pager every list has');
const sizes = (await optionsOffered(page, card.locator('[data-select]').first()).catch(() => [])).map((one) => one.value);
record(JSON.stringify(sizes) === '["5","10","25"]', `with 5, 10 and 25 to choose from (${sizes.join(', ')})`);
record((await ids())[0] === 'ses_01', `newest activity first to begin with (${(await ids())[0]})`);

await chooseOption(page, card.locator('[data-select]').first(), '5');
await page.waitForTimeout(200);
record((await rows.count()) === 5, `choosing 5 shows five (${await rows.count()})`);
await card.getByRole('button', { name: /^Next/ }).click();
await page.waitForTimeout(200);
record((await ids()).join(',') === 'ses_06,ses_07,ses_08,ses_09,ses_10', `and Next the next five (${(await ids()).join(',')})`);

// Every heading is a press.
const headings = await card.locator('[aria-sort] button').allInnerTexts();
record(headings.length === 6, `all six headings order the list (${headings.join(' | ')})`);

await card.locator('[aria-sort] button', { hasText: /^Agent$/ }).click();
await page.waitForTimeout(200);
const agentsShown = await rows.evaluateAll((all) => all.map((one) => one.children[1]?.textContent?.trim() ?? ''));
record(agentsShown.join(',') === 'Ada,Ada,Ada,Bo,Bo', `Agent orders by agent from A, back on the first page (${agentsShown.join(', ')})`);
await card.locator('[aria-sort] button', { hasText: /^Agent$/ }).click();
await page.waitForTimeout(200);
const reversed = await rows.evaluateAll((all) => all.map((one) => one.children[1]?.textContent?.trim() ?? ''));
record(reversed[0] === 'Mira', `a second press turns it round (${reversed.join(', ')})`);

await card.locator('[aria-sort] button', { hasText: /^Commands$/ }).click();
await page.waitForTimeout(200);
const counts = await rows.evaluateAll((all) => all.map((one) => Number((one.children[5]?.textContent ?? '').split('/')[1])));
record(counts.every((n, at) => at === 0 || counts[at - 1] >= n), `Commands orders by commands run, most first (${counts.join(', ')})`);

await graphql(`mutation ($id: ID!) { deleteBox(id: $id) }`, { id: box.id }).catch(() => undefined);
await finish(browser);
