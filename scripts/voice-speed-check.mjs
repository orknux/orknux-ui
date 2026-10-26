/**
 * How fast voice mode reads its answers, chosen in the panel. Issue #673.
 *
 * The speed is the player's: a reader asked for any speed but its own can
 * answer silence, so a speed picked in the panel's header is the rate the
 * next answer read aloud is played at, the reader is asked for none, and the
 * choice is still picked after a reload. A fake
 * microphone says something, the transcriber and the chat are stubbed, and
 * the speech request is caught on its way out rather than played.
 *
 * Before, the speed went to the reader and the clip played at 1.
 * The models, the chat, the turn-taking and the stored speed are put back.
 */
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BASE, WORKSPACE, open, record, drawn, finish, shot } from './suite/harness.mjs';

const PREFIX = 'zzVoiceSpeed';
const CHOSEN = '1.5';

/* ------------------------------------------------- a microphone to speak at */

const RATE = 48_000;
const VOICE_AT = 5.0;
const VOICE_FOR = 3.0;
const SYLLABLE = 0.17;
const BETWEEN = 0.11;
const LENGTH = 14;

/** Silence, then three seconds of voiced syllables, then silence - see voice-talk-over-check. */
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

const MICROPHONE = fakeMicrophone(join(tmpdir(), 'orknux-voice-speed.wav'));

const { browser, context, page, graphql } = await open({
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
});

/* ------------------------------------------------------------- the stubs */

await context.addInitScript(() => {
  const levels = [];
  window.__mute = { sent: [], transcribed: 0, levels, micAt: null, spoken: [] };

  const asked = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
  if (asked !== undefined) {
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await asked(constraints);
      window.__mute.micAt ??= Date.now();
      return stream;
    };
  }

  // What the circle says it heard.
  window.setInterval(() => {
    const orb = document.querySelector('aside[aria-label="Voice mode"] [style*="--level"]');
    if (orb === null) return;
    const level = Number(orb.style.getPropertyValue('--level'));
    if (level > 0) levels.push({ at: Date.now(), level });
  }, 25);

  // The rate each clip is played at: the speed is the player's now, not the reader's.
  window.__mute.rates = [];
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    window.__mute.rates.push(this.playbackRate);
    window.__mute.playing = this;
    return play.call(this);
  };
  // Two seconds of real silence, so a clip is still playing when the speed is changed under it.
  const silence = (() => {
    const rate = 8000;
    const samples = rate * 2;
    const bytes = new DataView(new ArrayBuffer(44 + samples * 2));
    const text = (at, words) => [...words].forEach((one, index) => bytes.setUint8(at + index, one.charCodeAt(0)));
    text(0, 'RIFF'); bytes.setUint32(4, 36 + samples * 2, true); text(8, 'WAVE'); text(12, 'fmt ');
    bytes.setUint32(16, 16, true); bytes.setUint16(20, 1, true); bytes.setUint16(22, 1, true);
    bytes.setUint32(24, rate, true); bytes.setUint32(28, rate * 2, true); bytes.setUint16(32, 2, true); bytes.setUint16(34, 16, true);
    text(36, 'data'); bytes.setUint32(40, samples * 2, true);
    return bytes.buffer;
  })();

  const real = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const address = typeof input === 'string' ? input : input.url;
    if (/\/api\/workspaces\/[^/]+\/transcription/.test(address)) {
      window.__mute.transcribed += 1;
      return new Response(JSON.stringify({ text: 'something said to the room' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (/\/api\/workspaces\/[^/]+\/speech/.test(address)) {
      window.__mute.spoken.push(JSON.parse(String(init?.body ?? '{}')));
      return new Response(silence, { status: 200, headers: { 'content-type': 'audio/wav' } });
    }
    if (/\/api\/chats\/[^/]+\/stream/.test(address)) {
      window.__mute.sent.push(JSON.parse(String(init?.body ?? '{}')).text ?? '');
      const encode = new TextEncoder();
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(encode.encode(`event: chunk\ndata: ${JSON.stringify({ text: 'Heard you.' })}\n\n`));
          controller.enqueue(encode.encode('event: done\ndata: {"millis":10}\n\n'));
          controller.close();
        },
      });
      return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    }
    return real(input, init);
  };
});

/* ----------------------------------------------------------- the fixture */

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

