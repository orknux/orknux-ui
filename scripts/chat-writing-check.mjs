/**
 * While a model spells out a long tool call, the chat says it is writing it.
 *
 * A model putting a whole file into one call writes for minutes after its
 * thinking ends and before the call exists - 9,000 tokens at forty a second in
 * the case that prompted this - and the chat showed nothing moving in that
 * time. The server sends a `writing` frame about once a second; the page draws
 * a line naming the tool and how much has arrived, and drops it when the call
 * itself arrives.
 *
 * The stream is stubbed in the page, so this needs a chat page and nothing else.
 */
import { BASE, open, record, finish } from './suite/harness.mjs';

const { browser, context, page } = await open({ viewport: { width: 1440, height: 1000 } });

const ANSWER = 'Written, and here is the answer.';

await context.addInitScript((answer) => {
  const real = window.fetch.bind(window);
  const encode = new TextEncoder();
  const frame = (event, data) => `event: ${event}
data: ${JSON.stringify(data)}

`;
  window.__writing = { step: null };
  window.fetch = async (input, init) => {
    const address = typeof input === 'string' ? input : input.url;
    if (/\/api\/chats\/[^/]+\/stream/.test(address)) {
      return new Response(
        new ReadableStream({
          start(controller) {
            const send = (event, data) => controller.enqueue(encode.encode(frame(event, data)));
            send('writing', { tool: 'orkbox_write', chars: 1200 });
            /* The page is looked at between each step, which the check drives. */
            window.__writing.step = (which) => {
              if (which === 'grow') send('writing', { tool: 'orkbox_write', chars: 12345 });
              if (which === 'call') {
                send('call', { at: 0, tool: 'orkbox_write', arguments: '{}' });
                send('called', { at: 0, result: 'written', failed: false });
              }
              if (which === 'answer') {
                send('writing', { tool: null, chars: 40 });
              }
              if (which === 'done') {
                send('chunk', { text: answer });
                send('done', { millis: 1000 });
                controller.close();
              }
            };
          },
        }),
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
      );
    }
    /* Nothing else is being written on this chat: a real turn running on it would draw lines of its own. */
    if (/\/api\/chats\/[^/]+\/follow/.test(address)) {
      return new Response(encode.encode(frame('idle', {})), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }
    return real(input, init);
  };
}, ANSWER);

await page.goto(`${BASE}/chat`, { waitUntil: 'domcontentloaded' });
const composer = page.locator('#chat-composer');
await composer.waitFor({ state: 'visible', timeout: 20_000 });
await page.waitForTimeout(700);
await composer.click();
await page.keyboard.type('Write the whole page into the box.');
await page.keyboard.press('Enter');

const line = page.locator('[data-chat-writing]');
const text = async () => ((await line.first().innerText().catch(() => '')) ?? '').trim();

await line.first().waitFor({ timeout: 10_000 }).catch(() => {});
const first = await text();
record(first === 'Writing orkbox_write… 1,200 chars (~300 tokens)', `while the call is spelled out, the chat says so (${first})`);
const padding = await line.first().evaluate((one) => {
  const style = getComputedStyle(one);
  return Math.min(parseFloat(style.paddingTop), parseFloat(style.paddingLeft));
}).catch(() => 0);
record(padding >= 8, `as a small card with room inside it (padding ${padding})`);

await page.evaluate(() => window.__writing.step?.('grow'));
await page.waitForTimeout(400);
const grown = await text();
record(grown === 'Writing orkbox_write… 12,345 chars (~3,086 tokens)', `and the count moves as it grows (${grown})`);

await page.evaluate(() => window.__writing.step?.('call'));
await page.waitForTimeout(400);
record((await line.count()) === 0, 'the line goes when the call itself arrives');

await page.evaluate(() => window.__writing.step?.('answer'));
await page.waitForTimeout(400);
const answering = await text();
record(answering === 'Writing the answer… 40 chars (~10 tokens)', `an answer being written says that instead (${answering})`);

await page.evaluate(() => window.__writing.step?.('done'));
await page.getByText(ANSWER).first().waitFor({ timeout: 10_000 }).catch(() => {});
/*
 * Over once Stop is gone. Not once Send is offered again: in a chat with an
 * agent Send stays live through the turn, for writing into it.
 */
const stop = page.locator('form:has(#chat-composer) button', { hasText: 'Stop' });
for (let poll = 0; poll < 100 && (await stop.count()) > 0; poll += 1) await page.waitForTimeout(100);
record((await line.count()) === 0, 'and nothing says it is writing once the turn is over');

await finish(browser);
