/**
 * How much of an answer has been read aloud, shown while it is read.
 *
 * A speech API answers audio and says nothing about progress, so the page works
 * it out: the characters of the pieces already played, plus the playing clip's
 * share of its own by how far into it the audio is. The chat draws it beside
 * the speaker as a short bar and a percentage; voice mode draws the same under
 * its caption, from the same reader.
 *
 * The chat's stream and the speech endpoint are stubbed - the answer is the
 * spoken-answer check's, cut into several pieces, each read as 1.2 seconds of
 * silence - and the bar is sampled while it plays: it is there while reading,
 * it climbs, it reaches the end, and it is gone afterwards.
 */
import { BASE, WORKSPACE, open, record, drawn, finish, shot } from './suite/harness.mjs';

const PREFIX = 'zzReadProgress';

/** How long the stubbed speech model takes over one piece. */
const SYNTH_MS = 700;

/**
 * An answer with one of everything a model writes.
 *
 * Long enough to be cut into several pieces, because a single-piece answer
 * would pass the timing assertions by having nothing to be late for.
 */
const ANSWER = [
  '## What changed',
  '',
  'The **cache** is warmed by a `startup` hook now, and the [release notes](https://example.com/notes) explain the reason for it.',
  '',
  '```kotlin',
  'val warmed = mapOf("cache" to true)',
  'println(warmed)',
  '```',
  '',
  '| Setting | Value |',
  '| ------- | ----- |',
  '| Timeout | Thirty seconds |',
  '',
  '- The first item, which is long enough to be worth saying on its own.',
  '- The second item, which is also long enough to stand as a sentence.',
  '',
  'The warming runs once, on the first request after a restart, and takes a little',
  'under a second on the machines we have measured it on. Nothing waits for it.',
  '',
  'If it fails there is a line in the log saying so, and the request it was warming',
  'for is served from the database instead, which is what used to happen every time.',
  '',
  'That is *everything* worth knowing, and it took about a minute to work out.',
].join('\n');

const { browser, context, page, graphql } = await open({
  launch: { args: ['--autoplay-policy=no-user-gesture-required'] },
  viewport: { width: 1440, height: 1000 },
});

/* ------------------------------------------------------------- the stubs */

await context.addInitScript(
  ({ answer, synthMs }) => {
    /** Every piece the page asked to have read, with when it asked. */
    const asked = [];
    let inFlight = 0;
    let mostInFlight = 0;
    window.__spoken = { asked, most: () => mostInFlight, playedAt: () => window.__playedAt ?? null };

    /* When sound actually started, taken from the element rather than the page. */
    const play = window.HTMLMediaElement.prototype.play;
    window.HTMLMediaElement.prototype.play = function patched() {
      this.addEventListener(
        'playing',
        () => {
          window.__playedAt ??= Date.now();
        },
        { once: true },
      );
      return play.call(this);
    };

    /** Four hundred milliseconds of silence, which is a clip a browser will play. */
    function clip() {
      const rate = 22_050;
      const frames = Math.round(rate * 1.2);
      const bytes = new ArrayBuffer(44 + frames * 2);
      const view = new DataView(bytes);
      const write = (at, text) => [...text].forEach((one, by) => view.setUint8(at + by, one.charCodeAt(0)));
      write(0, 'RIFF');
      view.setUint32(4, 36 + frames * 2, true);
      write(8, 'WAVEfmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, rate, true);
      view.setUint32(28, rate * 2, true);
      view.setUint16(32, 2, true);
      view.setUint16(34, 16, true);
      write(36, 'data');
      view.setUint32(40, frames * 2, true);
      return bytes;
    }

    const real = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const address = typeof input === 'string' ? input : input.url;

      if (/\/api\/chats\/[^/]+\/stream/.test(address)) {
        const encode = new TextEncoder();
        const body = new ReadableStream({
          start(controller) {
            // In pieces, as a model writes it: what the reader does with a
            // half-written answer is half of what is being tested.
            const parts = answer.match(/[\s\S]{1,60}/g) ?? [];
            parts.forEach((part, at) => {
              window.setTimeout(() => {
                controller.enqueue(encode.encode(`event: chunk\ndata: ${JSON.stringify({ text: part })}\n\n`));
              }, 60 * at);
            });
            window.setTimeout(() => {
              controller.enqueue(encode.encode('event: done\ndata: {"millis":1000}\n\n'));
              controller.close();
            }, 60 * parts.length + 60);
          },
        });
        return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
      }

      if (/\/api\/workspaces\/[^/]+\/speech/.test(address)) {
        const said = JSON.parse(String(init?.body ?? '{}'));
        const piece = { text: said.text ?? '', at: Date.now(), made: null };
        asked.push(piece);
        inFlight += 1;
        mostInFlight = Math.max(mostInFlight, inFlight);
        await new Promise((ready) => window.setTimeout(ready, synthMs));
        inFlight -= 1;
        piece.made = Date.now();
        return new Response(clip(), { status: 200, headers: { 'content-type': 'audio/wav' } });
      }

      return real(input, init);
    };
  },
  { answer: ANSWER, synthMs: SYNTH_MS },
);

/* ----------------------------------------------------------- the fixture */