const TURN_TAKING = `mutation($w: ID!, $pause: Int, $over: Int, $unattended: Int, $barge: Int) {
  setWorkspaceVoiceTurnTaking(workspaceId: $w, pauseEndsTurnMs: $pause, speechOverRoomPercent: $over,
    unattendedMicrophoneMs: $unattended, bargeInMs: $barge) { id }
}`;
const { workspace: found } = await graphql(
  `query($id: ID!) { workspace(id: $id) {
    voicePauseEndsTurnMs voiceSpeechOverRoomPercent voiceUnattendedMicrophoneMs voiceBargeInMs } }`,
  { id: WORKSPACE },
);

async function clean() {
  await page.evaluate(() => window.localStorage.removeItem('orknux.speech.speed')).catch(() => undefined);
  await sweep().catch(() => undefined);
  await graphql(TURN_TAKING, {
    w: WORKSPACE,
    pause: found.voicePauseEndsTurnMs,
    over: found.voiceSpeechOverRoomPercent,
    unattended: found.voiceUnattendedMicrophoneMs,
    barge: found.voiceBargeInMs,
  }).catch(() => undefined);
  await finish(browser);
}

await sweep();
// Voice mode's own numbers, so the timeline above means what it says.
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
await graphql(`mutation($w: ID!, $m: ID) { setWorkspaceTranscriptionModel(workspaceId: $w, modelId: $m) { id } }`, {
  w: WORKSPACE,
  m: ears.id,
});
await graphql(`mutation($w: ID!, $m: ID) { setWorkspaceSpeechModel(workspaceId: $w, modelId: $m) { id } }`, {
  w: WORKSPACE,
  m: mouth.id,
});
const started = await graphql(`mutation($input: StartChatInput!) { startChat(input: $input) { id title } }`, {
  input: { workspaceId: WORKSPACE, title: `${PREFIX} ${Date.now()}` },
});
const CHAT = started.startChat.id;

/* -------------------------------------------------- choosing a speed */

await page.goto(`${BASE}/chat/${CHAT}`, { waitUntil: 'domcontentloaded' });
const voice =
  (await drawn(page, 'the chat')) &&
  (await page
    .waitForSelector('button[aria-label="Enter voice mode"]', { timeout: 25_000 })
    .then(() => true)
    .catch(() => false));
record(voice, 'voice mode is offered on a chat whose workspace can hear and speak');
if (!voice) await clean();

await page.click('button[aria-label="Enter voice mode"]');
const picker = page.locator('aside[aria-label="Voice mode"] [data-voice-speed]');
const offered = await picker.waitFor({ timeout: 10_000 }).then(() => true).catch(() => false);
record(offered, 'the voice panel offers a reading speed');
if (!offered) await clean();

const first = await picker.inputValue();
record(first === '', `which is the default until somebody chooses (${JSON.stringify(first)})`);
await picker.selectOption(CHOSEN);
const box = await picker.boundingBox();
record(box !== null && box.width > 30 && box.height > 15, `drawn in the panel's header (${JSON.stringify(box)})`);
await page.screenshot({ path: shot('voice-speed.png') });

/* ---- the voice says something, the answer is read, at the speed picked ---- */

const stop = Date.now() + 30_000;
let spoken = [];
while (Date.now() < stop) {
  spoken = await page.evaluate(() => window.__mute.spoken).catch(() => []);
  if (spoken.length > 0) break;
  await page.waitForTimeout(100);
}
record(spoken.length > 0, `the answer was read aloud (${spoken.length} requests)`);
// Played at the speed picked, and the reader asked for no speed: a reader asked for one may answer silence.
const rates = await page.evaluate(() => window.__mute.rates).catch(() => []);
record(rates.length > 0 && rates.every((one) => one === Number(CHOSEN)), `played at the speed picked (${JSON.stringify(rates)})`);
record(spoken.length > 0 && spoken.every((one) => one.speed === undefined), `and the reader is asked for none (${JSON.stringify(spoken.map((one) => one.speed))})`);

/* ---- a speed picked while a clip plays is heard at once, not from the next clip ---- */

await picker.selectOption('2').catch(() => undefined);
await page.waitForTimeout(200);
const live = await page.evaluate(() => {
  const clip = window.__mute.playing;
  return clip ? { rate: clip.playbackRate, ended: clip.ended } : null;
});
record(live !== null && live.rate === 2, `the clip playing follows a new speed at once (${JSON.stringify(live)})`);
await picker.selectOption(CHOSEN).catch(() => undefined);

/* ---- and it is still picked after a reload ---- */

await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('button[aria-label="Enter voice mode"]', { timeout: 25_000 });
await page.click('button[aria-label="Enter voice mode"]');
const kept = await picker.waitFor({ timeout: 10_000 }).then(() => picker.inputValue()).catch(() => null);
record(kept === CHOSEN, `the speed is kept in this browser (${JSON.stringify(kept)})`);

await clean();
