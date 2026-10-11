/**
 * While a llama.cpp server reads a long prompt, the chat and the session page say so.
 *
 * A session whose cached prefix no longer matched was read for minutes - 208k
 * tokens - before a word was written, and only the server's own log showed it
 * working. A llama.cpp provider now reports how far it has read, and both pages
 * draw it in the card that says what is being written. Issue #627.
 *
 * Both halves are stubbed: the chat's stream with `reading` frames, and the
 * session page's live state, because no real server can be made to read a
 * prompt slowly on cue.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, context, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const ANSWER = 'Read it, and here is the answer.';

await context.addInitScript((answer) => {
  const real = window.fetch.bind(window);
  const encode = new TextEncoder();
  const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  window.__reading = { step: null };
  window.fetch = async (input, init) => {
    const address = typeof input === 'string' ? input : input.url;
    if (/\/api\/chats\/[^/]+\/stream/.test(address)) {
      return new Response(
        new ReadableStream({
          start(controller) {
            const send = (event, data) => controller.enqueue(encode.encode(frame(event, data)));
            send('reading', { total: 208324, cached: 38000, processed: 42610 });
            window.__reading.step = (which) => {
              if (which === 'grow') send('reading', { total: 208324, cached: 38000, processed: 104162 });
              if (which === 'write') send('writing', { tool: null, chars: 40 });
              if (which === 'think') send('thinking', { text: 'Weighing the answer.' });
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
    if (/\/api\/chats\/[^/]+\/follow/.test(address)) {
      return new Response(encode.encode(frame('idle', {})), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }
    return real(input, init);
  };
}, ANSWER);

/* ---------------------------------------------------------------- the chat */

await page.goto(`${BASE}/chat`, { waitUntil: 'domcontentloaded' });
const composer = page.locator('#chat-composer');
await composer.waitFor({ state: 'visible', timeout: 20_000 });
await page.waitForTimeout(700);
await composer.click();
await page.keyboard.type('Carry on with the review.');
await page.keyboard.press('Enter');

const line = page.locator('[data-chat-writing]');
const text = async () => ((await line.first().innerText().catch(() => '')) ?? '').trim();
await line.first().waitFor({ timeout: 10_000 }).catch(() => {});

const first = await text();
record(
  first.startsWith('Reading the prompt…') && first.includes('42,610 / 208,324 tokens · 38,000 cached'),
  `while the server reads the prompt, the chat says how far (${first})`,
);
/* The percentage stands apart, at the right end of the card. */
const shareAt = async (card) =>
  card.evaluate((box) => {
    const share = box.querySelector('[data-reading-share]');
    if (share === null) return null;
    const outer = box.getBoundingClientRect();
    const inner = share.getBoundingClientRect();
    // The lead - "Reading the prompt…" - is in the share's ink; the counts, on their own line below, are not.
    const label = box.querySelector('[data-reading-lead]');
    const counts = box.querySelector('[data-reading-details]');
    return {
      text: share.textContent?.trim(),
      rightGap: Math.round(outer.right - inner.right),
      leftOfCentre: inner.left < outer.left + outer.width / 2,
      countsBelow: label !== null && counts !== null && counts.getBoundingClientRect().top >= label.getBoundingClientRect().bottom - 1,
      sameInk:
        label !== null &&
        counts !== null &&
        getComputedStyle(label).color === getComputedStyle(share).color &&
        getComputedStyle(counts).color !== getComputedStyle(share).color,
    };
  });
const chatShare = await shareAt(line.first()).catch(() => null);
record(
  chatShare !== null && chatShare.text === '20%' && chatShare.rightGap <= 16 && !chatShare.leftOfCentre && chatShare.sameInk && chatShare.countsBelow,
  `and the percentage sits at the right of the card (${JSON.stringify(chatShare)})`,
);
await page.evaluate(() => window.__reading.step?.('grow'));
await page.waitForTimeout(400);
const grown = await text();
record(grown.includes('104,162 / 208,324 tokens') && grown.includes('50%'), `and the count moves (${grown.replace(/\s+/g, ' ')})`);
/* Thinking means the prompt has been read: the reading card goes. It stayed up through a voice turn's thinking. */
await page.evaluate(() => window.__reading.step?.('think'));
await page.waitForTimeout(400);
const thinking = await text();
record(!thinking.startsWith('Reading the prompt'), `once the model thinks, the reading card is gone (${thinking.replace(/\s+/g, ' ') || 'nothing'})`);
await page.evaluate(() => window.__reading.step?.('write'));
await page.waitForTimeout(400);
const writing = await text();
record(writing.startsWith('Writing the answer…'), `once the model writes, the card says that instead (${writing})`);
await page.evaluate(() => window.__reading.step?.('done'));
await page.getByText(ANSWER).first().waitFor({ timeout: 10_000 }).catch(() => {});

