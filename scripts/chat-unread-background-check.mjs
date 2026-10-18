/**
 * News in the open chat stays news while the window is in the background.
 *
 * The open chat was marked read the moment an answer landed in it - right for
 * somebody looking at it, wrong for the desktop app waiting in the tray or a
 * tab behind another: they came back to no count, and it looked as though the
 * count only worked sometimes. Now the open chat is read only while the window
 * is in front of somebody, and coming back reads it.
 *
 * The news is said here, rewriting the list's answer; leaving and coming back
 * are blur and focus, with the page told it no longer has focus. Makes one chat
 * of its own and deletes it.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });
const PREFIX = 'zz unread background';

const sweep = async () => {
  const { chatSessions } = await graphql(
    `query($w: ID!) { chatSessions(workspaceId: $w) { id title } }`,
    { w: WORKSPACE },
  ).catch(() => ({ chatSessions: [] }));
  for (const old of chatSessions.filter((one) => (one.title ?? '').startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { deleteChat(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
};

try {
  const title = `${PREFIX} ${Date.now()}`;
  const chat = (await graphql(`mutation($input: StartChatInput!) { startChat(input: $input) { id } }`, {
    input: { workspaceId: WORKSPACE, title },
  })).startChat.id;

  let news = false;
  const marked = [];
  await page.route('**/graphql', async (route) => {
    const body = route.request().postDataJSON() ?? {};
    const query = body.query ?? '';
    if (query.includes('markChatRead')) marked.push(body.variables?.id);
    if (!news || !query.includes('unreadCount')) return route.continue();
    const answered = await route.fetch();
    const json = await answered.json().catch(() => null);
    if (json === null) return route.fulfill({ response: answered });
    const told = (node) => {
      if (Array.isArray(node)) return node.forEach(told);
      if (node === null || typeof node !== 'object') return;
      if (node.id === chat && 'unreadCount' in node) node.unreadCount = 1;
      Object.values(node).forEach(told);
    };
    told(json);
    return route.fulfill({ response: answered, json });
  });

  await page.goto(`${BASE}/chat/${chat}`, { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder(/Type a message/).waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1000);

  // The window goes to the background; an answer lands in the chat open in it.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hasFocus', { value: () => false, configurable: true });
    window.dispatchEvent(new Event('blur'));
  });
  marked.length = 0;
  news = true;
  await page.evaluate(() => {
    // The list is asked again on the bell's beat; this asks it now.
    document.dispatchEvent(new Event('visibilitychange'));
  });
  // This chat's row only: another chat in the workspace may have real news of its own.
  const pill = page.locator('[class*="sessionRow"]', { hasText: title }).getByTestId('chat-unread');
  await pill.first().waitFor({ timeout: 5_000 }).catch(() => undefined);
  record((await pill.count()) === 1, 'while the window is in the background, the open chat shows its news');
  record(!marked.includes(chat), `and it is not marked read (${JSON.stringify(marked)})`);

  // Coming back reads it.
  news = false;
  await page.evaluate(() => {
    Object.defineProperty(document, 'hasFocus', { value: () => true, configurable: true });
    window.dispatchEvent(new Event('focus'));
  });
  await page.waitForTimeout(1000);
  record(marked.includes(chat), 'coming back to the window marks it read');
  record((await pill.count()) === 0, 'and the count goes');
} finally {
  await sweep();
}

await finish(browser);
