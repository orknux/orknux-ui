/**
 * A question an agent put to the person: its buttons, its outcome, and where it
 * is drawn.
 *
 * The first kind is a port an agent asked to expose - nothing opens until
 * somebody presses Allow - but the card is drawn from the request's own
 * options, so what is asserted is that: the buttons are the options, pressing
 * one sends that option, and the outcome replaces the buttons. A request
 * settled somewhere else, on the session page, shows that outcome too.
 *
 * And where it goes, which went wrong twice. An answered request was pinned
 * under the newest line for ever; then one asked during a turn was drawn above
 * the whole answer, between the person's message and the calls that led to it.
 * So:
 *   - an open request is the last thing in the chat, above the composer, so it
 *     cannot be scrolled past while the turn goes on;
 *   - answered, it goes back to when it was asked - between the call before it
 *     and the call after it, both in a history read back and among the calls of
 *     a turn still running;
 *   - and it keeps to the message column rather than the whole width.
 *
 * Stubbed in the page: the chat is a real one, given a session to hold the
 * requests, and its history, its requests and one turn's stream are answered
 * here - no model has to ask anything.
 */
import { BASE, open, record, finish } from './suite/harness.mjs';

const { browser, context, page } = await open({ viewport: { width: 1440, height: 1000 } });

const at = (secondsAgo) => new Date(Date.now() - secondsAgo * 1000).toISOString();
const STUB = {
  // A history read back: a question, two calls, and the answer - every line dated.
  messages: [
    { role: 'user', content: 'Expose me a running instance.', actor: null, takes: [], thinking: null, thinkingMillis: null, at: at(300) },
    { role: 'tool', content: '{"command":"start"}', actor: 'orkbox_exec', takes: [], thinking: null, thinkingMillis: null, at: at(280) },
    { role: 'tool', content: '{"session":7}', actor: 'orkbox_ports', takes: [], thinking: null, thinkingMillis: null, at: at(200) },
    { role: 'assistant', content: 'The port is open; here is what I found after it.', actor: null, takes: [], thinking: null, thinkingMillis: null, at: at(150) },
  ],
  requests: [
    // Settled on the session page, asked between the two calls.
    {
      id: '52', kind: 'box.port', askedBy: 'Builder', question: 'Builder wants to expose port 8080 of box session 7 on remote',
      options: [{ id: 'allow', label: 'Allow', style: 'primary' }, { id: 'reject', label: 'Reject', style: 'danger' }],
      chosen: 'settled', chosenBy: 'alice', chosenAt: at(240), outcome: 'Disabled', createdAt: at(250),
    },
    // Still open, and also asked between them.
    {
      id: '51', kind: 'box.port', askedBy: 'Builder', question: 'Builder wants to expose port 3000 of box session 7 on remote: the dev UI',
      options: [{ id: 'allow', label: 'Allow', style: 'primary' }, { id: 'reject', label: 'Reject', style: 'danger' }],
      chosen: null, chosenBy: null, chosenAt: null, outcome: null, createdAt: at(240),
    },
  ],
};

