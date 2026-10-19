/**
 * A run's log follows what it writes.
 *
 * Lines arriving while Follow is on bring the newest into view. Scrolling up to
 * read something turns it off, so new lines do not drag the reader away; Follow
 * turns it back on and goes to the bottom.
 *
 * Takes any run of the workspace and answers its log here, a few lines longer
 * on every refresh.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const { workspaceExecutions } = await graphql(
  'query($w: ID!) { workspaceExecutions(workspaceId: $w, page: 0, size: 1) { content { id } } }',
  { w: WORKSPACE },
);
const runId = workspaceExecutions?.content?.[0]?.id ?? null;
if (runId === null) {
  record(false, 'the workspace has a run to look at');
} else {
  let written = 40;
  await page.route('**/graphql', async (route) => {
    const query = route.request().postDataJSON()?.query ?? '';
    if (!query.includes('execution(id')) return route.continue();
    const answered = await route.fetch();
    const json = await answered.json();
    const run = json?.data?.execution;
    if (run) {
      run.status = 'RUNNING';
      run.logs = Array.from({ length: written }, (_, i) => ({
        id: `zz-${i}`, at: new Date(Date.now() - (written - i) * 1000).toISOString(), level: 'INFO',
        message: `zz line ${i}`, nodeKey: null,
      }));
      written += 5;
    }
    return route.fulfill({ response: answered, json });
  });

  await page.goto(`${BASE}/workspace/${WORKSPACE}/executions/${runId}`, { waitUntil: 'domcontentloaded' });
  const log = page.getByTestId('run-logs');
  await log.waitFor({ timeout: 20_000 });
  const atBottom = () => log.evaluate((box) => box.scrollHeight - box.scrollTop - box.clientHeight < 8);
  const lines = () => log.locator('p').count();
  const refresh = async () => {
    const before = await lines();
    await page.getByRole('button', { name: /Refresh/ }).first().click().catch(() => undefined);
    await page.waitForFunction((n) => document.querySelectorAll('[data-testid="run-logs"] p').length > n, before, { timeout: 10_000 }).catch(() => undefined);
    await page.waitForTimeout(200);
  };

  await page.waitForTimeout(800);
  const follow = page.getByTestId('run-logs-follow');
  record((await follow.getAttribute('aria-pressed')) === 'true' && (await atBottom()), 'the log opens following, at its newest line');
  await refresh();
  record(await atBottom(), `new lines bring the newest into view (${await lines()} lines)`);

  await log.evaluate((box) => { box.scrollTop = 0; box.dispatchEvent(new Event('scroll')); });
  await page.waitForTimeout(200);
  record((await follow.getAttribute('aria-pressed')) === 'false', 'scrolling up turns Follow off');
  await refresh();
  record(await log.evaluate((box) => box.scrollTop === 0), 'and new lines then leave the reader where they were');

  await follow.click();
  await page.waitForTimeout(200);
  record((await follow.getAttribute('aria-pressed')) === 'true' && (await atBottom()), 'Follow turns it back on and goes to the newest line');
}

await finish(browser);
