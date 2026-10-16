/**
 * The sessions list shows what each session cost - its tokens, in and out
 * together, and its money - and both columns sort.
 *
 * The rows are a fixture: what a session's spend adds up to, and that the
 * server orders by TOKENS and COST, is SessionSpendTest's business. Here the
 * drawing is under test: the figures read on their rows, a session that called
 * no model shows a dash, an unpriced one shows a dash for its cost, and
 * pressing either heading asks the server for that order, both ways round.
 *
 * Makes nothing and removes nothing.
 */
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1500, height: 1000 } });

const AT = '2026-10-16T09:00:00Z';
const row = (id, key, spent) => ({
  id, workspaceId: WORKSPACE, key, keyPrefix: null, eventCount: 3, createdAt: AT, lastEventAt: AT,
  active: false, subagentCount: 0, spent,
});
const ROWS = [
  row('910001', 'spend:priced', { inputTokens: 1_200_000, outputTokens: 300_000, cachedInputTokens: 400_000, cost: '4.5', partlyUnpriced: false }),
  row('910002', 'spend:unpriced', { inputTokens: 2_000, outputTokens: 500, cachedInputTokens: 0, cost: null, partlyUnpriced: true }),
  row('910003', 'spend:none', { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, cost: null, partlyUnpriced: false }),
];

/* Every order the list was asked for, with its direction. */
const orders = [];

await page.route('**/graphql', async (route) => {
  const request = route.request().postDataJSON() ?? {};
  if ((request.query ?? '').includes('llmSessions(')) {
    const vars = request.variables ?? {};
    orders.push(`${vars.order ?? ''}:${vars.ascending === true ? 'up' : 'down'}`);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { llmSessions: { totalElements: ROWS.length, content: ROWS } } }),
    });
    return;
  }
  await route.continue();
});

await page.goto(`${BASE}/workspace/${WORKSPACE}/sessions`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the sessions list'), 'the sessions list opens');
const line = (key) => page.locator('a', { hasText: key }).first();
await line('spend:priced').waitFor({ timeout: 20_000 }).catch(() => undefined);

const cells = async (key) => ({
  tokens: (await line(key).locator('[data-session-tokens]').innerText().catch(() => '')).trim(),
  cost: (await line(key).locator('[data-session-cost]').innerText().catch(() => '')).trim(),
  tip: (await line(key).locator('[data-session-tokens]').getAttribute('title').catch(() => null)) ?? '',
});
const priced = await cells('spend:priced');
const unpriced = await cells('spend:unpriced');
const none = await cells('spend:none');
console.log(JSON.stringify({ priced, unpriced, none }));

record(priced.tokens.replace(/\D/g, '') === '1500000', `a session's tokens are in and out together (${priced.tokens})`);
record(/4[.,]5/.test(priced.cost), `and its cost reads (${priced.cost})`);
record(priced.tip.includes('cached'), `the split is on hover (${priced.tip})`);
record(unpriced.cost === '—' && unpriced.tokens !== '—', 'a session on an unpriced model counts tokens and shows a dash for cost');
record(none.tokens === '—' && none.cost === '—', 'a session that called no model shows a dash in both');

/* The headings line up over their cells. */
const lined = await page.evaluate(() => {
  const head = (label) => [...document.querySelectorAll('[aria-sort]')].find((one) => one.textContent.trim().toLowerCase().startsWith(label));
  const cell = (attr) => document.querySelector(`[${attr}]`);
  const left = (one) => (one ? Math.round(one.getBoundingClientRect().left) : null);
  return { tokens: [left(head('tokens')), left(cell('data-session-tokens'))], cost: [left(head('cost')), left(cell('data-session-cost'))] };
});
record(lined.tokens[0] !== null && lined.tokens[0] === lined.tokens[1], `Tokens heading sits over its cells (${lined.tokens})`);
record(lined.cost[0] !== null && lined.cost[0] === lined.cost[1], `Cost heading sits over its cells (${lined.cost})`);

/* Both headings sort, and a second press turns the order round. */
for (const [label, order] of [['Tokens', 'TOKENS'], ['Cost', 'COST']]) {
  const button = page.locator('[aria-sort] > button', { hasText: new RegExp(`^${label}$`) }).first();
  const heading = button.locator('..');
  const before = orders.length;
  await button.click();
  await page.waitForTimeout(500);
  const first = orders.slice(before).at(-1) ?? '';
  const firstSort = await heading.getAttribute('aria-sort');
  await button.click();
  await page.waitForTimeout(500);
  const second = orders.slice(before).at(-1) ?? '';
  const secondSort = await heading.getAttribute('aria-sort');
  record(first.startsWith(`${order}:`) && second.startsWith(`${order}:`) && first !== second,
    `${label} sorts, and turns round on a second press (${first} then ${second})`);
  record(firstSort !== 'none' && secondSort !== 'none' && firstSort !== secondSort, `${label} heading says which way (${firstSort}, ${secondSort})`);
}

await finish(browser);
