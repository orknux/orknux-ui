/**
 * A run's summary says what its model calls cost, and is drawn in two columns.
 *
 * The cost is the server's sum over the run's sessions (ExecutionAPITest pins
 * that); here the answer is given a priced, partly unpriced cost so the row is
 * drawn whatever the development database has spent. Measured: the Cost row
 * reads the amount and "partial", the two lists sit side by side at a wide
 * window and one above the other at a narrow one.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 900 } });

const listed = await graphql(
  `query ($w: ID!) { workspaceExecutions(workspaceId: $w, page: 0, size: 1) { content { id } } }`,
  { w: WORKSPACE },
).catch(() => null);
const id = listed?.workspaceExecutions?.content?.[0]?.id;
record(id != null, `a run to open (${id})`);

if (id != null) {
  await page.route('**/graphql', async (route) => {
    const body = route.request().postData() ?? '';
    if (!body.includes('cost {')) return route.continue();
    const answer = await route.fetch();
    const json = await answer.json();
    if (json?.data?.execution) json.data.execution.cost = { amount: '0.0215', partlyUnpriced: true, sessions: 2 };
    return route.fulfill({ response: answer, json });
  });
  await page.goto(`${BASE}/workspace/${WORKSPACE}/executions/${id}`, { waitUntil: 'domcontentloaded' });
  const cost = page.locator('[data-run-cost]');
  const drawn = await cost.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
  record(drawn, 'the summary has a Cost row');
  if (drawn) {
    const text = (await cost.innerText()).replace(/\s+/g, ' ').trim();
    record(text.startsWith('$0.0215'), `it reads the amount (${text})`);
    record(/partial|częściowo/.test(text), `and says it is partial where some model had no price (${text})`);
  }
  const columns = () => page.locator('[data-summary-column]').evaluateAll((lists) =>
    lists.map((one) => { const r = one.getBoundingClientRect(); return { left: Math.round(r.left), top: Math.round(r.top) }; }));
  const wide = await columns();
  record(wide.length === 2 && wide[1].left > wide[0].left && wide[1].top === wide[0].top,
    `two columns side by side at 1600px (${JSON.stringify(wide)})`);
  await page.setViewportSize({ width: 800, height: 900 });
  await page.waitForTimeout(300);
  const narrow = await columns();
  record(narrow.length === 2 && narrow[1].left === narrow[0].left && narrow[1].top > narrow[0].top,
    `one above the other at 800px (${JSON.stringify(narrow)})`);
}

await finish(browser);
