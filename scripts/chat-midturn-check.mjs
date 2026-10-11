/**
 * The person can write while the agent is working, and the agent reads it.
 *
 * The composer used to turn into "Waiting…" for the whole of a turn, so a
 * correction had to wait for an answer built on the mistake, or Stop threw the
 * turn away. Now Send stays live in a chat with an agent: what is written goes
 * to the running turn, which reads it at its next round, and it is drawn at once
 * among what the turn is doing, where it was said.
 *
 * The stream is stubbed, and the chat list is passed through with an agent put
 * on every chat, so this needs a chat page and nothing else.
 */
import { BASE, open, record, finish } from './suite/harness.mjs';

const { browser, context, page } = await open({ viewport: { width: 1440, height: 1000 } });

const SAID = 'Use the blue one, please.';

await context.addInitScript(() => {
  const real = window.fetch.bind(window);
  const encode = new TextEncoder();
  const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  window.__midturn = { posted: [], release: null };
  window.fetch = async (input, init) => {
    const address = typeof input === 'string' ? input : input.url;
    const body = typeof init?.body === 'string' ? init.body : '';
    if (address.includes('/graphql') && body.includes('postChatMessageDuringTurn')) {
      window.__midturn.posted.push(JSON.parse(body).variables?.text ?? null);
      return new Response(JSON.stringify({ data: { postChatMessageDuringTurn: true } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (address.includes('/graphql') && (body.includes('chatSessions(') || body.includes('chatSession('))) {
      const answered = await real(input, init);
      const json = await answered.json();
      const stamp = (one) => (one && typeof one === 'object' && 'agentId' in one ? { ...one, agentId: '1', agentName: 'Reviewer' } : one);
      if (Array.isArray(json?.data?.chatSessions)) json.data.chatSessions = json.data.chatSessions.map(stamp);
      if (json?.data?.chatSession) json.data.chatSession = stamp(json.data.chatSession);
      return new Response(JSON.stringify(json), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (/\/api\/chats\/[^/]+\/follow/.test(address)) {
      return new Response(frame('idle', {}), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }
    if (/\/api\/chats\/[^/]+\/stream/.test(address)) {
      return new Response(
        new ReadableStream({
          start(controller) {
            const send = (event, data) => controller.enqueue(encode.encode(frame(event, data)));
            window.setTimeout(() => send('call', { at: 0, tool: 'midturn_first', arguments: '{}' }), 100);
            window.setTimeout(() => send('called', { at: 0, result: 'first', failed: false }), 200);
            window.__midturn.read = (text) => send('personRead', { text });
            window.__midturn.release = () => {
              send('call', { at: 1, tool: 'midturn_second', arguments: '{}' });
              send('called', { at: 1, result: 'second', failed: false });
              send('chunk', { text: 'Blue it is.' });
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
await page.waitForTimeout(700);
await composer.click();
await page.keyboard.type('Which colour?');
await page.keyboard.press('Enter');
await page.getByText('midturn_first').first().waitFor({ timeout: 10_000 }).catch(() => {});

/* Mid-turn: Send is live, and what is written goes to the turn. */
const send = page.locator('form:has(#chat-composer) button[type="submit"]');
await composer.click();
await page.keyboard.type(SAID);
record(!(await send.isDisabled()), `Send stays live while the agent works (it says "${(await send.textContent())?.trim()}")`);
await page.keyboard.press('Enter');
await page.waitForTimeout(400);

const posted = await page.evaluate(() => window.__midturn.posted);
record(posted.length === 1 && posted[0] === SAID, `what was written is posted to the running turn (${JSON.stringify(posted)})`);
record((await composer.inputValue().catch(() => '')) === '', 'and the composer is cleared');

const drawn = await page.locator('[data-person-in-turn]').filter({ hasText: SAID }).count();
record(drawn === 1, `it is drawn at once in the turn (${drawn})`);
const order = await page.evaluate((said) => {
  const all = [...document.querySelectorAll('[data-person-in-turn], [data-testid="call-line"]')];
  return all
    .filter((one) => (one.textContent ?? '').includes(said) || /midturn_first|midturn_second/.test(one.textContent ?? ''))
    .map((one) => (one.hasAttribute('data-person-in-turn') ? 'person' : /midturn_first/.test(one.textContent ?? '') ? 'first' : 'second'));
}, SAID);
record(order.join(',') === 'first,person', `after the call it came after (${order.join(',')})`);

/* Queued until the agent's next step takes it in, then Read: "Sent" for minutes read as ignored. */
const note = () => page.locator('[data-person-in-turn] [data-person-read]').first();
record((await note().getAttribute('data-person-read')) === 'false', `it says it is queued (${(await note().innerText().catch(() => '')).trim()})`);
await page.evaluate((said) => window.__midturn.read?.(said), SAID);
await page.waitForTimeout(300);
record((await note().getAttribute('data-person-read')) === 'true', `and read once the agent has it (${(await note().innerText().catch(() => '')).trim()})`);

await page.evaluate(() => window.__midturn.release?.());
await page.getByText('Blue it is.').first().waitFor({ timeout: 10_000 }).catch(() => {});
record((await page.getByText('Blue it is.').count()) > 0, 'and the turn still finishes');

await finish(browser);
