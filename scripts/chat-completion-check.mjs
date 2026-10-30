/**
 * Sentence completion in the chat composer, issue #649: after a pause in the
 * typing the completion model's continuation is drawn in grey after the caret,
 * starting where the typed text ends, and Tab puts it into the box. Escape and
 * typing on take it away, and nothing is asked in a workspace with no
 * Completion model.
 *
 * And what the feedback on it asked for: typing on after Tab is suggested to
 * again; typing the suggested words themselves keeps the rest drawn rather
 * than taking it away at the first key; and replies to the latest answer are
 * suggested under it as chips, sent with a click, gone once something is sent.
 *
 * The server is not asked for a suggestion: the workspace's answer is told it
 * has a Completion model, the chat's history ends on an answer written here,
 * and the completion, the replies and the send are answered here, so what is
 * checked is the page and not a model.
 */
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });

const { chatSessions } = await graphql(
  `query ($w: ID!) { chatSessions(workspaceId: $w) { id title } }`,
  { w: WORKSPACE },
);
const chat = chatSessions[0];
if (chat === undefined) {
  record(false, 'the workspace has a chat to open; the seed builds one');
  await finish(browser);
}

const SUGGESTED = ' to Friday morning';
/** What the stub answers; long for the case of a suggestion wider than the box. */
let answer = SUGGESTED;
/** Whether the workspace is answered as having a Completion model. */
let completing = true;
/** The texts the page asked a completion for, in order. */
const asked = [];
/** How many times the page asked for suggested replies. */
let repliesAsked = 0;
const REPLIES = ['Run it on Friday instead', 'Show me the logs', 'Cancel it'];
/** What the page sent as a message, in order. */
const sentMessages = [];
/** Holds a send open until released, so what the page shows while it is going can be read. */
let releaseSend = null;

const line = (role, content) => ({ role, content, actor: null, takes: [], thinking: null, thinkingMillis: null, at: new Date().toISOString(), attachments: [] });

await page.route('**/graphql', async (route) => {
  const body = route.request().postData() ?? '';
  if (body.includes('query ChatCompletion(')) {
    asked.push(JSON.parse(body).variables.text);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { chatCompletion: answer } }),
    });
    return;
  }
  if (body.includes('query ChatReplySuggestions(')) {
    repliesAsked += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { chatReplySuggestions: REPLIES } }),
    });
    return;
  }
  // The chat ends on a finished answer, whatever the seed left in it.
  if (body.includes('query ChatMessages(')) {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: { chatMessages: [line('user', 'When does the deploy run?'), line('assistant', 'Every weekday at nine.')] },
      }),
    });
    return;
  }
  if (body.includes('query Workspace(')) {
    const response = await route.fetch();
    const held = await response.json();
    if (held.data?.workspace) {
      held.data.workspace.completionModelId = completing ? '1' : null;
      held.data.workspace.completionAvailable = completing;
      held.data.workspace.completionPauseMillis = 300;
    }
    await route.fulfill({ response, body: JSON.stringify(held) });
    return;
  }
  await route.continue();
});

/** A send: recorded, held until released, then answered with one sentence. */
await page.route('**/api/chats/*/stream', async (route) => {
  sentMessages.push(JSON.parse(route.request().postData() ?? '{}').text ?? null);
  await new Promise((resolve) => {
    releaseSend = resolve;
  });
  const frames = [
    'event: chunk', 'data: {"text":"Moved to Friday."}', '',
    'event: done', 'data: {"millis":120,"thinkingMillis":0,"inputTokens":3,"outputTokens":4,"cost":null}', '', '',
  ].join(String.fromCharCode(10));
  await route.fulfill({ status: 200, contentType: 'text/event-stream', body: frames }).catch(() => {});
});

