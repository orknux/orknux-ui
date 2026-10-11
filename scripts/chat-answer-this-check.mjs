/**
 * A chat ending on the person's own message offers to answer it.
 *
 * A turn that died, was stopped, or that the page lost left the question with
 * nothing under it, and the only way to get an answer was to type it again.
 * The history is passed through with an unanswered question put on its end and
 * the regenerate stream is stubbed: the control shows under the question, a
 * press streams an answer under it, and the control is gone after.
 */
import { BASE, open, record, finish } from './suite/harness.mjs';

const QUESTION = 'Dobrze, przejdźmy zatem teraz do kolejnego pytania.';
const ANSWER = 'Pytanie drugie: czym jest wzorzec Observer?';

const { browser, context, page } = await open({ viewport: { width: 1440, height: 1000 } });
await context.addInitScript((answer) => {
  const real = window.fetch.bind(window);
  const encode = new TextEncoder();
  const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  window.__asked = 0;
  window.fetch = async (input, init) => {
    const address = typeof input === 'string' ? input : input.url;
    if (/\/api\/chats\/[^/]+\/follow/.test(address)) {
      return new Response(frame('idle', {}), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }
    if (/\/api\/chats\/[^/]+\/regenerate/.test(address)) {
      window.__asked += 1;
      return new Response(
        new ReadableStream({
          start(controller) {
            window.setTimeout(() => {
              controller.enqueue(encode.encode(frame('chunk', { text: answer })));
              controller.enqueue(encode.encode(frame('done', { millis: 1000 })));
              controller.close();
            }, 300);
          },
        }),
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
      );
    }
    return real(input, init);
  };
}, ANSWER);

/* The history, with an unanswered question on its end. */
await page.route('**/graphql', async (route) => {
  const body = route.request().postData() ?? '';
  if (!body.includes('chatMessages(')) return route.continue();
  const response = await route.fetch().catch(() => null);
  if (response === null) return;
  const json = await response.json().catch(() => null);
  if (json?.data?.chatMessages && Array.isArray(json.data.chatMessages)) {
    const like = json.data.chatMessages.find((one) => one.role === 'user') ?? {};
    json.data.chatMessages.push({ ...like, role: 'user', content: QUESTION, at: new Date().toISOString(), takes: [], thinking: null, thinkingMillis: null, actor: null, attachments: [] });
  }
  await route.fulfill({ response, json }).catch(() => {});
});

await page.goto(`${BASE}/chat`, { waitUntil: 'domcontentloaded' });
await page.getByText(QUESTION).first().waitFor({ timeout: 20_000 }).catch(() => {});
await page.waitForTimeout(500);

const control = page.locator('[data-answer-this]');
record((await control.count()) === 1, `the unanswered question offers an answer (${await control.count()})`);

await control.first().click().catch(() => {});
await page.getByText(ANSWER).first().waitFor({ timeout: 10_000 }).catch(() => {});
await page.waitForTimeout(400);
const drawn = await page.evaluate(([question, answer]) => {
  const text = document.body.innerText;
  return { asked: window.__asked, after: text.indexOf(answer) > text.indexOf(question) && text.indexOf(question) >= 0 };
}, [QUESTION, ANSWER]);
record(drawn.asked === 1 && drawn.after, `pressing it streams an answer under the question (${JSON.stringify(drawn)})`);
record((await control.count()) === 0, 'and the control is gone once it is answered');

await finish(browser);
