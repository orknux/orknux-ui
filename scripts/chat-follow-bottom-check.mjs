/**
 * Sending a message keeps the conversation at its foot, through the answer.
 *
 * "When I type a message and send it, sometimes it does not scroll fully to the
 * bottom." The log follows its foot until somebody scrolls up - and it decided
 * that somebody had from any scroll event that found the foot more than 40px
 * away. Its own scroll to the foot raises one too, a frame later, and by then a
 * piece of the answer can have landed below it: the log read its own scroll as
 * the reader leaving, stopped following, and the rest of the answer grew out of
 * sight.
 *
 * The chat's stream is stubbed with a tall answer in quick pieces, and a
 * several-line message is sent each time so the composer shrinks back as it
 * goes. After each answer the log has to be at its foot. And a reader who does
 * scroll up mid-answer is left there - following is theirs to stop.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const PREFIX = 'zzFollowBottom';
const { browser, context, page, graphql } = await open({ viewport: { width: 1280, height: 800 } });

await context.addInitScript(() => {
  const real = window.fetch.bind(window);
  const encode = new TextEncoder();
  window.fetch = async (input, init) => {
    const address = typeof input === 'string' ? input : input.url;
    if (/\/api\/chats\/[^/]+\/stream/.test(address)) {
      const lines = Array.from({ length: 40 }, (_, at) => `- Point ${at + 1} of the answer, long enough to wrap in a narrow column now and then.\n`);
      const body = new ReadableStream({
        start(controller) {
          lines.forEach((line, at) =>
            window.setTimeout(() => controller.enqueue(encode.encode(`event: chunk\ndata: ${JSON.stringify({ text: line })}\n\n`)), 15 * at),
          );
          window.setTimeout(() => {
            controller.enqueue(encode.encode('event: done\ndata: {"millis":600}\n\n'));
            controller.close();
          }, 15 * lines.length + 50);
        },
      });
      return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    }
    return real(input, init);
  };
});

async function sweep() {
  const { chatSessions } = await graphql(`query($w: ID!) { chatSessions(workspaceId: $w) { id title } }`, { w: WORKSPACE });
  for (const old of chatSessions.filter((one) => (one.title ?? '').startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { deleteChat(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
}
await sweep();
const started = await graphql(`mutation($input: StartChatInput!) { startChat(input: $input) { id } }`, {
  input: { workspaceId: WORKSPACE, title: `${PREFIX} ${Date.now()}` },
});

await page.goto(`${BASE}/chat/${started.startChat.id}`, { waitUntil: 'domcontentloaded' });
const composer = page.locator('#chat-composer');
const ready = await composer.waitFor({ state: 'visible', timeout: 25_000 }).then(() => true).catch(() => false);
record(ready, 'the chat opened with a composer');
if (!ready) {
  await sweep();
  await finish(browser);
}

/** How far the log is from its foot, in pixels. */
const fromFoot = () =>
  page.evaluate(() => {
    const log = document.querySelector('[class*="_log_"]');
    return log === null ? null : Math.round(log.scrollHeight - log.clientHeight - log.scrollTop);
  });

async function send(at) {
  await composer.click();
  await composer.fill(`Message ${at}`);
  for (let line = 0; line < 4; line += 1) await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('with a few lines, so the box shrinks back when it is sent');
  await page.keyboard.press('Enter');
  await page.waitForFunction((n) => document.body.innerText.includes(`Point 40 of the answer`) && document.querySelectorAll('[data-chat-row], [class*="_message_"]').length >= n, at, { timeout: 20_000 }).catch(() => undefined);
  await page.waitForTimeout(800);
  return fromFoot();
}

const distances = [];
for (let at = 1; at <= 6; at += 1) distances.push(await send(at));
console.log(`from the foot after each answer: ${JSON.stringify(distances)}`);
record(distances.every((one) => one !== null && one <= 2), `after every send and its answer, the log is at its foot (${JSON.stringify(distances)})`);

/* And a reader who scrolls up while an answer arrives is left where they went. */
await composer.fill('One more');
await page.keyboard.press('Enter');
// Once the answer is arriving: the person's own new message starts following again, rightly.
await page.waitForFunction(() => (document.body.innerText.match(/Point 3 of the answer/g) ?? []).length >= 7, null, { timeout: 10_000 }).catch(() => undefined);
// With the wheel, as a person does: a script setting the position is not a reader.
const box = await page.locator('[class*="_log_"]').first().boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
for (let turn = 0; turn < 10; turn += 1) await page.mouse.wheel(0, -2_000);
await page.waitForTimeout(1_500);
const top = await page.evaluate(() => document.querySelector('[class*="_log_"]')?.scrollTop ?? null);
record(top !== null && top < 50, `scrolled up mid-answer, the reader stays where they went (${top})`);

await sweep();
await finish(browser);
