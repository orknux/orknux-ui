/**
 * A question an agent asked is drawn once, in the turn that asked it - live,
 * once the turn is over, and after a reload.
 *
 * Chat 1004 drew one answered ask_person card twice while its turn ran and
 * twice after it ended, once of those inside the answer before. Here a turn is
 * held open by a fetch handed to the page, since a route can only answer a
 * whole body and a whole body ends the turn: it thinks, asks, says it asked,
 * looks something up, and the question is answered in the middle of it. The
 * cards are counted by their text at each point.
 */
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });
const NAME = `zz question once ${Date.now()}`;
const QUESTION = 'QUESTION-ONCE what should I look up?';
const iso = (millis) => new Date(millis).toISOString();
const started = Date.now() - 3 * 60_000;

const line = (role, content, at, extra = {}) => ({
  role, content, actor: null, takes: [], thinking: null, thinkingMillis: null, at, attachments: [], ...extra,
});
const before = [
  line('user', 'hi', iso(started)),
  line('assistant', 'GREETING-WORDS good to see you.', iso(started + 4_000), { thinking: 'A greeting, nothing to look up.', thinkingMillis: 2_000 }),
];
let history = before;
let request = null;

let chatId = null;
try {
  chatId = (await graphql(`mutation($input: StartChatInput!) { startChat(input: $input) { id } }`, {
    input: { workspaceId: WORKSPACE, title: NAME },
  })).startChat.id;
  await page.route('**/graphql', async (route) => {
    const body = route.request().postDataJSON() ?? {};
    const query = body.query ?? '';
    if (query.includes('sessionRequests')) return route.fulfill({ json: { data: { sessionRequests: request === null ? [] : [request] } } });
    if (query.includes('chatMessages')) return route.fulfill({ json: { data: { chatMessages: history } } });
    if (!query.includes('llmSessionId')) return route.continue();
    const answered = await route.fetch();
    const json = await answered.json();
    const give = (node) => {
      if (Array.isArray(node)) return node.forEach(give);
      if (node === null || typeof node !== 'object') return;
      if (String(node.id) === String(chatId) && 'llmSessionId' in node) node.llmSessionId = '999300';
      Object.values(node).forEach(give);
    };
    give(json);
    return route.fulfill({ response: answered, json });
  });
  // Nothing to follow on the chat: the page's wait for a woken turn is told so at once.
  await page.route('**/api/chats/*/follow*', (route) =>
    route.fulfill({ status: 200, contentType: 'text/event-stream', body: 'event: idle\ndata: {}\n\n' }),
  );

  // The send's stream, said a frame at a time from here and closed when the turn is over.
  await page.addInitScript(() => {
    const real = window.fetch.bind(window);
    const encoder = new TextEncoder();
    let controller = null;
    window.__say = (frames) => frames.forEach(([event, data]) => controller?.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)));
    window.__end = () => controller?.close();
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (!/\/api\/chats\/[^/]+\/stream$/.test(url)) return real(input, init);
      const body = new ReadableStream({ start(held) { controller = held; } });
      return Promise.resolve(new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    };
  });
  const say = async (...frames) => {
    await page.evaluate((all) => window.__say(all), frames);
    await page.waitForTimeout(300);
  };
  /**
   * Every card that holds the question: whether it is in the answer before, and
   * whether it is in the asking turn - after the person's message and before
   * the turn's last answer, wherever its words are drawn yet.
   */
  const cards = () =>
    page.evaluate((question) => {
      const all = [...document.querySelectorAll('[data-interaction]')].filter((one) => (one.textContent ?? '').includes(question));
      const holding = (words) => [...document.querySelectorAll('p, div')].filter((one) => one.children.length === 0 && (one.textContent ?? '').includes(words))[0];
      const asked = holding('Can you look up something specific?');
      const final = holding('FINAL-WORDS');
      return all.map((one) => {
        const row = one.closest('[class*="assistantRow"]');
        const after = asked !== undefined && (asked.compareDocumentPosition(one) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
        const before = final === undefined || (one.compareDocumentPosition(final) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
        return {
          open: one.getAttribute('data-interaction-open'),
          inGreeting: (row?.textContent ?? '').includes('GREETING-WORDS'),
          inTurn: after && before,
        };
      });
    }, QUESTION);

  await page.goto(`${BASE}/chat/${chatId}`, { waitUntil: 'domcontentloaded' });
  if (await drawn(page, 'the chat log')) {
    await page.getByText('GREETING-WORDS').first().waitFor({ timeout: 10_000 }).catch(() => undefined);
    const box = page.locator('#chat-composer');
    await box.click();
    await box.fill('Can you look up something specific?');
    await box.press('Enter');
    const askedAt = await page.evaluate(() => Date.now());
    await page.waitForTimeout(300);
    await say(['thinking', { text: 'Better to ask what.' }], ['thought', { text: 'Better to ask what.', millis: 900 }], ['call', { at: 0, tool: 'ask_person', arguments: '{"question":"what?"}' }]);
    const created = await page.evaluate(() => Date.now());
    request = {
      id: '999301', kind: 'agent.question', askedBy: 'Helper', question: QUESTION,
      options: [{ id: '6', label: 'Something on the web', style: null, description: 'A search' }, { id: '7', label: 'A file', style: null, description: 'A file here' }],
      items: [], chosen: null, chosenBy: null, chosenAt: null, outcome: null, createdAt: iso(created),
      multiple: false, allowsText: true, text: null,
    };
    await say(['called', { at: 0, result: '{"asked":true}', failed: false }]);
    await page.locator('[data-interaction="999301"]').first().waitFor({ timeout: 5_000 }).catch(() => undefined);
    await say(
      ['thinking', { text: 'Asked; now see what I can use.' }],
      ['thought', { text: 'Asked; now see what I can use.', millis: 400 }],
      ['said', { text: 'ASKED-WORDS Yes - I have asked what you would like me to look up.' }],
    );
    const said = await page.evaluate(() => Date.now());
    await say(['call', { at: 1, tool: 'skill_list', arguments: '{}' }]);
    // Answered from elsewhere while the turn runs; the page reads it back as the next call comes back.
    request = { ...request, chosen: '6', chosenBy: 'alice', chosenAt: iso(Date.now()), outcome: 'answered' };
    await say(['called', { at: 1, result: '[]', failed: false }]);
    await page.waitForTimeout(700);
    const live = await cards();
    record(live.length === 1, `live, mid-turn, the question is drawn once (${JSON.stringify(live)})`);
    record(live.length > 0 && live.every((one) => one.open === 'false' && one.inTurn && !one.inGreeting), `live, it is the answered card, in the asking turn and not the answer before (${JSON.stringify(live)})`);

    await say(['chunk', { text: 'FINAL-WORDS web search is ready.' }], ['done', { millis: 30_000, thinkingMillis: 1_300, inputTokens: 3, outputTokens: 4, cost: null }]);
    await page.evaluate(() => window.__end());
    await page.getByText('FINAL-WORDS').first().waitFor({ timeout: 5_000 }).catch(() => undefined);
    await page.waitForTimeout(1_000);
    const ended = await cards();
    record(ended.length === 1, `after the turn, without a reload, the question is drawn once (${JSON.stringify(ended)})`);
    record(ended.length > 0 && ended.every((one) => one.inTurn && !one.inGreeting), `after the turn it is in the asking turn, not the answer before (${JSON.stringify(ended)})`);

    // What the server keeps of that turn, read back on a reload.
    history = [
      ...before,
      line('user', 'Can you look up something specific?', iso(askedAt)),
      line('thought', '', iso(askedAt + 200), { thinking: 'Better to ask what.', thinkingMillis: 900 }),
      line('tool', '{"question":"what?"}', iso(created - 30), { actor: 'ask_person' }),
      line('thought', '', iso(created + 600), { thinking: 'Asked; now see what I can use.', thinkingMillis: 400 }),
      line('assistant', 'ASKED-WORDS Yes - I have asked what you would like me to look up.', iso(said)),
      line('assistant', 'FINAL-WORDS web search is ready.', iso(Date.now()), { thinking: 'Better to ask what.', thinkingMillis: 1_300 }),
    ];
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByText('FINAL-WORDS').first().waitFor({ timeout: 10_000 }).catch(() => undefined);
    await page.locator('[data-interaction="999301"]').first().waitFor({ timeout: 5_000 }).catch(() => undefined);
    await page.waitForTimeout(500);
    const reloaded = await cards();
    record(reloaded.length === 1, `after a reload the question is drawn once (${JSON.stringify(reloaded)})`);
    record(reloaded.length > 0 && reloaded.every((one) => one.inTurn && !one.inGreeting), `after a reload it is in the asking turn (${JSON.stringify(reloaded)})`);
  }
} finally {
  if (chatId !== null) await graphql(`mutation($id: ID!) { deleteChat(id: $id) }`, { id: chatId }).catch(() => undefined);
}

await finish(browser);
