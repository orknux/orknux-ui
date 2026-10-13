/**
 * Taking back the message waiting for the next turn in voice mode.
 *
 * Whatever is said or typed while a turn is in flight waits on the panel and
 * goes out by itself when the turn ends (voice-queue-check). That is right for
 * a follow-up and wrong for something said to the room or a thought abandoned
 * halfway, and there was no way to take it back: it went. The waiting box has
 * a Cancel now, which throws the waiting message away and leaves the turn in
 * flight alone.
 *
 *   the cancel     the waiting message leaves the panel, and when the turn
 *                  ends nothing more is sent
 *   the turn       the answer in flight is not stopped by it
 *   the queue      what is typed after is a turn as before - cancelling one
 *                  message does not break the queue for good
 *
 * Typed rather than spoken, so the microphone is a file of silence: what is
 * measured is the queue, which spoken and typed messages share. The models and
 * the chat are this check's own and are removed afterwards.
 */
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BASE, WORKSPACE, open, record, drawn, finish, shot } from './suite/harness.mjs';

const PREFIX = 'zzVoiceCancel';
const FIRST = 'What is the plan for today';
const ABANDONED = 'Hold on, the door';
const LATER = 'And what about tomorrow';
/** How long the stubbed model takes over the first answer: long enough to queue behind it and cancel. */
const THINKS_FOR = 4_000;

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

const MICROPHONE = silence(join(tmpdir(), 'orknux-voice-cancel.wav'));

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
  ({ thinksFor }) => {
    window.__cancel = { sent: [] };

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
      if (/\/api\/chats\/[^/]+\/stream/.test(address)) {
        const first = window.__cancel.sent.length === 0;
        window.__cancel.sent.push(JSON.parse(String(init?.body ?? '{}')).text ?? '');
        const encode = new TextEncoder();
        const body = new ReadableStream({
          start(controller) {
            window.setTimeout(
              () => {
                controller.enqueue(encode.encode(`event: chunk\ndata: ${JSON.stringify({ text: 'Here is the answer.' })}\n\n`));
                controller.enqueue(encode.encode('event: done\ndata: {"millis":10}\n\n'));
                controller.close();
              },
              first ? thinksFor : 300,
            );
          },
        });
        return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
      }
      if (/\/api\/workspaces\/[^/]+\/speech/.test(address)) {
        return new Response(clip(), { status: 200, headers: { 'content-type': 'audio/wav' } });
      }
      return real(input, init);
    };
  },
  { thinksFor: THINKS_FOR },
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
      caption: captions.find((text) => ['Listening', 'Thinking', 'Speaking'].includes(text)) ?? null,
      waiting: panel.querySelector('[data-voice-waiting]')?.textContent ?? null,
      sent: [...window.__cancel.sent],
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

await type(FIRST);
const thinking = await until((now) => now.caption === 'Thinking' && now.sent.length === 1, 'the first turn', 8_000);
record(thinking !== null, 'the first message is a turn, and the model is working on it');

await type(ABANDONED);
const held = await until((now) => (now.waiting ?? '').includes(ABANDONED), 'the second message to wait', 3_000);
record(held !== null, 'a message typed while it is busy waits on the panel');
const cancel = page.locator('[data-voice-cancel-waiting]');
record((await cancel.count()) === 1, 'with a Cancel beside it');
await page.screenshot({ path: shot('voice-cancel-waiting.png') });

await cancel.click({ timeout: 2_000 }).catch(() => undefined);
const gone = await until((now) => now.waiting === null, 'the waiting message to go', 2_000);
record(gone !== null, 'Cancel takes it off the panel');
record(gone !== null && gone.caption === 'Thinking', `and leaves the turn in flight alone (${gone?.caption})`);

const over = await until((now) => now.caption === 'Listening', 'the first turn to end', 20_000);
await page.waitForTimeout(2_000);
const after = await READ();
record(
  over !== null && after !== null && after.sent.length === 1,
  `when the turn ended, nothing more was sent (${JSON.stringify(after?.sent ?? null)})`,
);

await type(LATER);
const later = await until((now) => now.sent.length >= 2, 'a later message', 8_000);
record(
  later !== null && later.sent[later.sent.length - 1] === LATER,
  `and a later message is a turn as before (${JSON.stringify(later?.sent ?? null)})`,
);

await clean();
