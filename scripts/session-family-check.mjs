/**
 * The session page lists a session's family and switches between them.
 * Issue #379.
 *
 * An agent that asks another agent hands it a session of its own, under the
 * one that asked. The page opens a panel from the top right listing the main
 * session and every one started from it, each with a dot - green while an
 * agent is at work in it, orange once it has gone quiet - and a click draws
 * that session on the left, with the panel still open.
 *
 * ---------------------------------------------------------------------------
 * Why the family is stubbed and the query is not
 *
 * A subagent session exists because a model called ask_agent, and asking a
 * real model to do that on cue would make this a measurement of the provider's
 * mood. So the *contract* is asked of the running server - Query serves
 * llmSessionFamily with the fields the page asks for - and only the members
 * are put in front of a stubbed answer. What is kept and how it is ordered is
 * SubagentSessionTest's business.
 *
 * Makes nothing and removes nothing.
 * ---------------------------------------------------------------------------
 */
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 1000 } });

/* -------------------------------------------------- the server's contract - */

const served = await graphql(`query { __type(name: "Query") { fields { name } } }`, {}).catch(() => null);
record(
  (served?.__type?.fields ?? []).some((one) => one.name === 'llmSessionFamily'),
  "the server answers a session's family",
);
const member = await graphql(`query { __type(name: "LlmSessionMember") { fields { name } } }`, {}).catch(() => null);
const carried = (member?.__type?.fields ?? []).map((one) => one.name);
record(
  ['id', 'title', 'main', 'active'].every((one) => carried.includes(one)),
  'and each member says its title, whether it is the main one, and whether it is active',
);

/* ------------------------------------------------------------ the drawing - */

const MAIN = '424242';
const FAMILY = [
  { id: MAIN, key: 'chat:planning', title: 'Main session', main: true, active: true, lastEventAt: '2026-09-23T09:05:00Z' },
  { id: '424243', key: 'chat:planning:ask-1', title: 'Summarise the incident thread', main: false, active: false, lastEventAt: '2026-09-23T09:01:00Z' },
  { id: '424244', key: 'chat:planning:ask-2', title: 'Find the service owners', main: false, active: true, lastEventAt: '2026-09-23T09:04:00Z' },
];

await page.route('**/graphql', async (route) => {
  const body = route.request().postData() ?? '';
  if (body.includes('llmSessionFamily(')) {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { llmSessionFamily: FAMILY } }) });
    return;
  }
  if (body.includes('llmSession(')) {
    const asked = JSON.parse(body).variables?.id ?? MAIN;
    const one = FAMILY.find((held) => held.id === asked) ?? FAMILY[0];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          llmSession: {
            id: one.id, workspaceId: WORKSPACE, key: one.key, keyPrefix: 'chat', eventCount: 0,
            createdAt: '2026-09-23T08:00:00Z', lastEventAt: one.lastEventAt, notes: [],
          },
        },
      }),
    });
    return;
  }
  await route.continue();
});

await page.goto(`${BASE}/workspace/${WORKSPACE}/sessions/${MAIN}`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the session'), 'a session opens');

// The panel is simply there where there is a family - no button to open it,
// because a thing that exists should not have to be asked for. Issue #388.
record(await page.locator('[data-family-toggle]').count().then((many) => many === 0), 'there is no button to open it');
const opened = await page
  .locator('#session-family')
  .waitFor({ timeout: 10_000 })
  .then(() => true)
  .catch(() => false);
record(opened, 'the panel is there beside the transcript, without being asked for');
if (!opened) await finish(browser);

const rows = page.locator('[data-session-member]');
await rows.first().waitFor({ timeout: 10_000 }).catch(() => undefined);
const listed = await rows.allInnerTexts();
console.log(`listed: ${JSON.stringify(listed)}`);
record(listed.length === 3, `it lists the main session and every subagent session (${listed.length})`);
record(listed[0] === 'Main session', 'the main session first, named exactly that');
record(
  listed[1] === 'Summarise the incident thread' && listed[2] === 'Find the service owners',
  'and each subagent session by the task the main agent gave it',
);

const active = await page.locator('[data-session-member][data-session-active="true"]').count();
record(active === 2, `each carries its status: ${active} active (green), the rest inactive (orange)`);
record(
  await page.locator('[data-session-member][aria-current="page"]').getAttribute('data-session-member').then((id) => id === MAIN),
  'the one on screen is marked as the current one',
);

/* Above the fold and to the right of the transcript. */
const where = await page.evaluate(() => {
  const panel = document.querySelector('#session-family')?.getBoundingClientRect();
  const transcript = document.querySelector('[class*="_transcript_"]')?.getBoundingClientRect();
  return panel && transcript ? { panelLeft: panel.left, transcriptRight: transcript.right, panelTop: panel.top } : null;
});
console.log(`where: ${JSON.stringify(where)}`);
record(where !== null && where.panelLeft >= where.transcriptRight - 1, 'drawn on the right, beside the transcript');

/* ------------------------------------------------------- switching ------ */

await page.locator('[data-session-member="424243"]').click();
await page.waitForTimeout(1200);
record(
  page.url().includes('/sessions/424243'),
  `clicking a session draws it on the left (${page.url()})`,
);
record(
  await page.locator('#session-family').count().then((many) => many === 1),
  'and the panel is still there, because that session has a family too',
);
record(
  await page.locator('[data-session-member][aria-current="page"]').getAttribute('data-session-member').then((id) => id === '424243'),
  'and the panel now marks that one as current',
);

await finish(browser);
