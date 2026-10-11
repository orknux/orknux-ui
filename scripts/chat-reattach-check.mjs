/**
 * A chat's stream that ends before its turn does is picked up again, and the
 * answer is drawn once.
 *
 * The bug: a model thought for 637 seconds in one round, the container closed
 * the answer's stream at its async timeout of 330, and the page saw the stream
 * end with no `done` and no answer. Nothing was red, nothing moved again, and
 * the answer appeared only when somebody reloaded. The server no longer cuts a
 * chat's stream on that timeout, but a proxy or a network can still end one,
 * so the page now re-attaches with `/follow` - which replays the answer in
 * flight from its first frame - and must skip what it already drew.
 *
 * **The streams are this check's own.** What is being tested is a stream that
 * ends early, and no real model can be told to be cut off at a known frame. So
 * `fetch` is replaced for the chat's stream - which sends a thought and one
 * finished lookup, then closes with no `done` - and, once that has been sent,
 * for the plain `/follow` - which replays those frames, a second lookup, the
 * answer and `done`. A follow before the send, and the page's waiting follow
 * (`?wait=true`), go to the real server.
 *
 * Asserted on what is drawn: two lookup lines, not three (the first is not drawn
 * twice) and not one (the replay's own was drawn), the answer exactly once, and
 * the button back to Send.
 */
import { BASE, open, record, finish } from './suite/harness.mjs';

const { browser, context, page } = await open({ viewport: { width: 1440, height: 1000 } });

const ANSWER = 'The answer that came after the stream was cut.';

await context.addInitScript((answer) => {
  const real = window.fetch.bind(window);
  const encode = new TextEncoder();
  const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const before = [
    frame('thinking', { text: 'Thinking for a long time. ' }),
    frame('call', { at: 0, tool: 'first_lookup', arguments: '{}' }),
    frame('called', { at: 0, result: 'first result', failed: false }),
  ];
  const after = [
    frame('call', { at: 1, tool: 'second_lookup', arguments: '{}' }),
    frame('called', { at: 1, result: 'second result', failed: false }),
    frame('chunk', { text: answer }),
    frame('done', { millis: 1000 }),
  ];
  window.__reattach = { sent: false, follows: 0 };
  /** A response that sends these frames a little apart, and then ends. */
  const stream = (frames) =>
    new Response(
      new ReadableStream({
        start(controller) {
          frames.forEach((one, at) => window.setTimeout(() => controller.enqueue(encode.encode(one)), 150 * (at + 1)));
          window.setTimeout(() => controller.close(), 150 * (frames.length + 1));
        },
      }),
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
    );
  window.fetch = async (input, init) => {
    const address = typeof input === 'string' ? input : input.url;
    if (/\/api\/chats\/[^/]+\/stream/.test(address)) {
      window.__reattach.sent = true;
      // Cut: the turn goes on, and this stream says nothing more about it.
      return stream(before);
    }
    if (/\/api\/chats\/[^/]+\/follow$/.test(address) && window.__reattach.sent) {
      window.__reattach.follows += 1;
      return stream([frame('following', {}), ...before, ...after]);
    }
    return real(input, init);
  };
}, ANSWER);

await page.goto(`${BASE}/chat`, { waitUntil: 'domcontentloaded' });
const composer = page.locator('#chat-composer');
await composer.waitFor({ state: 'visible', timeout: 20_000 });
await page.waitForTimeout(700);

await composer.click();
await page.keyboard.type('Take as long as you need.');
await page.keyboard.press('Enter');

const button = page.locator('form:has(#chat-composer) button[type="submit"]');
let drawn = null;
for (let poll = 0; poll < 100; poll += 1) {
  drawn = await page.evaluate((answer) => {
    const text = document.body.innerText;
    return {
      answers: text.split(answer).length - 1,
      follows: window.__reattach.follows,
    };
  }, ANSWER);
  if (drawn.answers > 0 && ((await button.textContent()) ?? '').trim() === 'Send') break;
  await page.waitForTimeout(100);
}
await page.waitForTimeout(500);
drawn = await page.evaluate((answer) => {
  // This turn's lines only: the chat the page opened has lookups of its own.
  const lines = [...document.querySelectorAll('[data-testid="call-line"]')];
  const ours = (pattern) => lines.filter((line) => pattern.test(line.textContent ?? ''));
  return {
    answers: document.body.innerText.split(answer).length - 1,
    first: ours(/first_lookup|first result/).length,
    second: ours(/second_lookup|second result/).length,
    running: ours(/(first|second)_lookup|(first|second) result/).filter((line) => line.dataset.running === 'true').length,
    follows: window.__reattach.follows,
  };
}, ANSWER);

record(drawn.follows >= 1, `the page picked the turn up again after its stream ended (${drawn.follows} follow)`);
record(drawn.answers === 1, `the answer is drawn once (${drawn.answers} times)`);
record(
  drawn.first === 1 && drawn.second === 1 && drawn.running === 0,
  `both lookups are drawn once and finished (the first ${drawn.first} times, the second ${drawn.second}, ` +
    `${drawn.running} still running)`,
);
const label = ((await button.textContent()) ?? '').trim();
record(label === 'Send', `and the button is Send again (it says "${label}")`);

await finish(browser);
