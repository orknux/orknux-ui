/**
 * A message sent today carries its date, not only its clock.
 *
 * The date used to be drawn only for a line from another day, so today's
 * lines read "15:22" and the same chat read the next morning could not say
 * which day a line without one belonged to. The history is passed through
 * with a line sent now on its end; its time must name the month and the day.
 */
import { BASE, open, record, finish } from './suite/harness.mjs';

const SAID = 'A line sent a moment ago, for its date.';

const { browser, context, page } = await open({ viewport: { width: 1440, height: 1000 } });
await context.addInitScript(() => {
  const real = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const address = typeof input === 'string' ? input : input.url;
    if (/\/api\/chats\/[^/]+\/follow/.test(address)) {
      return new Response('event: idle\ndata: {}\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }
    return real(input, init);
  };
});

const now = new Date();
await page.route('**/graphql', async (route) => {
  const body = route.request().postData() ?? '';
  if (!body.includes('chatMessages(')) return route.continue();
  const response = await route.fetch().catch(() => null);
  if (response === null) return;
  const json = await response.json().catch(() => null);
  if (json?.data?.chatMessages && Array.isArray(json.data.chatMessages)) {
    json.data.chatMessages.push({ role: 'user', content: SAID, at: now.toISOString(), takes: [], thinking: null, thinkingMillis: null, actor: null, attachments: [] });
  }
  await route.fulfill({ response, json }).catch(() => {});
});

await page.goto(`${BASE}/chat`, { waitUntil: 'domcontentloaded' });
await page.getByText(SAID).first().waitFor({ timeout: 20_000 }).catch(() => {});
await page.waitForTimeout(500);

const drawn = await page.evaluate((said) => {
  const line = [...document.querySelectorAll('[class*="_sentAt_"]')].find((stamp) => {
    let up = stamp.parentElement;
    for (let depth = 0; up !== null && depth < 6; depth += 1, up = up.parentElement) {
      if ((up.textContent ?? '').includes(said)) return true;
    }
    return false;
  });
  return line?.textContent?.trim() ?? null;
}, SAID);

const day = String(now.getDate());
const month = now.toLocaleString([], { month: 'short' });
record(drawn !== null, `the line sent now is drawn with a time (${drawn})`);
record(
  drawn !== null && (drawn.includes(`${month} ${day}`) || drawn.includes(`${day} ${month}`)),
  `and the time names today's date, ${month} ${day} (${drawn})`,
);

await finish(browser);
