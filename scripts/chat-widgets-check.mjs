/**
 * The widgets an agent keeps in a chat - a timer, a stopwatch - are drawn
 * above the composer, tick on the page, answer the person's buttons, and
 * arrive mid-turn without a reload.
 *
 * The server is stubbed in the page: the chat's widgets are held here, the
 * mutations change them, and a turn's stream sends a `widgets` frame part way
 * through. What is measured is what the page draws - the digits counting down
 * over two seconds, standing still once paused, the card gone once removed.
 */
import { BASE, open, record, finish } from './suite/harness.mjs';

const { browser, context, page } = await open({ viewport: { width: 1440, height: 1000 } });

await context.addInitScript(() => {
  const real = window.fetch.bind(window);
  const encode = new TextEncoder();
  const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const now = () => new Date().toISOString();
  const timer = () => ({
    id: '701', kind: 'TIMER', label: 'Tea', createdBy: 'Reviewer', running: true, done: false, asOf: now(),
    durationSeconds: 180, endsAt: new Date(Date.now() + 120_000).toISOString(), remainingSeconds: 120, wake: true,
    startedAt: null, accumulatedMillis: null, elapsedMillis: null, laps: null,
  });
  window.__widgets = { held: [timer()], acted: [], removed: [], release: null };
  const json = (data) => new Response(JSON.stringify({ data }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  window.fetch = async (input, init) => {
    const address = typeof input === 'string' ? input : input.url;
    const body = typeof init?.body === 'string' ? init.body : '';
    if (address.includes('/graphql') && body.includes('chatWidgets(')) return json({ chatWidgets: window.__widgets.held });
    if (address.includes('/graphql') && body.includes('actOnChatWidget(')) {
      const { id, action } = JSON.parse(body).variables;
      window.__widgets.acted.push(action);
      const one = window.__widgets.held.find((w) => w.id === id);
      if (action === 'pause' && one) {
        const left = Math.ceil((Date.parse(one.endsAt) - Date.now()) / 1000);
        Object.assign(one, { running: false, endsAt: null, remainingSeconds: left, asOf: now() });
      }
      return json({ actOnChatWidget: one });
    }
    if (address.includes('/graphql') && body.includes('removeChatWidget(')) {
      const { id } = JSON.parse(body).variables;
      window.__widgets.removed.push(id);
      window.__widgets.held = window.__widgets.held.filter((w) => w.id !== id);
      return json({ removeChatWidget: true });
    }
    if (/\/api\/chats\/[^/]+\/follow/.test(address)) {
      return new Response(frame('idle', {}), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }
    if (/\/api\/chats\/[^/]+\/stream/.test(address)) {
      return new Response(
        new ReadableStream({
          start(controller) {
            const send = (event, data) => controller.enqueue(encode.encode(frame(event, data)));
            window.setTimeout(() => {
              const watch = {
                id: '702', kind: 'STOPWATCH', label: 'Build', createdBy: 'Reviewer', running: true, done: false, asOf: now(),
                durationSeconds: null, endsAt: null, remainingSeconds: null, wake: null,
                startedAt: now(), accumulatedMillis: 0, elapsedMillis: 0, laps: [],
              };
              window.__widgets.held = [...window.__widgets.held, watch];
              send('widgets', { widgets: window.__widgets.held });
            }, 200);
            window.__widgets.release = () => {
              send('chunk', { text: 'Started a stopwatch for the build.' });
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
});

await page.goto(`${BASE}/chat`, { waitUntil: 'domcontentloaded' });
const composer = page.locator('#chat-composer');
await composer.waitFor({ state: 'visible', timeout: 20_000 });
const row = page.locator('[data-chat-widgets]');
await row.waitFor({ timeout: 10_000 }).catch(() => {});

/* Above the composer. */
const placed = await page.evaluate(() => {
  const widgets = document.querySelector('[data-chat-widgets]')?.getBoundingClientRect();
  const box = document.querySelector('#chat-composer')?.closest('form')?.getBoundingClientRect();
  return widgets && box ? { widgetsBottom: Math.round(widgets.bottom), composerTop: Math.round(box.top) } : null;
});
record(placed !== null && placed.widgetsBottom <= placed.composerTop, `the widgets are drawn above the composer (${JSON.stringify(placed)})`);

/* A running timer counts down on the page, with no request each second. */
const digits = (id) => page.locator(`[data-chat-widget="${id}"] [data-widget-digits]`).innerText().catch(() => '');
const seconds = (shown) => shown.split(':').reduce((sum, part) => sum * 60 + Number(part), 0);
const before = await digits('701');
await page.waitForTimeout(2_200);
const after = await digits('701');
record(seconds(before) - seconds(after) >= 2, `a running timer counts down (${before} then ${after})`);

/* Paused, it stands still. */
await page.locator('[data-chat-widget="701"] button[aria-label="Pause"]').click();
await page.waitForTimeout(400);
const paused = await digits('701');
await page.waitForTimeout(1_500);
const still = await digits('701');
const acted = await page.evaluate(() => window.__widgets.acted);
record(acted.includes('pause') && paused === still, `pressing pause asks the server and the timer stands still (${paused} then ${still})`);

/* Mid-turn, a widgets frame adds the agent's stopwatch without a reload. */
await composer.click();
await page.keyboard.type('Time the build.');
await page.keyboard.press('Enter');
await page.locator('[data-chat-widget="702"]').waitFor({ timeout: 5_000 }).catch(() => {});
record((await page.locator('[data-chat-widget="702"]').count()) === 1, 'a widget the agent adds mid-turn appears at once');
await page.evaluate(() => window.__widgets.release?.());
await page.waitForTimeout(600);

/* Removed, it is gone. */
await page.locator('[data-chat-widget="701"] button[aria-label="Remove"]').click();
await page.waitForTimeout(500);
const removed = await page.evaluate(() => window.__widgets.removed);
record(removed.includes('701') && (await page.locator('[data-chat-widget="701"]').count()) === 0, `pressing remove takes it away (${JSON.stringify(removed)})`);

await finish(browser);
