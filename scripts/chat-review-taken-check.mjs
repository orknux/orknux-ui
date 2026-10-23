/**
 * A review taken back stays in the chat, quieter and marked, and a line where
 * it was taken back says so. It used to be deleted, and the chat showed the
 * review as though it still stood until a reload, and then nothing at all.
 *
 * The reviews are canned on their way to the page; what is measured is what
 * the page draws of one taken back.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });
const { chatSessions } = await graphql(`query { chatSessions(workspaceId: ${WORKSPACE}) { id llmSessionId } }`);
const chat = chatSessions.find((one) => one.llmSessionId !== null);
if (chat === undefined) {
  record(false, 'the workspace has an answered chat; the seed builds one');
  await finish(browser);
}

const sent = new Date(Date.now() - 60_000).toISOString();
const taken = new Date().toISOString();
await page.route('**/graphql', async (route) => {
  const query = route.request().postDataJSON()?.query ?? '';
  if (!query.includes('chatReviews')) return route.continue();
  return route.fulfill({
    json: { data: { chatReviews: [{ id: '990', at: sent, score: 4, review: null, personName: 'alice', withdrawnAt: taken }] } },
  });
});

await page.goto(`${BASE}/chat/${chat.id}`, { waitUntil: 'domcontentloaded' });
const card = page.getByTestId('chat-review');
await card.first().waitFor({ timeout: 20_000 }).catch(() => undefined);
record((await card.first().getAttribute('data-withdrawn')) === '', 'the review is still there, marked as taken back');
record(((await card.first().textContent()) ?? '').includes('taken back'), 'and says so beside who sent it');
const line = page.getByTestId('chat-review-taken');
record((await line.count()) === 1, 'a line says where it was taken back');
record(((await line.first().textContent()) ?? '').includes('alice took back their review (4 out of 5)'), `in words (${await line.first().textContent().catch(() => '')})`);
// The same size as the card it stands for, not the page's.
const sizes = await page.evaluate(() => ['chat-review-taken', 'chat-review'].map((id) => {
  const words = document.querySelector(`[data-testid="${id}"] [class*="reviewHead"] > span:last-child`);
  return words === null ? 0 : parseFloat(getComputedStyle(words).fontSize);
}));
record(sizes[0] > 0 && sizes[0] === sizes[1], `in the same size as the review's own line (${sizes.join(' / ')}px)`);

await finish(browser);
