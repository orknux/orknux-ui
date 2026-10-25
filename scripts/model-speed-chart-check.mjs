/**
 * A model's page draws its prompt and generation speed averaged per period -
 * minute, hour, day, month or year - over the usage card's dates, with a
 * switch for the period, and a gap where a period had no timed calls.
 *
 * Two halves.
 *
 * Stubbed: the speed and the chart's answer are made up here, one answer per
 * period, so what is drawn can be held to exact numbers - one hover target per
 * point, a line per run of consecutive periods, a dot for a period on its own,
 * the dot at the place on the axis its date is, and switching the period
 * changing how many points there are. The query itself is asked of the running
 * server first, for its contract.
 *
 * Live: where the server has timed calls for the model (a developer's or a
 * seeded one; CI's fixture has none, since no model there answers), every
 * period is switched to and the points drawn are counted against the server's
 * own answer. Where it has none this half says so and asserts nothing.
 *
 * Takes the workspace's first chat model. Makes nothing and removes nothing.
 */
import { BASE, WORKSPACE, open, record, finish, shot } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const QUERY = `query($id: ID!, $unit: SpeedUnit!, $from: String, $to: String) {
  model(id: $id) { speedOverTime(unit: $unit, from: $from, to: $to) {
    unit from to truncated points { at calls promptTokensPerSecond generatedTokensPerSecond } } } }`;
const UNITS = ['MINUTE', 'HOUR', 'DAY', 'MONTH', 'YEAR'];

const { models } = await graphql('query($w: ID!) { models(workspaceId: $w) { id kind } }', { w: WORKSPACE })
  .catch(() => ({ models: [] }));
const model = (models ?? []).find((one) => one.kind === 'CHAT');
record(model !== undefined, 'the workspace has a chat model to look at');
if (model === undefined) await finish(browser);

/* ---- The contract: the server answers the query the page sends. */

const contract = await graphql(QUERY, { id: model.id, unit: 'DAY' }).catch((cause) => ({ error: String(cause) }));
record(Array.isArray(contract?.model?.speedOverTime?.points), `the server answers a model's speed over time (${contract?.error ?? 'ok'})`);

/** Waits for a count to come to what it should, rather than reading a page mid-render. */
async function settles(read, wanted, timeout = 10_000) {
  const until = Date.now() + timeout;
  let seen = await read();
  while (seen !== wanted && Date.now() < until) {
    await page.waitForTimeout(150);
    seen = await read();
  }
  return seen;
}

const drawn = (selector) => page.locator(`[data-model-speed-chart] [data-speed-chart="generated"] ${selector}`).count();

