/**
 * The workflow editor's Refresh reads the graph and the pickers' lists again,
 * and never throws away work: what has not been sent yet is saved first.
 *
 * Something made elsewhere - an agent in another tab, a trigger an agent created
 * through the orknux tools - is not in a picker read before it existed, and a
 * graph saved from somewhere else is not on a canvas loaded before it was. So:
 * pressing Refresh on a clean canvas asks the server for the graph and for the
 * agents again; with a node added and not saved yet, it saves it and then reads
 * the graph back with the node in it. There is no Discard to ask about any more:
 * the editor saves as it goes (#645).
 *
 * Adds a node to the workspace's workflow; the runner puts the workflow back.
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

/* Work not sent yet: saved first, then read back with it. */
const before = await page.locator('.react-flow__node').count();
await page.getByRole('button', { name: /^Add node/ }).click();
await page.getByRole('menuitem', { name: 'Action', exact: true }).click();
await page.waitForTimeout(500);
const added = await page.locator('.react-flow__node').count();
record(added === before + 1, `a node is added and not saved (${before} -> ${added})`);

graphs = count('graph');
agents = count('agents');
await refresh.click();
await page.waitForTimeout(2500);
record(!(await page.getByRole('dialog').isVisible().catch(() => false)), 'Refresh asks nothing: there is nothing to throw away');
record(count('graph') > graphs, `it reads the graph again (${graphs} -> ${count('graph')})`);
record(count('agents') > agents, 'and the lists');
record((await page.locator('.react-flow__node').count()) === added, 'and the new node is still there, saved before the read');

await finish(browser);
