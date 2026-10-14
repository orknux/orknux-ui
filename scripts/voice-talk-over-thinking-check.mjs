/**
 * Talking while the model is still thinking stops it, unless the workspace
 * turned that off.
 *
 * Talking over the answer already stopped it (voice-talk-over-check), but only
 * once sound was coming out: somebody who changed their mind while the model
 * was still working had to sit through an answer to the old question first,
 * and their new one waited behind it. Now the same hold that stops an answer
 * stops the thinking, the request is abandoned, and what was said is the next
 * turn. It is a workspace setting, on by default, beside the hold itself.
 *
 *   on      a voice three seconds into a twenty-second think stops it within
 *           the hold, the request is aborted, and the words go next
 *   off     the same voice leaves the model thinking, and the words wait for
 *           the turn after
 *   the box the Voice card draws the setting ticked when nothing is decided,
 *           and unticked once the workspace turns it off
 *
 * Two browsers, one per half, so each microphone file starts from nought. The
 * models, the chats and the turn-taking are put back afterwards.
 */
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BASE, WORKSPACE, open, record, drawn, finish, shot } from './suite/harness.mjs';

const PREFIX = 'zzVoiceThinking';
const CHANGED = 'Actually, make it shorter';

/* ------------------------------------------------- a microphone to speak at */

const RATE = 48_000;
const VOICE_AT = 4.0;
const VOICE_FOR = 3.0;
const SYLLABLE = 0.17;
const BETWEEN = 0.11;
const LENGTH = 16;

