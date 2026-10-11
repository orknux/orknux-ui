/**
 * What an agent writes beside its calls is drawn as it happens, in order.
 *
 * An agent on a long piece of work keeps somebody posted the way a colleague
 * does - "Let me read the tests next" - and writes it beside the call it is
 * about to make. The session kept those lines, so a reload showed them, but the
 * open chat was never told: it drew a thinking block and a column of lookups,
 * and the agent's own account of what it was doing waited for a refresh.
 *
 * The stream is stubbed in the page, so this needs a chat page and nothing
 * else: a `said` frame between two calls must be drawn between them, before
 * the answer arrives.
 */
import { BASE, open, record, finish } from './suite/harness.mjs';

const { browser, context, page } = await open({ viewport: { width: 1440, height: 1000 } });

const PROGRESS = 'Found the config loader; reading its tests next.';
const ANSWER = 'All read, and here is the answer.';

await context.addInitScript(([progress, answer]) => {
  const real = window.fetch.bind(window);
  const encode = new TextEncoder();
  const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const frames = [
    frame('call', { at: 0, tool: 'progress_first', arguments: '{}' }),
    frame('called', { at: 0, result: 'first result', failed: false }),
    frame('said', { text: progress }),
    frame('call', { at: 1, tool: 'progress_second', arguments: '{}' }),
    frame('called', { at: 1, result: 'second result', failed: false }),
  ];
  /* The answer waits until the page has been looked at mid-turn. */
  window.__progress = { release: null };
  window.fetch = async (input, init) => {
    const address = typeof input === 'string' ? input : input.url;
    if (/\/api\/chats\/[^/]+\/stream/.test(address)) {
      return new Response(
        new ReadableStream({
          start(controller) {
            frames.forEach((one, at) => window.setTimeout(() => controller.enqueue(encode.encode(one)), 100 * (at + 1)));
            window.__progress.release = () => {
              controller.enqueue(encode.encode(frame('chunk', { text: answer })));
              controller.enqueue(encode.encode(frame('done', { millis: 1000 })));
              controller.close();
            };
          },
        }),
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
      );
    }
    return real(input, init);
  };
}, [PROGRESS, ANSWER]);

await page.goto(`${BASE}/chat`, { waitUntil: 'domcontentloaded' });
const composer = page.locator('#chat-composer');
await composer.waitFor({ state: 'visible', timeout: 20_000 });
await page.waitForTimeout(700);
await composer.click();
await page.keyboard.type('Read the whole project, please.');
await page.keyboard.press('Enter');

await page.locator('[data-said]').filter({ hasText: PROGRESS }).waitFor({ timeout: 10_000 }).catch(() => {});
await page.waitForTimeout(600);

const order = () =>
  page.evaluate((progress) => {
    const wanted = [...document.querySelectorAll('[data-said], [data-testid="call-line"]')].filter((one) =>
      /progress_first|progress_second/.test(one.textContent ?? '') || (one.textContent ?? '').includes(progress),
    );
    return wanted.map((one) =>
      one.hasAttribute('data-said') ? 'said' : /progress_first/.test(one.textContent ?? '') ? 'first' : 'second',
    );
  }, PROGRESS);

const during = await order();
record(
  JSON.stringify(during) === JSON.stringify(['first', 'said', 'second']),
  `while the turn runs, the progress line is drawn between the calls it came between (${JSON.stringify(during)})`,
);
const answered = await page.evaluate((answer) => document.body.innerText.includes(answer), ANSWER);
record(!answered, 'and it is drawn before the answer exists');

await page.evaluate(() => window.__progress.release?.());
await page.getByText(ANSWER).first().waitFor({ timeout: 10_000 }).catch(() => {});
await page.waitForTimeout(400);
const after = await order();
record(
  JSON.stringify(after) === JSON.stringify(['first', 'said', 'second']),
  `and it stays where it was once the answer lands (${JSON.stringify(after)})`,
);

await finish(browser);
