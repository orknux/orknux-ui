/**
 * Preferences -> Appearance -> Time Zone.
 *
 * A time zone chosen on the preferences page is kept with the account, comes
 * back with the session, and every time the interface draws is drawn in it -
 * not in the browser's own zone, which is what every formatter used before.
 *
 * Chosen through the page's own picker, so the control, the mutation and the
 * session are all on the path. The times are read off the watchers page, with
 * one stubbed row whose moment is fixed: 2026-01-01T00:00:00Z is 2:00 PM the
 * same day at UTC+14 (Pacific/Kiritimati), which no browser this suite runs in
 * is set to, so the browser's own zone cannot pass for the chosen one.
 *
 * Puts the zone back to what it was however it ends.
 */
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1280, height: 900 } });

const before = await page.request.get(`${BASE}/api/session`).then((answer) => answer.json()).catch(() => ({}));
const was = before?.timeZone ?? null;

try {
  await page.goto(`${BASE}/preferences`, { waitUntil: 'domcontentloaded' });
  record(await drawn(page, 'the preferences page'), 'the preferences page opens');
  const picker = page.locator('#preferences-time-zone');
  record(await picker.isVisible({ timeout: 10_000 }).catch(() => false), 'it has a time zone picker');
  const browserOwn = (await picker.locator('option[value=""]').textContent().catch(() => '')) ?? '';
  record(/\(.+\)/.test(browserOwn), `whose first choice is the browser's own, named (${browserOwn})`);

  const saved = page.waitForResponse((answer) => (answer.request().postData() ?? '').includes('setMyTimeZone'), { timeout: 10_000 }).catch(() => null);
  await picker.selectOption('Pacific/Kiritimati');
  // Preferences keeps a change as a draft until its Save.
  await page.locator('[class*="_pageSave_"]').click();
  record((await saved) !== null, 'choosing one and saving stores it');

  const session = await page.request.get(`${BASE}/api/session`).then((answer) => answer.json()).catch(() => ({}));
  record(session?.timeZone === 'Pacific/Kiritimati', `and the session carries it back (${session?.timeZone})`);

  await page.route('**/graphql', async (route) => {
    const body = route.request().postData() ?? '';
    if (!body.includes('watchers(')) return route.continue();
    const at = '2026-01-01T00:00:00Z';
    const row = {
      id: '1', sessionId: '91', sessionTitle: 'Release', agentName: 'Builder', tool: 'buildStatus', arguments: '{}',
      conditionKind: 'REGEX', condition: 'done', toolResultPath: '$', intervalSeconds: 60, agentCheckIntervalSeconds: null,
      timeoutSeconds: 3600, note: null, description: null, status: 'ACTIVE', checks: 1, matched: null, outcome: null,
      createdAt: at, expiresAt: '2026-01-01T01:00:00Z', nextCheckAt: at, lastCheckedAt: null, lastResult: null, finishedAt: null,
    };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { watchers: { content: [row], page: 0, size: 50, totalElements: 1, totalPages: 1 } } }),
    });
  });
  await page.goto(`${BASE}/workspace/${WORKSPACE}/watchers`, { waitUntil: 'domcontentloaded' });
  await drawn(page, 'the watchers page');
  const set = (await page.locator('[data-testid="watcher-set"]').first().getAttribute('title', { timeout: 10_000 }).catch(() => null)) ?? '';
  record(/2:00:00\s?PM|14:00:00/.test(set), `a time is drawn in the chosen zone, after a reload (${set})`);
  const ends = (await page.locator('[data-testid="watcher-timeout"]').first().getAttribute('title').catch(() => null)) ?? '';
  record(/3:00:00\s?PM|15:00:00/.test(ends), `and so is every other on the page (${ends})`);
} finally {
  await graphql(`mutation ($z: String) { setMyTimeZone(timeZone: $z) { timeZone } }`, { z: was }).catch(() => null);
}

await finish(browser);
