/**
 * The server's own tools are on for an agent to begin with, and hiding one is
 * stored. Issues #413, #444.
 *
 * `finish_answer` used to be a flag on the agent drawn as a tick in the Tools
 * list; since #444 it is a name in `tools` like every other built-in - the
 * note, the clock, the scratchpad, saving a file, the picture link - with the
 * same Hide, Offer, Always control, and every built-in is a row. What this
 * measures is that an agent that exists holds every one of them Always without
 * anybody having pressed anything (V302 gave existing agents what they were
 * being handed; a new agent starts with all of them), that hiding one is
 * stored as the name leaving `tools`, and that the old `finishAccess` and
 * `pictureLinkAccess` answers read the list - which is the half a derived
 * switch gets wrong: it is easy to draw Always, and easy to store nothing
 * behind it.
 *
 * It works on a scratch agent of its own and deletes it afterwards.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

/*
 * Hiding a built-in is gated since #482/#483: the rows are fixed until the
 * workspace allows unsafe built-in visibility. This check is about what a switch
 * stores, so it opens the gate for its run and puts it back as it found it.
 */
const unsafeWas = (await graphql(`query ($w: ID!) { workspace(id: $w) { unsafeBuiltInTools } }`, { w: WORKSPACE }))
  .workspace.unsafeBuiltInTools;
const allowUnsafe = (allowed) =>
  graphql(`mutation ($w: ID!, $a: Boolean!) { setWorkspaceUnsafeBuiltInTools(workspaceId: $w, allowed: $a) { id } }`, {
    w: WORKSPACE,
    a: allowed,
  });
await allowUnsafe(true);
// An agent of its own: saving the workspace's first one reset somebody's real agent.
const scratch = (await graphql(
  `mutation($w: ID!, $n: String!) { createAgent(input: { workspaceId: $w, name: $n, type: LLM }) { id } }`,
  { w: WORKSPACE, n: `zz finish answer agent ${Date.now()}` },
).catch(() => ({ createAgent: null }))).createAgent;
const done = async () => {
  if (scratch !== null) {
    await graphql(`mutation($id: ID!) { deleteAgent(id: $id) }`, { id: scratch.id }).catch(() => undefined);
  }
  await allowUnsafe(unsafeWas).catch(() => undefined);
  await finish(browser);
};

const agent =
  scratch === null
    ? undefined
    : (
        await graphql(`query ($id: ID!) { agent(id: $id) { id name tools requiredTools finishAccess pictureLinkAccess } }`, {
          id: scratch.id,
        })
      ).agent;
if (agent === undefined) {
  record(false, 'the workspace has an agent to open; the seed builds one');
  await done();
}

/* ------------------------------------------ what an existing agent holds */

const { builtInTools } = await graphql(`{ builtInTools { name governance } }`);
const byName = builtInTools.filter((one) => one.governance === 'GRANT').map((one) => one.name);
record(byName.length > 0, `the server declares ${byName.length} built-ins switched by name`);

/*
 * Every one that used to be handed out without asking. draw_picture was a
 * name grant before #444 - ticked by somebody or not held - so V302 leaves it
 * as it was; an agent that never had it still does not, and that is right.
 */
const OPT_IN_BEFORE = ['draw_picture'];
const missing = byName.filter((name) => !OPT_IN_BEFORE.includes(name) && !agent.tools.includes(name));
record(
  missing.length === 0,
  `an existing agent holds every one it was being handed without anybody ticking anything (missing: ${missing.join(', ') || 'none'})`,
);
record(
  agent.finishAccess === true && agent.pictureLinkAccess === true,
  `and the old switches read the list (${agent.finishAccess}, ${agent.pictureLinkAccess})`,
);

await page.goto(`${BASE}/workspace/${WORKSPACE}/agents/${agent.id}/settings`, {
  waitUntil: 'domcontentloaded',
});
await page.waitForSelector('[data-grants="tools"] [data-grant-rows]', { timeout: 20_000 });
await page.waitForSelector('[data-grant-name="finish_answer"] [data-tool-state]', { timeout: 20_000 });
// The catalogues arrive after the form does, and a row clicked while the
// list behind it is still settling is a click the next render undoes.
await page.waitForTimeout(2000);

