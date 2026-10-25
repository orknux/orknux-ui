/**
 * orknux_delete_diagram starts hidden: on a new agent with Orknux access, and
 * on one given the grant afresh on its settings page, where every other
 * orknux_ tool arrives at Offer. Its owner turns it on there, and Save stores it.
 *
 * The agents are this check's own and deleted afterwards.
 */
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const DELETE = 'orknux_delete_diagram';
const READ = 'orknux_diagrams';
const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 1100 } });
const made = async (name, access) => (await graphql(
  `mutation($w: ID!, $n: String!, $a: Boolean) { createAgent(input: { workspaceId: $w, name: $n, type: LLM, orknuxAccess: $a }) { id name } }`,
  { w: WORKSPACE, n: `${name} ${Date.now()}`, a: access },
)).createAgent;
const held = async (id) => (await graphql(`query($id: ID!) { agent(id: $id) { tools requiredTools } }`, { id })).agent;
const state = (tool) => page.locator(`[data-grant-name="${tool}"] [data-tool-state]`).first();

// A new agent with the grant: the delete hidden, the rest at Offer.
const fresh = await made('zz diagram delete new', true);
const freshHeld = await held(fresh.id);
record(!freshHeld.tools.includes(DELETE) && freshHeld.tools.includes(READ) && !freshHeld.requiredTools.includes(READ),
  `a new agent with Orknux access holds ${READ} at Offer and not ${DELETE} (${JSON.stringify(freshHeld)})`);

// Granted afresh on the page.
const later = await made('zz diagram delete later', false);
await page.goto(`${BASE}/workspace/${WORKSPACE}/agents/${later.id}/settings`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, "the agent's page"), "the agent's page is on screen");
await page.getByLabel(/Let this agent ask orknux about orknux/).check({ timeout: 20_000 });
await state(DELETE).waitFor({ timeout: 10_000 }).catch(() => undefined);
record((await state(READ).getAttribute('data-tool-state')) === 'offer' && (await state(DELETE).getAttribute('data-tool-state')) === 'hide',
  `granted afresh, ${READ} reads Offer and ${DELETE} Hide (${await state(READ).getAttribute('data-tool-state')}, ${await state(DELETE).getAttribute('data-tool-state')})`);
await page.getByRole('button', { name: /^Save/ }).first().click();
await page.waitForTimeout(2000);
const saved = await held(later.id);
record(!saved.tools.includes(DELETE) && saved.tools.includes(READ) && !saved.requiredTools.includes(READ), `and saved so (${JSON.stringify(saved.tools.filter((one) => one.includes('diagram')))})`);

// Its owner turns it on.
await state(DELETE).click();
await page.getByRole('button', { name: /^Save/ }).first().click();
await page.waitForTimeout(2000);
record((await held(later.id)).tools.includes(DELETE), `a press and Save offer ${DELETE} to this agent`);

for (const agent of [fresh, later]) await graphql(`mutation($id: ID!) { deleteAgent(id: $id) }`, { id: agent.id }).catch(() => undefined);
await finish(browser);
