/**
 * Issue #201: leaving a chat while the agent is thinking lost its reply.
 *
 * Somebody sends a message, leaves the page while the model is still thinking,
 * and comes back. The server had been taught to finish a text turn whose reader
 * left (#335), so the answer was being written into the history - but a person
 * who came back *while it was still being written* was shown the question and
 * nothing else, and nothing on the page would ever change that: the page read
 * the history once, found no answer in it yet, and had no way to hear about the
 * one being composed. From where they sat the reply was lost.
 *
 * Three ways of leaving, each with the assertion it exists for:
 *
 * 1. Leave mid-thinking and come back mid-thinking. The answer has to arrive on
 *    the page *without a reload* - the page is marked when it is opened, and a
 *    navigation would take the marker with it. This is the phase that fails
 *    before the fix.
 * 2. Close the tab mid-thinking and open the chat again after the model is done.
 *    The answer is in the history, read like any other.
 * 3. Come back mid-thinking and press Stop. Stopping on purpose still stops:
 *    the answer never arrives and the history keeps only the question.
 *
 * The model is `scripts/suite/slow-chat-stub.py`, which thinks for twenty
 * seconds before answering. It has to be a model the *server* calls - what is
 * being checked is that the server goes on with a turn nobody is reading and
 * that a returning page can find it - so it cannot be stubbed in the browser,
 * which is why this is `ci: false` like `task-live-check`. Run it by hand:
 *
 *   python scripts/suite/slow-chat-stub.py 8197
 *   node scripts/suite/run.mjs --only chat-leave-return-check
 *
 * Where the stub is, as the server reaches it, goes in ORKNUX_SLOW_CHAT_STUB.
 */
import { BASE, WORKSPACE, open, record, check, shot, finish } from './suite/harness.mjs';

const STUB = process.env.ORKNUX_SLOW_CHAT_STUB ?? 'http://localhost:8197';
/** What the stub's answer says; see slow-chat-stub.py. */
const ANSWER = 'The slow answer has arrived';
const PREFIX = 'zzLeaveReturn';
const stamp = Date.now();

