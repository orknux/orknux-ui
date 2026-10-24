/**
 * Run on a chat answer's shell blocks: drawn on a block the server can run
 * only while Admin -> Settings allows it, and what the command printed drawn
 * under that block when it is pressed.
 *
 * The answer is stubbed, as the other chat checks stub theirs - a seeded
 * installation has no model it can reach - but the run is real: the command
 * goes to the server and runs on its machine, so what comes back is the
 * server's own output, not a stub's. The block's language is one the server
 * says it can run, so the same check holds on a Windows desktop and in the
 * Linux image CI starts.
 *
 * Changes an installation-wide switch, so it runs alone and puts it back.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });

const { commandRunsEnabled: before } = await graphql('query { commandRunsEnabled { enabled } }');
const setRuns = (enabled) => graphql(`mutation { setCommandRuns(enabled: ${enabled}) { enabled } }`);

const { chatSessions } = await graphql(
  `query ($w: ID!) { chatSessions(workspaceId: $w) { id title } }`,
  { w: WORKSPACE },
);
const chat = chatSessions[0];
if (chat === undefined) {
  record(false, 'the workspace has a chat to open; the seed builds one');
  await finish(browser);
}

await setRuns(true);
const { commandRunsOffered } = await graphql('query { commandRunsOffered { languages } }');
// cmd on Windows, sh everywhere else: one the server says it runs.
const language = ['sh', 'cmd'].find((one) => commandRunsOffered.languages.includes(one));
record(language !== undefined, `the server offers a shell to run blocks with (${commandRunsOffered.languages.join(', ')})`);

const MARK = `ran-${Date.now()}`;
const FENCE = '```';
const ANSWER = [
  'Run this:',
  '',
  `${FENCE}${language ?? 'sh'}`,
  `echo ${MARK}`,
  FENCE,
  '',
  'And this is Python, which is not run:',
  '',
  `${FENCE}python`,
  'print("not a command")',
  FENCE,
].join('\n');

await page.route('**/graphql', async (route) => {
  const body = route.request().postData() ?? '';
  if (!body.includes('ChatMessages')) {
    await route.continue();
    return;
  }
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      data: {
        chatMessages: [
          { role: 'user', content: 'What do I run?', actor: null, takes: [], thinking: null, thinkingMillis: null, at: '2026-10-24T10:00:00Z' },
          { role: 'assistant', content: ANSWER, actor: null, takes: [], thinking: null, thinkingMillis: null, at: '2026-10-24T10:00:05Z' },
        ],
      },
    }),
  });
});

try {
  await page.goto(`${BASE}/chat/${chat.id}`, { waitUntil: 'domcontentloaded' });
  // Not drawn(): a block's Copy holds a [role=status] for its word, which drawn() reads as still loading.
  const answered = await page.waitForSelector('[data-testid="code-block"] code.language-python', { timeout: 20_000 }).then(() => true, () => false);
  record(answered, 'the stubbed answer is drawn with its code blocks');
  if (answered) {
    await page.waitForSelector('pre code.language-python', { timeout: 15_000 }).catch(() => null);
    await page.waitForSelector('[data-command-run]', { timeout: 10_000 }).catch(() => null);

    const offered = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="code-block"]')]
        .filter((block) => block.querySelector('[data-command-run]') !== null)
        .map((block) => ({
          language: block.querySelector('code')?.className.match(/language-(\S+)/)?.[1] ?? null,
          // In the block's own bar, beside Copy, rather than somewhere else on the page.
          besideCopy: block.querySelector('[data-command-run]')?.closest('div')?.querySelector('[data-testid="code-copy"]') != null,
        })),
    );
    record(
      offered.length === 1 && offered[0].language === language && offered[0].besideCopy,
      `Run is drawn on the ${language} block and on no other (${JSON.stringify(offered)})`,
    );

    await page.click('[data-command-run]').catch(() => null);
    await page
      .waitForFunction(
        (mark) => document.querySelector('[data-command-output] pre')?.textContent?.includes(mark) === true,
        MARK,
        { timeout: 20_000 },
      )
      .catch(() => null);
    await page.waitForSelector('[data-command-output][data-state="EXITED"]', { timeout: 20_000 }).catch(() => null);

    const result = await page.evaluate(() => {
      const block = document.querySelector('[data-command-run]')?.closest('[data-testid="code-block"]');
      const code = block?.querySelector('pre:has(code)');
      const output = block?.querySelector('[data-command-output] pre');
      return {
        printed: output?.textContent ?? null,
        state: block?.querySelector('[data-command-output]')?.getAttribute('data-state') ?? null,
        status: block?.querySelector('[data-command-output] p')?.textContent ?? null,
        // Where it is drawn: below the block it came from, not somewhere else on the page.
        below: code && output ? Math.round(output.getBoundingClientRect().top - code.getBoundingClientRect().bottom) : null,
      };
    });
    record(result.printed?.includes(MARK) === true, `what the command printed is drawn (${JSON.stringify(result.printed)})`);
    record(result.state === 'EXITED', `the run ends and says how (${result.state}: ${result.status})`);
    record(result.below !== null && result.below >= 0, `the output is drawn under its block (${result.below}px below it)`);

    // Off: the same answer, no Run anywhere, and the block itself still drawn.
    await setRuns(false);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector(`pre code.language-${language}`, { timeout: 15_000 }).catch(() => null);
    // Long enough for the offer to have come back, had it offered anything.
    await page.waitForTimeout(1_500);
    const off = await page.evaluate((lang) => ({
      blocks: document.querySelectorAll(`pre code.language-${lang}`).length,
      runs: document.querySelectorAll('[data-command-run], [data-runnable]').length,
      copies: document.querySelectorAll('[data-testid="code-copy"]').length,
    }), language);
    record(off.blocks === 1 && off.runs === 0 && off.copies === 2, `with the switch off the block is drawn with Copy and no Run (${JSON.stringify(off)})`);
  }
} finally {
  await setRuns(before.enabled).catch(() => undefined);
}

await finish(browser);
