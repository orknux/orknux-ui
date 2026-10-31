/**
 * The model's writing speed, right of the tokens under a chat.
 *
 * Read off what is drawn while a stream the page believes in arrives at a known
 * rate: an estimate marked ~ while it comes, changing as it comes, gone quiet
 * when the model stops, the provider's own figure once it is done, and nothing
 * at all for somebody who turned it off.
 */
import { BASE, open, record, finish } from './suite/harness.mjs';

const { browser, context, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

await context.addInitScript(() => {
  const real = window.fetch.bind(window);
  const encode = new TextEncoder();
  const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  window.__stream = {};
  window.fetch = async (input, init) => {
    const address = typeof input === 'string' ? input : input.url;
    if (/\/api\/chats\/[^/]+\/stream/.test(address)) {
      return new Response(new ReadableStream({
        start(controller) {
          const send = (event, data) => controller.enqueue(encode.encode(frame(event, data)));
          window.__stream.chunk = (text) => send('chunk', { text });
          window.__stream.reading = (processed) => send('reading', { total: 100000, cached: 0, processed });
          window.__stream.done = (extra) => {
            send('done', { millis: 1000, ...extra });
            controller.close();
          };
        },
      }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }
    if (/\/api\/chats\/[^/]+\/follow/.test(address)) {
      return new Response(encode.encode(frame('idle', {})), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }
    return real(input, init);
  };
});

const SET = 'mutation($s: Boolean!) { setChatSpeedShown(shown: $s) { chatSpeedShown } }';
const speed = page.locator('[data-chat-speed]');
const said = async () => (await speed.count()) === 0 ? null : (await speed.first().innerText()).trim();
const ask = async () => {
  await page.goto(`${BASE}/chat`, { waitUntil: 'domcontentloaded' });
  const composer = page.locator('#chat-composer');
  await composer.waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForTimeout(700);
  await composer.click();
  await page.keyboard.type('Go on.');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__stream.chunk !== undefined, null, { timeout: 10_000 });
};
/** 400 characters, so 100 tokens, every half second: 200 tokens a second. */
const pour = async (ticks, size = 400) => {
  for (let at = 0; at < ticks; at += 1) {
    await page.evaluate((text) => window.__stream.chunk(text), 'x'.repeat(size));
    await page.waitForTimeout(500);
  }
};

try {
  await ask();
  // 1,000 tokens of prompt every half second: 2,000 a second, counted rather than estimated.
  for (let at = 1; at <= 4; at += 1) {
    await page.evaluate((processed) => window.__stream.reading(processed), at * 1000);
    await page.waitForTimeout(500);
  }
  const reading = await page.locator('[data-chat-eval-speed]').first().innerText().catch(() => '');
  const readAt = Number(reading.replace(/[^0-9.]/g, ''));
  record(readAt > 1500 && readAt < 2500, `while the prompt is read its eval speed is near 2,000 (${reading})`);
  // Long enough to pass the moment the page attaches to the turn again, which used to wipe both.
  await pour(16);
  const held = await page.locator('[data-chat-eval-speed]').count();
  record(held === 1, 'the eval speed is still there well into the turn');
  const fast = await said();
  record(fast !== null && fast.startsWith('~') && fast.endsWith('t/s'), `while it arrives it is an estimate, marked ~ (${fast})`);
  const rate = Number(fast?.replace(/[^0-9.]/g, ''));
  record(rate > 100 && rate < 300, `and near the rate it is arriving at, 200 (${rate})`);
  await pour(8, 40);
  const slow = Number((await said())?.replace(/[^0-9.]/g, ''));
  record(slow < rate / 2, `it follows the model when it slows (${rate} then ${slow})`);
  await page.waitForTimeout(3_800);
  record((await said()) === null, 'and goes when the model has stopped');
  await pour(2);
  const line = await speed.first().evaluate((shown) => shown.parentElement.innerText);
  record(line.includes('decode speed'), `it says what it is (${line})`);
  const place = await page.evaluate(() => {
    const shown = document.querySelector('[data-chat-speed]');
    const before = shown?.previousElementSibling;
    return before ? shown.getBoundingClientRect().left >= before.getBoundingClientRect().right : null;
  });
  record(place !== false, `it is drawn right of the tokens where there are any (${place})`);
  await page.evaluate(() => window.__stream.done({ generatedPerSecond: 37.26, promptPerSecond: 1234.5 }));
  await page.waitForTimeout(1_200);
  record((await page.locator('[data-chat-eval-speed]').first().innerText().catch(() => '')) === '1,235 t/s', "when done the eval speed is the provider's own figure");
  const both = await speed.first().evaluate((shown) => shown.parentElement.innerText);
  record(both.includes('eval speed') && both.indexOf('eval speed') < both.indexOf('decode speed'), `eval is said before decode (${both})`);
  record((await said()) === '37 t/s', `when done it is the provider's own figure, with no ~ (${await said()})`);

  await graphql(SET, { s: false });
  await ask();
  await pour(4);
  record((await said()) === null, 'somebody who turned it off sees nothing');
  await page.evaluate(() => window.__stream.done({ generatedPerSecond: 37 }));
} finally {
  await graphql(SET, { s: true }).catch(() => undefined);
}
await finish(browser);