/** Silence, then three seconds of voiced syllables - see voice-talk-over-check. */
function fakeMicrophone(path) {
  const frames = RATE * LENGTH;
  const body = Buffer.alloc(frames * 2);
  for (let at = 0; at < frames; at += 1) {
    const time = at / RATE;
    let value = 0;
    if (time >= VOICE_AT && time < VOICE_AT + VOICE_FOR) {
      const into = (time - VOICE_AT) % (SYLLABLE + BETWEEN);
      if (into < SYLLABLE) {
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

const MICROPHONE = fakeMicrophone(join(tmpdir(), 'orknux-voice-thinking.wav'));
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

/** The stubs: a first answer that thinks for twenty seconds unless abandoned, and a transcriber. */
function stubs({ changed }) {
  window.__think = { sent: [], abortedAt: null, micAt: null };
  const asked = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
  if (asked !== undefined) {
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await asked(constraints);
      window.__think.micAt ??= Date.now();
      return stream;
    };
  }
  const real = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const address = typeof input === 'string' ? input : input.url;
    if (/\/api\/workspaces\/[^/]+\/transcription/.test(address)) {
      return new Response(JSON.stringify({ text: changed }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (/\/api\/chats\/[^/]+\/stream/.test(address)) {
      const first = window.__think.sent.length === 0;
      window.__think.sent.push(JSON.parse(String(init?.body ?? '{}')).text ?? '');
      const encode = new TextEncoder();
      const body = new ReadableStream({
        start(controller) {
          const done = window.setTimeout(
            () => {
              controller.enqueue(encode.encode(`event: chunk\ndata: ${JSON.stringify({ text: 'Here is the answer.' })}\n\n`));
              controller.enqueue(encode.encode('event: done\ndata: {"millis":10}\n\n'));
              controller.close();
            },
            first ? 20_000 : 300,
          );
          init?.signal?.addEventListener('abort', () => {
            window.clearTimeout(done);
            if (first) window.__think.abortedAt ??= Date.now();
            controller.error(new DOMException('aborted', 'AbortError'));
          });
        },
      });
      return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    }
    if (/\/api\/workspaces\/[^/]+\/speech/.test(address)) {
      return new Response(new ArrayBuffer(0), { status: 200, headers: { 'content-type': 'audio/wav' } });
    }
    return real(input, init);
  };
}

/* ----------------------------------------------------------- the fixture */

let { browser, context, page, graphql } = await open(LISTENS);

async function sweep() {
  const { models } = await graphql(`query($w: ID!) { models(workspaceId: $w) { id name } }`, { w: WORKSPACE });
  const { workspace } = await graphql(
    `query($id: ID!) { workspace(id: $id) { transcriptionModelId speechModelId } }`,
    { id: WORKSPACE },
  );
  const mine = models.filter((one) => one.name.startsWith(PREFIX));
  if (mine.some((one) => one.id === workspace.transcriptionModelId)) {
    await graphql(`mutation($w: ID!) { setWorkspaceTranscriptionModel(workspaceId: $w, modelId: null) { id } }`, {
      w: WORKSPACE,
    }).catch(() => undefined);
  }
  if (mine.some((one) => one.id === workspace.speechModelId)) {
    await graphql(`mutation($w: ID!) { setWorkspaceSpeechModel(workspaceId: $w, modelId: null) { id } }`, {
      w: WORKSPACE,
    }).catch(() => undefined);
  }
  for (const old of mine) {
    await graphql(`mutation($id: ID!) { removeModel(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
  const { chatSessions } = await graphql(`query($w: ID!) { chatSessions(workspaceId: $w) { id title } }`, {
    w: WORKSPACE,
  });
  for (const old of chatSessions.filter((one) => (one.title ?? '').startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { deleteChat(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
}

const TURN_TAKING = `mutation($w: ID!, $pause: Int, $over: Int, $unattended: Int, $barge: Int, $thinking: Boolean) {
  setWorkspaceVoiceTurnTaking(workspaceId: $w, pauseEndsTurnMs: $pause, speechOverRoomPercent: $over,
    unattendedMicrophoneMs: $unattended, bargeInMs: $barge, bargeInWhileThinking: $thinking) { id }
}`;
const { workspace: found } = await graphql(
  `query($id: ID!) { workspace(id: $id) {
    voicePauseEndsTurnMs voiceSpeechOverRoomPercent voiceUnattendedMicrophoneMs voiceBargeInMs voiceBargeInWhileThinking } }`,
  { id: WORKSPACE },
);
const decide = (thinking) =>
  graphql(TURN_TAKING, { w: WORKSPACE, pause: null, over: null, unattended: null, barge: null, thinking });

async function clean() {
  await sweep().catch(() => undefined);
  await graphql(TURN_TAKING, {
    w: WORKSPACE,
    pause: found.voicePauseEndsTurnMs,
    over: found.voiceSpeechOverRoomPercent,
    unattended: found.voiceUnattendedMicrophoneMs,
    barge: found.voiceBargeInMs,
    thinking: found.voiceBargeInWhileThinking,
  }).catch(() => undefined);
  await finish(browser);
}

await sweep();
await decide(null);

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
await graphql(`mutation($w: ID!, $m: ID) { setWorkspaceTranscriptionModel(workspaceId: $w, modelId: $m) { id } }`, {
  w: WORKSPACE,
  m: ears.id,
});
await graphql(`mutation($w: ID!, $m: ID) { setWorkspaceSpeechModel(workspaceId: $w, modelId: $m) { id } }`, {
  w: WORKSPACE,
  m: mouth.id,
});

/* ------------------------------------------------------------ the box */

const box = async () => {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/settings`, { waitUntil: 'domcontentloaded' });
  const there = page.locator('#voice-barge-in-thinking');
  if (!(await there.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false))) return null;
  await page.waitForTimeout(500);
  return there.isChecked();
};
const ticked = await box();
record(ticked === true, `the Voice card offers it, ticked while the workspace has decided nothing (${ticked})`);

/* ------------------------------------------------------------ one half */

/** Opens voice mode on a fresh chat, asks a question typed, and lets the microphone speak into the thinking. */
async function drive(label) {
  await context.addInitScript(stubs, { changed: CHANGED });
  const started = await graphql(`mutation($input: StartChatInput!) { startChat(input: $input) { id } }`, {
    input: { workspaceId: WORKSPACE, title: `${PREFIX} ${label} ${Date.now()}` },
  });
  await page.goto(`${BASE}/chat/${started.startChat.id}`, { waitUntil: 'domcontentloaded' });
  const voice =
    (await drawn(page, 'the chat')) &&
    (await page.waitForSelector('button[aria-label="Enter voice mode"]', { timeout: 25_000 }).then(() => true).catch(() => false));
  if (!voice) return null;
  await page.click('button[aria-label="Enter voice mode"]');
  await page.waitForFunction(() => window.__think?.micAt !== null, null, { timeout: 15_000 }).catch(() => undefined);
  await page.fill('#chat-composer', 'Tell me everything about the plan');
  await page.click('button[type="submit"]');

  const read = () =>
    page.evaluate(() => {
      const panel = document.querySelector('aside[aria-label="Voice mode"]');
      const captions = [...(panel?.querySelectorAll('p') ?? [])].map((one) => one.textContent.trim());
      const state = window.__think;
      return {
        mic: state.micAt === null ? null : (Date.now() - state.micAt) / 1000,
        aborted: state.abortedAt === null ? null : (state.abortedAt - state.micAt) / 1000,
        caption: captions.find((text) => ['Listening', 'Thinking', 'Speaking'].includes(text)) ?? null,
        waiting: panel?.querySelector('[data-voice-waiting]')?.textContent ?? null,
        sent: [...state.sent],
      };
    });
  const stop = Date.now() + 25_000;
  let last = await read();
  while (Date.now() < stop && (last.mic ?? 0) < VOICE_AT + VOICE_FOR + 4) {
    await page.waitForTimeout(100);
    last = await read();
  }
  console.log(`${label}: ${JSON.stringify(last)}`);
  return last;
}

/* ---- on, the default ---- */

const on = await drive('on');
record(on !== null, 'voice mode is offered on a chat whose workspace can hear and speak');
record(
  on !== null && on.aborted !== null && on.aborted >= VOICE_AT && on.aborted <= VOICE_AT + 2,
  `talking while it thinks abandons the request, within the hold (${on?.aborted ?? 'never'}s in; the voice began at ${VOICE_AT}s)`,
);
record(on !== null && on.sent.length === 2 && on.sent[1] === CHANGED, `and what was said is the next turn (${JSON.stringify(on?.sent ?? null)})`);
await page.screenshot({ path: shot('voice-talk-over-thinking.png') });
await browser.close();

/* ---- off ---- */

({ browser, context, page, graphql } = await open(LISTENS));
await decide(false);
const unticked = await box();
record(unticked === false, `turned off, the box is unticked (${unticked})`);

const off = await drive('off');
record(off !== null && off.aborted === null, `turned off, the same voice leaves the model thinking (${off?.aborted ?? 'not abandoned'})`);
record(
  off !== null && off.caption === 'Thinking' && (off.waiting ?? '').includes(CHANGED) && off.sent.length === 1,
  `and what was said waits for the turn after (${off?.caption}, ${JSON.stringify(off?.waiting ?? null)})`,
);

await clean();
