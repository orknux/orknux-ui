/**
 * The person's avatar is drawn beside what they said, and Preferences turns it off.
 *
 * The agent's answers had an avatar and the person's lines had none. The
 * history is passed through with a line of the person's on its end: on by
 * default, its avatar is drawn on the bubble's left and level with it, carrying their
 * initials; turned off on Preferences, it is gone. Put back on at the end,
 * because alice is a fixture.
 */
import { BASE, open, record, finish } from './suite/harness.mjs';

const SAID = 'A line of mine, for its avatar.';

const { browser, context, page } = await open({ viewport: { width: 1440, height: 1000 } });
await context.addInitScript(() => {
  const real = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const address = typeof input === 'string' ? input : input.url;
    if (/\/api\/chats\/[^/]+\/follow/.test(address)) {
      return new Response('event: idle\ndata: {}\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }
    return real(input, init);
  };
});
await page.route('**/graphql', async (route) => {
  const body = route.request().postData() ?? '';
  if (!body.includes('chatMessages(')) return route.continue();
  const response = await route.fetch().catch(() => null);
  if (response === null) return;
  const json = await response.json().catch(() => null);
  if (json?.data?.chatMessages && Array.isArray(json.data.chatMessages)) {
    json.data.chatMessages.push({ role: 'user', content: SAID, at: new Date().toISOString(), takes: [], thinking: null, thinkingMillis: null, actor: null, attachments: [] });
  }
  await route.fulfill({ response, json }).catch(() => {});
});

/** The avatar on the row holding the line, and where it sits against the bubble. */
async function readAvatar() {
  await page.goto(`${BASE}/chat`, { waitUntil: 'domcontentloaded' });
  await page.getByText(SAID).first().waitFor({ timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(500);
  return page.evaluate((said) => {
    const bubble = [...document.querySelectorAll('[class*="_userBubble_"]')].find((one) => one.textContent === said);
    const row = bubble?.closest('[class*="_userRow_"]');
    const avatar = row?.querySelector('[data-user-avatar]');
    if (!bubble || !avatar) return { bubble: Boolean(bubble), avatar: null };
    const a = avatar.getBoundingClientRect();
    const b = bubble.getBoundingClientRect();
    const middle = (box) => box.top + box.height / 2;
    return {
      bubble: true,
      avatar: avatar.textContent.trim(),
      left: a.right <= b.left,
      level: Math.abs(middle(a) - middle(b)) <= 2,
      size: Math.round(a.width),
    };
  }, SAID);
}

async function setAvatar(choice) {
  await page.goto(`${BASE}/preferences`, { waitUntil: 'domcontentloaded' });
  const group = page.locator('[role="radiogroup"][aria-labelledby="chat-avatar"]');
  await group.waitFor({ timeout: 20_000 });
  await group.getByRole('radio', { name: choice }).click();
  await page.locator('[class*="_pageSave_"]').click();
  await page.waitForTimeout(800);
}

const on = await readAvatar();
record(
  on.avatar !== null && /^[A-Z0-9]{1,2}$/.test(on.avatar) && on.left && on.level && on.size === 32,
  `on by default, the line has the person's initials on the bubble's left, level with it (${JSON.stringify(on)})`,
);

await setAvatar('Off');
const off = await readAvatar();
record(off.bubble && off.avatar === null, `turned off on Preferences, it is gone (${JSON.stringify(off)})`);

await setAvatar('On');
const back = await readAvatar();
record(back.avatar !== null, 'put back on');

await finish(browser);
