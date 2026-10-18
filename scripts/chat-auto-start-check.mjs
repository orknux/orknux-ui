/**
 * Chat with no chats opens one by itself.
 *
 * A fresh installation's first visit to Chat was "No chat open" and a button to
 * press before anything could be typed. With nothing to choose between, the
 * page now starts a chat - the same "+ New" - and opens it with the composer
 * focused. With chats there, it starts nothing.
 *
 * The chat list is answered empty here for the first visit, so the check needs
 * no empty workspace of its own; the chat it makes is real and is deleted at
 * the end.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });

let emptyList = true;
const started = [];
await page.route('**/graphql', async (route) => {
  const body = route.request().postDataJSON() ?? {};
  const query = body.query ?? '';
  if (query.includes('startChat(')) {
    const answered = await route.fetch();
    const json = await answered.json();
    const id = json?.data?.startChat?.id;
    if (id) started.push(id);
    // From the moment a chat exists, the list is the server's own.
    emptyList = false;
    return route.fulfill({ response: answered, json });
  }
  if (emptyList && query.includes('chatSessions(')) {
    return route.fulfill({ json: { data: { chatSessions: [] } } });
  }
  return route.continue();
});

try {
  await page.goto(`${BASE}/chat`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(/\/chat\/[^/]+$/, { timeout: 20_000 }).catch(() => undefined);
  record(started.length === 1, `with no chats, one is started by itself (${started.length})`);
  record(started.length === 1 && page.url().endsWith(`/chat/${started[0]}`), `and opened (${page.url()})`);
  await page.waitForTimeout(500);
  const focused = await page.evaluate(() => document.activeElement?.tagName === 'TEXTAREA');
  record(focused, 'with the message box focused');

  // With chats there - the server's real list - nothing new is started.
  const before = started.length;
  await page.goto(`${BASE}/chat`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  record(started.length === before, `with chats present nothing is started (${started.length - before} started)`);
} finally {
  for (const id of started) {
    await graphql(`mutation($id: ID!) { deleteChat(id: $id) }`, { id }).catch(() => undefined);
  }
}

await finish(browser);
