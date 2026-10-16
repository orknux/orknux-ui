/**
 * Muting yourself in voice mode, by a button and by a shortcut you choose.
 *
 * Voice mode holds the microphone open for the whole conversation, which is
 * what makes it hands-free - and what left somebody who had to say something
 * to the room with no way to say it without it becoming the next turn. Mute
 * switches the microphone's track off: the panel says Muted, the circle hears
 * nothing, nothing is transcribed and nothing is sent, and unmuting is
 * instant because nothing was closed.
 *
 * Three things, each of which a page that only drew a button would fail:
 *
 *   the shortcut   is chosen in Preferences, and the one chosen is the one
 *                  honoured - the default no longer is
 *   deafness       a fake microphone speaks for three seconds while muted,
 *                  and the circle does not move, the transcriber is not
 *                  asked, and the chat is sent nothing
 *   the way back   the button unmutes, and the panel is listening again
 *
 * The models, the chat, the turn-taking and the shortcut are put back
 * afterwards, including what a killed run left behind.
 */
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BASE, WORKSPACE, open, record, drawn, finish, shot } from './suite/harness.mjs';

const PREFIX = 'zzVoiceMute';
const CHOSEN = 'Ctrl+Shift+K';

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

const MICROPHONE = fakeMicrophone(join(tmpdir(), 'orknux-voice-mute.wav'));

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
  window.__mute = { sent: [], transcribed: 0, levels, micAt: null };

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
  await page.evaluate(() => window.localStorage.removeItem('orknux.voiceMuteShortcut')).catch(() => undefined);
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

/* ------------------------------------------------- choosing the shortcut */

await page.goto(`${BASE}/preferences`, { waitUntil: 'domcontentloaded' });
const recorder = page.locator('[data-voice-mute-record]');
const offered = await recorder.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
record(offered, 'Preferences has a Voice Mute Shortcut');
if (!offered) await clean();
const shown = ((await recorder.textContent()) ?? '').trim();
record(shown === 'Alt+M', `which is Alt+M until somebody chooses (${shown})`);
await recorder.click();
await page.keyboard.press('Control+Shift+K');
const chosen = ((await recorder.textContent()) ?? '').trim();
record(chosen === CHOSEN, `pressing a combination chooses it (${chosen})`);
// Preferences keeps a change as a draft until its Save.
await page.locator('[class*="_pageSave_"]').click();
await page.waitForTimeout(300);

/* ------------------------------------------------------------ the panel */

const READ = () =>
  page.evaluate(() => {
    const panel = document.querySelector('aside[aria-label="Voice mode"]');
    if (panel === null) return null;
    const button = panel.querySelector('[data-voice-mute]');
    const captions = [...panel.querySelectorAll('p')].map((one) => one.textContent.trim());
    const state = window.__mute;
    return {
      mic: state.micAt === null ? null : (Date.now() - state.micAt) / 1000,
      micAt: state.micAt,
      muted: button?.getAttribute('aria-pressed') === 'true',
      caption: captions.find((text) => ['Listening', 'Thinking', 'Speaking', 'Muted'].includes(text)) ?? null,
      sent: state.sent.length,
      transcribed: state.transcribed,
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
const listening = await until((now) => now.micAt !== null && now.caption === 'Listening', 'the microphone', 15_000);
record(listening !== null && listening.mic < VOICE_AT - 2, `the panel is listening, well before the voice (${listening?.mic}s in)`);
if (listening === null) await clean();

// The caret in the composer, where a shortcut has to be heard too.
await page.click('#chat-composer');
await page.keyboard.press('Alt+M');
await page.waitForTimeout(300);
const notDefault = await READ();
record(notDefault !== null && !notDefault.muted, 'the default no longer mutes once another is chosen');

await page.keyboard.press('Control+Shift+K');
const muted = await until((now) => now.muted, 'muting', 3_000);
record(muted !== null && muted.caption === 'Muted', `the chosen shortcut mutes, and the panel says so (${muted?.caption})`);
record(muted !== null && muted.mic < VOICE_AT, `before anybody speaks (${muted?.mic}s in)`);
const hint = await page.locator('aside[aria-label="Voice mode"]').textContent();
record((hint ?? '').includes(`press ${CHOSEN} to speak again`), 'and how to speak again');
await page.screenshot({ path: shot('voice-mute.png') });

/* ---- three seconds of voice, muted ---- */

const after = await until((now) => now.mic >= VOICE_AT + VOICE_FOR + 3, 'the voice to pass', 20_000);
const heard = await page.evaluate(
  ({ from, to }) => {
    const { micAt, levels } = window.__mute;
    return levels.filter((one) => (one.at - micAt) / 1000 >= from && (one.at - micAt) / 1000 <= to).length;
  },
  { from: VOICE_AT, to: VOICE_AT + VOICE_FOR },
);
record(heard === 0, `muted, the circle did not move for the voice (${heard} readings above nothing)`);
record(after !== null && after.transcribed === 0, `nothing was handed to the transcriber (${after?.transcribed})`);
record(after !== null && after.sent === 0, `and nothing was sent to the chat (${after?.sent})`);

/* ---- the way back ---- */

await page.click('[data-voice-mute]');
const back = await until((now) => !now.muted, 'unmuting', 3_000);
record(back !== null && back.caption === 'Listening', `the button unmutes, and the panel is listening again (${back?.caption})`);

await clean();