await page.goto(`${BASE}/chat/${chat.id}`, { waitUntil: 'domcontentloaded' });
if (await drawn(page, 'the chat log')) {
  const box = page.locator('#chat-composer');
  const ghost = page.getByTestId('chat-composer-suggestion');
  const chips = page.getByTestId('chat-reply-suggestion');

  /* Suggested replies under the latest answer. */
  const offered = await chips.first().waitFor({ timeout: 5_000 }).then(() => true).catch(() => false);
  const texts = offered ? await chips.allInnerTexts() : [];
  record(
    offered && JSON.stringify(texts.map((one) => one.trim())) === JSON.stringify(REPLIES),
    `replies are suggested under the latest answer (${JSON.stringify(texts)})`,
  );
  const under = await page.evaluate(() => {
    const group = document.querySelector('[data-testid="chat-reply-suggestions"]');
    const row = group?.closest('[class*="assistantRow"]');
    return row !== null && row !== undefined && (row.textContent ?? '').includes('Every weekday at nine.');
  });
  record(under, 'the chips are drawn in the latest answer, not elsewhere on the page');
  const oneLine = await chips.evaluateAll((all) => all.every((chip) => chip.getClientRects().length === 1 && chip.scrollHeight <= chip.clientHeight + 1));
  record(offered && oneLine, 'each chip is one line');

  // Typing is writing a message of one's own: the chips go while anything is in the box.
  await box.click();
  await box.pressSequentially('x', { delay: 20 });
  record((await chips.count()) === 0, 'the chips are not shown while something is typed');
  await box.fill('');
  await chips.first().waitFor({ timeout: 2_000 }).catch(() => {});

  // A click sends the reply as it is.
  if (offered) {
    await chips.nth(1).click();
    await page.waitForTimeout(300);
    record(sentMessages.at(-1) === REPLIES[1], `a click sends the reply (${JSON.stringify(sentMessages)})`);
    const shownAsMessage = await page.locator('[class*="userBubble"]').filter({ hasText: REPLIES[1] }).count();
    record(shownAsMessage > 0, 'and it is drawn as the person’s message');
    record((await box.inputValue()) === '', 'the composer is left as it was, empty');
    record((await chips.count()) === 0, 'the chips are gone once something is sent');
  } else {
    record(false, 'a click sends the reply (no chips to click)');
    record(false, 'the chips are gone once something is sent (no chips to begin with)');
  }
  releaseSend?.();
  await page.getByText('Moved to Friday.').first().waitFor({ timeout: 5_000 }).catch(() => {});

  await box.click();
  await box.pressSequentially('Can we move the deploy', { delay: 20 });
  const shown = await ghost.waitFor({ timeout: 5_000 }).then(() => true).catch(() => false);
  record(shown, 'a pause in the typing draws the suggestion after the caret');
  record(asked.at(-1) === 'Can we move the deploy', `the completion was asked for the text typed (${JSON.stringify(asked.at(-1))})`);

  if (shown) {
    // Drawn after the typed text, on its line, in a colour that is not the text's.
    const placed = await page.evaluate(() => {
      const words = document.querySelector('[data-testid="chat-composer-suggestion"]');
      const typed = words?.previousElementSibling;
      const area = document.getElementById('chat-composer');
      if (!words || !typed || !area) return null;
      const a = typed.getBoundingClientRect();
      const w = words.getClientRects()[0];
      const t = area.getBoundingClientRect();
      return {
        gap: Math.round(w.left - a.right),
        sameLine: Math.abs(w.top - (typed.getClientRects()[typed.getClientRects().length - 1]?.top ?? 0)) < 2,
        inside: w.top >= t.top - 1 && w.bottom <= t.bottom + 1,
        grey: getComputedStyle(words).color !== getComputedStyle(area).color,
      };
    });
    record(
      placed !== null && Math.abs(placed.gap) <= 1 && placed.sameLine && placed.inside,
      `the suggestion starts where the typed text ends, inside the box (${JSON.stringify(placed)})`,
    );
    record(placed?.grey === true, 'the suggestion is drawn in a colour of its own');

    await page.keyboard.press('Tab');
    const value = await box.inputValue();
    record(value === `Can we move the deploy${SUGGESTED}`, `Tab puts the suggestion into the box (${JSON.stringify(value)})`);
    record(await box.evaluate((el) => el === document.activeElement), 'Tab leaves the caret in the box');
    record((await ghost.count()) === 0, 'the suggestion is gone once taken');

    // Typing on after Tab is suggested to again.
    answer = ' so the team can review it';
    const before = asked.length;
    await box.pressSequentially(' and', { delay: 20 });
    const again = await ghost.waitFor({ timeout: 5_000 }).then(() => true).catch(() => false);
    record(
      again && asked.at(-1) === `Can we move the deploy${SUGGESTED} and` && (await ghost.innerText()) === answer,
      `typing on after Tab gets a second suggestion (${asked.length - before} asked, last ${JSON.stringify(asked.at(-1))})`,
    );

    // Typing the suggested words keeps the rest drawn, at once and without asking again.
    if (again) {
      const count = asked.length;
      await page.keyboard.type(' so', { delay: 20 });
      const rest = await ghost.innerText({ timeout: 100 }).catch(() => null);
      record(rest === ' the team can review it', `typing the suggested words keeps the rest of them drawn (${JSON.stringify(rest)})`);
      await page.waitForTimeout(600);
      record(asked.length === count, `and nothing is asked while the suggestion still covers what is typed (${asked.length - count} asked)`);
      await page.keyboard.press('Tab');
      const taken = await box.inputValue();
      record(taken === `Can we move the deploy${SUGGESTED} and so the team can review it`, `Tab takes the rest (${JSON.stringify(taken)})`);
    }
    answer = SUGGESTED;
  }

  // Typing on takes a suggestion away at once, before any answer could come.
  await box.fill('');
  await box.pressSequentially('Is the build green', { delay: 20 });
  await ghost.waitFor({ timeout: 5_000 }).catch(() => {});
  await page.keyboard.type('?');
  record((await ghost.count()) === 0, 'a key typed takes the suggestion away');

  await ghost.waitFor({ timeout: 5_000 }).catch(() => {});
  await page.keyboard.press('Escape');
  record((await ghost.count()) === 0, 'Escape takes the suggestion away');
  record((await box.inputValue()) === 'Is the build green?', 'Escape leaves what was typed as it was');

  // A suggestion running over several lines is shown whole: the box grows for it, and gives the room back when it goes.
  await box.fill('');
  const oneLineBox = (await box.boundingBox()).height;
  answer = ' and then ' + 'the release notes, the migration plan and the rollback steps '.repeat(4);
  await box.pressSequentially('Please send the summary', { delay: 20 });
  await ghost.waitFor({ timeout: 5_000 }).catch(() => {});
  const whole = await page.evaluate(() => {
    const words = document.querySelector('[data-testid="chat-composer-suggestion"]');
    const area = document.querySelector('#chat-composer');
    if (words === null || area === null) return null;
    const range = document.createRange();
    range.selectNodeContents(words);
    const rects = [...range.getClientRects()];
    const last = rects[rects.length - 1];
    const frame = area.getBoundingClientRect();
    return { lines: rects.length, lastBottom: Math.round(last.bottom), boxBottom: Math.round(frame.bottom) };
  });
  record(whole !== null && whole.lines > 1 && whole.lastBottom <= whole.boxBottom, `a long suggestion is shown to its last line (${JSON.stringify(whole)})`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const after = (await box.boundingBox()).height;
  record(after <= oneLineBox + 1, `and the box goes back to its size when it goes (${Math.round(oneLineBox)} -> ${Math.round(after)})`);
  answer = SUGGESTED;

  // A workspace with no Completion model asks for nothing.
  completing = false;
  asked.length = 0;
  repliesAsked = 0;
  await page.reload({ waitUntil: 'domcontentloaded' });
  if (await drawn(page, 'the chat log')) {
    await page.waitForTimeout(800);
    record(repliesAsked === 0 && (await chips.count()) === 0, `with no Completion model no replies are asked for (${repliesAsked} asked)`);
    await box.click();
    await box.pressSequentially('Nothing to suggest here', { delay: 20 });
    await page.waitForTimeout(1_000);
    record(asked.length === 0 && (await ghost.count()) === 0, `with no Completion model nothing is asked (${asked.length} asked)`);
  }
  await box.fill('');
}

await finish(browser);
