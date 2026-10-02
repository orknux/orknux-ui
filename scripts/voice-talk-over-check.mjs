/**
 * Talking over an answer stops it - with a microphone that is really talking.
 *
 * Issue #342, the second time. The first build measured only the setting,
 * because a headless browser has no voice and no speaker, and it shipped a
 * detector that never fired for anybody: it wanted half a second of talking
 * with not one twenty-millisecond frame under the bar, and speech dips under
 * any bar between syllables several times a second. Nothing that only reads the
 * setting could have seen that, so this gives the panel a voice.
 *
 * The microphone is a file Chromium is told to believe, written here rather
 * than committed, and it says three things in order while an answer is being
 * read aloud:
 *
 *   a cough     a quarter of a second of noise and then quiet, which must not
 *               stop the answer - it is the short noise the hold is there to
 *               keep out
 *   a voice     four seconds of syllables, each a fraction of a second long
 *               with a gap after it the way words have, which must stop the
 *               answer within a second or so of starting - before the fix it
 *               never did, because no single syllable is half a second long
 *   and then    quiet, which ends that utterance, and what was said over the
 *               answer is sent as the next turn
 *
 * The speaker is the part still missing: the answer is a silent clip, so the
 * echo cancellation has nothing of its own to cancel and nothing of the panel's
 * own voice reaches the microphone. Whether a real room's echo stops the answer
 * on nothing is the question this cannot answer, and the reason zero is a
 * setting.
 *
 * The ears, the mouth and the model are stubbed, as in voice-queue-check, so
 * that every time here is a known one. Leaves the workspace's turn-taking as it
 * found it, and removes the models and the chat it makes.
 */
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BASE, WORKSPACE, open, record, drawn, finish, shot } from './suite/harness.mjs';

const PREFIX = 'zzVoiceTalkOver';

/** What the stubbed transcriber hears in whatever it is handed. */
const OBJECTION = 'No, not that, something else';

/* ------------------------------------------------- a microphone to speak at */

const RATE = 48_000;
/** Seconds from the microphone opening. The answer is playing well before the first. */
const COUGH_AT = 6.0;
const COUGH_FOR = 0.25;
const VOICE_AT = 8.0;
const VOICE_FOR = 4.0;
/** One syllable, and the gap after it - shorter than the hold, as every syllable is. */
const SYLLABLE = 0.17;
const BETWEEN = 0.11;
const LENGTH = 20;

function fakeMicrophone(path) {
  const frames = RATE * LENGTH;
  const body = Buffer.alloc(frames * 2);
  // A fixed seed: the noise is noise, but the same noise every run.
  let seed = 342;
  const random = () => {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
    return seed / 2_147_483_648;
  };

  for (let at = 0; at < frames; at += 1) {
    const time = at / RATE;
    let value = 0;
    if (time >= COUGH_AT && time < COUGH_AT + COUGH_FOR) {
      // Broadband and loud, the way a cough or a door is.
      value = (random() * 2 - 1) * 0.5;
    } else if (time >= VOICE_AT && time < VOICE_AT + VOICE_FOR) {
      const into = (time - VOICE_AT) % (SYLLABLE + BETWEEN);
      if (into < SYLLABLE) {
        /*
         * A voiced syllable: a fundamental that drifts the way a speaking pitch
         * does, with the harmonics a voice has, under an envelope that rises and
         * falls. Periodic and moving, so the noise suppression on the way in has
         * no steady tone to learn and take away.
         */
        const pitch = 140 + 25 * Math.sin(2 * Math.PI * 0.7 * time);
        const envelope = Math.sin((Math.PI * into) / SYLLABLE);
        let wave = 0;
        for (let harmonic = 1; harmonic <= 8; harmonic += 1) {
          wave += Math.sin(2 * Math.PI * pitch * harmonic * time) / harmonic;
        }
        value = wave * envelope * 0.25;
      }
    }
    body.writeInt16LE(Math.max(-32_767, Math.min(32_767, Math.round(value * 32_767))), at * 2);
  }

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + body.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(body.length, 40);

  writeFileSync(path, Buffer.concat([header, body]));
  return path;
}

