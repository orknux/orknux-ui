/**
 * Leaving a voice turn that is thinking stops nothing; pressing the circle
 * stops it. Issue #615.
 *
 * Voice mode used to stop the model by closing the request: the circle,
 * talking over it and walking away all aborted the stream, and the server
 * hung a voice turn up the moment its reader went. So switching chat while
 * the model thought threw the answer away. The server now finishes a turn
 * whose reader leaves, whatever kind it is, and a turn stopped on purpose
 * says so through the chat's interrupt endpoint - which is what this checks
 * the panel does, and only when it means it.
 *
 *   circle  pressed while the model thinks, the panel asks the server to
 *           interrupt that chat
 *   leave   switching to another chat while it thinks asks for no interrupt,
 *           so the server goes on and keeps the answer
 *
 * The microphone is silence, so nothing barges in; the stream is a stub that
 * thinks for twenty seconds and the interrupt is caught on its way out. The
 * models and the chats are removed afterwards.
 */
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BASE, WORKSPACE, open, record, drawn, finish, shot } from './suite/harness.mjs';

const PREFIX = 'zzVoiceLeave';

/* ------------------------------------------------- a microphone that hears nothing */

const RATE = 48_000;
const LENGTH = 40;

function silentMicrophone(path) {
  const body = Buffer.alloc(RATE * LENGTH * 2);
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

const MICROPHONE = silentMicrophone(join(tmpdir(), 'orknux-voice-leave.wav'));

/** The stubs: every answer thinks for twenty seconds, and an interrupt is noted rather than sent. */
function stubs() {
  window.__leave = { sent: 0, aborted: 0, interrupted: [], micAt: null };
  const asked = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
  if (asked !== undefined) {
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await asked(constraints);
      window.__leave.micAt ??= Date.now();
      return stream;
    };
  }
  const real = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const address = typeof input === 'string' ? input : input.url;
    const interrupt = address.match(/\/api\/chats\/([^/]+)\/interrupt/);
    if (interrupt !== null) {
      window.__leave.interrupted.push(interrupt[1]);
      return new Response(null, { status: 204 });
    }
    if (/\/api\/chats\/[^/]+\/stream/.test(address)) {
      window.__leave.sent += 1;
      const encode = new TextEncoder();
      const body = new ReadableStream({
        start(controller) {
          const done = window.setTimeout(() => {
            controller.enqueue(encode.encode(`event: chunk\ndata: ${JSON.stringify({ text: 'Here is the answer.' })}\n\n`));
            controller.enqueue(encode.encode('event: done\ndata: {"millis":10}\n\n'));
            controller.close();
          }, 20_000);
          init?.signal?.addEventListener('abort', () => {
            window.clearTimeout(done);
            window.__leave.aborted += 1;
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

async function clean() {
  await sweep().catch(() => undefined);
  await finish(browser);
}

await sweep();

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

const stamp = Date.now();
async function startChat(label) {
  const title = `${PREFIX} ${label} ${stamp}`;
  const started = await graphql(`mutation($input: StartChatInput!) { startChat(input: $input) { id } }`, {
    input: { workspaceId: WORKSPACE, title },
  });
  return { id: started.startChat.id, title };
}
const here = await startChat('here');
const there = await startChat('there');

/* ------------------------------------------------------------ the turns */

await context.addInitScript(stubs);
await page.goto(`${BASE}/chat/${here.id}`, { waitUntil: 'domcontentloaded' });
const voice =
  (await drawn(page, 'the chat')) &&
  (await page.waitForSelector('button[aria-label="Enter voice mode"]', { timeout: 25_000 }).then(() => true).catch(() => false));
record(voice, 'voice mode is offered on a chat whose workspace can hear and speak');
if (!voice) await clean();
await page.click('button[aria-label="Enter voice mode"]');
await page.waitForFunction(() => window.__leave?.micAt !== null, null, { timeout: 15_000 }).catch(() => undefined);

const state = () => page.evaluate(() => ({ ...window.__leave, interrupted: [...window.__leave.interrupted] }));

/** Asks a question typed and waits until the panel says it is thinking. */
async function ask(question) {
  const before = (await state()).sent;
  await page.fill('#chat-composer', question);
  await page.click('button[type="submit"]');
  await page.waitForFunction((count) => window.__leave.sent > count, before, { timeout: 15_000 }).catch(() => undefined);
  return page
    .waitForFunction(
      () => [...(document.querySelector('aside[aria-label="Voice mode"]')?.querySelectorAll('p') ?? [])].some(
        (one) => one.textContent.trim() === 'Thinking',
      ),
      null,
      { timeout: 10_000 },
    )
    .then(() => true)
    .catch(() => false);
}

/* ---- the circle ---- */

record(await ask('What is the plan?'), 'the first question is being thought about');
await page.click('aside[aria-label="Voice mode"] button[aria-label="Stop this turn and listen"]');
await page.waitForTimeout(1_000);
const stopped = await state();
console.log(`circle: ${JSON.stringify(stopped)}`);
record(
  stopped.interrupted.length === 1 && stopped.interrupted[0] === here.id,
  `pressing the circle while it thinks asks the server to interrupt this chat (${JSON.stringify(stopped.interrupted)})`,
);

/* ---- leaving ---- */

record(await ask('And the one after that?'), 'the second question is being thought about');
await page.locator('button', { hasText: there.title }).first().click();
await page.waitForURL(`**/chat/${there.id}`, { timeout: 10_000 }).catch(() => undefined);
await page.waitForTimeout(1_500);
const left = await state();
console.log(`leave: ${JSON.stringify(left)} at ${page.url()}`);
record(page.url().endsWith(`/chat/${there.id}`), `the other chat is open (${page.url()})`);
record(
  left.interrupted.length === stopped.interrupted.length,
  `switching chat while it thinks asks for no interrupt, so the answer is finished and kept (${JSON.stringify(left.interrupted)})`,
);
await page.screenshot({ path: shot('voice-leave.png') });

await clean();
