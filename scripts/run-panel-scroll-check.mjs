/**
 * A run's node panel scrolls inside itself; the page does not grow with it.
 *
 * A step's parameters, input and output run long, and the panel growing with
 * them made the whole page scroll away from the graph it describes. Read off a
 * real run of the workspace: the step with the most to say, at a window shorter
 * than what it says.
 */
import { BASE, WORKSPACE, open, record, selectNode, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 800 } });

const { workspaceExecutions } = await graphql(
  `query($w: ID!) { workspaceExecutions(workspaceId: $w, page: 0, size: 25) { content { id } } }`,
  { w: WORKSPACE },
).catch(() => ({ workspaceExecutions: { content: [] } }));

// The run whose step has the most text: parameters, input and output together.
let best = null;
for (const { id } of workspaceExecutions?.content ?? []) {
  const { execution } = await graphql(
    `query($id: ID!) { execution(id: $id) { steps { key name input output } parameters { nodeKey value } } }`,
    { id },
  ).catch(() => ({ execution: null }));
  for (const step of execution?.steps ?? []) {
    const size = (step.input ?? '').length + (step.output ?? '').length +
      (execution.parameters ?? []).filter((one) => one.nodeKey === step.key).reduce((sum, one) => sum + one.value.length, 0);
    if (best === null || size > best.size) best = { id, name: step.name, size };
  }
}
record(best !== null && best.size > 1500, `a step with a long panel to read (${best?.name}, ${best?.size} characters)`);

if (best !== null) {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/executions/${best.id}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.react-flow__node').first().waitFor({ timeout: 20_000 }).catch(() => undefined);
  const scroller = () => page.evaluate(() => {
    // Whatever scrolls the page: the document, or the shell's main column.
    const candidates = [document.scrollingElement, ...document.querySelectorAll('main, [class*="_content_"]')];
    return Math.max(...candidates.filter(Boolean).map((el) => el.scrollHeight));
  });
  const before = await scroller();
  await selectNode(page, page.locator('.react-flow__node').filter({ hasText: best.name }).first(), best.name);
  await page.waitForTimeout(800);
  const after = await scroller();
  /*
   * Against the frame the page scrolls in - between the top bar and the
   * attribution strip - not the window: sized to the window, the rail ran past
   * the frame's bottom and the page scrolled to reach it. At the top of the
   * page, where the rail starts under the run's header, and scrolled, where it
   * sticks.
   */
  const look = () => page.evaluate(() => {
    const panel = document.querySelector('#run-node-details');
    const frame = panel.closest('main').getBoundingClientRect();
    const box = panel.getBoundingClientRect();
    return { bottom: Math.round(box.bottom), frame: Math.round(frame.bottom), scroll: panel.scrollHeight, client: panel.clientHeight, overflow: getComputedStyle(panel).overflowY };
  });
  const atTop = await look();
  record(atTop.bottom <= atTop.frame, `at the top of the page its last line is on screen (ends ${atTop.bottom}, frame ${atTop.frame})`);
  record(atTop.scroll > atTop.client && atTop.overflow === 'auto', `and it scrolls inside itself (${atTop.scroll}px of content in ${atTop.client})`);
  await page.evaluate(() => { document.querySelector('#run-node-details').closest('main').scrollTop = 400; });
  await page.waitForTimeout(500);
  const scrolled = await look();
  record(scrolled.bottom <= scrolled.frame, `scrolled, it stays within the frame too (ends ${scrolled.bottom}, frame ${scrolled.frame})`);
  record(after - before < 200, `the page does not grow with it (${before}px before, ${after}px after)`);
}

await finish(browser);