async function sweep() {
  const { models } = await graphql(`query($w: ID!) { models(workspaceId: $w) { id name } }`, {
    w: WORKSPACE,
  });
  const { workspace } = await graphql(`query($id: ID!) { workspace(id: $id) { speechModelId } }`, {
    id: WORKSPACE,
  });
  const mine = models.filter((one) => one.name.startsWith(PREFIX));
  if (mine.some((one) => one.id === workspace.speechModelId)) {
    await graphql(`mutation($w: ID!) { setWorkspaceSpeechModel(workspaceId: $w, modelId: null) { id } }`, {
      w: WORKSPACE,
    }).catch(() => undefined);
  }
  for (const old of mine) {
    await graphql(`mutation($id: ID!) { removeModel(id: $id) }`, { id: old.id }).catch(() => undefined);
    console.log(`swept model ${old.name} (#${old.id})`);
  }

  const { chatSessions } = await graphql(`query($w: ID!) { chatSessions(workspaceId: $w) { id title } }`, {
    w: WORKSPACE,
  });
  for (const old of chatSessions.filter((one) => (one.title ?? '').startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { deleteChat(id: $id) }`, { id: old.id }).catch(() => undefined);
    console.log(`swept chat ${old.title} (#${old.id})`);
  }
}

await sweep();

/*
 * A speech model, so the speaker is offered at all. It is never asked
 * anything - the stub above answers before the request leaves the page - but
 * the button is drawn on the workspace having one, and a check that turned it
 * on by reaching into the component would be testing the wrong screen.
 */
const { modelProviders } = await graphql(`query($w: ID!) { modelProviders(workspaceId: $w) { id name } }`, {
  w: WORKSPACE,
});
const provider = modelProviders[0];
if (provider === undefined) {
  record(false, 'this workspace has no model provider, so no speech model can be made');
  await finish(browser);
}

const made = await graphql(`mutation($input: CreateModelInput!) { createModel(input: $input) { id name } }`, {
  input: {
    providerId: provider.id,
    name: `${PREFIX} SPEECH`,
    modelId: `${PREFIX}-speech`,
    kind: 'SPEECH',
  },
});
console.log(`made model ${made.createModel.name} (#${made.createModel.id})`);
await graphql(`mutation($w: ID!, $m: ID) { setWorkspaceSpeechModel(workspaceId: $w, modelId: $m) { id } }`, {
  w: WORKSPACE,
  m: made.createModel.id,
});

const started = await graphql(`mutation($input: StartChatInput!) { startChat(input: $input) { id title } }`, {
  input: { workspaceId: WORKSPACE, title: `${PREFIX} ${Date.now()}` },
});
const CHAT = started.startChat.id;
console.log(`made chat ${started.startChat.title} (#${CHAT})`);

/* -------------------------------------------------------------- the drive */

await page.goto(`${BASE}/chat/${CHAT}`, { waitUntil: 'domcontentloaded' });
const drew = (await drawn(page, 'the chat')) &&
  (await page.waitForSelector('#chat-composer', { timeout: 25_000 }).then(() => true).catch(() => false));
record(drew, 'the chat opened with a composer to type in');
if (!drew) {
  await sweep();
  await finish(browser);
}

await page.fill('#chat-composer', 'Say something long');
await page.click('button[type="submit"]');
const spoke = await page
  .waitForFunction(
    () => document.body.innerText.includes('to work out.') && document.querySelector('button[aria-label="Read this answer aloud"]') !== null,
    { timeout: 30_000 },
  )
  .then(() => true)
  .catch(() => false);
record(spoke, 'the answer arrived in full, with a speaker under it');

await page.click('button[aria-label="Read this answer aloud"]');
await page.waitForSelector('button[aria-label="Stop reading"]', { timeout: 30_000 }).catch(() => undefined);

/* Sampled while it reads, until the speaker offers to read again. */
const samples = [];
const stop = Date.now() + 90_000;
let shotTaken = false;
for (;;) {
  const now = await page.evaluate(() => {
    const bar = document.querySelector('[data-read-progress]');
    const fill = bar?.querySelector('[style*="width"]');
    return {
      reading: document.querySelector('button[aria-label="Stop reading"]') !== null,
      value: bar === null ? null : Number(bar.getAttribute('aria-valuenow')),
      text: bar?.textContent?.trim() ?? null,
      fill: fill === null || fill === undefined ? null : fill.style.width,
    };
  });
  samples.push(now);
  if (!shotTaken && now.value !== null && now.value > 20) {
    await page.screenshot({ path: shot('read-progress.png') });
    shotTaken = true;
  }
  if (!now.reading || Date.now() > stop) break;
  await page.waitForTimeout(150);
}

const values = samples.filter((one) => one.value !== null).map((one) => one.value);
console.log(`read progress: ${JSON.stringify(values)}`);
record(values.length > 0, 'while the answer is read, the speaker has a progress bar beside it');
record(new Set(values).size >= 4, `and it moves as the audio plays, not only between pieces (${new Set(values).size} values)`);
record(values.every((one, at) => at === 0 || one >= values[at - 1]), 'never going back, the answer being whole before reading began');
record(Math.max(...values, 0) >= 95, `it reaches the end (${Math.max(...values, 0)}%)`);
const shown = samples.find((one) => one.value !== null && one.value > 0);
record(
  shown !== undefined && shown.text === `${shown.value}%` && shown.fill === `${shown.value}%`,
  `the percentage is written beside a bar filled to it (${JSON.stringify(shown ?? null)})`,
);
await page.waitForTimeout(500);
const after = await page.evaluate(() => document.querySelector('[data-read-progress]') === null);
record(after, 'and it is gone once the reading is over');

await sweep();
await finish(browser);
