/**
 * Admin > Reports > Ratings, and the chat's own way of sending one.
 *
 * The page opens on the usage report, with a picker over it naming the
 * report; picking Ratings draws the reviews and no switch. The two switches -
 * what offers rate_session, and the chat's own menu - are in Admin Settings'
 * Reports section, and the report says which of them is off, on one line that
 * links to it. A review sent from a chat's "+" menu, a score of 1 to 5 and the
 * person's words, is then a row there - with the chat reviews switch on and
 * the agents' one off, since the two are separate doors.
 *
 * Leaves the switches, the limit and the picked report as it found them.
 */
import { BASE, WORKSPACE, open, drawn, record, finish, chooseOption, chosenOption } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 1000 } });

const { sessionRatingsEnabled: before, chatReviewsEnabled: beforeChat } = await graphql(
  'query { sessionRatingsEnabled { enabled } chatReviewsEnabled { enabled } }',
);
const { installationSettings: limits } = await graphql('query { installationSettings { reviewsPerSession } }');
/*
 * Everything below switches settings of the installation it runs against, so
 * they are put back in a finally: a run that stopped halfway left agents'
 * ratings off and the limit at a hundred, and the next run "restored" that.
 */
try {
await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => { try { localStorage.removeItem('orknux.reports.kind'); } catch { /* none kept */ } });

await page.goto(`${BASE}/admin/reports`, { waitUntil: 'domcontentloaded' });
await drawn(page, 'Tokens by person');
const picker = page.getByRole('combobox', { name: 'Report' });
record((await picker.count()) === 1, 'a report picker sits at the top of Reports');
const chosen = await chosenOption(page, picker);
record(chosen === 'usage', `and it opens on the usage report (${chosen})`);

// On the title's line, not under it.
const level = await page.evaluate(() => {
  const title = [...document.querySelectorAll('h1')].find((one) => one.textContent === 'Reports');
  const select = document.querySelector('[data-select][class*="pickerSelect"]');
  if (!title || !select) return null;
  const a = title.getBoundingClientRect();
  const b = select.getBoundingClientRect();
  return { overlap: Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top), right: b.right > a.right };
});
record(level !== null && level.overlap > 0 && level.right, `the picker is on the title's line, after it (${JSON.stringify(level)})`);

await chooseOption(page, picker, 'ratings');
await drawn(page, 'Reviews');
record((await page.getByText('Tokens by person').count()) === 0, 'picking Ratings swaps the usage report out');
record((await page.getByRole('switch').count()) === 0, 'the ratings report draws no switch of its own');

/* ---- the two switches, in Admin Settings ---- */

await page.goto(`${BASE}/admin/settings#reports`, { waitUntil: 'domcontentloaded' });
const toggle = page.getByRole('switch', { name: /session ratings/i });
const chatToggle = page.getByRole('switch', { name: /chat reviews/i });
await chatToggle.waitFor({ timeout: 20_000 });
record((await toggle.count()) === 1 && (await chatToggle.count()) === 1, "Admin Settings has a switch for the agents' tool and one for the chat menu");
const sections = await page.evaluate(() => ['#session-ratings', '#chat-reviews', '#reviews-per-session'].map((selector) => {
  const element = document.querySelector(selector);
  if (element === null) return null;
  const headings = [...document.querySelectorAll('h2[id]')].filter((one) => one.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING);
  return headings.at(-1)?.id ?? null;
}));
record(sections.every((one) => one === 'reports'), `both switches and the reviews per conversation are in its Reports section (${sections.join()})`);

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
// Disabled until the server has said what it holds, and saying off until then.
await page.locator('#chat-reviews [role="switch"]:not([disabled])').waitFor({ timeout: 20_000 });
record((await page.getByRole('switch', { name: /chat reviews/i }).getAttribute('aria-checked')) === 'true', 'and the chat reviews switch says on after a reload');

/* ---- the report says which is off, and links to it ---- */

