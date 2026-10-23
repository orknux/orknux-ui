/**
 * Sentence completion in the chat composer, issue #649: after a pause in the
 * typing the completion model's continuation is drawn in grey after the caret,
 * starting where the typed text ends, and Tab puts it into the box. Escape and
 * typing on take it away, and nothing is asked in a workspace with no
 * Completion model.
 *
 * The server is not asked for a suggestion: the workspace's answer is told it
 * has a Completion model and the completion itself is answered here, so what is
 * checked is the composer and not a model.
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
  if (body.includes('query Workspace(')) {
    const response = await route.fetch();
    const held = await response.json();
    if (held.data?.workspace) {
      held.data.workspace.completionModelId = completing ? '1' : null;
      held.data.workspace.completionPauseMillis = 300;
    }
    await route.fulfill({ response, body: JSON.stringify(held) });
    return;
  }
  await route.continue();
});

await page.goto(`${BASE}/chat/${chat.id}`, { waitUntil: 'domcontentloaded' });
if (await drawn(page, 'the chat log')) {
  const box = page.locator('#chat-composer');
  const ghost = page.getByTestId('chat-composer-suggestion');

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
  const oneLine = (await box.boundingBox()).height;
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
  record(after <= oneLine + 1, `and the box goes back to its size when it goes (${Math.round(oneLine)} -> ${Math.round(after)})`);
  answer = SUGGESTED;

  // A workspace with no Completion model asks for nothing.
  completing = false;
  asked.length = 0;
  await page.reload({ waitUntil: 'domcontentloaded' });
  if (await drawn(page, 'the chat log')) {
    await box.click();
    await box.pressSequentially('Nothing to suggest here', { delay: 20 });
    await page.waitForTimeout(1_000);
    record(asked.length === 0 && (await ghost.count()) === 0, `with no Completion model nothing is asked (${asked.length} asked)`);
  }
  await box.fill('');
}

await finish(browser);
