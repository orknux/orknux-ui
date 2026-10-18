/**
 * While a chat is being named, its title bar says so; once named, the new name
 * is on the bar and in the list at once.
 *
 * Naming happens after the first answer and takes as long as a short answer
 * does, and the bar said nothing meanwhile - the chat sat on "New chat" with no
 * sign anything was coming. The stream now says `titling` before the model is
 * asked and `titled` with the name after.
 *
 * The stream is answered here, twice: once stopping after `titling`, so the
 * status can be seen, and once going on to `titled`. Makes one chat of its own
 * and deletes it again.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });
const PREFIX = 'zz chat naming';

const sweep = async () => {
  const { chatSessions } = await graphql(
    `query($w: ID!) { chatSessions(workspaceId: $w) { id title } }`,
    { w: WORKSPACE },
  ).catch(() => ({ chatSessions: [] }));
  for (const old of chatSessions.filter((one) => (one.title ?? '').startsWith(PREFIX) || one.title === 'Disk usage check')) {
    await graphql(`mutation($id: ID!) { deleteChat(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
};

const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
let finishes = false;

try {
  const started = await graphql(`mutation($input: StartChatInput!) { startChat(input: $input) { id } }`, {
    input: { workspaceId: WORKSPACE, title: `${PREFIX} ${Date.now()}` },
  });
  const chatId = started.startChat.id;

  await page.route(`**/api/chats/${chatId}/stream`, async (route) => {
    const body = frame('chunk', { text: 'Forty gigabytes.' }) + frame('titling', {}) +
      (finishes ? frame('titled', { title: 'Disk usage check' }) : '');
    return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body });
  });

  // Once named, the server holds the name too: the page reads its chats again at the end of a turn.
  await page.route('**/graphql', async (route) => {
    if (!finishes) return route.continue();
    const answered = await route.fetch();
    const json = await answered.json().catch(() => null);
    if (json === null) return route.fulfill({ response: answered });
    const rename = (node) => {
      if (Array.isArray(node)) return node.forEach(rename);
      if (node === null || typeof node !== 'object') return;
      if (node.id === chatId && typeof node.title === 'string') node.title = 'Disk usage check';
      Object.values(node).forEach(rename);
    };
    rename(json);
    return route.fulfill({ response: answered, json });
  });

  await page.goto(`${BASE}/chat/${chatId}`, { waitUntil: 'domcontentloaded' });
  const box = page.getByPlaceholder(/Type a message/);
  await box.waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);

  await box.fill('How big is the disk?');
  await box.press('Enter');
  // The answer first, then the naming after it - as the server sends them.
  await page.getByText('Forty gigabytes.').first().waitFor({ timeout: 15_000 }).catch(() => undefined);
  const naming = page.getByTestId('chat-naming');
  await naming.waitFor({ timeout: 10_000 }).catch(() => undefined);
  record((await naming.count()) === 1 && /Naming this chat/.test(await naming.innerText()), 'while it is named, the title bar says so');
  record((await page.getByTestId('chat-row-naming').count()) === 1, 'and its row in the list turns a spinner beside the name');

  finishes = true;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await box.waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
  await box.fill('And the logs?');
  await box.press('Enter');
  await page.waitForTimeout(1500);
  record((await naming.count()) === 0, 'once named, the status goes');
  record((await page.locator('h1').filter({ hasText: 'Disk usage check' }).count()) === 1, 'and the new name is on the title bar at once');
  record((await page.getByText('Disk usage check').count()) >= 2, 'and in the list');
} finally {
  await sweep();
}

await finish(browser);