async function showModel() {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/models/${model.id}`, { waitUntil: 'domcontentloaded' });
  await page.getByText('Usage Metrics', { exact: true }).waitFor({ timeout: 20_000 }).catch(() => undefined);
}

/* ---- Stubbed. January 2026: days 2-4 in a row, 10 on its own, 20-21 in a row. */

const point = (at, prompt, generated, calls = 3) => ({
  at, calls, promptTokensPerSecond: prompt, generatedTokensPerSecond: generated,
});
const ANSWERS = {
  DAY: [
    point('2026-01-02T00:00', 2000, 40), point('2026-01-03T00:00', 2400, 50), point('2026-01-04T00:00', 1800, 45),
    point('2026-01-10T00:00', 2600, 60, 1),
    point('2026-01-20T00:00', 2200, 55), point('2026-01-21T00:00', 2100, 52),
  ],
  HOUR: [
    point('2026-01-02T09:00', 2000, 40), point('2026-01-02T10:00', 2100, 42), point('2026-01-03T14:00', 2400, 50),
    point('2026-01-04T08:00', 1800, 45), point('2026-01-10T11:00', 2600, 60), point('2026-01-20T16:00', 2200, 55),
    point('2026-01-20T17:00', 2150, 54), point('2026-01-20T18:00', 2120, 53), point('2026-01-21T09:00', 2100, 52),
  ],
  MINUTE: Array.from({ length: 12 }, (_, index) => point(`2026-01-02T09:${String(index * 2).padStart(2, '0')}`, 2000 + index, 40)),
  MONTH: [point('2026-01-01T00:00', 2150, 50, 16)],
  YEAR: [point('2026-01-01T00:00', 2150, 50, 16)],
};
let truncate = false;
const asked = [];

await page.route('**/graphql', async (route) => {
  const body = route.request().postDataJSON() ?? {};
  const query = body.query ?? '';
  const answer = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
  if (query.includes('query ModelSpeed(')) {
    return answer({ model: { speed: { calls: 16, promptTokensPerSecond: 2150, generatedTokensPerSecond: 50 } } });
  }
  if (query.includes('query SpeedOverTime')) {
    const unit = body.variables?.unit;
    asked.push(unit);
    const points = ANSWERS[unit] ?? [];
    return answer({
      model: {
        speedOverTime: { unit, from: '2026-01-01', to: '2026-01-31', truncated: truncate, points: truncate ? points.slice(-4) : points },
      },
    });
  }
  return route.continue();
});

await showModel();
const chart = page.locator('[data-model-speed-chart]');
record(await chart.waitFor({ timeout: 15_000 }).then(() => true).catch(() => false), 'the model page draws a speed chart');
record((await page.locator('[data-speed-unit][aria-pressed="true"]').getAttribute('data-speed-unit').catch(() => null)) === 'DAY',
  'it opens on Day over the thirty days');
const labels = await page.locator('[data-speed-unit]').allInnerTexts();
record(JSON.stringify(labels) === JSON.stringify(['Minute', 'Hour', 'Day', 'Month', 'Year']), `the periods, as words (${labels})`);

/* By the day: six points, two lines, one dot - for each of the two speeds. */
record((await settles(() => drawn('[data-speed-point]'), 6)) === 6, 'by the day, a point for each of the six days with calls');
for (const series of ['prompt', 'generated']) {
  const runs = await page.locator(`[data-speed-chart="${series}"] [data-speed-run]`).count();
  const dots = await page.locator(`[data-speed-chart="${series}"] [data-speed-dot]`).count();
  record(runs === 2 && dots === 1, `${series}: the days with none between them are a gap - two lines and a dot (${runs} lines, ${dots} dots)`);
}

/* The dot is where the 10th is: nine days into a thirty-day axis. */
const placed = await page.evaluate(() => {
  const svg = document.querySelector('[data-speed-chart="generated"]');
  const dot = svg?.querySelector('[data-speed-dot]');
  if (!svg || !dot) return null;
  const box = svg.getBoundingClientRect();
  const mark = dot.getBoundingClientRect();
  return (mark.left + mark.width / 2 - box.left) / box.width;
});
record(placed !== null && Math.abs(placed - 9 / 30) < 0.01, `the lone day is drawn at its date on the axis (${placed?.toFixed(3)} of the width, 0.300 wanted)`);

/* A point hovered says its period, both speeds and how many calls. */
await page.locator('[data-speed-chart="prompt"] [data-speed-point="2026-01-10T00:00"]').hover({ force: true }).catch(() => undefined);
const tip = ((await page.locator('[data-speed-tooltip]').innerText().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim();
record(tip.includes('2026-01-10') && tip.includes('2,600 tok/s') && tip.includes('60.0 tok/s') && tip.includes('1 call'),
  `the hovered day's tooltip (${tip})`);
await page.locator('[data-model-speed]').screenshot({ path: shot('model-speed-chart.png') }).catch(() => undefined);

/* Switching the period asks again and draws that many points. */
for (const [unit, count] of [['HOUR', 9], ['MINUTE', 12], ['MONTH', 1], ['YEAR', 1], ['DAY', 6]]) {
  await page.locator(`[data-speed-unit="${unit}"]`).click();
  const seen = await settles(() => drawn('[data-speed-point]'), count);
  record(seen === count && asked.at(-1) === unit, `${unit.toLowerCase()}: ${count} points drawn (${seen}, asked for ${asked.at(-1)})`);
}
record((await drawn('[data-speed-dot]')) === 1 && (await drawn('[data-speed-run]')) === 2, 'back on Day, the same lines and dot');
await page.locator('[data-speed-unit="MONTH"]').click();
await settles(() => drawn('[data-speed-point]'), 1);
record((await drawn('[data-speed-dot]')) === 1 && (await drawn('[data-speed-run]')) === 0, 'one month with calls is a dot, not a line of no length');

/* Cut short by the server: the newest periods, and one line saying so. */
truncate = true;
await page.locator('[data-speed-unit="HOUR"]').click();
await settles(() => drawn('[data-speed-point]'), 4);
const note = page.locator('[data-speed-truncated]');
const noteBox = await note.boundingBox().catch(() => null);
const noteText = ((await note.innerText().catch(() => '')) ?? '').trim();
record(noteText.includes('4') && noteBox !== null && noteBox.height > 0 && noteBox.height < 24,
  `a chart cut short says so on one line (${noteText}, ${noteBox?.height}px high)`);
truncate = false;

await page.unroute('**/graphql').catch(() => undefined);

/* ---- Live, where the server has something to draw. */

const live = {};
for (const unit of UNITS) {
  live[unit] = (await graphql(QUERY, { id: model.id, unit }).catch(() => null))?.model?.speedOverTime?.points?.length ?? 0;
}
console.log(`live answers: ${JSON.stringify(live)}`);
if (live.YEAR === 0) {
  console.log('NOTE: this model has no timed calls in the last thirty days on this server; the live half has nothing to count.');
} else {
  await showModel();
  await chart.waitFor({ timeout: 15_000 }).catch(() => undefined);
  for (const unit of UNITS) {
    await page.locator(`[data-speed-unit="${unit}"]`).click();
    const seen = await settles(() => drawn('[data-speed-point]'), live[unit]);
    record(seen === live[unit], `live, ${unit.toLowerCase()}: the server's ${live[unit]} points are drawn (${seen})`);
  }
  await page.locator('[data-model-speed]').screenshot({ path: shot('model-speed-chart-live.png') }).catch(() => undefined);
  record(live.MINUTE >= live.HOUR && live.HOUR >= live.DAY && live.DAY >= live.YEAR, 'live: a shorter period has at least as many points');
}

await finish(browser);
