/**
 * In a voice conversation an agent plays a sound to the person, ahead of its
 * answer, and the sound stops the way the answer does.
 *
 * What `audio_play` sends is a `play` frame in the turn's stream, before the
 * answer arrives. The panel puts it in the queue it reads the answer from, so:
 *
 *   - the sound is fetched from the address the frame named, and played;
 *   - the panel says Speaking while it plays, since that is sound coming out;
 *   - the answer is read after it, not over it;
 *   - and on a second turn, stopping the turn stops the sound - the same act
 *     that ends an answer being read, which talking over it reaches too.
 *
 * The ears, the mouth and the model are stubbed as in voice-queue-check, and
 * the sound is a routed WAV clip, two seconds long, told apart from the speech
 * clips by its length. Whether the server sends the frame, and only to a voice
 * turn, is ChatAudioPlayTest's.
 */
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const PREFIX = 'zzVoicePlay';
const RATE = 48_000;

/** Somebody who says something, and a long while later says something again. */
function fakeMicrophone(path) {
  const SPEAKING_MS = 1_200;
  const QUIET_MS = 14_000;
  const frames = Math.round((RATE * (SPEAKING_MS + QUIET_MS) * 3) / 1000);
  const body = Buffer.alloc(frames * 2);
  const speaking = Math.round((RATE * SPEAKING_MS) / 1000);
  const round = Math.round((RATE * (SPEAKING_MS + QUIET_MS)) / 1000);
  for (let at = 0; at < frames; at += 1) {
    if (at % round >= speaking) continue;
    body.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * at) / RATE) * 16_000), at * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + body.length, 4);
  header.write('WAVEfmt ', 8);
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

/** A WAV of [seconds] of a quiet tone. */
function wav(seconds) {
  const rate = 22_050;
  const frames = Math.round(rate * seconds);
  const body = Buffer.alloc(frames * 2);
  for (let i = 0; i < frames; i += 1) body.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 330 * i) / rate) * 3000), i * 2);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + body.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(body.length, 40);
  return Buffer.concat([header, body]);
}

const MICROPHONE = fakeMicrophone(join(tmpdir(), 'orknux-voice-play.wav'));
const SOUND = wav(2);

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

await context.addInitScript((soundBytes) => {
  const played = [];
  window.__play = { played, sent: 0, soundFetched: 0 };

  // Every clip played, by how long it is: the sound is two seconds, a speech clip is not.
  const play = window.HTMLMediaElement.prototype.play;
  window.HTMLMediaElement.prototype.play = function patched() {
    const element = this;
    const note = () => played.push({ element, duration: element.duration, at: Date.now() });
    if (Number.isFinite(element.duration) && element.duration > 0) note();
    else element.addEventListener('loadedmetadata', note, { once: true });
    return play.call(this);
  };
  window.__play.sound = () => played.find((one) => one.duration > 1.5) ?? null;
  window.__play.soundPlaying = () => {
    const one = played.find((each) => each.duration > 1.5);
    return one !== undefined && !one.element.paused && !one.element.ended;
  };

  /** A short silent WAV, which is a speech clip a browser will play. */
  function clip() {
    const rate = 22_050;
    const frames = Math.round(rate * 0.4);
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
      return new Response(JSON.stringify({ text: 'Play me the tune' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (/\/api\/attachments\/913$/.test(address)) {
      window.__play.soundFetched += 1;
      return new Response(new Uint8Array(soundBytes), { status: 200, headers: { 'content-type': 'audio/wav' } });
    }
    if (/\/api\/chats\/[^/]+\/stream/.test(address)) {
      window.__play.sent += 1;
      const encode = new TextEncoder();
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encode.encode(`event: play\ndata: ${JSON.stringify({ url: '/api/attachments/913', filename: 'tune.mp3', contentType: 'audio/mpeg' })}\n\n`),
          );
          window.setTimeout(() => {
            controller.enqueue(encode.encode(`event: chunk\ndata: ${JSON.stringify({ text: 'That was the tune I wrote for you.' })}\n\n`));
            controller.enqueue(encode.encode('event: done\ndata: {"millis":1000}\n\n'));
            controller.close();
          }, 300);
        },
      });
      return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    }
    if (/\/api\/workspaces\/[^/]+\/speech/.test(address)) {
      return new Response(clip(), { status: 200, headers: { 'content-type': 'audio/wav' } });
    }
    return real(input, init);
  };
}, [...SOUND]);

/* ----------------------------------------------------------- the fixture */

