/**
 * A sound attached in a chat plays under its message, and a model's page
 * offers Takes audio where its provider carries an audio part.
 *
 * Two halves of one feature:
 *   - an mp3 read back with the history, and a flac sent with a message, is
 *     drawn as an `<audio>` with controls under the person's message - not as a
 *     chip that downloads - and has room on screen; a MIDI file is not a sound
 *     a browser plays, and has a Play instead (chat-sound-check presses it);
 *   - a chat model on OpenAI's own host and one on an OpenAI-shaped server (a
 *     llama.cpp or vLLM host) draw the Takes audio box, Save stores it and a
 *     reload draws it back; an Ollama model draws no such box, because its API
 *     has no audio part.
 *
 * The chat's history, the upload and one turn's stream are stubbed in the page,
 * so no model has to answer and no bytes have to be playable: what is measured
 * is the element and its box. The model half makes its own providers on
 * `.invalid` hosts - and one on api.openai.com that is never called - and
 * removes them, with their models. Whether a model is sent the sound, and
 * refused it, is ChatAudioTest's.
 */
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, context, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const at = (secondsAgo) => new Date(Date.now() - secondsAgo * 1000).toISOString();
const file = (id, filename, contentType) => ({ id, filename, contentType, sizeBytes: 2048 });
const HISTORY = [
  { role: 'user', content: 'What is this tune?', actor: null, takes: [], thinking: null, thinkingMillis: null, at: at(300), attachments: [file('901', 'earlier.mp3', 'audio/mpeg'), file('903', 'song.mid', 'audio/midi')] },
  { role: 'assistant', content: 'A waltz in G.', actor: null, takes: [], thinking: null, thinkingMillis: null, at: at(280), attachments: [] },
];

