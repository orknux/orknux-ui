/**
 * Thinking is drawn where it happened. A model that thinks, calls a tool and
 * thinks again had all of it joined into the one section above its calls, so
 * what it thought after reading a tool's answer read as if it came first. The
 * thinking before the first call stays above the calls; thinking after a call
 * is a folded section of its own, in its place among them.
 *
 * Three halves. Live, as the turn streams. Reloaded, where the server answers
 * each round's thinking as a `thought` line among the `tool` lines and the
 * answer then carries none - so the section is not drawn twice. And how it
 * looks: the chat's thinking is the session transcript's thinking card, read
 * off the computed style of both, and the chat's cards are a step smaller than
 * the session's - smaller than they are without the chat's sizing, and smaller
 * than the answer they sit above, but never under 11px.
 */
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });

const { chatSessions } = await graphql(`query ($w: ID!) { chatSessions(workspaceId: $w) { id title } }`, { w: WORKSPACE });
const chat = chatSessions[0];
if (chat === undefined) {
  record(false, 'the workspace has a chat to open; the seed builds one');
  await finish(browser);
}

const AT = '2026-10-24T09:00:00Z';
const line = (role, content, extra = {}) => ({
  role,
  content,
  actor: null,
  takes: [],
  thinking: null,
  thinkingMillis: null,
  at: AT,
  attachments: [],
  ...extra,
});

/** What the server answers for a reloaded chat whose agent thought, looked up, and thought again. */
const RELOADED = [
  line('user', 'look it up'),
  line('thought', '', { actor: 'Reviewer', thinking: 'FIRST-THOUGHT which list to read.', thinkingMillis: 1200 }),
  line('tool', '{}', { actor: 'split_lookup' }),
  line('thought', '', { actor: 'Reviewer', thinking: 'SECOND-THOUGHT the answer says ok.', thinkingMillis: 800 }),
  line('tool', '{}', { actor: 'split_after' }),
  line('assistant', 'Done looking.', { actor: 'Reviewer' }),
];

let messages = [];
await page.route('**/graphql', async (route) => {
  const body = route.request().postData() ?? '';
  if (body.includes('ChatMessages')) {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { chatMessages: messages } }) });
    return;
  }
  await route.continue();
});

/** Opens every folded section in the last answer's working, and in the log around it. */
async function openAll(scope) {
  const toggles = scope.locator('button[aria-expanded="false"]');
  for (let i = (await toggles.count()) - 1; i >= 0; i -= 1) await toggles.nth(i).click().catch(() => {});
  await page.waitForTimeout(300);
}

/* ------------------------------------------------------------------- live */

const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
await page.route('**/api/chats/*/stream', (route) =>
  route.fulfill({
    status: 200,
    contentType: 'text/event-stream',
    body: [
      frame('thinking', { text: 'FIRST-THOUGHT which list to read.' }),
      frame('call', { at: 0, tool: 'split_lookup', arguments: '{}' }),
      frame('called', { at: 0, result: '{"ok":true}', failed: false }),
      frame('thinking', { text: 'SECOND-THOUGHT the answer says ok.' }),
      frame('call', { at: 1, tool: 'split_after', arguments: '{}' }),
      frame('called', { at: 1, result: '{}', failed: false }),
      frame('chunk', { text: 'Done looking.' }),
      frame('done', { millis: 120, thinkingMillis: 0, inputTokens: 3, outputTokens: 4, cost: null }),
    ].join(''),
  }),
);

await page.goto(`${BASE}/chat/${chat.id}`, { waitUntil: 'domcontentloaded' });
if (await drawn(page, 'the chat log')) {
  await page.waitForTimeout(500);
  await page.fill('textarea', 'look it up');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2500);
  await openAll(page.locator('[class*="assistantRow"]').last());
  const order = await page.locator('[class*="assistantRow"]').last().evaluate((row) => {
    const text = row.textContent ?? '';
    const where = (word) => text.indexOf(word);
    return {
      first: where('FIRST-THOUGHT'),
      lookup: where('split_lookup'),
      second: where('SECOND-THOUGHT'),
      after: where('split_after'),
      sections: row.querySelectorAll('[data-thought]').length,
    };
  });
  record(order.first >= 0 && order.first < order.lookup, `the thinking before the first call is above it (${JSON.stringify(order)})`);
  record(order.second > order.lookup && order.second < order.after, 'the thinking after a call is drawn after that call, before the next');
  record(order.sections === 1, `as a section of its own (${order.sections})`);
}

/* --------------------------------------------------------------- reloaded */

