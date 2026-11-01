/**
 * Tool calls made one after another sit together, not a message apart.
 *
 * The conversation spaces its turns 24px apart, and a call read back from a
 * chat's history is one of its items - so six lookups in a row were spread
 * down a screen with a turn's gap between each. A run of calls is now one
 * stack. Since an agent's turn is read back as one message (d0fae578) the answer
 * under them is that message going on and stands as close; the log's gap is for
 * what is a new turn, the question after the answer.
 *
 * The conversation is answered here: a question, three calls, an answer, a
 * second question.
 * Makes one chat of its own and deletes it again.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });
const PREFIX = 'zz call stack';

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
  const started = await graphql(`mutation($input: StartChatInput!) { startChat(input: $input) { id } }`, {
    input: { workspaceId: WORKSPACE, title: `${PREFIX} ${Date.now()}` },
  });
  const at = new Date().toISOString();
  const said = (role, content, actor = null) => ({ role, content, actor, takes: [], thinking: null, thinkingMillis: null, at, attachments: [] });
  const call = (name) => said('tool', JSON.stringify({ name, arguments: {}, result: {} }), name);

  await page.route('**/graphql', async (route) => {
    const body = route.request().postDataJSON() ?? {};
    if (!(body.query ?? '').includes('chatMessages')) return route.continue();
    return route.fulfill({
      json: {
        data: {
          chatMessages: [
            said('user', 'What is on this page?'),
            call('skill_list'),
            call('memory_search'),
            call('http_request'),
            said('assistant', 'It is an office cabinet.'),
            said('user', 'And on the next one?'),
          ],
        },
      },
    });
  });

  await page.goto(`${BASE}/chat/${started.startChat.id}`, { waitUntil: 'domcontentloaded' });
  await page.getByText('It is an office cabinet.').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(500);

  const placed = await page.evaluate(() => {
    const calls = [...document.querySelectorAll('[class*="_call_"]')].filter((el) => el.parentElement?.className.includes('_log_'));
    const boxes = calls.map((el) => el.getBoundingClientRect());
    const answerEl = calls.at(-1)?.nextElementSibling;
    const answer = answerEl?.getBoundingClientRect();
    const next = answerEl?.nextElementSibling?.getBoundingClientRect();
    return {
      count: calls.length,
      between: boxes.slice(1).map((box, at) => Math.round(box.top - boxes[at].bottom)),
      after: answer && boxes.length > 0 ? Math.round(answer.top - boxes.at(-1).bottom) : null,
      nextTurn: answer && next ? Math.round(next.top - answer.bottom) : null,
    };
  });
  record(placed.count === 3, `the three calls are drawn (${placed.count})`);
  record(placed.between.length === 2 && placed.between.every((gap) => gap <= 8), `calls in a row sit together (${placed.between.join(', ')}px apart)`);
  record(placed.after !== null && placed.after <= 8, `the answer under them is the same message going on (${placed.after}px)`);
  record(placed.nextTurn !== null && placed.nextTurn >= 20, `and the next turn keeps a turn's gap (${placed.nextTurn}px)`);
} finally {
  await sweep();
}

await finish(browser);
