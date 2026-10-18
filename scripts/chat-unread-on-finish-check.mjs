/**
 * An answer that finishes in a chat somebody has left shows its count at once.
 *
 * Send in one chat, open another, wait: the answer finished, and the left
 * chat's count appeared only at the list's next once-a-minute read, or when the
 * window was come back to - so somebody waiting in the window (the desktop app,
 * nearly always) saw nothing and concluded the count did not work. The page
 * knows when that answer finishes, and reads the counts then.
 *
 * The answer is held back here for a few seconds, then finished; the list's
 * answer gives the left chat its count once it has. Nothing focuses or hides
 * the window. Makes two chats of its own and deletes them.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });
const PREFIX = 'zz unread on finish';

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

const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

try {
  const leftTitle = `${PREFIX} left ${Date.now()}`;
  const left = await start(leftTitle);
  const other = await start(`${PREFIX} other ${Date.now()}`);
  let finished = false;

  await page.route(`**/api/chats/${left}/stream`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 4000));
    finished = true;
    return route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
      body: frame('chunk', { text: 'Done.' }) + frame('done', {}),
    });
  });
  // Following the answer from elsewhere ends when the answer does, as the server's does.
  await page.route(`**/api/chats/${left}/follow*`, async (route) => {
    while (!finished) await new Promise((resolve) => setTimeout(resolve, 200));
    return route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
      body: frame('following', {}) + frame('chunk', { text: 'Done.' }) + frame('done', {}),
    });
  });
  await page.route('**/graphql', async (route) => {
    const body = route.request().postDataJSON() ?? {};
    if (!finished || !(body.query ?? '').includes('unreadCount')) return route.continue();
    const answered = await route.fetch();
    const json = await answered.json().catch(() => null);
    if (json === null) return route.fulfill({ response: answered });
    const told = (node) => {
      if (Array.isArray(node)) return node.forEach(told);
      if (node === null || typeof node !== 'object') return;
      if (node.id === left && 'unreadCount' in node) node.unreadCount = 1;
      Object.values(node).forEach(told);
    };
    told(json);
    return route.fulfill({ response: answered, json });
  });

  await page.goto(`${BASE}/chat/${left}`, { waitUntil: 'domcontentloaded' });
  const box = page.getByPlaceholder(/Type a message/);
  await box.waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
  await box.fill('Take your time.');
  await box.press('Enter');
  await page.waitForTimeout(500);

  // Off to the other chat, in the page, before the answer is in.
  await page.locator('[class*="sessionRow"]', { hasText: `${PREFIX} other` }).locator('button').first().click();
  await page.waitForURL(new RegExp(`/chat/${other}$`), { timeout: 10_000 }).catch(() => undefined);

  const pill = page.locator('[class*="sessionRow"]', { hasText: leftTitle }).getByTestId('chat-unread');
  await pill.waitFor({ timeout: 12_000 }).catch(() => undefined);
  record(finished, 'the answer finished while the other chat was open');
  record((await pill.count()) === 1, 'and the left chat shows its count at once, with nobody refocusing the window');
} finally {
  await sweep();
}

await finish(browser);
