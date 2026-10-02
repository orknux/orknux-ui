/**
 * A run and a session being followed refresh every second until somebody
 * chooses otherwise; a list starts at Off.
 *
 * Asked for: the run page and the session log opened at Off, so somebody
 * watching a run had to switch it on every time. The interval is still one
 * choice shared by every page - once chosen, the chosen one wins everywhere.
 */
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1500, height: 1000 } });

const auto = () => page.locator('select[aria-label="Refresh automatically"]').first();
const forget = () => page.evaluate(() => window.localStorage.removeItem('orknux.refreshSeconds'));

// Asked of the API with the page's own session: a list's links depend on its filters and paging.
async function firstOf(query, pick) {
  await page.goto(`${BASE}/workspace/${WORKSPACE}`, { waitUntil: 'domcontentloaded' });
  const data = await page.evaluate(async (q) => {
    const response = await fetch('/graphql', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }) });
    return response.json();
  }, query);
  return pick(data?.data);
}

const runId = await firstOf(`{ workspaceExecutions(workspaceId: ${WORKSPACE}, size: 1) { content { id } } }`, (d) => d?.workspaceExecutions?.content?.[0]?.id);
const sessionId = await firstOf(`{ llmSessions(workspaceId: ${WORKSPACE}, size: 1) { content { id } } }`, (d) => d?.llmSessions?.content?.[0]?.id);
const run = runId ? `/workspace/${WORKSPACE}/executions/${runId}` : null;
const session = sessionId ? `/workspace/${WORKSPACE}/sessions/${sessionId}` : null;
record(run !== null, `there is a run to open (${run})`);
record(session !== null, `there is a session to open (${session})`);

await forget();

// A list, with nothing chosen: Off.
await page.goto(`${BASE}/workspace/${WORKSPACE}/executions`, { waitUntil: 'domcontentloaded' });
await auto().waitFor({ timeout: 20_000 });
record((await auto().inputValue()) === '0', 'the list of runs starts at Off');

for (const [what, path] of [['a run', run], ['a session', session]]) {
  if (path === null) continue;
  await forget();
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  record(await drawn(page, what), `${what} is on screen`);
  await auto().waitFor({ timeout: 20_000 });
  record((await auto().inputValue()) === '1', `${what} starts at a second (${await auto().inputValue()})`);
}

// Once chosen, the choice is everybody's - Off included.
if (run !== null) {
  await page.goto(`${BASE}${run}`, { waitUntil: 'domcontentloaded' });
  await auto().waitFor({ timeout: 20_000 });
  await auto().selectOption('0');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await auto().waitFor({ timeout: 20_000 });
  record((await auto().inputValue()) === '0', 'and a run somebody set to Off stays Off');
}

await forget();
await finish(browser);
