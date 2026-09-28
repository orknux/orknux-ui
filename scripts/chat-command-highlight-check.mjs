/**
 * A block of commands in an answer is coloured, not only a block of script.
 *
 * highlight.js's bash colours keywords, strings, variables, comments and the
 * builtins it knows by name, and nothing else - so `npm install` and
 * `docker compose up -d`, which are none of those, came out in one colour. The
 * manual's blocks carry comments and looked highlighted; a chat answer telling
 * somebody what to run did not, which read as highlighting being off in chat.
 *
 * Measured on what is drawn: the command at the head of each line and after a
 * `&&` or `|` is its own coloured span, a flag is too, a variable being set and
 * a keyword are not mistaken for commands, and the Windows and prompt-session
 * spellings a model also writes are coloured at all.
 *
 * The answer is stubbed rather than asked for: a seeded installation has no
 * model it can reach, and what is measured is the rendering.
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

const FENCE = '```';
const ANSWER = [
  'Run these:',
  '',
  `${FENCE}bash`,
  'npm install',
  'docker compose up -d',
  'FOO=bar ./mvnw test -pl app && grep done out.txt | sort',
  'if true; then ls; fi',
  FENCE,
  '',
  `${FENCE}powershell`,
  'Get-ChildItem -Recurse',
  FENCE,
  '',
  `${FENCE}shell`,
  '$ npm run build',
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
          { role: 'user', content: 'How do I start it?', actor: null, takes: [], thinking: null, thinkingMillis: null, at: '2026-09-20T10:00:00Z' },
          { role: 'assistant', content: ANSWER, actor: null, takes: [], thinking: null, thinkingMillis: null, at: '2026-09-20T10:00:05Z' },
        ],
      },
    }),
  });
});

await page.goto(`${BASE}/chat/${chat.id}`, { waitUntil: 'domcontentloaded' });
if (await drawn(page, 'the chat log')) {
  await page.waitForSelector('pre code.language-bash', { timeout: 15_000 }).catch(() => null);

  const blocks = await page.evaluate(() =>
    [...document.querySelectorAll('pre code')].map((code) => {
      const plain = getComputedStyle(code).color;
      return {
        language: [...code.classList].find((one) => one.startsWith('language-')) ?? '',
        // What is drawn in a colour of its own, not merely wrapped in a span.
        coloured: [...code.querySelectorAll('span')]
          .filter((span) => getComputedStyle(span).color !== plain)
          .map((span) => span.textContent.trim()),
        keywords: [...code.querySelectorAll('.hljs-keyword')].map((span) => span.textContent.trim()),
      };
    }),
  );
  const bash = blocks.find((one) => one.language === 'language-bash');
  record(bash !== undefined, `the bash block is drawn (${blocks.length} blocks)`);

  if (bash !== undefined) {
    console.log(`bash coloured: ${JSON.stringify(bash.coloured)}`);
    for (const command of ['npm', 'docker', './mvnw', 'grep', 'sort']) {
      record(bash.coloured.includes(command), `the command ${command} is drawn in a colour of its own`);
    }
    for (const flag of ['-d', '-pl']) {
      record(bash.coloured.includes(flag), `the flag ${flag} is drawn in a colour of its own`);
    }
    record(!bash.coloured.includes('FOO=bar'), 'a variable being set is not coloured as a command');
    record(bash.keywords.includes('if'), 'a keyword opening a line is still a keyword, not a command');
  }

  for (const language of ['language-powershell', 'language-shell']) {
    const block = blocks.find((one) => one.language === language);
    console.log(`${language} coloured: ${JSON.stringify(block?.coloured)}`);
    record(
      block !== undefined && block.coloured.length > 0,
      `a ${language.slice(9)} block is coloured (${block?.coloured.length ?? 0} spans)`,
    );
  }
}

await finish(browser);