await context.addInitScript((history) => {
  const real = window.fetch.bind(window);
  const encode = new TextEncoder();
  const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const json = (data) => new Response(JSON.stringify({ data }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  window.__audio = { sentIds: null };
  window.fetch = async (input, init) => {
    const address = typeof input === 'string' ? input : input.url;
    const body = typeof init?.body === 'string' ? init.body : '';
    if (address.endsWith('/graphql') && body.includes('chatMessages(')) return json({ chatMessages: history });
    if (/\/api\/workspaces\/[^/]+\/attachments$/.test(address) && init?.method === 'POST') {
      return new Response(JSON.stringify({ attachments: [{ id: '902', filename: 'take.flac', contentType: 'audio/flac', sizeBytes: 4096 }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (/\/api\/chats\/[^/]+\/follow/.test(address)) {
      return new Response(frame('idle', {}), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }
    if (/\/api\/chats\/[^/]+\/stream/.test(address)) {
      window.__audio.sentIds = JSON.parse(body || '{}').attachmentIds ?? null;
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encode.encode(frame('chunk', { text: 'A short take.' })));
            controller.enqueue(encode.encode(frame('done', { millis: 500 })));
            controller.close();
          },
        }),
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
      );
    }
    return real(input, init);
  };
}, HISTORY);

/** How a file under a message is drawn: its tag, whether it has controls, its box, and whose row it is in. */
const drawnAs = (id) =>
  page.evaluate((wanted) => {
    const one = document.querySelector(`[data-message-file="${wanted}"]`);
    if (one === null) return null;
    const box = one.getBoundingClientRect();
    const row = one.closest('[class*="_userRow_"]') !== null ? 'user' : one.closest('[class*="_assistantRow_"]') !== null ? 'assistant' : 'elsewhere';
    return { tag: one.tagName.toLowerCase(), controls: one.hasAttribute('controls'), width: Math.round(box.width), height: Math.round(box.height), row };
  }, id);

/* ------------------------------------------------------------ the chat half */

await page.goto(`${BASE}/chat`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-message-file="901"]', { timeout: 20_000 }).catch(() => {});
const earlier = await drawnAs('901');
record(earlier?.tag === 'audio', `read back, an mp3 is drawn as an <audio> (${JSON.stringify(earlier)})`);
record(earlier?.controls === true, 'with controls to play it');
record(earlier?.row === 'user', `under the person's message (${earlier?.row})`);
record((earlier?.width ?? 0) >= 200 && (earlier?.height ?? 0) >= 20, `and with room on screen (${earlier?.width}x${earlier?.height})`);
const midi = await drawnAs('903');
record(midi?.tag === 'div' && !midi.controls, `a MIDI file is not a sound a browser plays: a bar with Play, not a player (${JSON.stringify(midi)})`);

await page.locator('input[type="file"]').first().setInputFiles({ name: 'take.flac', mimeType: 'audio/flac', buffer: Buffer.from('fLaC') });
await page.waitForTimeout(400);
await page.locator('#chat-composer').click();
await page.keyboard.type('And this take?');
await page.keyboard.press('Enter');
await page.waitForSelector('[data-message-file="902"]', { timeout: 10_000 }).catch(() => {});
const sent = await drawnAs('902');
record(sent?.tag === 'audio' && sent?.row === 'user', `a flac sent with a message plays under it at once (${JSON.stringify(sent)})`);
const sentIds = await page.evaluate(() => window.__audio.sentIds);
record(JSON.stringify(sentIds) === '["902"]', `and it went with that message (${JSON.stringify(sentIds)})`);

/* ----------------------------------------------------------- the model half */

const stamp = Date.now();
const provider = async (name, type, endpoint) => (await graphql(
  `mutation($w: ID!, $n: String!, $t: ProviderType!, $e: String!) {
     createModelProvider(input: { workspaceId: $w, name: $n, type: $t, endpoint: $e }) { id }
   }`,
  { w: WORKSPACE, n: name, t: type, e: endpoint },
)).createModelProvider;
const model = async (providerId, name) => (await graphql(
  `mutation($p: ID!, $n: String!) { createModel(input: { providerId: $p, name: $n, modelId: "qwen2.5-omni", kind: CHAT }) { id } }`,
  { p: providerId, n: name },
)).createModel;

const local = await provider(`zz audio vllm ${stamp}`, 'OPENAI', 'http://vllm.example.invalid:8000/v1');
const hosted = await provider(`zz audio openai ${stamp}`, 'OPENAI', 'https://api.openai.com/v1');
const ollama = await provider(`zz audio ollama ${stamp}`, 'OLLAMA', 'http://ollama.example.invalid:11434');
const listener = await model(local.id, 'zz audio vllm model');
const gptAudio = await model(hosted.id, 'zz audio openai model');
const omni = await model(ollama.id, 'zz audio ollama model');
const box = page.getByTestId('model-takes-audio');

try {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/models/${listener.id}`, { waitUntil: 'domcontentloaded' });
  record(await drawn(page, 'the vLLM model page'), 'the vLLM model page is on screen');
  await box.waitFor({ timeout: 20_000 }).catch(() => undefined);
  record((await box.count()) === 1, 'a model on an OpenAI-shaped server draws Takes audio');
  if ((await box.count()) === 1) {
    record(!(await box.isChecked()), 'off until somebody says otherwise');
    await box.check();
    await page.getByRole('button', { name: /^Save/ }).first().click();
    await page.getByText('Saved.', { exact: true }).waitFor({ timeout: 10_000 }).catch(() => undefined);
    const held = (await graphql(`query($id: ID!) { model(id: $id) { takesAudio } }`, { id: listener.id })).model;
    record(held?.takesAudio === true, `the server holds it on (${held?.takesAudio})`);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await box.waitFor({ timeout: 20_000 }).catch(() => undefined);
    record(await box.isChecked().catch(() => false), 'and a reload draws it back on');
  }

  await page.goto(`${BASE}/workspace/${WORKSPACE}/models/${gptAudio.id}`, { waitUntil: 'domcontentloaded' });
  record(await drawn(page, 'the OpenAI model page'), 'the OpenAI model page is on screen');
  await box.waitFor({ timeout: 20_000 }).catch(() => undefined);
  record((await box.count()) === 1, `a model on OpenAI's own host draws Takes audio too (${await box.count()})`);

  await page.goto(`${BASE}/workspace/${WORKSPACE}/models/${omni.id}`, { waitUntil: 'domcontentloaded' });
  record(await drawn(page, 'the Ollama model page'), 'the Ollama model page is on screen');
  await page.locator('#temperature').waitFor({ timeout: 20_000 }).catch(() => undefined);
  await page.waitForTimeout(1000);
  record((await box.count()) === 0, `an Ollama model draws no Takes audio (${await box.count()})`);
} finally {
  for (const one of [local, hosted, ollama]) {
    await graphql(`mutation($id: ID!) { removeModelProvider(id: $id) }`, { id: one.id }).catch(() => undefined);
  }
}
await finish(browser);
