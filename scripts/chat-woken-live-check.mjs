/**
 * A turn the server starts on a chat by itself is drawn on the page open on it.
 *
 * A watcher firing, an agent the chat's agent asked answering, a reminder
 * coming due: each wakes the agent on the server with nobody typing. Its answer
 * was written to the history and to nobody's screen - the page open on the
 * chat had asked for nothing and read the history once, so the person watching
 * it saw nothing until they reloaded. Now an idle chat page waits on
 * `/follow?wait=true` and draws whatever turn it is handed.
 *
 * The woken turn is played by the browser: the first wait is answered with the
 * frames a woken turn produces, and the page must draw them in the same
 * document. Before the fix nothing asks to wait, so nothing is drawn.
 */
import { BASE, WORKSPACE, open, record, check, shot, finish } from './suite/harness.mjs';

const PREFIX = 'zzWokenLive';
const SAID = 'The watcher fired: the build is done.';
const stamp = Date.now();

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const { chatSessions } = await graphql('query ($w: ID!) { chatSessions(workspaceId: $w) { id title } }', { w: WORKSPACE });
for (const old of chatSessions.filter((one) => (one.title ?? '').startsWith(PREFIX))) {
  await graphql('mutation($id: ID!) { deleteChat(id: $id) }', { id: old.id }).catch(() => undefined);
}
const chat = (
  await graphql('mutation($input: StartChatInput!) { startChat(input: $input) { id } }', {
    input: { workspaceId: WORKSPACE, title: `${PREFIX} ${stamp}` },
  })
).startChat;

let waits = 0;
let woke = () => undefined;
const wokenAsked = new Promise((done) => {
  woke = done;
});
await page.route(/\/api\/chats\/[^/]+\/follow\?wait=true/, async (route) => {
  waits += 1;
  if (waits > 1) return route.continue();
  // Held a moment, as a wait is: the page is on screen and idle before the turn starts.
  await wokenAsked;
  await route.fulfill({
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
    body:
      'event: waiting\ndata: {}\n\n' +
      'event: following\ndata: {}\n\n' +
      `event: chunk\ndata: ${JSON.stringify({ text: SAID })}\n\n` +
      'event: done\ndata: {"millis":1200}\n\n',
  });
});

await page.goto(`${BASE}/chat/${chat.id}`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#chat-composer', { state: 'visible', timeout: 25_000 });
await page.waitForTimeout(1_500);
await page.evaluate(() => {
  window.__orknuxNeverReloaded = true;
});
record(waits >= 1, `an idle chat page waits for a turn the server starts by itself (${waits} wait asked)`);
record(!(await page.evaluate((said) => document.body.innerText.includes(said), SAID)), 'nothing is drawn before it starts');

woke();
const drawn = await page
  .waitForFunction((said) => document.body.innerText.includes(said), SAID, { timeout: 10_000 })
  .then(() => true)
  .catch(() => false);
const same = await page.evaluate(() => window.__orknuxNeverReloaded === true).catch(() => false);
check(
  drawn && same,
  'the woken answer is drawn live, without a reload',
  `the woken answer never reached the page (drawn: ${drawn}, same document: ${same})`,
);
await page.waitForTimeout(1_000);
record(waits >= 2, 'and the page goes back to waiting for the next one');
await page.screenshot({ path: shot('chat-woken-live.png') });

await graphql('mutation($id: ID!) { deleteChat(id: $id) }', { id: chat.id }).catch(() => undefined);
await finish(browser);
