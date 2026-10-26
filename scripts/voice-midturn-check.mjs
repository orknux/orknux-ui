/**
 * In a voice conversation the agent's words between its calls are spoken as
 * they arrive, and the turn does not wait for them. Issue #671.
 *
 * An agent that writes "Checking your decks" before it calls a tool sends that
 * line as a `said` frame, apart from the answer. The panel used to be handed
 * the answer alone, so the line was drawn in the chat, never spoken, and the
 * panel said Thinking over it for as long as the tool ran. So here:
 *
 *   - the line is handed to the speech model before the answer has arrived,
 *     and the panel says Speaking while it plays, then Thinking again;
 *   - speech is slow on purpose and the turn does not wait for it: the call
 *     is drawn while the line is still being synthesised;
 *   - the answer opens by repeating the line, and the line is spoken once;
 *   - the answer's own words are spoken after it, and the thinking never is.
 *
 * The ears, the mouth and the model are stubbed as in voice-play-check. Every
 * speech request is held for SPEECH_MS before its clip comes back.
 */
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const PREFIX = 'zzVoiceMidturn';
const RATE = 48_000;
const LINE = 'Checking your decks and cards due for review.';
const REST = 'You have six thousand cards due. Which deck shall I draw from?';
const THOUGHT = 'Reasoning nobody should hear about decks.';
const SPEECH_MS = 2_500;

