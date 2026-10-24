/**
 * A picture a tool drew is drawn where it was drawn in the turn, not below a
 * message the person wrote into the turn afterwards.
 *
 * Chat 974: the agent drew a mockup, the person wrote "ok, but I want
 * wireframe" while the turn was still running, and the mockup was drawn under
 * that message and the "Writing the answer…" line - reading as the answer to
 * it, though it came before it. Pictures were carried to the end of the
 * working rather than kept among its lines.
 *
 * The stream, the post and the agent on the chat list are stubbed, as in
 * chat-midturn-check: no real model can be held mid-turn on cue.
 */
import { BASE, open, record, finish } from './suite/harness.mjs';

const { browser, context, page } = await open({ viewport: { width: 1440, height: 1000 } });

const SAID = 'ok, but I want wireframe';
const PICTURE = '/api/attachments/90310';

/** One red pixel, so the picture has bytes to draw. */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
await page.route('**/api/attachments/*', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }));

await context.addInitScript((picture) => {
  const real = window.fetch.bind(window);
  const encode = new TextEncoder();
  const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  window.__drawn = { release: null };
  window.fetch = async (input, init) => {
    const address = typeof input === 'string' ? input : input.url;
    const body = typeof init?.body === 'string' ? init.body : '';
    if (address.includes('/graphql') && body.includes('postChatMessageDuringTurn')) {
      return new Response(JSON.stringify({ data: { postChatMessageDuringTurn: true } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (address.includes('/graphql') && (body.includes('chatSessions(') || body.includes('chatSession('))) {
      const answered = await real(input, init);
      const json = await answered.json();
      const stamp = (one) => (one && typeof one === 'object' && 'agentId' in one ? { ...one, agentId: '1', agentName: 'Designer' } : one);
      if (Array.isArray(json?.data?.chatSessions)) json.data.chatSessions = json.data.chatSessions.map(stamp);
      if (json?.data?.chatSession) json.data.chatSession = stamp(json.data.chatSession);
      return new Response(JSON.stringify(json), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (/\/api\/chats\/[^/]+\/stream/.test(address)) {
      return new Response(
        new ReadableStream({
          start(controller) {
            const send = (event, data) => controller.enqueue(encode.encode(frame(event, data)));
            window.setTimeout(() => send('call', { at: 0, tool: 'svg_draw', arguments: '{}' }), 100);
            window.setTimeout(() => send('called', { at: 0, result: 'drawn', failed: false }), 150);
            window.setTimeout(() => send('drew', { markdown: `![](${picture})` }), 200);
            window.__drawn.read = (text) => send('personRead', { text });
            window.__drawn.writing = () => send('writing', { tool: null, chars: 1520 });
            window.__drawn.release = () => {
              send('chunk', { text: 'Rebuilt as a wireframe.' });
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
}, PICTURE);

await page.goto(`${BASE}/chat`, { waitUntil: 'domcontentloaded' });
const composer = page.locator('#chat-composer');
await composer.waitFor({ state: 'visible', timeout: 20_000 });
await page.waitForTimeout(700);
await composer.click();
await page.keyboard.type('draw me a mockup of a sign-up form');
await page.keyboard.press('Enter');
await page.locator(`img[src*="${PICTURE}"]`).first().waitFor({ timeout: 10_000 }).catch(() => {});

// The person writes into the running turn, after the picture was drawn.
await composer.click();
await page.keyboard.type(SAID);
await page.keyboard.press('Enter');
await page.locator('[data-person-in-turn]').filter({ hasText: SAID }).first().waitFor({ timeout: 5_000 }).catch(() => {});
await page.evaluate((said) => window.__drawn.read?.(said), SAID);
await page.evaluate(() => window.__drawn.writing?.());
await page.waitForTimeout(400);

const placed = await page.evaluate(({ said, picture }) => {
  const pictures = [...document.querySelectorAll(`img[src*="${picture}"]`)];
  const person = [...document.querySelectorAll('[data-person-in-turn]')].find((one) => (one.textContent ?? '').includes(said));
  if (pictures.length === 0 || person === undefined) return { pictures: pictures.length, person: person !== undefined, above: null };
  // DOCUMENT_POSITION_FOLLOWING: the person's line comes after the picture.
  const above = pictures.every((one) => (one.compareDocumentPosition(person) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0);
  return { pictures: pictures.length, person: true, above };
}, { said: SAID, picture: PICTURE });
record(placed.pictures === 1, `the picture is drawn once during the turn (${JSON.stringify(placed)})`);
record(placed.above === true, `the picture drawn before the person wrote is above what they wrote, not under it (${JSON.stringify(placed)})`);

await page.evaluate(() => window.__drawn.release?.());
await page.getByText('Rebuilt as a wireframe.').first().waitFor({ timeout: 10_000 }).catch(() => {});
record((await page.getByText('Rebuilt as a wireframe.').count()) > 0, 'and the turn still finishes');

await finish(browser);
