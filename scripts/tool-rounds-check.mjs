/**
 * How many rounds of tool calls an agent gets, set from the screen.
 *
 * It was eight, written into the code, and an agent holding twenty tools spent
 * three of them listing and loading before the work began: what came back was
 * "kept looking things up without reaching an answer", with everything it had
 * gathered thrown away and nothing anybody could change about it.
 *
 * Two knobs, because one number cannot be right for both cases. Admin sets what
 * every agent follows; an agent whose work is longer carries its own, and
 * emptying that box puts it back to the installation's.
 *
 * Driven against the server rather than against the boxes: a field that shows a
 * number and stores nothing is the failure this is for. Leaves the installation
 * on the number it found.
 */
import { BASE, WORKSPACE, open, drawn, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

/** What the server holds for the installation. */
const held = async () => {
  const { installationSettings } = await graphql(
    `{ installationSettings { chatMaxRounds chatMaxRoundsConfigured } }`,
  );
  return installationSettings;
};

const was = await held();
console.log(`installation: ${JSON.stringify(was)}`);

/*
 * A number this installation is not already on. Save is disabled until a box
 * differs from what the server holds - which is right, and which means a check
 * typing the number already there would press a control that is correctly dead.
 */
const WANTED = was.chatMaxRounds === 24 ? 25 : 24;

/* ------------------------------------------------------- the admin default */

await page.goto(`${BASE}/admin/settings`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the settings page'), 'the admin settings page is on screen');

const box = page.locator('#chat-max-rounds');
const there = await box
  .waitFor({ timeout: 20_000 })
  .then(() => true)
  .catch(() => false);
record(there, 'the installation has a box for how many rounds an agent gets');

if (there) {
  record(Number(await box.inputValue()) === was.chatMaxRounds, "and it opens on what the server holds");

  await box.fill(String(WANTED));
  // Saved by the page's own button, the way every other number here is.
  await page.getByRole('button', { name: /^Save/ }).first().click();
  await page.waitForTimeout(2000);

  const stored = await held();
  console.log(`after saving ${WANTED}: ${JSON.stringify(stored)}`);
  record(stored.chatMaxRounds === WANTED, `the number typed is the number stored (${stored.chatMaxRounds})`);
  /*
   * What the file says is untouched. The screen stores an answer beside the
   * configured one rather than over it, so an operator can see the two differ
   * rather than wonder why the file they edited appears to be ignored.
   */
  record(
    stored.chatMaxRoundsConfigured === was.chatMaxRoundsConfigured,
    'and what the configuration file says is left alone',
  );
}

/* ------------------------------------------------------ the agent's own one */

const { workspaceAgents } = await graphql(
  `query($w: ID!) { workspaceAgents(workspaceId: $w, size: 1) { content { id name maxRounds } } }`,
  { w: WORKSPACE },
);
const agent = workspaceAgents.content[0] ?? null;

if (agent === null) {
  record(false, 'there is an agent to open');
} else {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/agents/${agent.id}/settings`, {
    waitUntil: 'domcontentloaded',
  });
  record(await drawn(page, "the agent's page"), "the agent's page is on screen");

  const own = page.locator('#agent-max-rounds');
  const offered = await own
    .waitFor({ timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  record(offered, 'an agent has a box of its own for the same number');

  if (offered) {
    record(
      (await own.inputValue()) === (agent.maxRounds === null ? '' : String(agent.maxRounds)),
      'which opens on what that agent holds, empty where it follows the installation',
    );

    // The same rule on this form: a number it already holds is not a change.
    const asked = agent.maxRounds === 40 ? 41 : 40;
    await own.fill(String(asked));
    await page.getByRole('button', { name: /^Save/ }).first().click();
    await page.waitForTimeout(2000);

    const after = await graphql(`query($id: ID!) { agent(id: $id) { maxRounds } }`, { id: agent.id });
    console.log(`agent after saving ${asked}: ${JSON.stringify(after.agent)}`);
    record(
      after.agent.maxRounds === asked,
      `the agent's own number reached the server (${after.agent.maxRounds})`,
    );

    // Emptied is "follow the installation", which is the way back and the half
    // a form that only ever sets a number would have no way to say.
    await own.fill('');
    await page.getByRole('button', { name: /^Save/ }).first().click();
    await page.waitForTimeout(2000);

    const back = await graphql(`query($id: ID!) { agent(id: $id) { maxRounds } }`, { id: agent.id });
    record(back.agent.maxRounds === null, 'and emptying the box puts it back to the installation’s');
  }
}

/* --------------------------------------------- leave it as it was found ---- */

await graphql(`mutation($rounds: Int!) { setChatMaxRounds(rounds: $rounds) { chatMaxRounds } }`, {
  rounds: was.chatMaxRounds,
});

await finish(browser);
