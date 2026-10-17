/**
 * The triggers list narrowed by where a trigger listens: the schedule, the
 * webhook, or one connection.
 *
 * Sieved on the server rather than in the browser, because the list is paged
 * - a sieve over page one would hide the matches on page four. So each choice
 * is checked twice: the rows drawn all show that source, and their number is
 * what the server answers for the same sieve. Reads the workspace as it is.
 */
import { BASE, WORKSPACE, open, drawn, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });

await page.goto(`${BASE}/workspace/${WORKSPACE}/triggers`, { waitUntil: 'domcontentloaded' });
await drawn(page, 'Triggers');

const { workspaceTriggerSources: sources } = await graphql(
  `query($w: ID!) { workspaceTriggerSources(workspaceId: $w) { value label } }`,
  { w: WORKSPACE },
);
console.log(`sources: ${sources.map((one) => `${one.value}=${one.label}`).join(', ')}`);
const filter = page.getByTestId('trigger-source-filter');
if (sources.length < 2) {
  record((await filter.count()) === 0, 'one source only, so no sieve is drawn');
} else {
  await filter.waitFor({ timeout: 10_000 });
  const offered = await filter.locator('select option').evaluateAll((all) => all.map((one) => one.value).filter((one) => one !== ''));
  record(JSON.stringify(offered) === JSON.stringify(sources.map((one) => one.value)), `the sieve offers the sources in use (${offered.join(', ')})`);

  for (const source of sources) {
    await filter.locator('select').selectOption(source.value);
    await page.waitForTimeout(400);
    await drawn(page, 'Triggers');
    const seen = await page.locator('[class*="colSource"]').evaluateAll((all) => all.slice(1).map((one) => one.textContent?.trim()));
    const { workspaceTriggers } = await graphql(
      `query($w: ID!, $s: String!) { workspaceTriggers(workspaceId: $w, page: 0, size: 100, source: $s) { totalElements } }`,
      { w: WORKSPACE, s: source.value },
    );
    const shown = Math.min(workspaceTriggers.totalElements, 10);
    record(
      seen.length > 0 && seen.every((one) => one === source.label) && (seen.length === shown || seen.length === workspaceTriggers.totalElements),
      `${source.label}: ${seen.length} row(s) drawn, all of it, and the server counts ${workspaceTriggers.totalElements}`,
    );
  }
  await filter.locator('select').selectOption('');
}

await finish(browser);
