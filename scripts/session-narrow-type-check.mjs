/**
 * The session page on half a 1920 screen: the type is drawn at the size it is
 * meant to be, on the lines it is meant to be on.
 *
 * At 960 wide the page came apart. The title is the session's key, one long
 * word in the mono face, and it shared a row that did not wrap with actions
 * that would not shrink - so the key was handed what the buttons left, which
 * was two letters' width, and ran down the header two characters a line. The
 * kind chips under the search were a group that did not wrap either, and ran
 * on under the rail beside the transcript.
 *
 * What is measured, at 960 and at 1920 for comparison:
 *
 *   the title's size  - the same computed font-size at both widths: nothing
 *                       switches to another scale at half a screen
 *   the title's lines - one line, measured as its height against its own
 *                       line-height, and at least two dozen characters wide
 *   the chips         - every one inside the transcript column: its right edge
 *                       left of where the rail begins
 *
 * The session is stubbed, as session-export-csv-check does it, with a key of
 * the length a chat's really is: the check is about drawing a long key.
 */
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 960, height: 1000 } });

const SESSION = '424250';
const KEY = 'chat:e121680f-e4db-4775-8501-74b0c009f4df';
const LOG = [
  { id: '1', kind: 'USER', actor: 'alice', content: 'Ask me five questions from my deck.', result: null, millis: null, at: '2026-10-21T22:31:00Z', agentDetails: null },
];

await page.route('**/graphql', async (route) => {
  const body = route.request().postData() ?? '';
  const answer = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
  if (body.includes('llmSessionEvents(')) return answer({ llmSessionEvents: { totalElements: LOG.length, content: LOG } });
  if (body.includes('llmSession(')) {
    return answer({
      llmSession: {
        id: SESSION,
        workspaceId: WORKSPACE,
        key: KEY,
        keyPrefix: 'chat',
        eventCount: LOG.length,
        createdAt: '2026-10-21T22:30:00Z',
        lastEventAt: LOG[0].at,
        notes: [],
      },
    });
  }
  return route.continue();
});

/** The title, the chips and the rail, measured. */
async function measure(width) {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto(`${BASE}/workspace/${WORKSPACE}/sessions/${SESSION}`, { waitUntil: 'domcontentloaded' });
  await drawn(page, 'the session');
  await page.getByRole('heading', { level: 1, name: KEY }).waitFor({ timeout: 20_000 }).catch(() => undefined);
  await page.waitForTimeout(800);
  return page.evaluate((key) => {
    const title = [...document.querySelectorAll('h1')].find((one) => one.textContent === key) ?? null;
    const style = title === null ? null : getComputedStyle(title);
    const box = title?.getBoundingClientRect() ?? null;
    const group = document.querySelector('[role="group"][aria-label="Which kinds to show"]');
    const chips = group === null ? [] : [...group.querySelectorAll('button')].map((chip) => chip.getBoundingClientRect().right);
    // The rail is the transcript column's sibling: the first thing drawn to its right.
    const column = group?.closest('[class*="main"]') ?? null;
    const columnRight = column?.getBoundingClientRect().right ?? null;
    const charWidth = (() => {
      if (title === null) return 0;
      const probe = document.createElement('span');
      probe.textContent = '0'.repeat(10);
      probe.style.font = style.font;
      probe.style.position = 'absolute';
      document.body.append(probe);
      const one = probe.getBoundingClientRect().width / 10;
      probe.remove();
      return one;
    })();
    return {
      fontSize: style === null ? null : parseFloat(style.fontSize),
      lineHeight: style === null ? null : parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2,
      height: box?.height ?? null,
      width: box?.width ?? null,
      charWidth,
      chips,
      columnRight,
    };
  }, KEY);
}

const wide = await measure(1920);
const half = await measure(960);
console.log(JSON.stringify({ wide, half }));

record(half.fontSize !== null, 'the session page draws its key as the title at 960 wide');
record(
  half.fontSize === wide.fontSize,
  `the title is the same size at 960 as at 1920 (${half.fontSize}px against ${wide.fontSize}px)`,
);
record(
  half.height !== null && half.height < half.lineHeight * 1.6,
  `the key is one line at 960, not a column of letters (${half.height}px tall, line ${half.lineHeight}px)`,
);
record(
  half.width !== null && half.width >= half.charWidth * 24,
  `and at least two dozen characters wide (${Math.round(half.width ?? 0)}px, ${Math.round((half.width ?? 0) / (half.charWidth || 1))} characters)`,
);
record(
  half.chips.length > 0 && half.columnRight !== null && half.chips.every((right) => right <= half.columnRight + 0.5),
  `every kind chip stays inside the transcript column (rightmost ${Math.round(Math.max(...half.chips))}px, column ends ${Math.round(half.columnRight ?? 0)}px)`,
);
record(wide.height !== null && wide.height < wide.lineHeight * 1.6, 'and at 1920 the key is one line as well');

await finish(browser);
