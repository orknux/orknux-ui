/**
 * An unread count appears without a reload.
 *
 * The chat list was read when the page opened and when something on the page
 * reloaded it, so an answer that finished in a chat somebody had left - or a
 * reminder an agent posted later - showed no count until a reload. The list
 * is now asked again on the notification bell's beat and whenever the window
 * is come back to.
 *
 * The news is said here: the list's answer is rewritten to give the other
 * chat two unread answers once the check says so, and coming back to the
 * window is a focus event. Makes two chats of its own and deletes them.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });
const PREFIX = 'zz unread refresh';

const sweep = async () => {
  const { chatSessions } = await graphql(
    `query($w: ID!) { chatSessions(workspaceId: $w) { id title } }`,
    { w: WORKSPACE },
  ).catch(() => ({ chatSessions: [] }));
  for (const old of chatSessions.filter((one) => (one.title ?? '').startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { deleteChat(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
};

const start = async (title) =>
  (await graphql(`mutation($input: StartChatInput!) { startChat(input: $input) { id } }`, {
    input: { workspaceId: WORKSPACE, title },
  })).startChat.id;

try {
  const elsewhereTitle = `${PREFIX} elsewhere ${Date.now()}`;
  const elsewhere = await start(elsewhereTitle);
  const here = await start(`${PREFIX} here ${Date.now()}`);
  let news = false;

  await page.route('**/graphql', async (route) => {
    const body = route.request().postDataJSON() ?? {};
    if (!news || !(body.query ?? '').includes('unreadCount')) return route.continue();
    const answered = await route.fetch();
    const json = await answered.json().catch(() => null);
    if (json === null) return route.fulfill({ response: answered });
    const told = (node) => {
      if (Array.isArray(node)) return node.forEach(told);
      if (node === null || typeof node !== 'object') return;
      if (node.id === elsewhere && 'unreadCount' in node) node.unreadCount = 2;
      Object.values(node).forEach(told);
    };
    told(json);
    return route.fulfill({ response: answered, json });
  });

  await page.goto(`${BASE}/chat/${here}`, { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder(/Type a message/).waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
  // The other chat's row only: a chat outside this check may have real news of its own.
  const pill = page.locator('[class*="sessionRow"]', { hasText: elsewhereTitle }).getByTestId('chat-unread');
  record((await pill.count()) === 0, 'nothing unread to begin with');

  // An answer finishes in the other chat; the person comes back to the window.
  news = true;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await pill.first().waitFor({ timeout: 5_000 }).catch(() => undefined);
  record((await pill.count()) === 1 && (await pill.first().innerText()).trim() === '2', `its count shows without a reload (${await pill.count()})`);
  record(page.url().endsWith(`/chat/${here}`), 'and the chat open stays open');
} finally {
  await sweep();
}

await finish(browser);
