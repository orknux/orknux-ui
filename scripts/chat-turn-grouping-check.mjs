/**
 * One agent turn is one message, read back or live.
 *
 * Chat 979: a turn that said something, looked things up, said something
 * else, made more calls, thought, drew a picture and answered was drawn after
 * a reload as three messages from the agent - each line it said with its own
 * avatar, name, time and Copy. A turn now has one header, its lines follow
 * under it in the order they came, and only its answer has a Copy.
 *
 * The history, the stream and the agent on the chat list are stubbed, so this
 * needs a chat and nothing else.
 */
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const { chatSessions } = await graphql(
  `query ($w: ID!) { chatSessions(workspaceId: $w) { id title } }`,
  { w: WORKSPACE },
);
const chat = chatSessions[0];
if (chat === undefined) {
  record(false, 'the workspace has a chat to open; the seed builds one');
  await finish(browser);
}

/** One red pixel, so the pictures have bytes to draw. */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
await page.route('**/api/attachments/*', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }));

const AGENT = 'Support responder';
const at = (second) => `2026-10-25T01:0${Math.floor(second / 60)}:${String(second % 60).padStart(2, '0')}Z`;
const line = (role, content, actor, second, extra = {}) => ({
  role,
  content,
  actor,
  takes: [],
  thinking: null,
  thinkingMillis: null,
  at: at(second),
  attachments: [],
  ...extra,
});

/** Chat 979's turn, as the server reads it back: the thread's lines with the session's between them. */
const FIRST = [
  line('user', 'create me a mockup for user login form', null, 3),
  line('assistant', "I'll check the workspace's skills first, then draw it.", AGENT, 10),
  line('tool', '{"query":"skills"}', 'tool_find', 11),
  line('tool', '{}', 'skill_list', 12),
  line('assistant', 'Loading done - a screen mockup goes in the wireframe editor.', AGENT, 20),
  line('tool', '{"name":"Login"}', 'orknux_create_wireframe', 21),
  line('thought', '', AGENT, 30, { thinking: 'The form wants an email, a password and a button.', thinkingMillis: 94000 }),
  line('assistant', '![](/api/attachments/90401)', 'image model', 112),
  line('assistant', 'Done - the login form mockup is in the wireframe editor.', AGENT, 134),
];
/** And after the second turn below, as a reload reads it. */
const SECOND = [
  ...FIRST,
  line('user', 'make the button wider', null, 140),
  line('assistant', 'Widening it now.', AGENT, 141),
  line('tool', '{"width":320}', 'orknux_change_wireframe', 142),
  line('assistant', '![](/api/attachments/90402)', 'image model', 150),
  line('assistant', 'The button is wider.', AGENT, 151),
];
let history = FIRST;

await page.route('**/graphql', async (route) => {
  const body = route.request().postData() ?? '';
  if (body.includes('query ChatMessages(')) {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { chatMessages: history } }) });
    return;
  }
  if (body.includes('chatSessions(') || body.includes('chatSession(')) {
    const response = await route.fetch();
    const json = await response.json();
    const stamp = (one) => (one && typeof one === 'object' && 'agentId' in one ? { ...one, agentId: '1', agentName: AGENT } : one);
    if (Array.isArray(json?.data?.chatSessions)) json.data.chatSessions = json.data.chatSessions.map(stamp);
    if (json?.data?.chatSession) json.data.chatSession = stamp(json.data.chatSession);
    await route.fulfill({ response, body: JSON.stringify(json) });
    return;
  }
  await route.continue();
});

/** The second turn, live: a line said, a call, a picture, then the answer. */
await page.route('**/api/chats/*/stream', async (route) => {
  const frames = [
    'event: said', 'data: {"text":"Widening it now."}', '',
    'event: call', 'data: {"at":0,"tool":"orknux_change_wireframe","arguments":"{}"}', '',
    'event: called', 'data: {"at":0,"result":"changed","failed":false}', '',
    'event: drew', 'data: {"markdown":"![](/api/attachments/90402)"}', '',
    'event: chunk', 'data: {"text":"The button is wider."}', '',
    'event: done', 'data: {"millis":120,"thinkingMillis":0,"inputTokens":3,"outputTokens":4,"cost":null}', '', '',
  ].join(String.fromCharCode(10));
  history = SECOND;
  await route.fulfill({ status: 200, contentType: 'text/event-stream', body: frames });
});

