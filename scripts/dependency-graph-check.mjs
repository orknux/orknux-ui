/**
 * A workspace's Dependencies page draws every part as a box and every "uses"
 * as a line, and choosing a part lights its chain and dims the rest, with a
 * link that opens the part.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1500, height: 1000 } });

await page.goto(`${BASE}/workspace/${WORKSPACE}/dependencies`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('dependency-graph').waitFor({ timeout: 30_000 });
await page.waitForTimeout(1500);

const parts = page.locator('[data-part-name]');
const boxes = await parts.count();
const lines = await page.locator('.react-flow__edge-path').count();
record(boxes > 0, `the parts are drawn (${boxes})`);
record(lines > 0, `and what uses what as lines (${lines})`);

// A workflow uses something on this fixture, so its box has a line leaving it.
const workflow = page.locator('[data-part-kind$="workflow"]').first();
await workflow.click();
await page.waitForTimeout(500);
const selection = page.getByTestId('dependency-selection');
record(await selection.isVisible(), 'choosing a part names it above the graph');
const dimmed = await page.locator('[data-part-name][class*="partDimmed"]').count();
record(dimmed > 0 && dimmed < boxes, `and dims what is not in its chain (${dimmed} of ${boxes})`);
const href = await selection.getByRole('link').getAttribute('href');
record(/\/workspace\/\d+\/workflows\/\d+\/settings$/.test(href ?? ''), `with a link that opens it (${href})`);

await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });
await page.waitForTimeout(300);
record(!(await selection.isVisible()), 'and clicking the background lets it go');

await page.screenshot({ path: '/tmp/dependency-graph.png' });
await finish(browser);
