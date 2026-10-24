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
  /*
   * Orknux access off on purpose. A new agent starts with it on since the
   * server's 065cb6dd, and with it on the orknux_* rows are the agent's to
   * switch one by one (c283f934) - so none of them is locked, and the half of
   * this check about a locked row would have nothing to hover.
   */
  `mutation($w: ID!, $n: String!) { createAgent(input: { workspaceId: $w, name: $n, type: LLM, orknuxAccess: false }) { id } }`,
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
const card = page.locator('[data-grant-card]').first();
/*
 * Hovered again until the card is up: the row is there before the list has
 * settled, and a row that moves out from under the pointer never hears the
 * mouse arrive. Three tries in the time one wait used to take.
 */
let shown = false;
for (let attempt = 0; attempt < 3 && !shown; attempt += 1) {
  await page.mouse.move(0, 0);
  await row.hover();
  shown = await card.waitFor({ timeout: 1_000 }).then(() => true).catch(() => false);
}
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

/*
 * A locked row says why it cannot be changed, and where it is switched - on or
 * off (6eb5f06). Off: an orknux_ tool while Orknux access is off. On: a memory
 * tool, carried because the agent holds the workspace's memory catalogs, which
 * every new agent does since 1.0.8 and which every workspace has one of.
 */
async function lockedReason(name) {
  const row = page.locator(`[data-grant-name="${name}"]`).first();
  if (!(await row.waitFor({ timeout: 5_000 }).then(() => true).catch(() => false))) return null;
  const button = row.locator('[data-tool-state]').first();
  const fixed = (await button.getAttribute('data-tool-fixed')) !== null;
  const state = await button.getAttribute('data-tool-state');
  await row.hover();
  const reason = await page.locator('[data-grant-card] [data-grant-card-reason]').first().innerText().catch(() => '');
  await page.mouse.move(0, 0);
  return { fixed, state, reason };
}
const lockedOff = await lockedReason('orknux_sessions');
record(
  lockedOff !== null && lockedOff.fixed && lockedOff.state === 'hide' && /Orknux access/.test(lockedOff.reason),
  `a locked row that is off says where it is switched (${JSON.stringify(lockedOff)})`,
);
const lockedOn = await lockedReason('memory_search');
record(
  lockedOn !== null && lockedOn.fixed && lockedOn.state !== 'hide' && /memory catalogs/.test(lockedOn.reason),
  `a locked row that is on says where it is switched (${JSON.stringify(lockedOn)})`,
);

/* A press on the name cycles the row, as the state button does. */
const pressRow = page.locator(`[data-grant-name="aaa_card_tool_${stamp}"]`).first();
await pressRow.waitFor({ timeout: 10_000 }).catch(() => undefined);
const stateOf = () => pressRow.locator('[data-tool-state]').first().getAttribute('data-tool-state');
const was = await stateOf();
await pressRow.locator('[data-grant-press]').first().click();
const now = await stateOf();
record(was !== null && now !== null && was !== now, `pressing the name cycles the row (${was} -> ${now})`);
await pressRow.locator('[data-tool-state]').first().click();
await pressRow.locator('[data-tool-state]').first().click();
record((await stateOf()) === was, 'and the button still cycles it, all the way round');

/* Only the icon at the row's end opens the page; the name is text. Asked for after the name was made a link. */
const toolRow = page.locator(`[data-grant-name="aaa_card_tool_${stamp}"]`).first();
await toolRow.waitFor({ timeout: 10_000 }).catch(() => undefined);
const links = toolRow.locator('a');
record((await links.count()) === 1, `a workspace tool's row has exactly one link (${await links.count()})`);
const icon = toolRow.locator('[data-grant-link]').first();
const href = await icon.getAttribute('href').catch(() => null);
record(href !== null && href.endsWith(`/tools/${tool.id}`), `the icon goes to that tool's page (${href})`);
const nameBox = await toolRow.getByText(`aaa_card_tool_${stamp}`, { exact: true }).first().boundingBox();
const iconBox = await icon.boundingBox();
record(
  nameBox !== null && iconBox !== null && iconBox.x > nameBox.x + nameBox.width - 1 && iconBox.width <= 24,
  `and it is the small icon at the row's end, not the name (${iconBox ? Math.round(iconBox.width) : 'none'}px wide)`,
);

await graphql(`mutation($id: ID!) { deleteTool(id: $id) }`, { id: tool.id }).catch(() => undefined);
await graphql(`mutation($id: ID!) { deleteAgent(id: $id) }`, { id: agent.id }).catch(() => undefined);
await finish(browser);
