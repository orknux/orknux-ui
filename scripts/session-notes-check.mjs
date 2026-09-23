/**
 * What an agent wrote down for itself, on the session it wrote it in. Issue #371.
 *
 * The server half is pinned in NoteToSelfTest: what is kept, what is refused,
 * and that a turn with nowhere to put a note is not offered the tool. What is
 * measured here is the other end - that the field is served, and that a session
 * with notes draws them above the transcript rather than beside a heading with
 * nothing under it.
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

/** Oldest first, which is the order an agent wrote them in and reads them back in. */
const WROTE = [
  { id: '1', note: 'Steps 1-6 are done.', writtenBy: 'zzNotes first', writtenAt: '2026-09-23T09:00:00Z' },
  { id: '2', note: 'The failing one is the third.', writtenBy: 'zzNotes second', writtenAt: '2026-09-23T09:05:00Z' },
];

let held = WROTE;

await page.route('**/graphql', async (route) => {
  const body = route.request().postData() ?? '';
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
          eventCount: 0,
          createdAt: '2026-09-23T08:00:00Z',
          lastEventAt: null,
          notes: held,
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

const notes = page.locator('[class*="_notesList_"] li');
const there = await notes
  .first()
  .waitFor({ timeout: 20_000 })
  .then(() => true)
  .catch(() => false);
record(there, 'what the agent wrote down is on the page');
if (!there) await finish(browser);

const drawnNotes = await notes.allInnerTexts();
console.log(`drawn: ${JSON.stringify(drawnNotes)}`);
record(drawnNotes.length === WROTE.length, `each one is drawn (${drawnNotes.length})`);
record(
  drawnNotes[0].includes('Steps 1-6 are done.') && drawnNotes[1].includes('The failing one is the third.'),
  'oldest first, which is the order it wrote them in',
);

/* Which agent wrote it, since a conversation can be shared between several. */
record(
  drawnNotes[0].includes('zzNotes first') && drawnNotes[1].includes('zzNotes second'),
  'and each says which agent wrote it',
);

/*
 * Above the transcript rather than in it. A note is not part of what was said -
 * it is the part an agent chose to keep - and somebody reading a conversation to
 * work out what an agent was doing wants the four lines before the four hundred.
 */
const order = await page.evaluate(() => {
  const box = (css) => document.querySelector(css)?.getBoundingClientRect() ?? null;
  const notes = box('[class*="_notes_"]');
  const transcript = box('[class*="_transcript_"]');
  return notes === null || transcript === null ? null : { notes: notes.top, transcript: transcript.top };
});
console.log(`order: ${JSON.stringify(order)}`);
record(order !== null && order.notes < order.transcript, 'drawn above the transcript, not inside it');

/* ------------------------------------------- and a conversation with none - */

/*
 * No heading standing over nothing. Most sessions have no notes at all, and a
 * panel that says only that there is nothing in it is a panel every reader pays
 * for so that a handful of them can be told something they already know.
 */
held = [];
record(await openIt(), 'a session with nothing written down opens');
await page.waitForTimeout(1200);
record(
  await page.locator('[class*="_notesList_"]').count().then((many) => many === 0),
  'and carries no panel at all, rather than a heading over nothing',
);

await finish(browser);
