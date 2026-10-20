/**
 * Admin > Reports: the chart over the people table, read as drawn.
 *
 * A bar per day of the period, the quiet days included; each day's stack as
 * tall as its total on one scale (measured off the marks, against what
 * usageSeries says), input not cached at the foot, cached input on it and
 * output on top; a legend naming the three; a tooltip for the day under the
 * pointer; and Cost as its own measure, with no token legend left behind.
 *
 * Over the last 30 days, which is where the page opens. An empty period has to
 * draw no chart at all, as it draws no table.
 */
import { BASE, open, drawn, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 1000 } });

const pad = (n) => String(n).padStart(2, '0');
const dayOf = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const filter = { from: dayOf(new Date(Date.now() - 29 * 86_400_000)), to: dayOf(new Date()) };
const { usageSeries: series } = await graphql(
  'query($filter: UsageReportFilter) { usageSeries(filter: $filter) { day inputTokens cachedInputTokens outputTokens cost partlyUnpriced } }',
  { filter },
);
record(series.length === 30, `the server answers every day of the period (${series.length} of 30)`);
const tokensOf = (day) => day.inputTokens + day.outputTokens;
const busy = series.filter((day) => tokensOf(day) > 0);

await page.goto(`${BASE}/admin/reports`, { waitUntil: 'domcontentloaded' });
await drawn(page, 'Tokens by person');
const chart = page.getByTestId('usage-chart');

if (busy.length === 0) {
  await page.getByText('Nothing recorded in this period.').waitFor({ timeout: 10_000 });
  record((await chart.count()) === 0, 'an empty period draws no chart');
} else {
  await chart.locator('svg').waitFor({ timeout: 10_000 });

  const days = await chart.locator('[data-bar-day]').count();
  record(days === series.length, `a bar slot per day, the quiet ones too (${days} of ${series.length})`);

  const legend = await chart.locator('[data-legend]').evaluateAll((all) => all.map((one) => one.getAttribute('data-legend')));
  record(JSON.stringify(legend) === JSON.stringify(['fresh', 'cached', 'output']), `the legend names the three series (${legend.join(', ')})`);

  /** Each day's segments as drawn: their tops and bottoms in page pixels, foot first. */
  const measure = () => chart.locator('[data-bar-day]').evaluateAll((all) => all.map((group) => ({
    day: group.getAttribute('data-bar-day'),
    segments: [...group.querySelectorAll('[data-segment]')].map((one) => {
      const box = one.getBoundingClientRect();
      return { key: one.getAttribute('data-segment'), top: box.top, bottom: box.bottom };
    }),
  })));

  const bars = await measure();
  const heightOf = (bar) => bar.segments.length === 0 ? 0 : Math.max(...bar.segments.map((s) => s.bottom)) - Math.min(...bar.segments.map((s) => s.top));
  const peak = busy.reduce((best, day) => (tokensOf(day) > tokensOf(best) ? day : best));
  const peakHeight = heightOf(bars.find((bar) => bar.day === peak.day));
  // One scale: each day's stack is its share of the tallest one, to within the gaps and a pixel of rounding.
  const off = busy.map((day) => {
    const expected = (tokensOf(day) / tokensOf(peak)) * peakHeight;
    return Math.abs(heightOf(bars.find((bar) => bar.day === day.day)) - expected);
  });
  record(peakHeight > 50, `the busiest day stands tall (${Math.round(peakHeight)}px)`);
  record(Math.max(...off) <= 5, `every day is as tall as its total on one scale (worst ${Math.max(...off).toFixed(1)}px off)`);
  const quiet = bars.filter((bar) => series.find((day) => day.day === bar.day && tokensOf(day) === 0));
  record(quiet.every((bar) => bar.segments.length === 0), `a quiet day draws nothing (${quiet.length} quiet)`);

  // Foot first: the input nobody cached, the cached input on it, the output on top.
  const order = ['fresh', 'cached', 'output'];
  const stacked = bars.every((bar) => bar.segments.every((one, at) => {
    const next = bar.segments[at + 1];
    return next === undefined || (order.indexOf(one.key) < order.indexOf(next.key) && next.bottom <= one.top + 0.5);
  }));
  record(stacked, 'each stack runs not cached, cached, output from the foot up');
  const peakBar = bars.find((bar) => bar.day === peak.day);
  const cachedShown = peakBar.segments.some((one) => one.key === 'cached');
  record(cachedShown === peak.cachedInputTokens > 0, `cached input is drawn where there was some (${peak.cachedInputTokens} on ${peak.day})`);

  // The pointer on the busiest day: its tooltip says which day and its total.
  await chart.locator(`rect[data-day="${peak.day}"]`).hover();
  const tooltip = page.getByTestId('usage-chart-tooltip');
  await tooltip.waitFor({ timeout: 5_000 });
  const said = (await tooltip.innerText()).replace(/\s+/g, ' ');
  const [, month, date] = peak.day.split('-').map(Number);
  const named = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(new Date(2000, month - 1, 1));
  record(said.includes(`${named} ${date}`), `hovering a day names it (${said.slice(0, 60)})`);
  record(/Total/.test(said) && /Input, cached/.test(said) && /Output/.test(said), 'and lists what it used, with the total');
  const box = await tooltip.boundingBox();
  const plot = await chart.locator('svg').boundingBox();
  record(box !== null && plot !== null && box.x >= plot.x - 1 && box.x + box.width <= plot.x + plot.width + 1, 'the tooltip stays inside the chart');
  await page.mouse.move(0, 0);

  /* ---- cost: a measure of its own ---- */

  await chart.getByRole('button', { name: 'Cost' }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="usage-chart"]')?.getAttribute('data-measure') === 'COST');
  record((await chart.getByRole('button', { name: 'Cost' }).getAttribute('aria-pressed')) === 'true', 'Cost is pressed once chosen');
  record((await chart.locator('[data-legend]').count()) === 0, 'one series needs no legend: none is left from tokens');
  const costBars = await measure();
  const keys = new Set(costBars.flatMap((bar) => bar.segments.map((one) => one.key)));
  record([...keys].every((key) => key === 'cost'), `only cost is drawn (${[...keys].join(', ') || 'nothing'})`);
  const priced = series.filter((day) => day.cost !== null);
  const pricedDrawn = costBars.filter((bar) => bar.segments.length > 0).length;
  record(pricedDrawn === priced.length, `a bar for each day something was priced (${pricedDrawn} of ${priced.length})`);
  const heading = (await chart.locator('h3').textContent())?.trim();
  record(heading === 'Cost per day', `the heading says what is plotted (${heading})`);

  await chart.getByRole('button', { name: 'Tokens' }).click();
}

await finish(browser);