async function sweep() {
  const { models } = await graphql(`query($w: ID!) { models(workspaceId: $w) { id name } }`, { w: WORKSPACE });
  const { workspace } = await graphql(`query($id: ID!) { workspace(id: $id) { transcriptionModelId speechModelId } }`, { id: WORKSPACE });
  const mine = models.filter((one) => one.name.startsWith(PREFIX));
  if (mine.some((one) => one.id === workspace.transcriptionModelId)) {
    await graphql(`mutation($w: ID!) { setWorkspaceTranscriptionModel(workspaceId: $w, modelId: null) { id } }`, { w: WORKSPACE }).catch(() => undefined);
  }
  if (mine.some((one) => one.id === workspace.speechModelId)) {
    await graphql(`mutation($w: ID!) { setWorkspaceSpeechModel(workspaceId: $w, modelId: null) { id } }`, { w: WORKSPACE }).catch(() => undefined);
  }
  for (const old of mine) await graphql(`mutation($id: ID!) { removeModel(id: $id) }`, { id: old.id }).catch(() => undefined);
  const { chatSessions } = await graphql(`query($w: ID!) { chatSessions(workspaceId: $w) { id title } }`, { w: WORKSPACE });
  for (const old of chatSessions.filter((one) => (one.title ?? '').startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { deleteChat(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
}

await sweep();
const { modelProviders } = await graphql(`query($w: ID!) { modelProviders(workspaceId: $w) { id name } }`, { w: WORKSPACE });
const provider = modelProviders[0];
if (provider === undefined) {
  record(false, 'this workspace has no model provider, so voice mode cannot be offered at all');
  await finish(browser);
}
const makeModel = async (kind) =>
  (await graphql(`mutation($input: CreateModelInput!) { createModel(input: $input) { id } }`, {
    input: { providerId: provider.id, name: `${PREFIX} ${kind}`, modelId: `${PREFIX}-${kind.toLowerCase()}`, kind },
  })).createModel;
const ears = await makeModel('TRANSCRIPTION');
const mouth = await makeModel('SPEECH');
await graphql(`mutation($w: ID!, $m: ID) { setWorkspaceTranscriptionModel(workspaceId: $w, modelId: $m) { id } }`, { w: WORKSPACE, m: ears.id });
await graphql(`mutation($w: ID!, $m: ID) { setWorkspaceSpeechModel(workspaceId: $w, modelId: $m) { id } }`, { w: WORKSPACE, m: mouth.id });
const CHAT = (await graphql(`mutation($input: StartChatInput!) { startChat(input: $input) { id } }`, {
  input: { workspaceId: WORKSPACE, title: `${PREFIX} ${Date.now()}` },
})).startChat.id;

/* -------------------------------------------------------------- the drive */

const caption = () =>
  page.evaluate(() => {
    const panel = document.querySelector('aside[aria-label="Voice mode"]');
    return [...(panel?.querySelectorAll('p') ?? [])].map((one) => one.textContent.trim()).find((text) => ['Listening', 'Thinking', 'Speaking'].includes(text)) ?? null;
  });
async function until(what, ms) {
  const stop = Date.now() + ms;
  for (;;) {
    const now = await page.evaluate(() => ({
      sent: window.__play.sent,
      fetched: window.__play.soundFetched,
      playing: window.__play.soundPlaying(),
      played: window.__play.played.map((one) => ({ duration: one.duration, at: one.at })),
    })).catch(() => null);
    if (now !== null) now.caption = await caption().catch(() => null);
    if (now !== null && what(now)) return now;
    if (Date.now() > stop) return null;
    await page.waitForTimeout(100);
  }
}

await page.goto(`${BASE}/chat/${CHAT}`, { waitUntil: 'domcontentloaded' });
const offered = (await drawn(page, 'the chat')) &&
  (await page.waitForSelector('button[aria-label="Enter voice mode"]', { timeout: 25_000 }).then(() => true).catch(() => false));
record(offered, 'voice mode is offered on a chat whose workspace can hear and speak');
if (!offered) {
  await sweep();
  await finish(browser);
}

await page.click('button[aria-label="Enter voice mode"]');
await page.waitForSelector('aside[aria-label="Voice mode"]', { timeout: 15_000 });

const sounding = await until((now) => now.playing, 30_000);
record(sounding !== null, 'the sound the agent played was fetched and is playing');
record(sounding?.fetched === 1, `from the address the play frame named (${sounding?.fetched})`);
record(sounding?.caption === 'Speaking', `and the panel says Speaking while it plays (${sounding?.caption})`);

const after = await until((now) => now.played.length >= 2 && !now.playing, 15_000);
const order = after?.played.map((one) => (one.duration > 1.5 ? 'sound' : 'speech')) ?? [];
record(order[0] === 'sound' && order.includes('speech'), `the answer was read after the sound, not over it (${order.join(', ')})`);
if (after !== null) {
  const sound = after.played.find((one) => one.duration > 1.5);
  const speech = after.played.find((one) => one.duration <= 1.5);
  record(speech.at - sound.at >= 1_500, `the first word came when the sound had ended (${speech.at - sound.at} ms after it began)`);
}

/* ---- and stopping the turn stops the sound ---- */

await page.evaluate(() => {
  window.__play.played.length = 0;
});
// The next thing said starts the second turn, which plays the sound again.
const again = await until((now) => now.playing && now.sent >= 2, 40_000);
record(again !== null, 'a second turn plays it again');
if (again !== null) {
  await page.click('aside[aria-label="Voice mode"] button[aria-label="Stop this turn and listen"]');
  const stopped = await until((now) => !now.playing, 3_000);
  record(stopped !== null, 'stopping the turn stops the sound, as it stops an answer');
  record(stopped?.caption === 'Listening', `and the panel is listening again (${stopped?.caption})`);
}

await sweep();
await finish(browser);
