/**
 * The workflow editor's Refresh reads the graph and the pickers' lists again,
 * and does not throw away unsaved work without asking.
 *
 * Something made elsewhere - an agent in another tab, a trigger an agent created
 * through the orknux tools - is not in a picker read before it existed, and a
 * graph saved from somewhere else is not on a canvas loaded before it was. So:
 * pressing Refresh on a clean canvas asks the server for the graph and for the
 * agents again; with a node added and not saved, it asks for the lists but not
 * the graph, and opens the Discard confirmation instead; cancelling keeps the
 * new node.
 *
 * Reads the workspace's workflow; saves nothing.
 */
import { BASE, WORKSPACE, WORKFLOW, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 900 } });

const asked = [];
page.on('request', (request) => {
  if (!request.url().includes('/graphql')) return;
  const body = request.postData() ?? '';
  if (body.includes('workflowGraph(') && !body.includes('workflowGraphPreview')) asked.push('graph');
  if (body.includes('workspaceAgents(')) asked.push('agents');
});
const count = (what) => asked.filter((one) => one === what).length;

await page.goto(`${BASE}/workspace/${WORKSPACE}/workflows/${WORKFLOW}/editor`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the workflow editor'), 'the editor opens');
await page.locator('.react-flow__node').first().waitFor({ timeout: 20_000 }).catch(() => undefined);
await page.waitForTimeout(800);

const refresh = page.getByRole('button', { name: /^Refresh/ });
record(await refresh.isVisible(), 'the toolbar has a Refresh button');

/* A clean canvas: both are read again, straight away. */
let graphs = count('graph');
let agents = count('agents');
await refresh.click();
await page.waitForTimeout(1500);
record(count('graph') > graphs, `the graph is read again (${graphs} -> ${count('graph')})`);
record(count('agents') > agents, `and the agents a node picks from (${agents} -> ${count('agents')})`);
record(!(await page.getByRole('dialog').isVisible().catch(() => false)), 'nothing is asked when nothing is unsaved');

/* Unsaved work: the lists, not the graph, and a question. */
const before = await page.locator('.react-flow__node').count();
await page.getByRole('button', { name: /^Add node/ }).click();
await page.getByRole('menuitem', { name: 'Action', exact: true }).click();
await page.waitForTimeout(500);
const added = await page.locator('.react-flow__node').count();
record(added === before + 1, `a node is added and not saved (${before} -> ${added})`);

graphs = count('graph');
agents = count('agents');
await refresh.click();
await page.waitForTimeout(1500);
const dialog = page.getByRole('dialog');
record(await dialog.isVisible().catch(() => false), 'with unsaved work, Refresh asks before throwing it away');
record(count('graph') === graphs, 'and has not read the graph over it');
record(count('agents') > agents, 'while the lists are read again regardless');

await dialog.getByRole('button', { name: 'Cancel' }).click();
await page.waitForTimeout(500);
record((await page.locator('.react-flow__node').count()) === added, 'cancelling keeps the new node');

await finish(browser);
