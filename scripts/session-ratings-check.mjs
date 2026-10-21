/**
 * Admin > Reports > Ratings, and the chat's own way of sending one.
 *
 * The page opens on the usage report, with a picker over it naming the
 * report; picking Ratings draws its own switch - what offers rate_session -
 * and the reviews. A review sent from a chat's "+" menu, a score of 1 to 5 and
 * the person's words, is then a row there - with the chat reviews switch on
 * and the agents' one off, since the two are separate doors.
 *
 * Leaves the switch, the limit and the picked report as it found them.
 */
import { BASE, WORKSPACE, open, drawn, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 1000 } });

const { sessionRatingsEnabled: before, chatReviewsEnabled: beforeChat } = await graphql(
  'query { sessionRatingsEnabled { enabled } chatReviewsEnabled { enabled } }',
);
const { installationSettings: limits } = await graphql('query { installationSettings { reviewsPerSession } }');
await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => { try { localStorage.removeItem('orknux.reports.kind'); } catch { /* none kept */ } });

await page.goto(`${BASE}/admin/reports`, { waitUntil: 'domcontentloaded' });
await drawn(page, 'Usage tracking');
const picker = page.getByRole('combobox', { name: 'Report' });
record((await picker.count()) === 1, 'a report picker sits at the top of Reports');
record((await picker.inputValue()) === 'usage', `and it opens on the usage report (${await picker.inputValue()})`);

// On the title's line, not under it.
const level = await page.evaluate(() => {
  const title = [...document.querySelectorAll('h1')].find((one) => one.textContent === 'Reports');
  const select = document.querySelector('select[class*="pickerSelect"]');
  if (!title || !select) return null;
  const a = title.getBoundingClientRect();
  const b = select.getBoundingClientRect();
  return { overlap: Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top), right: b.right > a.right };
});
record(level !== null && level.overlap > 0 && level.right, `the picker is on the title's line, after it (${JSON.stringify(level)})`);

await picker.selectOption('ratings');
await drawn(page, 'Session ratings');
record((await page.getByTestId('usage-tracking').count()) === 0, 'picking Ratings swaps the usage report out');
const toggle = page.getByRole('switch', { name: /session ratings/i });
const chatToggle = page.getByRole('switch', { name: /chat reviews/i });
record((await toggle.count()) === 1 && (await chatToggle.count()) === 1, "the ratings report has a switch for the agents' tool and one for the chat menu");

// Chat reviews on, so a chat can send one; agents' ratings off, to show the two are apart.
const switchTo = async (which, want) => {
  if ((await which.getAttribute('aria-checked')) !== String(want)) {
    await which.click();
    await page.waitForFunction(([el, w]) => el.getAttribute('aria-checked') === w, [await which.elementHandle(), String(want)]);
  }
};
await switchTo(chatToggle, true);
await switchTo(toggle, false);
await page.reload({ waitUntil: 'domcontentloaded' });
await drawn(page, 'Session ratings');
record((await page.getByRole('combobox', { name: 'Report' }).inputValue()) === 'ratings', 'the picked report is remembered over a reload');
record((await page.getByRole('switch', { name: /chat reviews/i }).getAttribute('aria-checked')) === 'true', 'and the chat reviews switch says on');

/* ---- a review from a chat's + menu ---- */

const { chatSessions } = await graphql(`query { chatSessions(workspaceId: ${WORKSPACE}) { id llmSessionId } }`);
const chat = chatSessions.find((one) => one.llmSessionId !== null);
if (chat === undefined) {
  record(true, 'no answered chat in this workspace to review; the menu half is skipped');
} else {
  await graphql('mutation { setReviewsPerSession(count: 100) { reviewsPerSession } }');
  const words = `check ${Date.now()}`;
  await page.goto(`${BASE}/chat/${chat.id}`, { waitUntil: 'domcontentloaded' });
  const plus = page.getByRole('button', { name: 'Add to this message' });
  await plus.waitFor({ timeout: 15_000 });
  await plus.click();
  const item = page.getByRole('menuitem', { name: 'Send a review' });
  record((await item.count()) === 1, 'the chat\'s + menu offers Send a review');
  await item.click();
  const dialog = page.getByTestId('review-dialog');
  await dialog.waitFor();
  const send = dialog.getByRole('button', { name: 'Send review' });
  record(await send.isDisabled(), 'it cannot be sent without a score');
  const scores = await dialog.getByRole('radio').allInnerTexts();
  record(scores.join() === '1,2,3,4,5', `the score is one of 1 to 5 (${scores.join()})`);
  await dialog.getByRole('radio', { name: '2' }).click();
  await dialog.getByRole('textbox', { name: 'Review' }).fill(words);
  await send.click();
  await dialog.waitFor({ state: 'hidden', timeout: 10_000 });
  record(true, 'sending closes the dialog');
  const line = page.getByTestId('chat-review').filter({ hasText: words });
  await line.first().waitFor({ timeout: 10_000 }).catch(() => {});
  const shown = ((await line.first().textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ');
  record(shown.includes('2 / 5') && shown.includes('reviewed this chat'), `and the review is drawn in the chat (${shown})`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await line.first().waitFor({ timeout: 15_000 }).catch(() => {});
  record((await line.count()) === 1, 'and is still there after a reload');

  const { sessionRatings } = await graphql(
    'query { sessionRatings(filter: {}, size: 5) { rows { score review sessionId personKey } } }',
  );
  const row = sessionRatings.rows.find((one) => one.review === words);
  record(row?.score === 2 && row?.sessionId === chat.llmSessionId, `the review is kept with its score and session (${JSON.stringify(row)})`);

  await page.goto(`${BASE}/admin/reports`, { waitUntil: 'domcontentloaded' });
  await drawn(page, 'Session ratings');
  const drawnRow = page.getByTestId('rating-row').filter({ hasText: words });
  await drawnRow.first().waitFor({ timeout: 10_000 });
  const score = (await drawnRow.first().locator('[data-rating-score]').textContent())?.trim();
  record(score === '2 / 5', `and drawn on the Ratings report (${score})`);
  const cells = await drawnRow.first().locator('td').allTextContents();
  const workspace = (await drawnRow.first().locator('[data-rating-workspace]').textContent())?.trim() ?? '';
  record(workspace !== '' && !cells.at(-2).includes(workspace), `the workspace has a column of its own, not the session's (${JSON.stringify(cells.slice(-2))})`);
  await graphql(`mutation { setReviewsPerSession(count: ${limits.reviewsPerSession}) { reviewsPerSession } }`);
}

// Back as it was.
await graphql(`mutation { setSessionRatings(enabled: ${before.enabled}) { enabled } }`);
await graphql(`mutation { setChatReviews(enabled: ${beforeChat.enabled}) { enabled } }`);
await page.evaluate(() => { try { localStorage.removeItem('orknux.reports.kind'); } catch { /* none kept */ } });

await finish(browser);
