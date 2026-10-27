/**
 * The three switches over session flagging, in Admin Settings under Sessions.
 *
 * "Hide concealed tool calls in chats" (on by default) decides whether a chat
 * keeps the calls to `flag_session` and `unflag_session` from an administrator
 * too - nobody else is ever shown one. "Session flagging" (on) decides whether
 * agents are offered the tools at all. "Flag tools on agents' Tools lists"
 * (off) decides whether those two are rows on an agent's Tools list whose mark
 * can change. The rules are ConcealedCallsInChatsTest's,
 * SessionFlaggingSwitchTest's and SessionFlagToolMarksTest's - the first two
 * need a model that flags, which CI has none of. Measured here is the screen:
 * each switch drawn after the switch for removing conversations with its (?),
 * saying what the server holds, storing what it is flipped to and still saying
 * so after a reload; the flags report saying in one line that flagging is off
 * while it is; and a scratch agent's Tools list without the two rows while the
 * third is off, and with them while it is on.
 *
 * Leaves the installation on the settings it found, and removes its agent.
 */
import { BASE, WORKSPACE, open, drawn, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const SWITCHES = [
  { id: 'concealed-calls-hidden', field: 'concealedCallsHiddenInChats', write: 'setConcealedCallsHiddenInChats', argument: 'hidden', label: 'Hide concealed tool calls in chats' },
  { id: 'session-flagging', field: 'sessionFlaggingEnabled', write: 'setSessionFlaggingEnabled', argument: 'enabled', label: 'Session flagging' },
  { id: 'session-flag-tools-adjustable', field: 'sessionFlagToolsAdjustable', write: 'setSessionFlagToolsAdjustable', argument: 'adjustable', label: 'Flag tools on agents’ Tools lists' },
];

const held = async (one) => {
  const { installationSettings } = await graphql(`{ installationSettings { ${one.field} } }`);
  return installationSettings[one.field];
};
const put = async (one, value) => {
  await graphql(`mutation($v: Boolean!) { ${one.write}(${one.argument}: $v) { ${one.field} } }`, { v: value });
};

const was = new Map();
for (const one of SWITCHES) {
  const value = await held(one).catch(() => null);
  was.set(one.id, value);
  record(value !== null, `the server answers ${one.field} (${value})`);
}

const clean = async () => {
  for (const one of SWITCHES) {
    const value = was.get(one.id);
    if (value !== null && value !== undefined) await put(one, value).catch(() => undefined);
  }
  await finish(browser);
};

const settingsPage = async () => {
  await page.goto(`${BASE}/admin/settings`, { waitUntil: 'domcontentloaded' });
  return page
    .locator(`#${SWITCHES[SWITCHES.length - 1].id}`)
    .waitFor({ timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
};

await page.goto(`${BASE}/admin/settings`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the settings page'), 'the admin settings page is on screen');

for (const one of SWITCHES) {
  const there = await page
    .locator(`#${one.id}`)
    .waitFor({ timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  record(there, `Admin Settings has a switch: ${one.label}`);
  if (!there) await clean();
}

/* ---------------------------------------------- where they are, and how they read */

const layout = await page.evaluate((ids) => {
  const top = (one) => one?.getBoundingClientRect().top ?? NaN;
  const sessions = top(document.querySelector('#sessions'));
  const scratchpads = top(document.querySelector('#scratchpads'));
  let after = top(document.querySelector('#sessions-removable'));
  return ids.map((id) => {
    const button = document.querySelector(`#${id}`);
    const row = button?.closest('div[class*="setting"]');
    const at = top(button);
    const inOrder = at > after;
    after = at;
    return {
      id,
      role: button?.getAttribute('role'),
      label: row?.querySelector('p')?.textContent?.trim() ?? '',
      hint: row?.querySelector('button:not([role="switch"])') !== null,
      placed: inOrder && at > sessions && at < scratchpads,
    };
  });
}, SWITCHES.map((one) => one.id));

for (const [index, one] of SWITCHES.entries()) {
  const drawnAs = layout[index];
  record(drawnAs.role === 'switch', `${one.label}: drawn as a switch (${drawnAs.role})`);
  record(drawnAs.label === one.label, `${one.label}: labelled in one line (${drawnAs.label})`);
  record(drawnAs.hint, `${one.label}: with a (?) beside its label`);
  record(drawnAs.placed, `${one.label}: under Sessions, in order after the switch for removing conversations`);
}

/* ----------------------------------------- flipping each stores it, and a reload */

const checked = async (one) => (await page.locator(`#${one.id}`).getAttribute('aria-checked')) === 'true';
const settle = (one, value) =>
  page
    .waitForFunction(
      ([id, want]) => document.querySelector(`#${id}`)?.getAttribute('aria-checked') === want,
      [one.id, String(value)],
      { timeout: 10_000 },
    )
    .catch(() => undefined);

for (const one of SWITCHES) {
  // From on, whichever its default, so each is pressed off and back on.
  await put(one, true);
  await settingsPage();
  record(await checked(one), `${one.label}: shows on while the server holds on`);

  await page.locator(`#${one.id}`).click();
  await settle(one, false);
  record(!(await checked(one)), `${one.label}: pressed, it shows off`);
  record((await held(one)) === false, `${one.label}: and the server holds off`);
  record(await page.getByText('Saved.').first().isVisible().catch(() => false), `${one.label}: and the page says it saved`);

  await settingsPage();
  record(!(await checked(one)), `${one.label}: after a reload it is still off`);

  if (one.id === 'session-flagging') {
    /* The report says so while it is off, and links to the switch. */
    await page.goto(`${BASE}/admin/reports?report=flags`, { waitUntil: 'domcontentloaded' });
    const line = page.locator('[data-recording-off="flags"]');
    const said = await line
      .waitFor({ timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    record(said, 'the flags report says session flagging is off');
    if (said) {
      record(
        (await line.locator('a').getAttribute('href'))?.endsWith('#session-flagging') === true,
        'and links to the switch',
      );
    }
    await settingsPage();
  }

  await page.locator(`#${one.id}`).click();
  await settle(one, true);
  await settingsPage();
  record((await checked(one)) && (await held(one)) === true, `${one.label}: pressed again and reloaded, it is on again`);
}

/* And the report says nothing while flagging is on. */
await page.goto(`${BASE}/admin/reports?report=flags`, { waitUntil: 'domcontentloaded' });
await page.locator('[data-testid="flag-row"], table, h2').first().waitFor({ timeout: 20_000 }).catch(() => undefined);
await page.waitForTimeout(800);
record((await page.locator('[data-recording-off="flags"]').count()) === 0, 'the flags report says nothing of it while flagging is on');

/* ------------------------------------------- the rows on an agent's Tools list */

const name = `zz flag tools rows ${Date.now()}`;
const scratch = (await graphql(
  `mutation($w: ID!, $n: String!) { createAgent(input: { workspaceId: $w, name: $n, type: LLM }) { id } }`,
  { w: WORKSPACE, n: name },
).catch(() => ({ createAgent: null }))).createAgent;
record(scratch !== null, 'a scratch agent could be made');

const rowsDrawn = async () => {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/agents/${scratch.id}/settings`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-grants="tools"] [data-grant-rows]', { timeout: 20_000 });
  await page.waitForSelector('[data-grant-name="skill_list"] [data-tool-state]', { timeout: 20_000 });
  await page.waitForTimeout(1500);
  return {
    flag: await page.locator('[data-grant-name="flag_session"]').count(),
    unflag: await page.locator('[data-grant-name="unflag_session"]').count(),
  };
};

if (scratch !== null) {
  const marks = SWITCHES[2];
  await put(marks, false);
  const hidden = await rowsDrawn();
  record(hidden.flag === 0 && hidden.unflag === 0, `switched off, the Tools list has no row for either flag tool (${JSON.stringify(hidden)})`);

  await put(marks, true);
  const shown = await rowsDrawn();
  record(shown.flag === 1 && shown.unflag === 1, `switched on, both are rows like any other built-in (${JSON.stringify(shown)})`);
  const state = await page.locator('[data-grant-name="flag_session"] [data-tool-state]').getAttribute('data-tool-state').catch(() => null);
  record(state === 'always', `and read Always, which every agent holds them at (${state})`);

  await graphql(`mutation($id: ID!) { deleteAgent(id: $id) }`, { id: scratch.id }).catch(() => undefined);
}

await clean();
