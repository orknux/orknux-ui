/**
 * A video attached in a chat plays under its message, and a model's page
 * offers Takes video where its provider carries one.
 *
 * Two halves of one feature:
 *   - a video read back with the history, and one sent with a message, is drawn
 *     as a `<video>` with controls under the person's message - not as a chip
 *     that downloads - and has room on screen;
 *   - a chat model on an OpenAI-shaped server that is not OpenAI's own (a
 *     llama.cpp or vLLM host) draws the Takes video box, Save stores it and a
 *     reload draws it back; an Ollama model draws no such box, because its API
 *     has no video part.
 *
 * The chat's history, the upload and one turn's stream are stubbed in the page,
 * so no model has to answer and no bytes have to be playable: what is measured
 * is the element and its box. The model half makes its own providers on
 * `.invalid` hosts and removes them, with their models.
 */
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, context, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const at = (secondsAgo) => new Date(Date.now() - secondsAgo * 1000).toISOString();
const file = (id, filename, contentType) => ({ id, filename, contentType, sizeBytes: 2048 });
const HISTORY = [
  { role: 'user', content: 'What happens here?', actor: null, takes: [], thinking: null, thinkingMillis: null, at: at(300), attachments: [file('901', 'earlier.mp4', 'video/mp4')] },
  { role: 'assistant', content: 'A ball rolls off the table.', actor: null, takes: [], thinking: null, thinkingMillis: null, at: at(280), attachments: [] },
];

await context.addInitScript((history) => {
  const real = window.fetch.bind(window);
  const encode = new TextEncoder();
  const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const json = (data) => new Response(JSON.stringify({ data }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  window.__video = { sentIds: null };
  window.fetch = async (input, init) => {
    const address = typeof input === 'string' ? input : input.url;
    const body = typeof init?.body === 'string' ? init.body : '';
    if (address.endsWith('/graphql') && body.includes('chatMessages(')) return json({ chatMessages: history });
    if (/\/api\/workspaces\/[^/]+\/attachments$/.test(address) && init?.method === 'POST') {
      return new Response(JSON.stringify({ attachments: [{ id: '902', filename: 'clip.webm', contentType: 'video/webm', sizeBytes: 4096 }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (/\/api\/chats\/[^/]+\/follow/.test(address)) {
      return new Response(frame('idle', {}), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }
    if (/\/api\/chats\/[^/]+\/stream/.test(address)) {
      window.__video.sentIds = JSON.parse(body || '{}').attachmentIds ?? null;
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encode.encode(frame('chunk', { text: 'It is a short clip.' })));
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
record(earlier?.tag === 'video', `read back, a video is drawn as a <video> (${JSON.stringify(earlier)})`);
record(earlier?.controls === true, 'with controls to play it');
record(earlier?.row === 'user', `under the person's message (${earlier?.row})`);
record((earlier?.width ?? 0) >= 200, `and with room on screen (${earlier?.width}px wide)`);

await page.locator('input[type="file"]').first().setInputFiles({ name: 'clip.webm', mimeType: 'video/webm', buffer: Buffer.from('webm') });
await page.waitForTimeout(400);
await page.locator('#chat-composer').click();
await page.keyboard.type('And this one?');
await page.keyboard.press('Enter');
await page.waitForSelector('[data-message-file="902"]', { timeout: 10_000 }).catch(() => {});
const sent = await drawnAs('902');
record(sent?.tag === 'video' && sent?.row === 'user', `a video sent with a message plays under it at once (${JSON.stringify(sent)})`);
const sentIds = await page.evaluate(() => window.__video.sentIds);
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
  `mutation($p: ID!, $n: String!) { createModel(input: { providerId: $p, name: $n, modelId: "qwen2.5-vl", kind: CHAT }) { id } }`,
  { p: providerId, n: name },
)).createModel;

const local = await provider(`zz video vllm ${stamp}`, 'OPENAI', 'http://vllm.example.invalid:8000/v1');
const ollama = await provider(`zz video ollama ${stamp}`, 'OLLAMA', 'http://ollama.example.invalid:11434');
const watcher = await model(local.id, 'zz video vllm model');
const llava = await model(ollama.id, 'zz video ollama model');
const box = page.getByTestId('model-takes-video');

try {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/models/${watcher.id}`, { waitUntil: 'domcontentloaded' });
  record(await drawn(page, 'the vLLM model page'), 'the vLLM model page is on screen');
  await box.waitFor({ timeout: 20_000 }).catch(() => undefined);
  record((await box.count()) === 1, 'a model on an OpenAI-shaped server draws Takes video');
  if ((await box.count()) === 1) {
    record(!(await box.isChecked()), 'off until somebody says otherwise');
    await box.check();
    await page.getByRole('button', { name: /^Save/ }).first().click();
    await page.getByText('Saved.', { exact: true }).waitFor({ timeout: 10_000 }).catch(() => undefined);
    const held = (await graphql(`query($id: ID!) { model(id: $id) { takesVideo } }`, { id: watcher.id })).model;
    record(held?.takesVideo === true, `the server holds it on (${held?.takesVideo})`);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await box.waitFor({ timeout: 20_000 }).catch(() => undefined);
    record(await box.isChecked().catch(() => false), 'and a reload draws it back on');
  }

  await page.goto(`${BASE}/workspace/${WORKSPACE}/models/${llava.id}`, { waitUntil: 'domcontentloaded' });
  record(await drawn(page, 'the Ollama model page'), 'the Ollama model page is on screen');
  await page.locator('#temperature').waitFor({ timeout: 20_000 }).catch(() => undefined);
  await page.waitForTimeout(1000);
  record((await box.count()) === 0, `an Ollama model draws no Takes video (${await box.count()})`);
} finally {
  for (const one of [local, ollama]) {
    await graphql(`mutation($id: ID!) { removeModelProvider(id: $id) }`, { id: one.id }).catch(() => undefined);
  }
}
await finish(browser);
