/**
 * The end of an answer is read when the answer ends, not when the stream does.
 *
 * What follows an answer on the stream can be a model call: naming the chat.
 * The last sentence waited for all of it, because nothing told the panel the
 * words were complete, and so did going back to listening. The server says
 * `answered` now, and this stub holds `done` back well after it.
 *
 *   speech     the last sentence, which has no space after it, is asked for
 *              before `done` arrives
 *   caption    the panel says Preparing speech while the audio is being made
 *   listening  it listens again when the audio ends, with `done` still to come
 *   the rest   the stream is not stopped by that, and a second turn's answer
 *              does not take the first one's frames
 *
 * The models and the chat are this check's own and are removed afterwards.
 */
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BASE, WORKSPACE, open, record, drawn, finish, shot } from './suite/harness.mjs';

const PREFIX = 'zzVoiceAnswered';
const HOLDS_DONE_FOR = 9_000;

/** Twenty seconds of a silent microphone. */
function silence(path) {
  const rate = 48_000;
  const frames = rate * 20;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + frames * 2, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(frames * 2, 40);
  writeFileSync(path, Buffer.concat([header, Buffer.alloc(frames * 2)]));
  return path;
}

const MICROPHONE = silence(join(tmpdir(), 'orknux-voice-answered.wav'));

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

await context.addInitScript(
  ({ holdsDoneFor, makesSpeechIn }) => {
    window.__ended = { log: [] };

    /** Half a second of silence, as the speech model's answer. */
    function clip() {
      const rate = 8_000;
      const frames = rate / 2;
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
      const log = window.__ended.log;
      if (/\/api\/chats\/[^/]+\/stream/.test(address)) {
        const encode = new TextEncoder();
        const body = new ReadableStream({
          start(controller) {
            window.setTimeout(() => {
              controller.enqueue(encode.encode(`event: chunk\ndata: ${JSON.stringify({ text: 'This whole answer is one last sentence.' })}\n\n`));
              controller.enqueue(encode.encode('event: answered\ndata: {}\n\n'));
              log.push('answered');
            }, 200);
            window.setTimeout(() => {
              log.push('done');
              controller.enqueue(encode.encode('event: done\ndata: {"millis":10}\n\n'));
              controller.close();
            }, holdsDoneFor);
          },
          cancel() {
            log.push('cancelled');
          },
        });
        return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
      }
      if (/\/api\/chats\/[^/]+\/interrupt/.test(address)) {
        log.push('interrupted');
        return new Response(null, { status: 200 });
      }
      if (/\/api\/workspaces\/[^/]+\/speech/.test(address)) {
        log.push('speech');
        await new Promise((done) => window.setTimeout(done, makesSpeechIn));
        return new Response(clip(), { status: 200, headers: { 'content-type': 'audio/wav' } });
      }
      return real(input, init);
    };
  },
  { holdsDoneFor: HOLDS_DONE_FOR, makesSpeechIn: 1_000 },
);

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

/* ------------------------------------------------------------ the panel */

const READ = () =>
  page.evaluate(() => {
    const panel = document.querySelector('aside[aria-label="Voice mode"]');
    if (panel === null) return null;
    const captions = [...panel.querySelectorAll('p')].map((one) => one.textContent.trim());
    return {
      caption: captions.find((text) => ['Listening', 'Thinking', 'Speaking', 'Preparing speech'].includes(text)) ?? null,
      log: [...window.__ended.log],
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

async function type(text) {
  await page.fill('#chat-composer', text);
  await page.click('button[type="submit"]');
}

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
const listening = await until((now) => now.caption === 'Listening', 'the panel to listen', 15_000);
record(listening !== null, 'the panel is listening');
if (listening === null) await clean();

await type('Tell me something');
const preparing = await until((now) => now.caption === 'Preparing speech', 'the panel to say it is preparing', 4_000);
record(preparing !== null, 'the panel says Preparing speech while the audio is being made');
record(
  preparing !== null && preparing.log.includes('speech') && !preparing.log.includes('done'),
  `the last sentence goes to speech before the stream ends (${JSON.stringify(preparing?.log ?? null)})`,
);
await page.screenshot({ path: shot('voice-preparing-speech.png') });

const spoke = await until((now) => now.caption === 'Speaking', 'the answer to be read', 5_000);
record(spoke !== null, 'then it is read');
const back = await until((now) => now.caption === 'Listening', 'the panel to listen again', 5_000);
record(
  back !== null && !back.log.includes('done'),
  `and the panel listens again when the audio ends, with the stream still open (${JSON.stringify(back?.log ?? null)})`,
);

await type('Something else');
await until((now) => now.log.filter((one) => one === 'answered').length === 2, 'the second turn', 4_000);
await until((now) => now.log.includes('done'), 'the first stream to end', 12_000);
const after = await READ();
record(
  !after.log.includes('cancelled') && !after.log.includes('interrupted'),
  `a next turn leaves what is left of the first alone (${JSON.stringify(after.log)})`,
);

await clean();