await page.goto(`${BASE}/admin/reports`, { waitUntil: 'domcontentloaded' });
await drawn(page, 'Reviews');
record((await chosenOption(page, page.getByRole('combobox', { name: 'Report' }))) === 'ratings', 'the picked report is remembered over a reload');
const offLine = page.locator('[data-recording-off="ratings"]');
await offLine.waitFor({ timeout: 10_000 }).catch(() => {});
const said = ((await offLine.textContent().catch(() => '')) ?? '').trim();
record((await offLine.count()) === 1 && /Session ratings are off/.test(said) && !/chat reviews/i.test(said), `with agents' ratings off, the report says which (${said})`);
const href = await offLine.getByRole('link').getAttribute('href').catch(() => null);
record(href === '/admin/settings#session-ratings', `and links to that switch (${href})`);
await offLine.getByRole('link').click();
await page.waitForURL(/\/admin\/settings#session-ratings$/, { timeout: 10_000 }).catch(() => {});
const landed = page.locator('#session-ratings [role="switch"]');
await landed.waitFor({ timeout: 20_000 }).catch(() => {});
const view = await landed.evaluate((element) => {
  const box = element.getBoundingClientRect();
  return { top: Math.round(box.top), bottom: Math.round(box.bottom), height: window.innerHeight };
}).catch(() => null);
record(view !== null && view.top >= 0 && view.bottom <= view.height, `which lands on it, in view (${JSON.stringify(view)})`);

// Both on, and the report says nothing about either.
await graphql('mutation { setSessionRatings(enabled: true) { enabled } }');
await page.goto(`${BASE}/admin/reports`, { waitUntil: 'domcontentloaded' });
await drawn(page, 'Reviews');
record((await page.locator('[data-recording-off]').count()) === 0, 'with both on, the report says nothing about them');
await graphql('mutation { setSessionRatings(enabled: false) { enabled } }');

/* ---- a chat with nothing answered offers no review ---- */

// Reported: the menu offered Send a review on a new chat, and sending it was refused.
const { startChat: fresh } = await graphql(
  `mutation { startChat(input: { workspaceId: ${WORKSPACE}, title: "zz review nothing yet" }) { id } }`,
);
try {
  await page.goto(`${BASE}/chat/${fresh.id}`, { waitUntil: 'domcontentloaded' });
  await page.getByText('Nothing said yet', { exact: false }).first().waitFor({ timeout: 15_000 }).catch(() => {});
  const plusFresh = page.getByRole('button', { name: 'Add to this message' });
  if ((await plusFresh.count()) > 0) await plusFresh.click();
  await page.waitForTimeout(300);
  const offered = await page.getByRole('menuitem', { name: 'Send a review' }).count();
  record(offered === 0, `a chat with no answer yet does not offer Send a review (${offered})`);
} finally {
  await graphql(`mutation { deleteChat(id: ${fresh.id}) }`).catch(() => undefined);
}

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
  const stars = await line.first().locator('[role="img"]').getAttribute('aria-label').catch(() => null);
  record(stars === '2 out of 5' && shown.includes('reviewed this chat'), `and the review is drawn in the chat (${stars}; ${shown})`);
  // A card of its own: a panel behind it, the stars drawn, and the words on a line below them.
  const card = await line.first().evaluate((element) => {
    const lit = [...element.querySelectorAll('svg')].map((star) => getComputedStyle(star).fill);
    const words = element.querySelector('[data-review-words]')?.getBoundingClientRect();
    const head = element.firstElementChild?.getBoundingClientRect();
    return {
      panel: getComputedStyle(element).backgroundColor,
      page: getComputedStyle(document.body).backgroundColor,
      lit: lit.filter((fill) => fill === lit[0]).length,
      count: lit.length,
      below: words !== undefined && head !== undefined && words.top >= head.bottom,
    };
  });
  record(
    card.panel !== card.page && card.panel !== 'rgba(0, 0, 0, 0)' && card.count === 5 && card.lit === 2 && card.below,
    `drawn as a card: a panel, two of five stars lit, the words below (${JSON.stringify(card)})`,
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
  await line.first().waitFor({ timeout: 15_000 }).catch(() => {});
  record((await line.count()) === 1, 'and is still there after a reload');
  // Reported: opening the chat scrolled to the last turn and left the review below the fold.
  // A short window, so the chat overflows and there is a fold for it to be left below.
  await page.setViewportSize({ width: 1280, height: 420 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await line.first().waitFor({ timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(800);
  const inView = await line.first().evaluate((card) => {
    let log = card.parentElement;
    while (log !== null && getComputedStyle(log).overflowY !== 'auto' && getComputedStyle(log).overflowY !== 'scroll') log = log.parentElement;
    if (log === null) return null;
    return {
      cardBottom: Math.round(card.getBoundingClientRect().bottom),
      logBottom: Math.round(log.getBoundingClientRect().bottom),
      gap: Math.round(log.scrollHeight - log.clientHeight - log.scrollTop),
      overflows: log.scrollHeight > log.clientHeight + 40,
    };
  });
  record(
    inView !== null && inView.overflows && inView.cardBottom <= inView.logBottom + 1 && inView.gap < 40,
    `opening the chat scrolls down to the review (${JSON.stringify(inView)})`,
  );
  await page.setViewportSize({ width: 1500, height: 1000 });

  const { sessionRatings } = await graphql(
    'query { sessionRatings(filter: {}, size: 5) { rows { score review sessionId personKey } } }',
  );
  const row = sessionRatings.rows.find((one) => one.review === words);
  record(row?.score === 2 && row?.sessionId === chat.llmSessionId, `the review is kept with its score and session (${JSON.stringify(row)})`);

  await page.goto(`${BASE}/admin/reports`, { waitUntil: 'domcontentloaded' });
  await drawn(page, 'Reviews');
  const drawnRow = page.getByTestId('rating-row').filter({ hasText: words });
  await drawnRow.first().waitFor({ timeout: 10_000 });
  const score = (await drawnRow.first().locator('[data-rating-score]').textContent())?.trim();
  record(score === '2 / 5', `and drawn on the Ratings report (${score})`);
  const cells = await drawnRow.first().locator('td').allTextContents();
  const workspace = (await drawnRow.first().locator('[data-rating-workspace]').textContent())?.trim() ?? '';
  record(workspace !== '' && !cells.at(-2).includes(workspace), `the workspace has a column of its own, not the session's (${JSON.stringify(cells.slice(-2))})`);
}
} finally {
  // Back as it was, however the run ended.
  await graphql(`mutation { setReviewsPerSession(count: ${limits.reviewsPerSession}) { reviewsPerSession } }`).catch(() => undefined);
  await graphql(`mutation { setSessionRatings(enabled: ${before.enabled}) { enabled } }`).catch(() => undefined);
  await graphql(`mutation { setChatReviews(enabled: ${beforeChat.enabled}) { enabled } }`).catch(() => undefined);
  await page.evaluate(() => { try { localStorage.removeItem('orknux.reports.kind'); } catch { /* none kept */ } }).catch(() => undefined);
}

await finish(browser);