/** One row's control: its state, and whether it can be pressed. */
const control = (named) => page.locator(`[data-grant-name="${named}"] [data-tool-state]`);
const stateOf = async (named) => control(named).getAttribute('data-tool-state');

/** Presses the control round its cycle until it reads `wanted`; at most three presses. */
async function cycleTo(named, wanted) {
  for (let press = 0; press < 3; press += 1) {
    if ((await stateOf(named)) === wanted) return;
    await control(named).click();
    await page.waitForTimeout(250);
  }
}

record((await control('finish_answer').count()) === 1, 'the row is in the Tools list, where the grants are');
/*
 * Always where the agent carries a ceiling, Offer where it does not: V302 marked
 * Always only under a ceiling, since without one every offered tool is carried
 * and the two states are the same thing. Either reads as held.
 */
record(['always', 'offer'].includes(await stateOf('finish_answer')), `and it reads as held (${await stateOf('finish_answer')})`);

/* ---------------------------------------------------- hiding it is stored */

await cycleTo('finish_answer', 'hide');
record((await stateOf('finish_answer')) === 'hide', 'it can be hidden');

await page.getByRole('button', { name: /^Save/ }).first().click();
await page.waitForTimeout(1500);

const after = (
  await graphql(`query ($id: ID!) { agent(id: $id) { tools requiredTools finishAccess } }`, { id: agent.id })
).agent;
record(
  !after.tools.includes('finish_answer') && !after.requiredTools.includes('finish_answer'),
  `the server holds the hiding as the name leaving the list (${after.tools.length} tools)`,
);
record(after.finishAccess === false, `and the old switch reads it (${after.finishAccess})`);

await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-grant-name="finish_answer"] [data-tool-state]', { timeout: 20_000 });
await page.waitForTimeout(2000);
record(
  (await stateOf('finish_answer')) === 'hide',
  'and the form comes back hidden rather than on again by a default',
);

/* ------------------------------------------------------ and back on it goes */

await cycleTo('finish_answer', 'always');
await page.getByRole('button', { name: /^Save/ }).first().click();
await page.waitForTimeout(1500);

const restored = (
  await graphql(`query ($id: ID!) { agent(id: $id) { tools requiredTools finishAccess } }`, { id: agent.id })
).agent;
record(
  restored.tools.includes('finish_answer') && restored.requiredTools.includes('finish_answer') && restored.finishAccess === true,
  'marking it Always again puts it back on the list, and the switch reads it',
);

/* ------------------------------------------ the picture link, the same way */

/*
 * `picture_link` is the same arrangement, and was the other flag. The drawing
 * tools answer with a key, and this is the door a model knocks on when it wants
 * the picture inside what it writes - worth having, and worth being able to
 * take away from an agent whose answers are read somewhere this installation
 * is not.
 */
record((await control('picture_link').count()) === 1, 'picture_link is in the same list');
record(['always', 'offer'].includes(await stateOf('picture_link')), `and reads as held to begin with too (${await stateOf('picture_link')})`);

await cycleTo('picture_link', 'hide');
await page.getByRole('button', { name: /^Save/ }).first().click();
await page.waitForTimeout(1500);

const linked = (
  await graphql(`query ($id: ID!) { agent(id: $id) { tools pictureLinkAccess } }`, { id: agent.id })
).agent;
record(
  !linked.tools.includes('picture_link') && linked.pictureLinkAccess === false,
  `hiding it is stored, and the old switch reads it (${linked.pictureLinkAccess})`,
);

await cycleTo('picture_link', 'always');
await page.getByRole('button', { name: /^Save/ }).first().click();
await page.waitForTimeout(1500);
const relinked = (
  await graphql(`query ($id: ID!) { agent(id: $id) { tools pictureLinkAccess } }`, { id: agent.id })
).agent;
record(relinked.tools.includes('picture_link') && relinked.pictureLinkAccess === true, 'and it goes back on');

await done();
