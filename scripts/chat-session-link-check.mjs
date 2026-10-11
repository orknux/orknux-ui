/**
 * A chat links to the session it is answered in.
 *
 * The session is where a chat's turn can be read whole - every tool call, the
 * thinking, the boxes and the to-do list - and somebody wanting it had to find
 * it in the Sessions list by id. The header carries a link to it now.
 *
 * The chat list is passed through with a session id put on every chat, so the
 * check does not depend on the installation holding a chat that has one.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 1000 } });
const SESSION = '424242';

await page.route('**/graphql', async (route) => {
  const body = route.request().postData() ?? '';
  if (!body.includes('chatSessions(') && !body.includes('chatSession(')) return route.continue();
  // A request still in flight when the page closes has nobody to answer; dropping it is the honest end.
  const response = await route.fetch().catch(() => null);
  if (response === null) return;
  const json = await response.json().catch(() => null);
  if (json === null) return route.fulfill({ response }).catch(() => {});
  const stamp = (one) => (one && typeof one === 'object' && 'llmSessionId' in one ? { ...one, llmSessionId: SESSION } : one);
  if (Array.isArray(json?.data?.chatSessions)) json.data.chatSessions = json.data.chatSessions.map(stamp);
  if (json?.data?.chatSession) json.data.chatSession = stamp(json.data.chatSession);
  await route.fulfill({ response, json }).catch(() => {});
});

await page.goto(`${BASE}/chat`, { waitUntil: 'domcontentloaded' });
const link = page.locator('[data-chat-session-link]');
await link.waitFor({ timeout: 20_000 }).catch(() => {});
const href = await link.getAttribute('href').catch(() => null);
record(href === `/workspace/${WORKSPACE}/sessions/${SESSION}`, `the chat's header links to its session (${href})`);
record((await link.getAttribute('target').catch(() => null)) === '_blank', 'in a new tab, like the agent link beside it');
const box = await link.boundingBox().catch(() => null);
record(box !== null && box.width > 0 && box.height > 0, `and it is drawn (${JSON.stringify(box)})`);

await finish(browser);
