/**
 * What an agent wrote down for itself, on the session it wrote it in. Issue #371.
 *
 * The server half is pinned in NoteToSelfTest: what is kept, what is refused,
 * and that a turn with nowhere to put a note is not offered the tool. What is
 * measured here is the other end - that the field is served, and that a note is
 * a line of the session's log, in time order with the rest, since #409 took them
 * out of the block that stood above the transcript.
 *
 * ---------------------------------------------------------------------------
 * Why the notes are stubbed and the field is not
 *
 * A note exists because a model called `note_to_self`, and there is no mutation
 * that writes one - rightly, since a note nobody's agent wrote is not a note.
 * Asking a real model to call it would make this check a measurement of whether
 * a provider felt like using a tool that round, which is the kind of check that
 * goes red on a Tuesday for no reason anybody can act on.
 *
 * So the two halves are held apart. The *contract* is asked of the running
 * server - does LlmSession serve `notes`, with the four fields the page asks
 * for - and only the *drawing* is put in front of a stubbed answer. A page that
 * renders beautifully against a field the server stopped serving still fails
 * here, which is the failure a stub usually hides.
 *
 * Makes nothing and removes nothing.
 * ---------------------------------------------------------------------------
 */
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1400, height: 1000 } });

/* -------------------------------------------------- the server's contract - */

const served = await graphql(
  `query { __type(name: "LlmSession") { fields { name type { ofType { name } } } } }`,
  {},
).catch(() => null);

const field = served?.__type?.fields?.find((one) => one.name === 'notes') ?? null;
record(field !== null, 'the server serves an opened session its notes');

const note = await graphql(`query { __type(name: "LlmSessionNote") { fields { name } } }`, {}).catch(() => null);
const carried = (note?.__type?.fields ?? []).map((one) => one.name);
console.log(`note fields: ${JSON.stringify(carried)}`);
record(
  ['id', 'note', 'writtenBy', 'writtenAt'].every((one) => carried.includes(one)),
  'and each note says what was written, by which agent, and when',
);

/* ------------------------------------------------------------ the drawing - */

const SESSION = '424242';

/*
 * A conversation with two notes in it, between what was said. Since #409 a note
 * is a NOTE line of the log, where it was written, rather than a block lifted out
 * above the transcript: a reader following a conversation wants the note at the
 * point the agent chose to keep it.
 */
const line = (id, kind, actor, content, at) => ({
  id, kind, actor, content, result: null, millis: null, at, agentDetails: null,
});
const LOG = [
  line('1', 'USER', 'alice', 'Run the steps and tell me which one fails.', '2026-09-23T08:59:00Z'),
  line('2', 'NOTE', 'zzNotes first', 'Steps 1-6 are done.', '2026-09-23T09:00:00Z'),
  line('3', 'AGENT', 'zzNotes first', 'Still working on it.', '2026-09-23T09:02:00Z'),
  line('4', 'NOTE', 'zzNotes second', 'The failing one is the third.', '2026-09-23T09:05:00Z'),
];

let held = LOG;

await page.route('**/graphql', async (route) => {
  const body = route.request().postData() ?? '';
  if (body.includes('llmSessionEvents(')) {
    const asked = JSON.parse(body).variables?.kinds ?? null;
    const content = held.filter((one) => asked === null || asked.includes(one.kind));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { llmSessionEvents: { totalElements: content.length, content } } }),
    });
    return;
  }
  if (!body.includes('llmSession(')) {
    await route.continue();
    return;
  }
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      data: {
        llmSession: {
          id: SESSION,
          workspaceId: WORKSPACE,
          key: 'zzNotes371',
          keyPrefix: 'zzNotes',
          eventCount: held.length,
          createdAt: '2026-09-23T08:00:00Z',
          lastEventAt: held.at(-1)?.at ?? null,
          notes: [],
        },
      },
    }),
  });
});

const openIt = async () => {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/sessions/${SESSION}`, { waitUntil: 'domcontentloaded' });
  return drawn(page, 'the session');
};

record(await openIt(), 'a session opens');

const notes = page.locator('article[class*="_kindNote_"]');
const there = await notes
  .first()
  .waitFor({ timeout: 20_000 })
  .then(() => true)
  .catch(() => false);
record(there, 'what the agent wrote down is on the page, as lines of the log');
if (!there) await finish(browser);

const drawnNotes = await notes.allInnerTexts();
console.log(`drawn: ${JSON.stringify(drawnNotes)}`);
record(drawnNotes.length === 2, `each one is drawn (${drawnNotes.length})`);
record(
  drawnNotes[0].includes('Steps 1-6 are done.') && drawnNotes[1].includes('The failing one is the third.'),
  'oldest first, which is the order it wrote them in',
);
record(
  drawnNotes[0].includes('zzNotes first') && drawnNotes[1].includes('zzNotes second'),
  'and each says which agent wrote it',
);

/* Where it was written: between the lines either side of it, not above them all. */
const texts = await page.locator('article[class*="_event_"]').allInnerTexts();
const at = (words) => texts.findIndex((one) => one.includes(words));
record(
  at('Run the steps') < at('Steps 1-6 are done.') &&
    at('Steps 1-6 are done.') < at('Still working on it.') &&
    at('Still working on it.') < at('The failing one is the third.'),
  `in time order with what was said around it (${[at('Run the steps'), at('Steps 1-6'), at('Still working'), at('The failing')].join(', ')})`,
);

/* No block above the transcript any more, with notes or without. */
record(
  (await page.locator('[class*="_notesList_"]').count()) === 0,
  'and no block of notes stands above the transcript',
);

await finish(browser);
