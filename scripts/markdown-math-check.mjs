/**
 * LaTeX in rendered markdown is set as maths, and money is not.
 *
 * A model answered "Polish $\rightarrow$ English" and the chat printed the
 * dollars and the backslash. The shared Markdown component now sets maths with
 * KaTeX - `$x$`, `$$x$$`, `\(x\)` and `\[x\]` - while "costs $5 and $10" stays
 * the sentence it is, and a dollar inside code stays in the code.
 *
 * Drawn through an issue's description, which is the same component the chat
 * answer goes through; the check files the issue and deletes it again.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });
const MARK = 'zzMarkdownMath';

const sweep = async () => {
  const found = await graphql(
    `query($id: ID!, $q: String) { workspaceIssues(workspaceId: $id, page: 0, size: 100, search: $q, status: null) { content { id title } } }`,
    { id: WORKSPACE, q: MARK },
  );
  for (const old of found.workspaceIssues.content.filter((one) => one.title.startsWith(MARK))) {
    await graphql(`mutation($id: ID!) { deleteIssue(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
};

const DESCRIPTION = [
  'Polish $\\rightarrow$ English, and \\(x^2\\) inline.',
  '',
  '$$\\frac{a}{b}$$',
  '',
  'It costs $5 and $10 to send.',
  '',
  'Left as written: `$x$`.',
].join('\n');

await sweep();
try {
  const made = await graphql(`mutation($input: IssueInput!) { createIssue(input: $input) { id number } }`, {
    input: { workspaceId: WORKSPACE, title: `${MARK} ${Date.now()}`, description: DESCRIPTION, labels: [], status: 'OPEN' },
  });
  await page.goto(`${BASE}/workspace/${WORKSPACE}/issues/${made.createIssue.number}`, { waitUntil: 'domcontentloaded' });
  const prose = page.locator('p', { hasText: 'English' }).first();
  await prose.waitFor({ timeout: 20_000 });

  const arrow = await prose.evaluate((paragraph) => ({
    maths: paragraph.querySelectorAll('.katex').length,
    text: [...paragraph.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent).join(''),
    colour: getComputedStyle(paragraph.querySelector('.katex') ?? paragraph).color,
    paragraphColour: getComputedStyle(paragraph).color,
  }));
  record(arrow.maths === 2, `$\\rightarrow$ and \\(x^2\\) are set as maths (${arrow.maths})`);
  record(!/[$\\]/.test(arrow.text), `no dollar or backslash is left in the sentence (${JSON.stringify(arrow.text)})`);
  record(arrow.colour === arrow.paragraphColour, `the maths takes the text's colour, so it follows the theme (${arrow.colour})`);

  const display = await page.locator('.katex-display').count();
  record(display === 1, `$$\\frac{a}{b}$$ on a line of its own is a display block (${display})`);

  const money = page.locator('p', { hasText: 'It costs' }).first();
  const moneyMaths = await money.locator('.katex').count();
  const moneyText = (await money.innerText()).trim();
  record(moneyMaths === 0 && moneyText === 'It costs $5 and $10 to send.', `money stays money (${moneyText})`);

  const code = await page.locator('code', { hasText: '$x$' }).count();
  record(code === 1, 'a dollar inside code stays in the code');
} finally {
  await sweep();
}

await finish(browser);
