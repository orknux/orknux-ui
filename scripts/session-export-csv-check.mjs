/**
 * A session's transcript downloads as CSV from the session page.
 *
 * What is measured:
 *
 *   the control            - an "Export CSV" link sits among the session's
 *                            actions, and it is a download
 *   the whole session      - it points at the server's transcript file for this
 *                            session, not at the page on screen
 *   as the page narrows it - typing in the search box carries the words into
 *                            the link, so the file holds what the page is
 *                            filtering to
 *   the server is behind it - the address is the server's: a session that
 *                            does not exist answers 404, not the interface's
 *                            page
 *
 * The page's session is stubbed, the way session-notes-check draws one: the
 * check is about the control, and the file's content is SessionTranscriptCsvTest's.
 */
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1400, height: 1000 } });

const SESSION = '424243';
const LOG = [
  { id: '1', kind: 'USER', actor: 'alice', content: 'Where is the invoice?', result: null, millis: null, at: '2026-10-27T08:59:00Z', agentDetails: null },
];

await page.route('**/graphql', async (route) => {
  const body = route.request().postData() ?? '';
  if (body.includes('llmSessionEvents(')) {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { llmSessionEvents: { totalElements: LOG.length, content: LOG } } }),
    });
    return;
  }
  if (!body.includes('llmSession(')) {
    await route.continue();
    return;
  }
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      data: {
        llmSession: {
          id: SESSION,
          workspaceId: WORKSPACE,
          key: 'zzCsvExport',
          keyPrefix: null,
          eventCount: LOG.length,
          createdAt: '2026-10-27T08:00:00Z',
          lastEventAt: LOG[0].at,
          notes: [],
        },
      },
    }),
  });
});

await page.goto(`${BASE}/workspace/${WORKSPACE}/sessions/${SESSION}`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the session'), 'a session opens');

const link = page.getByTestId('session-export-csv');
const there = await link
  .waitFor({ timeout: 20_000 })
  .then(() => true)
  .catch(() => false);
record(there, 'an Export CSV control is among the session actions');
if (!there) await finish(browser);

record((await link.getAttribute('download')) !== null, 'and it is a download');
const plain = await link.getAttribute('href');
console.log(`href: ${plain}`);
record(plain === `/api/sessions/${SESSION}/transcript.csv`, 'it names the whole transcript of this session');

await page.getByPlaceholder(/Search what was said/).fill('invoice');
await page.waitForTimeout(600);
const narrowed = await link.getAttribute('href');
console.log(`narrowed: ${narrowed}`);
record((narrowed ?? '').includes('search=invoice'), 'and carries the search the page is filtering with');

const missing = await page.request.get(`${BASE}/api/sessions/999999999/transcript.csv`);
record(missing.status() === 404, `a session that is not there answers 404 (${missing.status()})`);

await finish(browser);