const MICROPHONE = fakeMicrophone(join(tmpdir(), 'orknux-voice-talk-over.wav'));

const LISTENS = {
  launch: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${MICROPHONE}%noloop`,
      '--autoplay-policy=no-user-gesture-required',
    ],
  },
  context: { permissions: ['microphone'] },
  viewport: { width: 1440, height: 1000 },
};

const { browser, context, page, graphql } = await open(LISTENS);

/* ------------------------------------------------------------- the stubs */

await context.addInitScript(
  ({ objection }) => {
    const sent = [];
    const levels = [];
    window.__talk = {
      sent,
      levels,
      micAt: null,
      opens: 0,
      playedAt: null,
      pausedAt: null,
      endedAt: null,
    };

    const asked = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
    if (asked !== undefined) {
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        const stream = await asked(constraints);
        window.__talk.opens += 1;
        window.__talk.micAt ??= Date.now();
        return stream;
      };
    }

    const play = window.HTMLMediaElement.prototype.play;
    window.HTMLMediaElement.prototype.play = function patched() {
      this.addEventListener('playing', () => (window.__talk.playedAt ??= Date.now()), { once: true });
      // Paused by the panel before the clip was over is the answer being stopped.
      this.addEventListener('pause', () => {
        if (!this.ended) window.__talk.pausedAt ??= Date.now();
      });
      this.addEventListener('ended', () => (window.__talk.endedAt ??= Date.now()), { once: true });
      return play.call(this);
    };

    /*
     * What the circle says it heard, often enough to catch a quarter-second
     * cough - which is how this knows the cough reached the panel at all, and
     * that the answer surviving it is the hold at work rather than deafness.
     */
    window.setInterval(() => {
      const orb = document.querySelector('aside[aria-label="Voice mode"] [style*="--level"]');
      if (orb === null) return;
      const level = Number(orb.style.getPropertyValue('--level'));
      if (level > 0) levels.push({ at: Date.now(), level });
    }, 25);

    /** Twenty-five seconds of silence: an answer long enough to talk over. */
    function clip() {
      const rate = 8_000;
      const frames = rate * 25;
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

      if (/\/api\/workspaces\/[^/]+\/transcription/.test(address)) {
        return new Response(JSON.stringify({ text: objection }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (/\/api\/chats\/[^/]+\/stream/.test(address)) {
        const said = JSON.parse(String(init?.body ?? '{}'));
        sent.push({ text: said.text ?? '', at: Date.now() });
        const encode = new TextEncoder();
        const body = new ReadableStream({
          start(controller) {
            window.setTimeout(() => {
              controller.enqueue(
                encode.encode(
                  `event: chunk\ndata: ${JSON.stringify({
                    text: 'Here is a long answer that somebody is about to decide they did not want.',
                  })}\n\n`,
                ),
              );
              controller.enqueue(encode.encode('event: done\ndata: {"millis":300}\n\n'));
              controller.close();
            }, 300);
          },
        });
        return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
      }

      if (/\/api\/workspaces\/[^/]+\/speech/.test(address)) {
        await new Promise((ready) => window.setTimeout(ready, 200));
        return new Response(clip(), { status: 200, headers: { 'content-type': 'audio/wav' } });
      }

      return real(input, init);
    };
  },
  { objection: OBJECTION },
);

/* ----------------------------------------------------------- the fixture */

async function sweep() {
  const { models } = await graphql(`query($w: ID!) { models(workspaceId: $w) { id name } }`, {
    w: WORKSPACE,
  });
  const { workspace } = await graphql(
    `query($id: ID!) { workspace(id: $id) { transcriptionModelId speechModelId } }`,
    { id: WORKSPACE },
  );
  const mine = models.filter((one) => one.name.startsWith(PREFIX));
  if (mine.some((one) => one.id === workspace.transcriptionModelId)) {
    await graphql(
      `mutation($w: ID!) { setWorkspaceTranscriptionModel(workspaceId: $w, modelId: null) { id } }`,
      { w: WORKSPACE },
    ).catch(() => undefined);
  }
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

const TURN_TAKING = `mutation($w: ID!, $pause: Int, $over: Int, $unattended: Int, $barge: Int) {
  setWorkspaceVoiceTurnTaking(workspaceId: $w, pauseEndsTurnMs: $pause, speechOverRoomPercent: $over,
    unattendedMicrophoneMs: $unattended, bargeInMs: $barge) { id }
}`;

const { workspace: found } = await graphql(
  `query($id: ID!) { workspace(id: $id) {
    voicePauseEndsTurnMs voiceSpeechOverRoomPercent voiceUnattendedMicrophoneMs voiceBargeInMs } }`,
  { id: WORKSPACE },
);
console.log(`workspace holds: ${JSON.stringify(found)}`);

const putBack = () =>
  graphql(TURN_TAKING, {
    w: WORKSPACE,
    pause: found.voicePauseEndsTurnMs,
    over: found.voiceSpeechOverRoomPercent,
    unattended: found.voiceUnattendedMicrophoneMs,
    barge: found.voiceBargeInMs,
  }).catch(() => undefined);

async function clean() {
  await sweep().catch(() => undefined);
  await putBack();
  await finish(browser);
}

await sweep();

// The interface's own numbers, stated: the timeline above is written against
// them, and a workspace that had moved them would be measuring something else.
await graphql(TURN_TAKING, { w: WORKSPACE, pause: null, over: null, unattended: null, barge: null });

const { modelProviders } = await graphql(`query($w: ID!) { modelProviders(workspaceId: $w) { id name } }`, {
  w: WORKSPACE,
});
const provider = modelProviders[0];
if (provider === undefined) {
  record(false, 'this workspace has no model provider, so voice mode cannot be offered at all');
  await clean();
}

async function makeModel(kind) {
  const made = await graphql(`mutation($input: CreateModelInput!) { createModel(input: $input) { id name } }`, {
    input: { providerId: provider.id, name: `${PREFIX} ${kind}`, modelId: `${PREFIX}-${kind.toLowerCase()}`, kind },
  });
  return made.createModel;
}

const ears = await makeModel('TRANSCRIPTION');
const mouth = await makeModel('SPEECH');
await graphql(
  `mutation($w: ID!, $m: ID) { setWorkspaceTranscriptionModel(workspaceId: $w, modelId: $m) { id } }`,
  { w: WORKSPACE, m: ears.id },
);
await graphql(`mutation($w: ID!, $m: ID) { setWorkspaceSpeechModel(workspaceId: $w, modelId: $m) { id } }`, {
  w: WORKSPACE,
  m: mouth.id,
});

const started = await graphql(`mutation($input: StartChatInput!) { startChat(input: $input) { id title } }`, {
  input: { workspaceId: WORKSPACE, title: `${PREFIX} ${Date.now()}` },
});
const CHAT = started.startChat.id;

/* --------------------------------------------------------------- reading it */

const READ = () =>
  page.evaluate(() => {
    const panel = document.querySelector('aside[aria-label="Voice mode"]');
    if (panel === null) return null;
    const caption =
      [...panel.querySelectorAll('p')]
        .map((one) => one.textContent.trim())
        .find((text) => ['Listening', 'Thinking', 'Speaking'].includes(text)) ?? null;
    const talk = window.__talk;
    return {
      at: Date.now(),
      // Seconds since the microphone opened, which is the clock the file runs on.
      mic: talk.micAt === null ? null : (Date.now() - talk.micAt) / 1000,
      caption,
      sent: talk.sent.map((one) => one.text),
      opens: talk.opens,
      playedAt: talk.playedAt,
      pausedAt: talk.pausedAt,
      endedAt: talk.endedAt,
      micAt: talk.micAt,
    };
  });

async function until(what, why, ms) {
  const stop = Date.now() + ms;
  let last = null;
  for (;;) {
    const now = await READ().catch(() => null);
    if (now !== null) last = now;
    if (now !== null && what(now)) return now;
    if (Date.now() > stop) {
      console.log(`gave up waiting for ${why}: ${JSON.stringify(last)}`);
      return null;
    }
    await page.waitForTimeout(50);
  }
}

/* -------------------------------------------------------------- the drive */

await page.goto(`${BASE}/chat/${CHAT}`, { waitUntil: 'domcontentloaded' });

const offered =
  (await drawn(page, 'the chat')) &&
  (await page
    .waitForSelector('button[aria-label="Enter voice mode"]', { timeout: 25_000 })
    .then(() => true)
    .catch(() => false));
record(offered, 'voice mode is offered on a chat whose workspace can hear and speak');
if (!offered) await clean();

await page.click('button[aria-label="Enter voice mode"]');
const listening = await until((now) => now.micAt !== null && now.caption === 'Listening', 'the microphone', 15_000);
record(listening !== null, 'the panel opened the microphone and is listening');
if (listening === null) await clean();

// The question is typed: the microphone's file has nothing to say until the
// answer to it is being read.
await page.fill('#chat-composer', 'Tell me something long');
await page.click('button[type="submit"]');

const speaking = await until((now) => now.caption === 'Speaking' && now.playedAt !== null, 'the answer', 15_000);
record(
  speaking !== null && speaking.mic < COUGH_AT - 0.5,
  `the answer is being read aloud before anything is said over it (${speaking?.mic ?? 'never'}s in)`,
);
if (speaking === null) await clean();

/* ---- the cough: heard, and ignored ---- */

const afterCough = await until((now) => now.mic >= VOICE_AT - 0.3, 'the quiet after the cough', 15_000);
const heardCough = await page.evaluate(
  ({ from, to }) => {
    const { micAt, levels } = window.__talk;
    return levels.some((one) => (one.at - micAt) / 1000 >= from && (one.at - micAt) / 1000 <= to);
  },
  { from: COUGH_AT - 0.2, to: COUGH_AT + COUGH_FOR + 0.4 },
);
record(heardCough, 'the cough reached the panel - the circle moved for it');
record(
  afterCough !== null && afterCough.caption === 'Speaking' && afterCough.pausedAt === null,
  `and the answer went on through it, a short noise not being somebody talking (${afterCough?.caption})`,
);

/* ---- the voice: the answer stops ---- */

const stopped = await until((now) => now.caption === 'Listening', 'the answer to stop', 12_000);
const stoppedAt = stopped === null || stopped.pausedAt === null ? null : (stopped.pausedAt - stopped.micAt) / 1000;
console.log(`the answer stopped ${stoppedAt ?? 'never'}s in; the voice began at ${VOICE_AT}s`);
record(
  stoppedAt !== null && stoppedAt >= VOICE_AT && stoppedAt <= VOICE_AT + 2,
  `talking over the answer stopped it within two seconds of starting, syllables and gaps and all (${stoppedAt ?? 'never'})`,
);
record(
  stopped !== null && stopped.endedAt === null,
  'and it was stopped rather than finished - the clip had twenty seconds left in it',
);
// Counted from the answer starting rather than from one: a development build
// mounts the panel twice and asks for the microphone twice before anything.
record(
  stopped !== null && stopped.opens === speaking.opens,
  `on the microphone that was already open, so nothing said was lost to reopening it ` +
    `(${speaking.opens} opens when the answer began, ${stopped?.opens} when it stopped)`,
);
await page.screenshot({ path: shot('voice-talk-over.png') });

/* ---- and what was said is the next turn ---- */

const next = await until((now) => now.sent.length > 1, 'what was said over it to be sent', 15_000);
record(
  next !== null && next.sent[1] === OBJECTION,
  `what was said over the answer was sent as the next turn (${JSON.stringify(next?.sent[1] ?? null)})`,
);
// Sent at the end of the answer is what happened before: queued behind a
// reading nobody wanted, and heard only once it was over.
record(
  next !== null && next.endedAt === null && (next.at - next.micAt) / 1000 < 18,
  `and sent straight away rather than after the answer it was said over (${next === null ? 'never' : `${(next.at - next.micAt) / 1000}s in`})`,
);

await clean();
