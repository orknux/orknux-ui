/**
 * A run's canvas stays where somebody put it, through every kind of refresh.
 *
 * Michal zoomed in on a run and the page pulled the zoom back. The first
 * framing path had learnt to stop once a hand was on the canvas; a second,
 * keyed on the nodes - rebuilt on every refresh of the run - had not, and a
 * browser reload started from nothing either way. So the hand outranks both
 * paths now, and the viewport is kept per run for the tab's lifetime, put back
 * on a reload before anything frames.
 *
 * The zoom is a synthetic pinch on the pane, the way d3-zoom hears a trackpad,
 * because a headless wheel does not reach it. Reads a run that exists and
 * changes nothing.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });

const { workspaceExecutions } = await graphql(
  `query($w: ID!) { workspaceExecutions(workspaceId: $w, page: 0, size: 20) { content { id } } }`,
  { w: WORKSPACE },
);
const RUN = workspaceExecutions.content[0]?.id ?? null;
if (RUN === null) {
  record(false, 'nothing to run against: the workspace has no run');
  await finish(browser);
}

const transform = () => page.evaluate(() => document.querySelector('.react-flow__viewport')?.style.transform ?? 'none');
const scaleOf = (said) => Number(/scale\(([\d.]+)\)/.exec(said)?.[1] ?? NaN);
const opened = async () => {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/executions/${RUN}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.react-flow__node').first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1500);
};

// Nothing kept from an earlier run of this check: cleared on the origin, not
// by an init script, which would run again on the reload below and clear the
// very thing that reload is meant to find.
await page.goto(`${BASE}/workspace/${WORKSPACE}`, { waitUntil: 'domcontentloaded' });
await page.evaluate((id) => sessionStorage.removeItem(`run-view:${id}`), RUN);
await opened();
const framed = await transform();
record(scaleOf(framed) > 0 && scaleOf(framed) <= 1, `a run opens framed on its graph (${framed})`);

await page.evaluate(() => {
  const pane = document.querySelector('.react-flow__pane');
  const at = pane.getBoundingClientRect();
  pane.dispatchEvent(new WheelEvent('wheel', { deltaY: -300, ctrlKey: true, clientX: at.left + at.width / 2, clientY: at.top + at.height / 2, bubbles: true, cancelable: true }));
});
await page.waitForTimeout(800);
const zoomed = await transform();
record(zoomed !== framed, `a pinch on the pane zooms it (${zoomed})`);

// Forced: on a long run the sticky heading overlaps the button, and the
// button is not what is measured here.
await page.getByRole('button', { name: /^Refresh$/ }).first().click({ force: true });
await page.waitForTimeout(2500);
record((await transform()) === zoomed, 'reading the run again leaves the zoom alone');

await page.locator('.react-flow__node').first().click({ force: true });
await page.waitForTimeout(1200);
record((await transform()) === zoomed, 'opening a step, which resizes the canvas, leaves it alone too');

const kept = await page.evaluate((id) => sessionStorage.getItem(`run-view:${id}`), RUN);
record(kept !== null && Math.abs(JSON.parse(kept).zoom - scaleOf(zoomed)) < 0.001, `the viewport is kept for this tab (${kept})`);

await page.reload({ waitUntil: 'domcontentloaded' });
await page.locator('.react-flow__node').first().waitFor({ timeout: 30_000 });
await page.waitForTimeout(1500);
const back = await transform();
record(Math.abs(scaleOf(back) - scaleOf(zoomed)) < 0.001, `a browser reload opens where it was left (${back})`);

await page.evaluate((id) => sessionStorage.removeItem(`run-view:${id}`), RUN);
await finish(browser);