const { browser, context, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

/* ----------------------------------------------------------- the fixture */

async function sweep() {
  const found = await graphql(
    `query ($w: ID!) {
       modelProviders(workspaceId: $w) { id name }
       workspaceAgents(workspaceId: $w, page: 0, size: 200) { content { id name } }
       chatSessions(workspaceId: $w) { id title }
     }`,
    { w: WORKSPACE },
  );
  for (const old of found.chatSessions.filter((one) => (one.title ?? '').startsWith(PREFIX))) {
    await graphql('mutation($id: ID!) { deleteChat(id: $id) }', { id: old.id }).catch(() => undefined);
  }
  for (const old of found.workspaceAgents.content.filter((one) => one.name.startsWith(PREFIX))) {
    await graphql('mutation($id: ID!) { deleteAgent(id: $id) }', { id: old.id }).catch(() => undefined);
  }
  for (const old of found.modelProviders.filter((one) => one.name.startsWith(PREFIX))) {
    await graphql('mutation($id: ID!) { removeModelProvider(id: $id) }', { id: old.id }).catch(() => undefined);
  }
}

await sweep();

const provider = (
  await graphql('mutation ($input: CreateModelProviderInput!) { createModelProvider(input: $input) { id } }', {
    input: { workspaceId: WORKSPACE, name: `${PREFIX}Provider${stamp}`, endpoint: STUB, secret: 'sk-scratch' },
  })
).createModelProvider;
const model = (
  await graphql('mutation ($input: CreateModelInput!) { createModel(input: $input) { id } }', {
    input: { providerId: provider.id, name: `${PREFIX}Model${stamp}`, modelId: 'stub-slow', kind: 'CHAT' },
  })
).createModel;
const agent = (await graphql('mutation ($m: ID!) { createAgentForModel(modelId: $m) { id } }', { m: model.id }))
  .createAgentForModel;

/** A chat answered by the slow agent, ready to be typed into. */
async function chat(label) {
  const started = (
    await graphql('mutation($input: StartChatInput!) { startChat(input: $input) { id } }', {
      input: { workspaceId: WORKSPACE, title: `${PREFIX} ${label} ${stamp}` },
    })
  ).startChat;
  await graphql('mutation($id: ID!, $a: ID!) { chooseChatAgent(id: $id, agentId: $a) { id } }', {
    id: started.id,
    a: agent.id,
  });
  return started.id;
}

/** What the history holds for a chat, by role. */
async function roles(id) {
  const { chatMessages } = await graphql('query($id: ID!) { chatMessages(id: $id) { role content } }', { id });
  return chatMessages.map((one) => one.role);
}

/* --------------------------------------------------------------- driving */

/** Opens a chat and says something to it; resolves once the turn has gone out. */
async function say(on, id, text) {
  await on.goto(`${BASE}/chat/${id}`, { waitUntil: 'domcontentloaded' });
  await on.waitForSelector('#chat-composer', { state: 'visible', timeout: 25_000 });
  await on.waitForTimeout(500);
  const went = on.waitForRequest(/\/api\/chats\/[^/]+\/stream/, { timeout: 15_000 });
  await on.fill('#chat-composer', text);
  await on.keyboard.press('Enter');
  await went;
}

/** Whether the answer is on the page right now. */
const answered = (on) => on.evaluate((said) => document.body.innerText.includes(said), ANSWER);

/** Waits for the answer to be on the page, up to `ms`. */
async function untilAnswered(on, ms) {
  const stop = Date.now() + ms;
  while (Date.now() < stop) {
    if (await answered(on).catch(() => false)) return true;
    await on.waitForTimeout(250);
  }
  return false;
}

const stopOffered = (on) =>
  on.evaluate(() => [...document.querySelectorAll('form button')].some((one) => (one.textContent ?? '').trim() === 'Stop'));

/* ---------------------------------- 1. leave mid-thinking, back mid-thinking */

const first = await chat('back-while-thinking');
await say(page, first, 'Think about this for a while, please');
await page.waitForTimeout(3_000);
record(!(await answered(page)), 'the model is still thinking when the page is left');

// Somewhere else entirely: a full navigation, which is the browser letting go
// of the stream exactly as closing the tab does.
await page.goto(`${BASE}/workspace/${WORKSPACE}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3_000);

await page.goto(`${BASE}/chat/${first}`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#chat-composer', { state: 'visible', timeout: 25_000 });
await page.evaluate(() => {
  window.__orknuxNeverReloaded = true;
});
const stillGoing = !(await answered(page));
record(stillGoing, 'back on the chat while the model is still thinking: no answer yet');
await page.waitForTimeout(1_500);
check(
  await stopOffered(page),
  'the page knows a turn is in flight and offers Stop for it',
  'the page shows no turn in flight, though the server is still composing one',
);
await page.screenshot({ path: shot('chat-leave-return-thinking.png') });

const live = await untilAnswered(page, 40_000);
const sameDocument = await page.evaluate(() => window.__orknuxNeverReloaded === true).catch(() => false);
check(
  live && sameDocument,
  'the answer arrives live on the page that came back, without a reload',
  `the answer never arrived on the page that came back (on the page: ${live}, same document: ${sameDocument})`,
);
await page.screenshot({ path: shot('chat-leave-return-answered.png') });
check(
  JSON.stringify(await roles(first)) === JSON.stringify(['user', 'assistant']),
  'and the history holds the question and the answer',
  `the history holds ${JSON.stringify(await roles(first))}`,
);

/* ------------------------------ 2. close the tab, open it again afterwards */

const second = await chat('closed-tab');
const leaving = await context.newPage();
await say(leaving, second, 'And this one, while I go away');
await leaving.waitForTimeout(3_000);
await leaving.close();
// The stub thinks for twenty seconds; wait out the rest of it.
await page.waitForTimeout(24_000);
await page.goto(`${BASE}/chat/${second}`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#chat-composer', { state: 'visible', timeout: 25_000 });
check(
  await untilAnswered(page, 10_000),
  'a tab closed mid-thinking: the answer is there when the chat is opened again',
  'a tab closed mid-thinking: the chat opened again shows no answer',
);

/* ------------------------------------- 3. back mid-thinking, and press Stop */

const third = await chat('stopped');
await say(page, third, 'Start on this, I may stop you');
await page.waitForTimeout(2_000);
await page.goto(`${BASE}/workspace/${WORKSPACE}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2_000);
await page.goto(`${BASE}/chat/${third}`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#chat-composer', { state: 'visible', timeout: 25_000 });
await page.waitForTimeout(1_500);
const canStop = await stopOffered(page);
record(canStop, 'a turn found in flight on return can be stopped from the page');
if (canStop) {
  await page.click('form button:text-is("Stop")');
  // Longer than the stub has left to think, so an answer that was not really
  // stopped would have landed by now.
  await page.waitForTimeout(22_000);
  record(!(await answered(page)), 'and once stopped the answer never arrives');
  check(
    JSON.stringify(await roles(third)) === JSON.stringify(['user']),
    'and the history keeps only the question',
    `the history holds ${JSON.stringify(await roles(third))} after Stop`,
  );
}

await sweep();
await finish(browser);
