/**
 * A fenced code block in rendered markdown carries its own Copy.
 *
 * A chat answer handed over two PowerShell commands to run and there was no way
 * to take them but selecting by hand. Every block drawn by the shared Markdown
 * component - the chat's answers, an issue's description, the manual - now has
 * a Copy at its top right that puts exactly the block's text on the clipboard,
 * highlighting taken off, and says so; and the button sits clear of the text.
 *
 * Drawn through an issue's description, which is the same component the chat
 * answer goes through; the check files the issue and deletes it again.
 */
import { BASE, WORKSPACE, open, record, finish, shot, clipboardText, setClipboardText } from './suite/harness.mjs';

const { browser, context, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });
const MARK = 'zzCodeCopy';
const COMMAND = 'powershell -NoProfile -ExecutionPolicy Bypass -File C:\\ai\\staging\\finish-elevated.ps1 -DryRun';
const SCRIPT = ['$name = "world"', 'Write-Host "hello $name"'].join('\n');

const sweep = async () => {
  const found = await graphql(
    `query($id: ID!, $q: String) { workspaceIssues(workspaceId: $id, page: 0, size: 100, search: $q, status: null) { content { id title } } }`,
    { id: WORKSPACE, q: MARK },
  );
  for (const old of found.workspaceIssues.content.filter((one) => one.title.startsWith(MARK))) {
    await graphql(`mutation($id: ID!) { deleteIssue(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
};

const DESCRIPTION = ['Preview it:', '', '```powershell', COMMAND, '```', '', 'And then:', '', '```powershell', SCRIPT, '```'].join('\n');

await sweep();
try {
  const made = await graphql(`mutation($input: IssueInput!) { createIssue(input: $input) { id number } }`, {
    input: { workspaceId: WORKSPACE, title: `${MARK} ${Date.now()}`, description: DESCRIPTION, labels: [], status: 'OPEN' },
  });
  await page.goto(`${BASE}/workspace/${WORKSPACE}/issues/${made.createIssue.number}`, { waitUntil: 'domcontentloaded' });
  const blocks = page.getByTestId('code-block');
  await blocks.first().waitFor({ timeout: 20_000 }).catch(() => undefined);

  const count = await blocks.count();
  const buttons = await page.getByTestId('code-copy').count();
  record(count === 2 && buttons === 2, `each of the two code blocks has a Copy (${count} blocks, ${buttons} buttons)`);

  // Top right of its block, above the code: a line too long for the block scrolls under nothing.
  const placed = await blocks.first().evaluate((block) => {
    const button = block.querySelector('[data-testid="code-copy"]').getBoundingClientRect();
    const frame = block.getBoundingClientRect();
    const pre = block.querySelector('pre').getBoundingClientRect();
    return { right: Math.round(frame.right - button.right), top: Math.round(button.top - frame.top), aboveCode: button.bottom <= pre.top + 0.5, bar: Math.round(pre.top - frame.top) };
  });
  record(placed.right >= 0 && placed.right < 12 && placed.top >= 0 && placed.top < 12 && placed.aboveCode && placed.bar <= 36,
    `the button sits at the block's top right, in a bar no taller than a line or two above the code (${JSON.stringify(placed)})`);
  const language = await blocks.first().locator('pre').evaluate((pre) => pre.previousElementSibling?.textContent ?? '');
  record(language.includes('powershell'), `the bar names the block's language (${JSON.stringify(language)})`);

  // What lands on the clipboard is the block exactly: no colouring, no trailing newline.
  await page.screenshot({ path: shot('code-copy.png'), clip: await blocks.first().evaluate((b) => { const r = b.parentElement.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: Math.min(r.height, 400) }; }) });
  await setClipboardText(context, 'nothing copied yet');
  await page.getByTestId('code-copy').nth(1).click();
  const status = blocks.nth(1).getByRole('status');
  await status.filter({ hasText: /\S/ }).waitFor({ timeout: 3_000 }).catch(() => undefined);
  const said = await status.textContent().catch(() => '');
  const held = await clipboardText(context);
  record(held === SCRIPT, `Copy puts the block's own text on the clipboard (${JSON.stringify(held)})`);
  record((said ?? '').includes('Copied'), `and says so beside the button (${JSON.stringify(said)})`);
} finally {
  await sweep();
}
await finish(browser);