messages = RELOADED;
await page.goto(`${BASE}/chat/${chat.id}`, { waitUntil: 'domcontentloaded' });
let sizes = null;
if (await drawn(page, 'the reloaded chat log')) {
  await page.locator('[data-thought]').first().waitFor({ timeout: 15_000 }).catch(() => undefined);
  await openAll(page.locator('[class*="_log_"]').first());
  const reloaded = await page.evaluate(() => {
    const log = document.querySelector('[class*="_log_"]');
    const text = log?.textContent ?? '';
    const where = (word) => text.indexOf(word);
    const answer = [...document.querySelectorAll('[class*="assistantRow"]')].pop();
    return {
      first: where('FIRST-THOUGHT'),
      lookup: where('split_lookup'),
      second: where('SECOND-THOUGHT'),
      after: where('split_after'),
      done: where('Done looking.'),
      sections: log?.querySelectorAll('[data-thought] [data-testid="thinking"]').length ?? 0,
      // The answer's own row draws no thinking: it went to the lines above.
      onAnswer: answer?.querySelectorAll('[data-testid="thinking"]').length ?? -1,
      firstSeen: text.split('FIRST-THOUGHT').length - 1,
    };
  });
  record(
    reloaded.first >= 0 && reloaded.first < reloaded.lookup && reloaded.lookup < reloaded.second && reloaded.second < reloaded.after && reloaded.after < reloaded.done,
    `reloaded, each round's thinking is in its place among the calls (${JSON.stringify(reloaded)})`,
  );
  record(reloaded.sections === 2, `as two folded sections of their own (${reloaded.sections})`);
  record(reloaded.onAnswer === 0 && reloaded.firstSeen === 1, 'and the answer does not draw the same thinking a second time');

  /*
   * The chat's cards a step smaller: read with the chat's sizing, then with it
   * taken off the log (`initial` puts every card back on the session's
   * fallbacks), and compared - which is the before and after in one run.
   */
  const measure = () =>
    page.evaluate(() => {
      const name = [...document.querySelectorAll('[class*="_name_"]')].find((one) => one.textContent?.trim() === 'split_lookup');
      const card = name?.closest('[class*="_card_"]');
      const prose = document.querySelector('[data-thought] pre');
      const answer = [...document.querySelectorAll('[class*="assistantRow"]')].pop()?.querySelector('p');
      const px = (element) => (element ? parseFloat(getComputedStyle(element).fontSize) : NaN);
      return {
        toolText: px(name),
        toolHeight: card?.getBoundingClientRect().height ?? NaN,
        thinkingText: px(prose),
        answerText: px(answer),
      };
    });
  const compact = await measure();
  await page.evaluate(() => {
    const log = document.querySelector('[class*="_log_"]');
    for (const name of ['--event-text', '--event-prose', '--event-pad-y', '--event-pad-x', '--event-gap']) log?.style.setProperty(name, 'initial');
  });
  await page.waitForTimeout(200);
  const full = await measure();
  await page.evaluate(() => document.querySelector('[class*="_log_"]')?.removeAttribute('style'));
  sizes = { compact, full };
  record(
    compact.toolText < full.toolText && compact.toolHeight < full.toolHeight,
    `a tool row in the chat is a step smaller than the session's card (${JSON.stringify(sizes)})`,
  );
  record(compact.toolText >= 11 && compact.thinkingText >= 11, 'and its text is never under 11px');
  record(
    compact.toolText < compact.answerText && compact.thinkingText < compact.answerText,
    'and the tool row and the thinking are set smaller than the answer',
  );
}

/* ------------------------------------------------- one look with the session */

const thinkingCardLook = (selector) =>
  page.evaluate((card) => {
    const block = document.querySelector(card);
    const badge = block?.querySelector('[class*="_badge_"], [class*="_kindBadge_"]');
    const style = block ? getComputedStyle(block) : null;
    const badgeStyle = badge ? getComputedStyle(badge) : null;
    return {
      background: style?.backgroundColor ?? '',
      edge: style?.borderLeftColor ?? '',
      edgeWidth: style?.borderLeftWidth ?? '',
      radius: style?.borderTopLeftRadius ?? '',
      badgeInk: badgeStyle?.color ?? '',
      badgeTint: badgeStyle?.backgroundColor ?? '',
      badgeCase: badgeStyle?.textTransform ?? '',
      badgeWeight: badgeStyle?.fontWeight ?? '',
      badgeWord: badge?.textContent?.trim() ?? '',
    };
  }, selector);

const chatLook = await thinkingCardLook('[data-thought] [data-testid="thinking"]');

const SESSION = {
  id: '9002',
  key: 'zz-thinking-look',
  keyPrefix: 'zz',
  workspaceId: WORKSPACE,
  eventCount: 1,
  createdAt: AT,
  lastEventAt: AT,
};
const EVENTS = [{ id: 1, kind: 'THINKING', actor: 'Reviewer', content: 'Checking the runs.', result: null, millis: 4200, at: AT }];
await page.unroute('**/graphql');
await page.route('**/graphql', async (route) => {
  const body = route.request().postData() ?? '';
  const answer = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
  if (body.includes('llmSessionWriting(')) return answer({ llmSessionWriting: null });
  if (body.includes('llmSessionEvents')) {
    return answer({ llmSessionEvents: { totalElements: EVENTS.length, totalPages: 1, content: EVENTS } });
  }
  if (body.includes('llmSession(')) return answer({ llmSession: SESSION });
  return route.continue();
});
await page.goto(`${BASE}/workspace/${WORKSPACE}/sessions/${SESSION.id}`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('article[class*="_event_"]', { timeout: 20_000 }).catch(() => undefined);
const sessionLook = await thinkingCardLook('article[class*="_event_"]');

const same = Object.keys(sessionLook).filter((key) => sessionLook[key] === '' || sessionLook[key] !== chatLook[key]);
record(
  sessionLook.background !== '' && same.length === 0,
  `the chat's thinking is the session's thinking card - background, edge, badge (${same.length === 0 ? 'all equal' : `differs in ${same.join(', ')}: ${JSON.stringify({ chatLook, sessionLook })}`})`,
);

await finish(browser);
