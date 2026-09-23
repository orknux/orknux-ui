/**
 * What can be typed in a chat instead of said.
 *
 * Issue #343. A chat is for asking an agent, and some of what people want from
 * this product is not a question: start that workflow, file that as an issue.
 * Doing either meant leaving the conversation, finding the page and coming back
 * - and the conversation is usually where the reason lives, so what came back
 * was somebody retyping what they had just written.
 *
 * The catalogue is the server's rather than the interface's, because the chat is
 * not the only place people type: Slack's own slash commands arrive there with
 * nothing of the browser about them. That half is pinned in ChatCommandsTest.
 *
 * What is measured here is the part only a browser can answer: that a slash at
 * the start of the box opens the menu and a slash in the middle of a sentence
 * does not, that the keys work, and that the first Enter completes rather than
 * runs - because `/workflow` really runs it, and a menu that fired on the
 * keystroke that opened it would run things nobody had finished reading.
 *
 * Makes a chat of its own and files one issue through a command - which is the
 * only way to see that the command actually did something - and sweeps both.
 */
import { BASE, WORKSPACE, open, drawn, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const TITLE = `zzChatCommand ${Date.now()}`;

const sweep = async () => {
  const { workspaceIssues } = await graphql(
    `query($w: ID!) { workspaceIssues(workspaceId: $w, size: 50) { content { id number title } } }`,
    { w: WORKSPACE },
  ).catch(() => ({ workspaceIssues: { content: [] } }));
  for (const old of workspaceIssues.content.filter((one) => one.title.startsWith('zzChatCommand'))) {
    await graphql(`mutation($id: ID!) { deleteIssue(id: $id) }`, { id: old.id }).catch(() => undefined);
    console.log(`swept issue ${old.title}`);
  }
};

await sweep();

/*
 * Its own chat, opened by id. `/chat` with nothing after it picks whichever
 * conversation was last open, which is a different screen on every run.
 */
const started = await graphql('mutation($input: StartChatInput!) { startChat(input: $input) { id title } }', {
  input: { workspaceId: WORKSPACE, title: `zzChatCommand ${Date.now()}` },
});
const CHAT = started.startChat.id;
console.log(`made chat ${started.startChat.title} (#${CHAT})`);

const clean = async () => {
  await graphql('mutation($id: ID!) { deleteChat(id: $id) }', { id: CHAT }).catch(() => undefined);
  await sweep();
  await finish(browser);
};

/* -------------------------------------------------------------------- drive */

await page.goto(`${BASE}/chat/${CHAT}`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the chat'), 'the chat is on screen');

const box = page.locator('#chat-composer');
const there = await box
  .waitFor({ timeout: 20_000 })
  .then(() => true)
  .catch(() => false);
record(there, 'it has a box to type in');
if (!there) await clean();

const menu = page.locator('[role="listbox"][aria-label="Commands"]');

/* ---------------------------------------------- when the menu opens ------- */

await box.click();
await box.fill('/');
const opened = await menu
  .waitFor({ timeout: 10_000 })
  .then(() => true)
  .catch(() => false);
record(opened, 'a slash at the start of the box opens the commands');
if (!opened) await clean();

const rows = await menu.locator('[role="option"]').allInnerTexts();
console.log(`offered: ${JSON.stringify(rows)}`);
record(rows.length > 0, `and it lists what can be typed (${rows.length})`);
record(
  rows.some((one) => one.includes('/workflow')),
  'including the one that starts a workflow',
);

/*
 * Said on the row rather than only afterwards: /workflow really runs it, and if
 * that workflow messages somebody it messages them.
 */
record(
  rows.some((one) => one.includes('/workflow') && one.toLowerCase().includes('really runs')),
  'which says it really runs before it is pressed, not after',
);

/* --------------------------------------- and when it stays out of the way - */

await box.fill('what about and/or in a sentence');
const midSentence = await menu.count().then((many) => many === 0);
record(midSentence, 'a slash in the middle of a sentence is a slash, not a menu');

await box.fill('/');
await menu.waitFor({ timeout: 10_000 }).catch(() => undefined);
await box.press('Escape');
const closed = await page
  .waitForFunction(() => document.querySelector('[role="listbox"][aria-label="Commands"]') === null, {
    timeout: 10_000,
  })
  .then(() => true)
  .catch(() => false);
record(closed, 'Escape puts it away without clearing the line');
record(await box.inputValue().then((held) => held === '/'), 'and what was typed is still there');

/* ------------------------------------------ the first Enter completes ----- */

await box.fill('/iss');
await menu.waitFor({ timeout: 10_000 }).catch(() => undefined);
await box.press('Enter');
const completed = await box.inputValue();
console.log(`after Enter: ${JSON.stringify(completed)}`);
record(
  completed.startsWith('/issue'),
  `the first Enter completes the command rather than running it (${completed})`,
);

/*
 * Nothing ran. This is the assertion the whole shape exists for: a menu that
 * acted on the keystroke that opened it would start workflows nobody had
 * finished reading.
 */
const after = await graphql(
  `query($w: ID!) { workspaceIssues(workspaceId: $w, size: 50) { content { title } } }`,
  { w: WORKSPACE },
).catch(() => ({ workspaceIssues: { content: [] } }));
record(
  !after.workspaceIssues.content.some((one) => one.title.startsWith('zzChatCommand')),
  'and nothing was done by completing it',
);

/* ------------------------------------------- the second Enter acts -------- */

await box.fill(`/issue ${TITLE}`);
await box.press('Enter');

const filed = await page
  .waitForFunction(
    (wanted) => document.body.innerText.includes(wanted),
    TITLE,
    { timeout: 20_000 },
  )
  .then(() => true)
  .catch(() => false);
record(filed, 'the second Enter runs it, and what was typed is in the conversation');

/*
 * And it really filed one. Asked of the server rather than read off the screen:
 * a command that printed a confirmation and did nothing is the failure this is
 * for.
 */
/*
 * Polled rather than asked once. What is on screen is the line that was typed,
 * echoed the moment it was sent - so the transcript says nothing about whether
 * the server has finished, and a single question here read the state before the
 * command had returned.
 */
const onServer = async () => {
  const until = Date.now() + 20_000;
  for (;;) {
    const { workspaceIssues } = await graphql(
      `query($w: ID!) { workspaceIssues(workspaceId: $w, size: 50) { content { title } } }`,
      { w: WORKSPACE },
    ).catch(() => ({ workspaceIssues: { content: [] } }));
    if (workspaceIssues.content.some((one) => one.title === TITLE)) return true;
    if (Date.now() > until) {
      console.log(`gave up: ${JSON.stringify(workspaceIssues.content.map((one) => one.title).slice(0, 4))}`);
      return false;
    }
    await page.waitForTimeout(500);
  }
};

record(await onServer(), 'and the issue is on the server, not only in the transcript');

await clean();
