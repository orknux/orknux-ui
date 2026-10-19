/**
 * AI -> Schedules lists what the agents come back to on a schedule, and stops it.
 *
 * A schedule is set by an agent, not on this page, so the list is answered
 * here: one active by interval, one by cron. Each row says how often it runs
 * and when next, and Stop asks the server to stop that one. The Ended filter
 * asks for the ended ones. Admin Settings has the two bounds, saved with the
 * page's Save.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1600, height: 1000 } });
const soon = new Date(Date.now() + 15 * 60_000).toISOString();
const row = (id, extra) => ({
  id, sessionId: '7', sessionTitle: 'Review PRs', agentName: 'OKO Bot', note: `zz note ${id}`, everySeconds: null, cron: null,
  timezone: null, status: 'ACTIVE', runs: 3, times: null, until: null, createdAt: new Date(Date.now() - 3_600_000).toISOString(),
  nextRunAt: soon, lastRunAt: new Date(Date.now() - 600_000).toISOString(), finishedAt: null, outcome: null, ...extra,
});
const LONG_NOTE = 'Daily 9:00: remind the person to log their hours and review the open pull requests';
const ACTIVE = [row('1', { everySeconds: 900, note: LONG_NOTE }), row('2', { cron: '0 9 * * 1-5', timezone: 'Europe/Warsaw', times: 10 })];
const asked = { ended: [], stopped: [] };

await page.route('**/graphql', async (route) => {
  const body = route.request().postDataJSON() ?? {};
  const query = body.query ?? '';
  if (query.includes('schedules(')) {
    asked.ended.push(body.variables?.ended);
    const content = body.variables?.ended ? [] : ACTIVE;
    return route.fulfill({ json: { data: { schedules: { content, page: 0, size: 50, totalElements: content.length, totalPages: 1 } } } });
  }
  if (query.includes('stopSchedule')) {
    asked.stopped.push(body.variables?.id);
    return route.fulfill({ json: { data: { stopSchedule: { ...ACTIVE[0], status: 'STOPPED' } } } });
  }
  return route.continue();
});

await page.goto(`${BASE}/workspace/${WORKSPACE}/schedules`, { waitUntil: 'domcontentloaded' });
await page.locator('[data-schedule-row]').first().waitFor({ timeout: 20_000 }).catch(() => undefined);
const cadences = await page.getByTestId('schedule-cadence').allInnerTexts();
const runs = await page.getByTestId('schedule-runs').allInnerTexts();
record(JSON.stringify(cadences) === JSON.stringify(['every 15 min', '0 9 * * 1-5 (Europe/Warsaw)']),
  `each schedule says how often it runs (${JSON.stringify(cadences)})`);
record(JSON.stringify(runs) === JSON.stringify(['3', '3 / 10']), `and how many times it has, of how many (${JSON.stringify(runs)})`);
record((await page.getByTestId('schedule-next').count()) === 2, 'and when it runs next');

// The note is what a row is about: at this width it is shown whole, not cut
// to fit a column sized for a label while the cadence takes the slack.
const cut = await page.getByTestId('schedule-note').first().evaluate((el) => el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight + 1);
const nextCut = await page.getByTestId('schedule-next').first().evaluate((el) => el.scrollWidth > el.clientWidth);
record(!cut, `a long note is shown whole (${cut ? 'cut' : 'whole'})`);
record(!nextCut, `and the next run's date and time fit (${nextCut ? 'cut' : 'whole'})`);

await page.locator('[data-schedule-stop="1"]').click();
await page.waitForTimeout(500);
record(JSON.stringify(asked.stopped) === JSON.stringify(['1']), `Stop stops that schedule (${JSON.stringify(asked.stopped)})`);

await page.locator('[data-schedule-filter="ended"]').click();
await page.waitForTimeout(600);
record(asked.ended.includes(true) && (await page.getByText('No schedule has ended yet.').count()) === 1, 'Ended asks for the ended ones');

// The bounds, in Admin Settings.
await page.goto(`${BASE}/admin/settings#schedules`, { waitUntil: 'domcontentloaded' });
await page.locator('#schedule-min-interval').waitFor({ timeout: 20_000 }).catch(() => undefined);
const bounds = {
  interval: await page.locator('#schedule-min-interval').inputValue().catch(() => ''),
  perAgent: await page.locator('#schedule-max-per-agent').inputValue().catch(() => ''),
};
record(Number(bounds.interval) > 0 && bounds.perAgent !== '', `Admin Settings holds the schedule bounds (${JSON.stringify(bounds)})`);

await finish(browser);
