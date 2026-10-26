/**
 * A run's agent step says whether it streamed what its agent said.
 *
 * Whether a message reached a Slack thread as it was written or only with the
 * answer depends on the node's Output streaming, and the run page did not say
 * which the run had. Read off a real run with an agent step; the row must say
 * what the server says the run copied.
 */
import { BASE, WORKSPACE, open, record, selectNode, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });

const { workspaceExecutions } = await graphql(
  `query($w: ID!) { workspaceExecutions(workspaceId: $w, page: 0, size: 25) { content { id } } }`,
  { w: WORKSPACE },
).catch(() => ({ workspaceExecutions: { content: [] } }));

let run = null;
for (const { id } of workspaceExecutions?.content ?? []) {
  const { execution } = await graphql(`query($id: ID!) { execution(id: $id) { id steps { key name kind streamOutput } } }`, { id })
    .catch(() => ({ execution: null }));
  const agent = execution?.steps?.find((step) => step.kind === 'AGENT');
  if (agent) {
    run = { id, step: agent };
    break;
  }
}
record(run !== null, `a run with an agent step (${run?.id} / ${run?.step?.name} / ${run?.step?.streamOutput})`);

if (run !== null) {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/executions/${run.id}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.react-flow__node').first().waitFor({ timeout: 20_000 }).catch(() => undefined);
  const node = page.locator('.react-flow__node').filter({ hasText: run.step.name }).first();
  await selectNode(page, node, run.step.name);
  const row = page.locator('[data-step-streaming]');
  await row.waitFor({ timeout: 10_000 }).catch(() => undefined);
  const drawn = await row.getAttribute('data-step-streaming').catch(() => null);
  const text = await row.innerText().catch(() => '');
  const expected = run.step.streamOutput ? 'on' : 'off';
  record(drawn === expected, `the step's panel says Output streaming was ${expected} (${JSON.stringify(text)})`);
  // In the type the other values are drawn in, not the page's larger one.
  const sizes = await page.evaluate(() => {
    const leaf = (el) => { let at = el; while (at.firstElementChild) at = at.firstElementChild; return getComputedStyle(at).fontSize; };
    const values = [...document.querySelectorAll('[data-step-parameters] dd')];
    const mine = document.querySelector('[data-step-streaming] dd');
    return { mine: mine && leaf(mine), others: values.filter((one) => one !== mine && one.closest('[data-step-streaming]') === null).map(leaf) };
  });
  record(sizes.mine !== null && (sizes.others.length === 0 || sizes.others.includes(sizes.mine)), `its value is in the others' type (${JSON.stringify(sizes)})`);
}

await finish(browser);
