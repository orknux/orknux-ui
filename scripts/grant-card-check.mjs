/**
 * A tool or skill on the agent page says what it is on hover, and its name
 * goes to its page.
 *
 * Asked for: hovering a row should give the tool's or skill's summary, and the
 * name should be a link. It was a native title - a second's wait for one grey
 * line - and a built-in or a plugin's tool had no line at all. Measured as a
 * drawn card with text in it, and a link on a workspace tool's name.
 *
 * The agent and the tool are this check's own and deleted afterwards.
 */
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 1100 } });
const stamp = Date.now();
const agent = (await graphql(
  `mutation($w: ID!, $n: String!) { createAgent(input: { workspaceId: $w, name: $n, type: LLM }) { id } }`,
  { w: WORKSPACE, n: `zz grant card agent ${stamp}` },
)).createAgent;
const tool = (await graphql(
  `mutation($w: ID!, $n: String!) { createTool(input: { workspaceId: $w, name: $n }) { id } }`,
  { w: WORKSPACE, n: `aaa_card_tool_${stamp}` },
)).createTool;

await page.goto(`${BASE}/workspace/${WORKSPACE}/agents/${agent.id}/settings`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, "the agent's page"), "the agent's page is on screen");

const row = page.locator('[data-grant-name="scratchpad_write"]').first();
record(await row.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false), 'the tools list has the built-in scratchpad_write');
await row.hover();
const card = page.locator('[data-grant-card]').first();
const shown = await card.waitFor({ timeout: 3_000 }).then(() => true).catch(() => false);
record(shown, 'hovering it draws a card');
if (shown) {
  const box = await card.boundingBox();
  const text = (await card.innerText()).trim();
  record(box !== null && box.width > 50 && box.height > 20, `with room to read (${box?.width}x${box?.height})`);
  record(!text.includes('No description.') && text.length > 'scratchpad_write'.length + 20, `and says what the tool does (${text.replace(/\s+/g, ' ').slice(0, 120)})`);
}
const builtInLinks = await row.locator('[data-grant-link]').count();
record(builtInLinks === 0, `a built-in's name is not a link, having no page of its own (${builtInLinks})`);
await page.mouse.move(0, 0);
record(!(await card.isVisible().catch(() => false)), 'and leaving the row puts it away');

const toolName = page.locator(`[data-grant-name="aaa_card_tool_${stamp}"] [data-grant-link]`).first();
record(await toolName.waitFor({ timeout: 10_000 }).then(() => true).catch(() => false), "a workspace tool's name is a link");
const href = await toolName.getAttribute('href').catch(() => null);
record(href !== null && href.endsWith(`/tools/${tool.id}`), `to that tool's page (${href})`);

await graphql(`mutation($id: ID!) { deleteTool(id: $id) }`, { id: tool.id }).catch(() => undefined);
await graphql(`mutation($id: ID!) { deleteAgent(id: $id) }`, { id: agent.id }).catch(() => undefined);
await finish(browser);
