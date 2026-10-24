/**
 * A workflow with no trigger node is started with its input handed over whole -
 * a research, an API call - and reads it as `trigger.x`. The editor says so:
 * such a placeholder and such a reference are the run's input, not red. The
 * research modes are the workflows that do it, so a mode is what is opened.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1920, height: 1000 } });

const found = await graphql(
  `query($w: ID!) { workspaceWorkflows(workspaceId: $w, page: 0, size: 5, search: "Research: Shallow", showHidden: true) { content { id name } } }`,
  { w: WORKSPACE },
).catch(() => null);
const mode = (found?.workspaceWorkflows?.content ?? []).find((one) => one.name === 'Research: Shallow');
record(mode !== undefined, `the workspace has its Shallow research mode (${JSON.stringify(found?.workspaceWorkflows?.content ?? null)})`);

if (mode !== undefined) {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/workflows/${mode.id}/editor`, { waitUntil: 'domcontentloaded' });
  const plan = page.locator('.react-flow__node', { hasText: 'Plan' }).first();
  await plan.waitFor({ timeout: 60_000 }).catch(() => undefined);
  await plan.click().catch(() => undefined);
  await page.waitForTimeout(1500);
  const panel = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      red: text.includes('nothing in this workflow produces it'),
      gone: text.includes('no longer produced'),
      runInput: (text.match(/Run input/g) ?? []).length,
    };
  });
  record(!panel.red && !panel.gone && panel.runInput >= 2,
    `trigger.question and the model reference read as the run's input, not as missing (${JSON.stringify(panel)})`);
}

await finish(browser);
