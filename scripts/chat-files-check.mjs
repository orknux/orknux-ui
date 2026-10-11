/**
 * A file is drawn under the message it came with, and needs no reload to get
 * there.
 *
 * The chat used to draw every file it held in one strip above the composer,
 * because nothing recorded which message a file had come with - so a document
 * sent an hour ago sat next to the box being typed into, and a file the agent
 * filed in a turn showed nowhere until the page was reloaded. Now:
 *   - read back, each file is under its message: a person's under theirs, the
 *     agent's under the answer of the turn that filed it;
 *   - a file sent with a message is under it the moment it is sent;
 *   - a file the agent's side files mid-turn arrives as a `filed` frame and is
 *     under the answer while the turn is still running, and stays there;
 *   - and there is no strip above the composer.
 *
 * Stubbed in the page: the chat is a real one, and its history, the upload and
 * one turn's stream are answered here.
 */
import { BASE, open, record, finish } from './suite/harness.mjs';

const { browser, context, page } = await open({ viewport: { width: 1440, height: 1000 } });

const at = (secondsAgo) => new Date(Date.now() - secondsAgo * 1000).toISOString();
const file = (id, filename, contentType = 'text/plain') => ({ id, filename, contentType, sizeBytes: 1200 });
const HISTORY = [
  { role: 'user', content: 'Here is the log.', actor: null, takes: [], thinking: null, thinkingMillis: null, at: at(300), attachments: [file('701', 'server.log')] },
  { role: 'assistant', content: 'I wrote up what I found.', actor: null, takes: [], thinking: null, thinkingMillis: null, at: at(280), attachments: [file('702', 'findings.md')] },
];

await context.addInitScript((history) => {
  const real = window.fetch.bind(window);
  const encode = new TextEncoder();
  const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const json = (data) => new Response(JSON.stringify({ data }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  window.__files = { release: null, sentIds: null };
  window.fetch = async (input, init) => {
    const address = typeof input === 'string' ? input : input.url;
    const body = typeof init?.body === 'string' ? init.body : '';
    if (address.endsWith('/graphql') && body.includes('chatMessages(')) return json({ chatMessages: history });
    if (/\/api\/workspaces\/[^/]+\/attachments$/.test(address) && init?.method === 'POST') {
      return new Response(JSON.stringify({ attachments: [{ id: '801', filename: 'notes.txt', contentType: 'text/plain', sizeBytes: 5 }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    // Nothing is running on this chat as far as the page knows: the real one may well be answering somebody.
    if (/\/api\/chats\/[^/]+\/follow/.test(address)) {
      return new Response(frame('idle', {}), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }
    if (/\/api\/chats\/[^/]+\/stream/.test(address)) {
      window.__files.sentIds = JSON.parse(body || '{}').attachmentIds ?? null;
      return new Response(
        new ReadableStream({
          start(controller) {
            const send = (event, data) => controller.enqueue(encode.encode(frame(event, data)));
            window.setTimeout(() => {
              send('call', { at: 0, tool: 'save_report', arguments: '{}' });
              send('called', { at: 0, result: '{}', failed: false });
              send('filed', { id: '802', filename: 'report.txt', contentType: 'text/plain', sizeBytes: 640 });
            }, 200);
            window.__files.release = () => {
              send('chunk', { text: 'The report is attached.' });
              send('done', { millis: 1000 });
              controller.close();
            };
          },
        }),
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
      );
    }
    return real(input, init);
  };
}, HISTORY);

/** Which kind of row a file chip is drawn in: the person's message, an answer, or neither. */
const rowOf = (id) =>
  page.evaluate((wanted) => {
    const chip = document.querySelector(`[data-message-file="${wanted}"]`);
    if (chip === null) return null;
    if (chip.closest('[class*="_userRow_"]') !== null) return 'user';
    if (chip.closest('[class*="_assistantRow_"]') !== null) return 'assistant';
    return 'elsewhere';
  }, id);

await page.goto(`${BASE}/chat`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-message-file="701"]', { timeout: 20_000 }).catch(() => {});

record((await rowOf('701')) === 'user', `read back, a file the person sent is under their message (${await rowOf('701')})`);
record((await rowOf('702')) === 'assistant', `and one filed during a turn is under its answer (${await rowOf('702')})`);
const strip = await page.evaluate(
  () => [...document.querySelectorAll('span')].filter((one) => (one.textContent ?? '').trim() === 'Files').length,
);
record(strip === 0, `there is no strip of files above the composer (${strip})`);

/* Sent with a message: under it at once, with no reload. */
await page.locator('input[type="file"]').first().setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('notes') });
await page.waitForTimeout(400);
await page.locator('#chat-composer').click();
await page.keyboard.type('And here are my notes.');
await page.keyboard.press('Enter');
await page.waitForSelector('[data-message-file="801"]', { timeout: 10_000 }).catch(() => {});
record((await rowOf('801')) === 'user', `a file sent with a message is under it the moment it is sent (${await rowOf('801')})`);
const sentIds = await page.evaluate(() => window.__files.sentIds);
record(JSON.stringify(sentIds) === '["801"]', `and it went with that message (${JSON.stringify(sentIds)})`);

/* Filed by the agent's side mid-turn: under the answer while the turn runs. */
await page.waitForSelector('[data-message-file="802"]', { timeout: 10_000 }).catch(() => {});
record((await rowOf('802')) === 'assistant', `a file filed mid-turn is under the answer before the turn ends (${await rowOf('802')})`);
await page.evaluate(() => window.__files.release?.());
await page.getByText('The report is attached.').first().waitFor({ timeout: 10_000 }).catch(() => {});
await page.waitForTimeout(400);
record((await rowOf('802')) === 'assistant', `and it stays there once the answer lands (${await rowOf('802')})`);
record((await page.locator('[data-message-file="802"]').count()) === 1, 'drawn once');

await finish(browser);