/** Headers, Copy buttons and the order of what is drawn, read off the page. */
const read = (probes) =>
  page.evaluate((wanted) => {
    const avatars = [...document.querySelectorAll('span[aria-hidden="true"]')].filter((one) =>
      /assistantAvatar(?!Space)/.test(typeof one.className === 'string' ? one.className : ''),
    ).length;
    const names = document.querySelectorAll('[class*="assistantName"]').length;
    const copies = document.querySelectorAll('[aria-label="Copy this answer"]').length;
    const textNode = (text) => {
      const walk = document.createTreeWalker(document.querySelector('[data-turn-line]')?.parentElement ?? document.body, NodeFilter.SHOW_TEXT);
      for (let node = walk.nextNode(); node !== null; node = walk.nextNode()) {
        if ((node.textContent ?? '').includes(text)) return node.parentElement;
      }
      return null;
    };
    const found = wanted.map((probe) =>
      probe.startsWith('img:') ? document.querySelector(`img[src*="${probe.slice(4)}"]`) : probe.startsWith('sel:') ? document.querySelector(probe.slice(4)) : textNode(probe),
    );
    const missing = wanted.filter((_, index) => found[index] === null);
    const inOrder =
      missing.length === 0 &&
      found.every((one, index) => index === 0 || (found[index - 1].compareDocumentPosition(one) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0);
    return { avatars, names, copies, missing, inOrder };
  }, probes);

const FIRST_ORDER = [
  "I'll check the workspace's skills first",
  'tool_find',
  'skill_list',
  'Loading done',
  'orknux_create_wireframe',
  'sel:[data-thought]',
  'img:/api/attachments/90401',
  'Done - the login form mockup',
];

await page.goto(`${BASE}/chat/${chat.id}`, { waitUntil: 'domcontentloaded' });
if (await drawn(page, 'the chat log')) {
  await page.getByText('Done - the login form mockup').first().waitFor({ timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(300);

  const loaded = await read(FIRST_ORDER);
  record(loaded.avatars === 1 && loaded.names === 1, `a turn read back is one message: one avatar and one name (${JSON.stringify(loaded)})`);
  record(loaded.copies === 1, `with one Copy, on its answer (${loaded.copies})`);
  record(loaded.inOrder, `its lines are drawn in the order they came (${JSON.stringify(loaded.missing)} missing)`);
  const copied = await page.evaluate(() => {
    const copy = document.querySelector('[aria-label="Copy this answer"]');
    return (copy?.closest('[class*="assistantRow"]')?.textContent ?? '').includes('Done - the login form mockup');
  });
  record(copied, 'the Copy is the answer’s');

  // Live: the second turn is one message too, beside the first.
  const box = page.locator('#chat-composer');
  await box.click();
  await page.keyboard.type('make the button wider');
  await page.keyboard.press('Enter');
  await page.getByText('The button is wider.').first().waitFor({ timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(300);
  const live = await read([...FIRST_ORDER, 'make the button wider', 'Widening it now.', 'orknux_change_wireframe', 'img:/api/attachments/90402', 'The button is wider.']);
  record(live.avatars === 2 && live.names === 2, `live, the new turn adds one message: two avatars and two names in all (${JSON.stringify(live)})`);
  record(live.inOrder, `in the order they came (${JSON.stringify(live.missing)} missing)`);

  // Reloaded, the same.
  await page.reload({ waitUntil: 'domcontentloaded' });
  if (await drawn(page, 'the chat log')) {
    await page.getByText('The button is wider.').first().waitFor({ timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(300);
    const again = await read([...FIRST_ORDER, 'make the button wider', 'Widening it now.', 'orknux_change_wireframe', 'img:/api/attachments/90402', 'The button is wider.']);
    record(again.avatars === 2 && again.names === 2 && again.copies === 2, `after a reload, still one message a turn (${JSON.stringify(again)})`);
    record(again.inOrder, `in the order they came (${JSON.stringify(again.missing)} missing)`);
  }
}

await finish(browser);