/** Somebody who says something once, and then nothing for a long while. */
function fakeMicrophone(path) {
  const SPEAKING_MS = 1_200;
  const QUIET_MS = 40_000;
  const frames = Math.round((RATE * (SPEAKING_MS + QUIET_MS)) / 1000);
  const body = Buffer.alloc(frames * 2);
  const speaking = Math.round((RATE * SPEAKING_MS) / 1000);
  for (let at = 0; at < speaking; at += 1) {
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

const MICROPHONE = fakeMicrophone(join(tmpdir(), 'orknux-voice-midturn.wav'));

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

await context.addInitScript(({ line, rest, thought, speechMs }) => {
  const state = { sent: 0, frames: {}, speech: [], played: [], callDrawnAt: null, answerDrawnAt: null };
  window.__mid = state;

  const play = window.HTMLMediaElement.prototype.play;
  window.HTMLMediaElement.prototype.play = function patched() {
    state.played.push({ element: this, at: Date.now() });
    return play.call(this);
  };
  state.playingNow = () => state.played.filter((one) => !one.element.paused && !one.element.ended).length;
  state.endedNow = () => state.played.filter((one) => one.element.ended).length;

  // When the call and the answer are first on the screen, to set against when the speech came back.
  new MutationObserver(() => {
    const text = document.body?.textContent ?? '';
    if (state.callDrawnAt === null && text.includes('anki_decks')) state.callDrawnAt = Date.now();
    if (state.answerDrawnAt === null && text.includes('six thousand cards')) state.answerDrawnAt = Date.now();
  }).observe(document, { subtree: true, childList: true, characterData: true });

  function clip() {
    const rate = 22_050;
    const frames = Math.round(rate * 0.6);
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
      return new Response(JSON.stringify({ text: 'Draw me questions from my Anki' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (/\/api\/chats\/[^/]+\/stream/.test(address)) {
      state.sent += 1;
      if (state.sent > 1) return new Response('', { status: 200, headers: { 'content-type': 'text/event-stream' } });
      const encode = new TextEncoder();
      const body = new ReadableStream({
        start(controller) {
          const frame = (event, data) => {
            state.frames[event] = state.frames[event] ?? Date.now();
            controller.enqueue(encode.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
          };
          frame('thinking', { text: thought });
          frame('thought', { text: thought, millis: 300 });
          frame('said', { text: `${line}\n\n` });
          // The call follows at once: nothing about the line being spoken holds the turn back.
          window.setTimeout(() => frame('call', { at: 0, tool: 'anki_decks', arguments: '{"anki":"1"}' }), 50);
          // The tool runs on past the line's speech, so the panel has a pause to show.
          window.setTimeout(() => frame('called', { at: 0, result: '{"due":6901}', failed: false }), 4_000);
          window.setTimeout(() => {
            frame('chunk', { text: `${line}\n\n${rest}` });
            frame('done', { millis: 1000 });
            controller.close();
          }, 5_500);
        },
      });
      return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    }
    if (/\/api\/workspaces\/[^/]+\/speech/.test(address)) {
      const asked = { text: JSON.parse(init?.body ?? '{}').text ?? '', at: Date.now(), back: null };
      state.speech.push(asked);
      // A slow speech model: the clip comes back seconds after it is asked for.
      await new Promise((done) => window.setTimeout(done, speechMs));
      asked.back = Date.now();
      return new Response(clip(), { status: 200, headers: { 'content-type': 'audio/wav' } });
    }
    return real(input, init);
  };
}, { line: LINE, rest: REST, thought: THOUGHT, speechMs: SPEECH_MS });

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
      sent: window.__mid.sent,
      frames: window.__mid.frames,
      speech: window.__mid.speech,
      played: window.__mid.played.length,
      playing: window.__mid.playingNow(),
      ended: window.__mid.endedNow(),
      callDrawnAt: window.__mid.callDrawnAt,
      answerDrawnAt: window.__mid.answerDrawnAt,
    })).catch(() => null);
    if (now !== null) now.caption = await caption().catch(() => null);
    if (now !== null && what(now)) return now;
    if (Date.now() > stop) return null;
    await page.waitForTimeout(50);
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

const asked = await until((now) => now.speech.length >= 1, 30_000);
record(asked !== null, 'something was handed to the speech model');
const first = asked?.speech[0];
record(first !== undefined && first.text.trim() === LINE, `the first thing spoken is the line the agent said before its call (${JSON.stringify(first?.text)})`);
record(
  first !== undefined && asked.frames.chunk === undefined,
  'and it was handed over as it arrived, before the answer had',
);

// The turn goes on while the line is being synthesised.
const calling = await until((now) => now.callDrawnAt !== null, 10_000);
const firstBack = calling?.speech[0]?.back ?? null;
record(
  calling !== null && (firstBack === null || calling.callDrawnAt < firstBack),
  `the call is drawn while the line is still being synthesised: speech does not hold the turn back (${firstBack === null ? 'speech still out' : `${firstBack - calling.callDrawnAt} ms before the clip came back`})`,
);

const sounding = await until((now) => now.playing >= 1, 15_000);
record(sounding !== null, 'the line is played');
record(sounding?.caption === 'Speaking', `the panel says Speaking over the line, not Thinking (${sounding?.caption})`);
const said = await page.evaluate(() => {
  const line = document.querySelector('[data-said]');
  return { text: line?.textContent ?? '', inThought: line?.closest('[data-thought]') !== null && line !== null };
});
record(said.text.includes('Checking your decks') && !said.inThought, 'the line is drawn in the chat as the agent saying it, not as thinking');

const between = await until((now) => now.ended >= 1 && now.playing === 0, 10_000);
record(between?.caption === 'Thinking', `with the line said and the tool still running, the panel says Thinking (${between?.caption})`);
record(between !== null && between.answerDrawnAt === null, 'and that is before the answer has arrived');

const after = await until((now) => now.caption === 'Listening' && now.answerDrawnAt !== null && now.speech.every((one) => one.back !== null) && now.playing === 0, 30_000);
const last = after ?? (await until(() => true, 0));
if (after === null) console.log(`left at ${JSON.stringify({ ...last, speech: last?.speech.length })}`);
const texts = last?.speech.map((one) => one.text) ?? [];
record(texts.some((text) => text.includes('six thousand cards')), `the answer is spoken after the line (${JSON.stringify(texts)})`);
record(texts.filter((text) => text.includes(LINE)).length === 1, 'the line the answer repeats is spoken once');
record(!texts.some((text) => text.includes('Reasoning nobody')), 'the thinking is never spoken');
record(after?.caption === 'Listening', `and the panel is listening again (${after?.caption})`);

await sweep();
await finish(browser);
