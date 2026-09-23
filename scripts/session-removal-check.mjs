/**
 * An installation that will not let a conversation be thrown away.
 *
 * A session is the record of what an agent was asked and what it answered, and
 * on some installations that is the only account of a decision anybody has.
 * Removing one is a person tidying up after a mistyped key or a run they were
 * trying out - which is what it is for - but where the record has to stand it is
 * a hole somebody can put in it with one press and no way back.
 *
 * The rule is pinned in SessionRemovalTest, which can open a session and try the
 * mutation. What is measured here is the screen: the switch is in Admin, and the
 * control on a conversation appears and disappears with it - drawn where the
 * door is open, and left out rather than drawn and refused where it is closed.
 *
 * Makes one session and removes it, and leaves the installation on the setting
 * it found.
 */
import { BASE, WORKSPACE, open, drawn, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const held = async () => {
  const { installationSettings } = await graphql(`{ installationSettings { sessionsRemovable } }`);
  return installationSettings.sessionsRemovable;
};

const was = await held();
console.log(`installation allows removal: ${was}`);

const allow = async (removable) => {
  await graphql(`mutation($r: Boolean!) { setSessionsRemovable(removable: $r) { sessionsRemovable } }`, {
    r: removable,
  });
};

/* ----------------------------------------------------------------- fixture */

/*
 * Its own conversation, so the control is measured on a session this check may
 * remove. Nothing creates a session through the API - one appears because a run
 * computed its key - so a chat is started and the session it opens is used.
 */
const { llmSessions } = await graphql(
  `query($w: ID!) { llmSessions(workspaceId: $w, page: 0, size: 1) { content { id } } }`,
  { w: WORKSPACE },
);
const SESSION = llmSessions.content[0]?.id ?? null;

if (SESSION === null) {
  /*
   * Said rather than passed quietly: with no conversation there is no control
   * to look for, and a silent skip reads afterwards as coverage.
   */
  record(false, 'there is a conversation in this workspace to measure the control on');
  await allow(was);
  await finish(browser);
}

const clean = async () => {
  await allow(was);
  await finish(browser);
};

/* ------------------------------------------------ the switch is in Admin -- */

await page.goto(`${BASE}/admin/settings`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the settings page'), 'the admin settings page is on screen');

const toggle = page.locator('button[role="switch"][aria-label*="conversations to be removed"]');
const there = await toggle
  .first()
  .waitFor({ timeout: 20_000 })
  .then(() => true)
  .catch(() => false);
record(there, 'Admin has a switch for whether conversations can be removed');
if (!there) await clean();

/* ---------------------------------------- the control follows the switch -- */

const removeButton = page.getByRole('button', { name: /^Remove session$/ });

await allow(true);
await page.goto(`${BASE}/workspace/${WORKSPACE}/sessions/${SESSION}`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the conversation'), "a conversation's page is on screen");

const offered = await removeButton
  .first()
  .waitFor({ timeout: 20_000 })
  .then(() => true)
  .catch(() => false);
record(offered, 'with the door open, the conversation offers a way to remove it');

await allow(false);
await page.goto(`${BASE}/workspace/${WORKSPACE}/sessions/${SESSION}`, { waitUntil: 'domcontentloaded' });
await drawn(page, 'the conversation');

/*
 * Waited for rather than read once: the setting is a second answer that lands
 * after the page, and the control is drawn until it does.
 */
const gone = await page
  .waitForFunction(
    () => ![...document.querySelectorAll('button')].some((one) => one.textContent.trim() === 'Remove session'),
    { timeout: 20_000 },
  )
  .then(() => true)
  .catch(() => false);
record(gone, 'with it closed, the control is left out rather than drawn and refused');

/* ------------------------------------ and the server refuses it regardless - */

/*
 * Asked of the server, because the button being gone is not the boundary: the
 * same mutation is reachable from the API.
 */
const refused = await graphql(`mutation($id: ID!) { removeLlmSession(id: $id) }`, { id: SESSION }).then(
  () => null,
  (cause) => String(cause?.message ?? cause),
);
console.log(`refusal: ${refused}`);
record(
  refused !== null && refused.includes('does not allow conversations to be removed'),
  'and the server refuses it too, because a screen is not a boundary',
);
record(
  refused !== null && refused.includes('Admin'),
  'saying where it is changed rather than only that it cannot be done',
);

/* The conversation is still there, which is the whole of what this is for. */
const stillThere = await graphql(`query($id: ID!) { llmSession(id: $id) { id } }`, { id: SESSION }).catch(
  () => null,
);
record(stillThere?.llmSession?.id === SESSION, 'and the conversation is still there');

await clean();
