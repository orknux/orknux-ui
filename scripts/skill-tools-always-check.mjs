/**
 * The skill tools are held at Always, like finish_answer, while the workspace
 * keeps its built-ins fixed - and the agent form draws their rows fixed there.
 *
 * Session 896: a Qwen agent under a tool limit had skill_list and skill_load at
 * Offer, so they were behind the tool search while its briefing told it to call
 * them before starting work. It asked to be granted skill_list, was told it
 * could not be, and never read a skill. The server now puts the mark back on
 * every save (BuiltInTools.FIXED_ALWAYS); this measures that a save sending
 * the marks without them still stores them, and that each row reads Always and
 * cannot be pressed.
 *
 * It works on a scratch agent of its own, with the gate shut, and puts both back.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const FIXED = ['skill_list', 'skill_load', 'skill_search', 'finish_answer'];

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const unsafeWas = (await graphql(`query ($w: ID!) { workspace(id: $w) { unsafeBuiltInTools } }`, { w: WORKSPACE }))
  .workspace.unsafeBuiltInTools;
const allowUnsafe = (allowed) =>
  graphql(`mutation ($w: ID!, $a: Boolean!) { setWorkspaceUnsafeBuiltInTools(workspaceId: $w, allowed: $a) { id } }`, {
    w: WORKSPACE,
    a: allowed,
  });
await allowUnsafe(false);

const name = `zz skill tools always ${Date.now()}`;
const scratch = (await graphql(
  `mutation($w: ID!, $n: String!) { createAgent(input: { workspaceId: $w, name: $n, type: LLM }) { id requiredTools } }`,
  { w: WORKSPACE, n: name },
).catch(() => ({ createAgent: null }))).createAgent;
const done = async () => {
  if (scratch !== null) {
    await graphql(`mutation($id: ID!) { deleteAgent(id: $id) }`, { id: scratch.id }).catch(() => undefined);
  }
  await allowUnsafe(unsafeWas).catch(() => undefined);
  await finish(browser);
};
if (scratch === null) {
  record(false, 'a scratch agent could be made');
  await done();
}

const { builtInTools } = await graphql(`{ builtInTools { name fixedAlways } }`);
const flagged = builtInTools.filter((one) => one.fixedAlways).map((one) => one.name).sort();
record(
  JSON.stringify(flagged) === JSON.stringify([...FIXED].sort()),
  `the server flags finish_answer and the skill tools as held at Always (${flagged.join(', ')})`,
);

// A save under a tool limit that sends the marks without them, as a form or a script left at Offer would.
const sent = scratch.requiredTools.filter((one) => !FIXED.includes(one));
const saved = (
  await graphql(
    `mutation($id: ID!, $n: String!, $r: [String!]) { updateAgent(id: $id, input: { name: $n, maxTools: 20, requiredTools: $r }) { requiredTools } }`,
    { id: scratch.id, n: name, r: sent },
  )
).updateAgent;
const kept = FIXED.filter((one) => saved.requiredTools.includes(one));
record(kept.length === FIXED.length, `a save leaving them out still stores them Always (${kept.join(', ') || 'none'})`);

await page.goto(`${BASE}/workspace/${WORKSPACE}/agents/${scratch.id}/settings`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-grants="tools"] [data-grant-rows]', { timeout: 20_000 });
await page.waitForSelector('[data-grant-name="skill_list"] [data-tool-state]', { timeout: 20_000 });
await page.waitForTimeout(2000);

for (const one of FIXED) {
  const control = page.locator(`[data-grant-name="${one}"] [data-tool-state]`);
  const state = await control.getAttribute('data-tool-state');
  const fixed = (await control.getAttribute('data-tool-fixed')) !== null;
  const pressable = await control.isEnabled();
  record(state === 'always' && fixed && !pressable, `${one} reads Always and is fixed (${state}, fixed ${fixed}, pressable ${pressable})`);
}

await done();
