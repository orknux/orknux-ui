/**
 * Test in the Add MCP Server dialog: a server can be asked whether it answers
 * before it is added, and asking adds nothing.
 *
 * Pointed at a port nothing listens on, for the reason mcp-check-button-check
 * gives: what has to appear is a reason naming the address, not just a colour.
 * The dialog is then cancelled, and the workspace must hold no server by that
 * name - a Test that saved would be an Add with a different label.
 *
 * And Test is drawn as the dialog's other buttons are - Cancel's padding - in
 * the row of buttons at the foot, immediately left of Add Server; the status
 * line above says what it found.
 */
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });

const NAME = `zzMcpDraft ${Date.now()}`;
const ADDRESS = 'http://127.0.0.1:9/rpc';

await page.goto(`${BASE}/workspace/${WORKSPACE}/integrations`, { waitUntil: 'domcontentloaded' });
await drawn(page, 'MCP Servers');
await page.getByRole('button', { name: '+ Add Server' }).click();
await page.locator('#mcp-server-name').fill(NAME);
await page.locator('#mcp-server-address').fill(ADDRESS);

const line = page.getByTestId('mcp-draft-check');
const test = page.locator('dialog[open]').getByRole('button', { name: 'Test', exact: true });
record((await test.count()) === 1 && (await test.isEnabled()), 'the add dialog offers Test once there is an address');

const padding = (locator) => locator.evaluate((element) => getComputedStyle(element).padding);
const cancel = page.getByRole('button', { name: 'Cancel' });
const [testPadding, cancelPadding] = [await padding(test), await padding(cancel)];
const [testBox, cancelBox] = [await test.boundingBox(), await cancel.boundingBox()];
record(
  testPadding === cancelPadding && Math.abs(testBox.height - cancelBox.height) <= 1 && testBox.width <= cancelBox.width * 1.5,
  `Test is drawn as Cancel is (padding ${testPadding} against ${cancelPadding}, ${testBox.width.toFixed(0)}x${testBox.height.toFixed(0)} against ${cancelBox.width.toFixed(0)}x${cancelBox.height.toFixed(0)})`,
);

/** Test in the actions row, directly left of Add Server: one row, centres level, the row's gap between. */
const add = page.locator('dialog[open]').getByRole('button', { name: 'Add Server', exact: true });
const placement = await test.evaluate((element, other) => {
  const own = element.getBoundingClientRect();
  const next = other.getBoundingClientRect();
  return {
    sameParent: element.parentElement === other.parentElement,
    adjacent: element.nextElementSibling === other,
    offset: Math.abs(own.top + own.height / 2 - (next.top + next.height / 2)),
    gap: next.left - own.right,
    rowGap: parseFloat(getComputedStyle(element.parentElement).columnGap) || 0,
  };
}, await add.elementHandle());
record(
  placement.sameParent && placement.adjacent && placement.offset <= 1 && placement.gap > 0 && Math.abs(placement.gap - placement.rowGap) <= 1,
  `Test is in the actions row, immediately left of Add Server (same row ${placement.sameParent}, next to it ${placement.adjacent}, ${placement.offset.toFixed(1)}px off centre, ${placement.gap.toFixed(1)}px apart against a ${placement.rowGap}px gap)`,
);
await test.click();
const said = line.locator('[data-check-reachable]');
await page.waitForFunction(() => document.querySelector('[data-check-reachable]') !== null, null, { timeout: 30_000 }).catch(() => {});
const reachable = await said.getAttribute('data-check-reachable').catch(() => null);
const sentence = ((await said.textContent().catch(() => '')) ?? '').trim();
record(reachable === 'false', `a server nothing answers on is reported unreachable (${reachable})`);
record(sentence.includes('127.0.0.1:9'), `and the reason names the address (${sentence})`);

await page.getByRole('button', { name: 'Cancel' }).click();
const { mcpServers } = await graphql(`query($id: ID!) { mcpServers(workspaceId: $id) { name } }`, { id: WORKSPACE });
record(!mcpServers.some((one) => one.name === NAME), 'and testing added nothing');

await finish(browser);