await context.addInitScript((stub) => {
  const real = window.fetch.bind(window);
  const encode = new TextEncoder();
  const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const json = (data) => new Response(JSON.stringify({ data }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  window.__stub = { ...stub, sent: [], release: null };
  window.fetch = async (input, init) => {
    const address = typeof input === 'string' ? input : input.url;
    const body = typeof init?.body === 'string' ? init.body : '';
    if (address.endsWith('/graphql') && body !== '') {
      if (body.includes('answerRequest(')) {
        const variables = JSON.parse(body).variables ?? {};
        window.__stub.sent.push(variables);
        window.__stub.requests = window.__stub.requests.map((one) =>
          one.id === variables.id
            ? { ...one, chosen: variables.option, chosenBy: 'alice', chosenAt: new Date().toISOString(), outcome: 'Allowed - http://localhost:49153/' }
            : one,
        );
        return json({ answerRequest: window.__stub.requests.find((one) => one.id === variables.id) });
      }
      if (body.includes('chatMessages(')) return json({ chatMessages: window.__stub.messages });
      if (body.includes('sessionRequests(')) return json({ sessionRequests: window.__stub.requests });
      if (body.includes('chatSessions(')) {
        // A real chat, given a session to hold the requests in.
        const answer = await real(input, init);
        const held = await answer.json();
        for (const chat of held?.data?.chatSessions ?? []) chat.llmSessionId = '9100';
        return new Response(JSON.stringify(held), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
    }
    /*
     * One turn: a call, a question asked while it runs, another call - a second
     * apart, so the question falls between them - and then nothing until the
     * check has looked, and only then the answer.
     */
    // Nothing is running on this chat as far as the page knows: the real one may well be answering somebody.
    if (/\/api\/chats\/[^/]+\/follow/.test(address)) {
      return new Response(frame('idle', {}), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }
    if (/\/api\/chats\/[^/]+\/stream/.test(address)) {
      return new Response(
        new ReadableStream({
          start(controller) {
            const send = (event, data) => controller.enqueue(encode.encode(frame(event, data)));
            window.setTimeout(() => {
              send('call', { at: 0, tool: 'orkbox_exec', arguments: '{"command":"npm run dev"}' });
              send('called', { at: 0, result: '{"exitCode":0}', failed: false });
            }, 150);
            window.setTimeout(() => {
              window.__stub.requests = [
                ...window.__stub.requests,
                {
                  id: '53', kind: 'box.port', askedBy: 'Builder', question: 'Builder wants to expose port 5173 of box session 7 on remote: live',
                  options: [{ id: 'allow', label: 'Allow', style: 'primary' }, { id: 'reject', label: 'Reject', style: 'danger' }],
                  chosen: null, chosenBy: null, chosenAt: null, outcome: null, createdAt: new Date().toISOString(),
                },
              ];
            }, 700);
            window.setTimeout(() => {
              send('call', { at: 1, tool: 'orkbox_ports', arguments: '{"session":7}' });
              send('called', { at: 1, result: '[]', failed: false });
            }, 1900);
            window.__stub.release = () => {
              send('chunk', { text: 'Both calls are done.' });
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
}, STUB);

const top = (selector) =>
  page.evaluate((one) => {
    const element = typeof one === 'string' ? document.querySelector(one) : null;
    return element === null ? null : Math.round(element.getBoundingClientRect().top);
  }, selector);
/** The top of the chat line (call or text) whose text holds this. */
const lineTop = (text) =>
  page.evaluate((wanted) => {
    const lines = [...document.querySelectorAll('[data-testid="call-line"], p, li')].filter((one) =>
      (one.textContent ?? '').includes(wanted),
    );
    const last = lines.at(-1);
    return last === undefined ? null : Math.round(last.getBoundingClientRect().top);
  }, text);

await page.goto(`${BASE}/chat`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-interaction="51"]', { timeout: 20_000 }).catch(() => {});

/* ---------------------------------------------------------- the card itself */

const card = await page.evaluate(() => {
  const one = document.querySelector('[data-interaction="51"]');
  return one === null
    ? null
    : {
        question: one.querySelector('p')?.textContent ?? '',
        options: [...one.querySelectorAll('[data-interaction-option]')].map((button) => button.textContent?.trim()),
      };
});
record(card !== null && card.question.includes('wants to expose port 3000'), `the question is drawn in the chat (${card?.question})`);
record(card?.options.join('/') === 'Allow/Reject', `with a button per option (${card?.options?.join('/')})`);
const settled = (await page.locator('[data-interaction="52"] [data-interaction-outcome]').innerText().catch(() => '')).trim();
record(
  settled.startsWith('Disabled') && (await page.locator('[data-interaction="52"] [data-interaction-option]').count()) === 0,
  `one settled on the session page shows that outcome and no buttons (${settled})`,
);

/* ---------------------------------------------- a history read back: placement */

const read = {
  first: await lineTop('orkbox_exec'),
  second: await lineTop('orkbox_ports'),
  answer: await lineTop('here is what I found after it'),
  answered: await top('[data-interaction="52"]'),
  open: await top('[data-interaction="51"]'),
};
record(
  read.first !== null && read.second !== null && read.answered !== null && read.first < read.answered && read.answered < read.second,
  `read back, an answered request sits between the call before it and the call after it (${JSON.stringify(read)})`,
);
record(
  read.open !== null && read.answer !== null && read.open > read.answer,
  `an open one is drawn at the bottom, below the answer, whenever it was asked (${read.open} > ${read.answer})`,
);
const lastInLog = await page.evaluate(() => {
  const open = document.querySelector('[data-interaction="51"]');
  if (open === null) return null;
  const box = open.getBoundingClientRect();
  const log = open.closest('[class*="_log_"]');
  const below = [...(log ?? document).querySelectorAll('[data-interaction], [data-testid="call-line"], p')].filter(
    (one) => !open.contains(one) && one.getBoundingClientRect().top > box.bottom,
  );
  return below.length;
});
record(lastInLog === 0, `and nothing in the conversation is drawn below it (${lastInLog} below)`);
const width = await page.evaluate(() => {
  const card = document.querySelector('[data-interaction="52"]');
  const log = card?.closest('[class*="_log_"]');
  return card === null || log === null || log === undefined
    ? null
    : { card: Math.round(card.getBoundingClientRect().width), log: Math.round(log.getBoundingClientRect().width) };
});
record(width !== null && width.card < width.log * 0.8, `a question keeps to the message column, not the whole width (${JSON.stringify(width)})`);

await page.click('[data-interaction="51"] [data-interaction-option="allow"]');
await page.waitForTimeout(800);
const sent = await page.evaluate(() => window.__stub.sent[0] ?? null);
record(sent?.id === '51' && sent?.option === 'allow', `Allow sends that option (${JSON.stringify(sent)})`);
const outcome = (await page.locator('[data-interaction="51"] [data-interaction-outcome]').innerText().catch(() => '')).trim();
record(outcome.startsWith('Allowed - http://localhost:49153/'), `and the outcome replaces the buttons (${outcome})`);
record((await page.locator('[data-interaction="51"] [data-interaction-option]').count()) === 0, 'no button is left to press twice');
// Measured again: answering changes the card's height, and the log scrolls.
const moved = { first: await lineTop('orkbox_exec'), placed: await top('[data-interaction="51"]'), second: await lineTop('orkbox_ports') };
record(
  moved.placed !== null && moved.first !== null && moved.second !== null && moved.placed > moved.first && moved.placed < moved.second,
  `once answered it moves to when it was asked, between the two calls (${JSON.stringify(moved)})`,
);

/* ----------------------------------------------------------- a turn running */

const composer = page.locator('#chat-composer');
await composer.click();
await page.keyboard.type('Run it and show me.');
await page.keyboard.press('Enter');
await page.waitForFunction(() => document.querySelectorAll('[data-testid="call-line"]').length >= 4, null, { timeout: 15_000 }).catch(() => {});
// Asking is a call, and the page reads the questions again as each call finishes; coming back into view does too.
await page.evaluate(() => window.dispatchEvent(new Event('focus')));
await page.waitForSelector('[data-interaction="53"]', { timeout: 10_000 }).catch(() => {});
await page.waitForTimeout(500);

const live = {
  first: await lineTop('orkbox_exec'),
  second: await lineTop('orkbox_ports'),
  open: await top('[data-interaction="53"]'),
};
record(
  live.open !== null && live.second !== null && live.open > live.second,
  `while the turn runs, the open question is below its calls, at the bottom (${JSON.stringify(live)})`,
);
await page.click('[data-interaction="53"] [data-interaction-option="allow"]');
await page.waitForTimeout(800);
const placed = await top('[data-interaction="53"]');
const liveFirst = await lineTop('orkbox_exec');
const liveSecond = await lineTop('orkbox_ports');
record(
  placed !== null && liveFirst !== null && liveSecond !== null && placed > liveFirst && placed < liveSecond,
  `answered mid-turn, it sits among the turn's calls, between the call before it and the call after (${liveFirst} < ${placed} < ${liveSecond})`,
);
await page.evaluate(() => window.__stub.release?.());
await page.getByText('Both calls are done.').first().waitFor({ timeout: 10_000 }).catch(() => {});
await page.waitForTimeout(400);
const after = { placed: await top('[data-interaction="53"]'), first: await lineTop('orkbox_exec'), second: await lineTop('orkbox_ports') };
record(
  after.placed !== null && after.first !== null && after.second !== null && after.placed > after.first && after.placed < after.second,
  `and it stays there once the answer lands (${JSON.stringify(after)})`,
);

await finish(browser);
