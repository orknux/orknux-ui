/**
 * A chat says beside its name how many answers arrived since it was last open.
 *
 * Unmistakable at a glance in a long list: a solid silver pill, bold, and the
 * chat's name brighter and heavier than a read one's. Opening the chat clears
 * it at once and tells the server, which keeps the count.
 *
 * The list's counts are rewritten in the browser, so any two of alice's chats
 * will do and nothing is changed but what opening one marks read.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });
const PREFIX = 'zz unread';
const sweep = async () => {
  const { chatSessions } = await graphql(`query($w: ID!) { chatSessions(workspaceId: $w) { id title } }`, { w: WORKSPACE })
    .catch(() => ({ chatSessions: [] }));
  for (const old of chatSessions.filter((one) => (one.title ?? '').startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { deleteChat(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
};

try {
  const make = async (name) => (await graphql(`mutation($input: StartChatInput!) { startChat(input: $input) { id } }`, {
    input: { workspaceId: WORKSPACE, title: `${PREFIX} ${name} ${Date.now()}` },
  })).startChat.id;
  const quiet = await make('read');
  const busy = await make('news');

  let marked = [];
  await page.route('**/graphql', async (route) => {
    const body = route.request().postDataJSON() ?? {};
    const query = body.query ?? '';
    if (query.includes('markChatRead')) marked.push(body.variables?.id);
    if (!query.includes('chatSessions')) return route.continue();
    const answered = await route.fetch();
    const json = await answered.json();
    for (const one of json.data?.chatSessions ?? []) {
      // The busy chat has news until it has been marked read here.
      one.unreadCount = one.id === busy && !marked.includes(busy) ? 3 : 0;
    }
    return route.fulfill({ response: answered, json });
  });

  await page.goto(`${BASE}/chat/${quiet}`, { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder(/Type a message/).waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1000);

  const row = (id) => page.locator('[class*="sessionRow"]').filter({ hasText: id === busy ? `${PREFIX} news` : `${PREFIX} read` }).first();
  const pill = row(busy).getByTestId('chat-unread');
  record((await pill.count()) === 1 && (await pill.innerText()).trim() === '3', `the chat with news says how much beside its name (${await pill.innerText().catch(() => 'none')})`);
  record((await row(quiet).getByTestId('chat-unread').count()) === 0, 'a read chat says nothing');

  const look = await page.evaluate(([news, read]) => {
    const rows = [...document.querySelectorAll('[class*="sessionRow"]')];
    const find = (text) => rows.find((one) => one.textContent.includes(text));
    const title = (one) => one.querySelector('[class*="sessionTitle"]');
    const badge = find(news).querySelector('[data-testid="chat-unread"]');
    const style = getComputedStyle(badge);
    return {
      filled: style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent',
      bold: Number(style.fontWeight) >= 700,
      newsWeight: Number(getComputedStyle(title(find(news))).fontWeight),
      readWeight: Number(getComputedStyle(title(find(read))).fontWeight),
    };
  }, [`${PREFIX} news`, `${PREFIX} read`]);
  record(look.filled && look.bold, `the count is a filled, bold pill (${JSON.stringify(look)})`);
  record(look.newsWeight > look.readWeight, `and the chat's name is heavier than a read one's (${look.newsWeight} vs ${look.readWeight})`);

  await row(busy).locator('button').first().click();
  await page.waitForTimeout(600);
  record((await pill.count()) === 0, 'opening it clears the count at once');
  record(marked.includes(busy), 'and tells the server it has been read');
} finally {
  await sweep();
}

await finish(browser);
