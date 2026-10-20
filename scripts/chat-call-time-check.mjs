/**
 * Every tool call in a chat says when it was made, to the second.
 *
 * A turn that ran five minutes is read by which call took them, and without a
 * time on each call there was no telling. Drawn whether or not the workspace
 * shows message times, which is about the conversation and not the work.
 *
 * Makes one chat of its own and deletes it again.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });
const PREFIX = 'zz call time';

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
  const base = Date.now() - 300_000;
  const said = (role, content, actor = null, at = new Date(base).toISOString()) => ({ role, content, actor, takes: [], thinking: null, thinkingMillis: null, at, attachments: [] });
  const call = (name, seconds) => said('tool', JSON.stringify({ name, arguments: {}, result: {} }), name, new Date(base + seconds * 1000).toISOString());

  await page.route('**/graphql', async (route) => {
    const body = route.request().postDataJSON() ?? {};
    if (!(body.query ?? '').includes('chatMessages')) return route.continue();
    return route.fulfill({
      json: {
        data: {
          chatMessages: [
            said('user', 'What is on this page?'),
            call('skill_list', 1),
            call('memory_search', 42),
            call('http_request', 187),
            said('assistant', 'It is an office cabinet.'),
          ],
        },
      },
    });
  });

  await page.goto(`${BASE}/chat/${started.startChat.id}`, { waitUntil: 'domcontentloaded' });
  await page.getByText('It is an office cabinet.').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(500);

  const times = await page.locator('[data-call-when]').allInnerTexts();
  const expected = [1, 42, 187].map((seconds) =>
    new Date(base + seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  );
  record(times.length === 3, `each of the three calls carries a time (${JSON.stringify(times)})`);
  record(times.every((one) => /\d{1,2}:\d{2}:\d{2}/.test(one)), 'to the second');
  record(new Set(times).size === 3 && times.every((one) => expected.includes(one)), `and it is the time the call was made (${JSON.stringify(expected)})`);

  // The status sits beside the time at the row's end, not halfway along the row.
  const gaps = await page.locator('[data-testid="call-line"]').evaluateAll((lines) => lines.map((line) => {
    const when = line.querySelector('[data-call-when]');
    const state = when?.previousElementSibling;
    if (!when || !state || state === when) return null;
    return Math.round(when.getBoundingClientRect().left - state.getBoundingClientRect().right);
  }).filter((gap) => gap !== null));
  record(gaps.length > 0 && gaps.every((gap) => gap >= 0 && gap <= 24), `the status sits beside the time (${JSON.stringify(gaps)}px apart)`);
} finally {
  await sweep();
}

await finish(browser);
