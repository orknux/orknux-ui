/**
 * An answer's "Thought for" is its own turn's time.
 *
 * The time was kept beside the page and drawn under whichever answer was last,
 * so the next turn's answer read "Thought for 46 seconds" - the previous one's
 * - while it was still being written, and changed when its own arrived. Two
 * stubbed turns: the second must show no time until it is done, then its own.
 */
import { BASE, open, record, finish } from './suite/harness.mjs';

const { browser, context, page } = await open({ viewport: { width: 1440, height: 1000 } });
await context.addInitScript(() => {
  const real = window.fetch.bind(window);
  const encode = new TextEncoder();
  const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  window.__turns = { count: 0, finish: null };
  window.fetch = async (input, init) => {
    const address = typeof input === 'string' ? input : input.url;
    if (/\/api\/chats\/[^/]+\/follow/.test(address)) {
      return new Response(frame('idle', {}), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }
    if (/\/api\/chats\/[^/]+\/stream/.test(address)) {
      window.__turns.count += 1;
      const turn = window.__turns.count;
      return new Response(
        new ReadableStream({
          start(controller) {
            const send = (event, data) => controller.enqueue(encode.encode(frame(event, data)));
            const end = (text, millis) => {
              send('chunk', { text });
              send('done', { millis });
              controller.close();
            };
            if (turn === 1) window.setTimeout(() => end('First answer.', 46000), 200);
            else window.__turns.finish = () => end('Second answer.', 23000);
          },
        }),
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
      );
    }
    return real(input, init);
  };
});

await page.goto(`${BASE}/chat`, { waitUntil: 'domcontentloaded' });
const composer = page.locator('#chat-composer');
await composer.waitFor({ state: 'visible', timeout: 20_000 });
await page.waitForTimeout(700);
const ask = async (text) => {
  await composer.click();
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
};
const times = () => page.evaluate(() => [...document.querySelectorAll('button')].map((one) => one.textContent ?? '').filter((text) => text.startsWith('Thought for')));

await ask('First question.');
await page.getByText('First answer.').first().waitFor({ timeout: 10_000 }).catch(() => {});
await page.waitForTimeout(300);
const afterFirst = await times();
record(afterFirst.some((one) => one.includes('46 seconds')), `the first answer shows its own time (${JSON.stringify(afterFirst)})`);

await ask('Second question.');
await page.waitForTimeout(800);
const during = await times();
record(during.every((one) => !one.includes('46 seconds')), `while the second is written it shows no earlier turn's time (${JSON.stringify(during)})`);

await page.evaluate(() => window.__turns.finish?.());
await page.getByText('Second answer.').first().waitFor({ timeout: 10_000 }).catch(() => {});
await page.waitForTimeout(300);
const done = await times();
record(done.some((one) => one.includes('23 seconds')), `and once done, its own (${JSON.stringify(done)})`);

await finish(browser);