/* -------------------------------------------------------- the session page */

const SESSION = '424243';
const AT = new Date().toISOString();
await page.route('**/graphql', async (route) => {
  const body = route.request().postData() ?? '';
  const json = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
  if (body.includes('llmSessionWriting')) {
    return json({
      llmSessionWriting: {
        agent: 'Support responder', tool: null, chars: 0, since: AT,
        promptTotal: 208324, promptCached: 38000, promptProcessed: 42610,
      },
    });
  }
  if (body.includes('llmSessionEvents')) return json({ llmSessionEvents: { totalElements: 0, totalPages: 1, content: [] } });
  if (body.includes('llmSession(')) {
    return json({
      llmSession: { id: SESSION, key: 'zz-reading', keyPrefix: 'zz', workspaceId: WORKSPACE, eventCount: 0, createdAt: AT, lastEventAt: AT },
    });
  }
  return route.continue();
});
await page.goto(`${BASE}/workspace/${WORKSPACE}/sessions/${SESSION}`, { waitUntil: 'domcontentloaded' });
const card = page.locator('[data-session-writing]');
await card.first().waitFor({ timeout: 15_000 }).catch(() => {});
const said = ((await card.first().innerText().catch(() => '')) ?? '').trim();
record(
  said.startsWith('READING') && said.includes('Reading the prompt…') && said.includes('42,610 / 208,324 tokens · 38,000 cached'),
  `the session page says the same while it reads (${said.replace(/\s+/g, ' ')})`,
);
const sessionShare = await shareAt(card.first()).catch(() => null);
record(
  sessionShare !== null && sessionShare.text === '20%' && sessionShare.rightGap <= 24 && !sessionShare.leftOfCentre && sessionShare.sameInk && sessionShare.countsBelow,
  `with its percentage at the right too (${JSON.stringify(sessionShare)})`,
);

/* --------------------------------------------------- the chat's running total */

/*
 * What the provider reused from its cache is said beside the total. Every round
 * sends the whole conversation, so a long session's input read as 16 million
 * tokens a local server had mostly never read again.
 */
await page.unroute('**/graphql');
await graphql(`mutation { setChatCostShown(shown: true) { chatCostShown } }`).catch(() => null);
const stamp = (one) =>
  one && typeof one === 'object' && 'spentInputTokens' in one
    ? { ...one, spentInputTokens: 16471429, spentOutputTokens: 0, spentCachedInputTokens: 15900000, spentPictures: 0 }
    : one;
await page.route('**/graphql', async (route) => {
  const body = route.request().postData() ?? '';
  if (!body.includes('chatSessions(') && !body.includes('chatSession(')) return route.continue();
  const response = await route.fetch().catch(() => null);
  if (response === null) return;
  const json = await response.json().catch(() => null);
  if (json === null) return route.fulfill({ response }).catch(() => {});
  if (Array.isArray(json?.data?.chatSessions)) json.data.chatSessions = json.data.chatSessions.map(stamp);
  if (json?.data?.chatSession) json.data.chatSession = stamp(json.data.chatSession);
  await route.fulfill({ response, json }).catch(() => {});
});
await page.goto(`${BASE}/chat`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.querySelector('[class*="_spent"]') !== null, null, { timeout: 15_000 }).catch(() => {});
const total = await page.evaluate(() => (document.querySelector('[class*="_spent"]')?.textContent ?? '').trim());
record(total.includes('16,471,429 tokens (15,900,000 cached)'), `the chat's total says how much of it was cached (${total})`);
await graphql(`mutation { setChatCostShown(shown: false) { chatCostShown } }`).catch(() => null);

await finish(browser);
