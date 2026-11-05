/**
 * Orknux MCP: a button left of Ask AI, opening how to reach this workspace
 * from an AI client.
 *
 * The button sits in the corner row with Ask AI, to its left and level with
 * it. It opens a dialog naming this server's MCP address for the workspace
 * being looked at - the browser's own origin and the workspace's id, which is
 * the part that differs on every installation - where a token is made, and
 * each client's own way of being given both. The attribution strip's words
 * end short of the row, now that it is two buttons wide.
 *
 * Measured off what is drawn.
 */
import { WORKSPACE, BASE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 900 } });

// A workspace page that is not a chat: the corner is the composer's there.
await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/diagrams`, { waitUntil: 'domcontentloaded' });
const button = page.getByTestId('mcp-connect');
const shown = await button.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
record(shown, 'Orknux MCP is in the corner of a workspace page');

if (shown) {
  record((await button.innerText()).trim() === 'Orknux MCP', `it is called Orknux MCP (${(await button.innerText()).trim()})`);
  // An icon, as Ask AI has: loaded, drawn, and before the words.
  const icon = await button.evaluate((one) => {
    const img = one.querySelector('img');
    if (img === null) return null;
    const box = img.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(one);
    const words = [...range.getClientRects()].at(-1);
    return { loaded: img.complete && img.naturalWidth > 0, width: box.width, before: words !== undefined && box.right <= words.right };
  });
  record(icon !== null && icon.loaded && icon.width >= 16 && icon.before, `the button carries an icon before its name (${JSON.stringify(icon)})`);
  // Ask AI comes once the workspace's settings have arrived, a moment after the
  // page, and moves this button left when it does - so measured after it.
  const ask = page.locator('[aria-label="Ask AI"]');
  await ask.first().waitFor({ timeout: 5000 }).catch(() => undefined);
  await page.waitForTimeout(300);
  const mine = await button.boundingBox();
  if ((await ask.count()) > 0) {
    const theirs = await ask.first().boundingBox();
    record(mine.x + mine.width <= theirs.x, `it is left of Ask AI (${Math.round(mine.x + mine.width)} <= ${Math.round(theirs.x)})`);
    record(Math.abs(mine.y - theirs.y) < 2 && Math.abs(mine.height - theirs.height) < 2, `and level with it, the same height (${mine.height} and ${theirs.height})`);
  } else {
    record(true, 'Ask AI is not offered in this workspace, so there is nothing to sit beside');
  }
  record(mine.y + mine.height <= 900 && mine.x + mine.width <= 1440, 'and wholly on the screen');

  // The strip's words end short of the whole row.
  const clear = await page.evaluate(() => {
    const bar = document.querySelector('[class*="_attributionBar_"]');
    const row = document.querySelector('[data-testid="corner-buttons"]');
    if (!bar || !row) return null;
    const range = document.createRange();
    range.selectNodeContents(bar);
    const box = row.getBoundingClientRect();
    const level = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.bottom > box.top && rect.top < box.bottom);
    return { textRight: level.length ? Math.round(Math.max(...level.map((rect) => rect.right))) : null, rowLeft: Math.round(box.left) };
  });
  record(clear !== null && (clear.textRight === null || clear.textRight <= clear.rowLeft), `the attribution strip ends left of both buttons (${JSON.stringify(clear)})`);

  // Open: the address is this server's, for this workspace.
  await button.click();
  const dialog = page.getByTestId('mcp-connect-dialog');
  await dialog.waitFor({ timeout: 5000 });
  const origin = new URL(page.url()).origin;
  const address = (await page.getByTestId('mcp-connect-address').innerText()).trim();
  record(address === `${origin}/mcp/${WORKSPACE}`, `the dialog names this workspace's MCP address (${address})`);
  record((await dialog.getByRole('link', { name: /Preferences/ }).count()) === 1, 'and links to where a token is made');
  // A directory account cannot make its own token: the dialog says who makes one and where, and an administrator is shown the way.
  const directory = dialog.getByTestId('mcp-connect-directory');
  const told = (await directory.innerText()).trim();
  record(/administrator/i.test(told) && told.includes('Admin › Users') && told.includes('Access Tokens'), `it says where an administrator makes one for a directory account (${told})`);
  const way = dialog.getByTestId('mcp-connect-admin-users');
  record((await way.count()) === 1 && (await way.getAttribute('href')) === '/admin/users', 'and, to an administrator, links to Admin › Users');

  // Each client its own spelling, each with the address in it.
  const wants = {
    'claude-code': 'claude mcp add --transport http orknux',
    codex: '[mcp_servers.orknux]',
    cursor: '"mcpServers"',
    vscode: '"servers"',
    other: 'Authorization: Bearer',
  };
  for (const [key, said] of Object.entries(wants)) {
    await page.getByTestId(`mcp-connect-client-${key}`).click();
    const pasted = await page.getByTestId('mcp-connect-pasted').innerText();
    record(pasted.includes(said) && pasted.includes(address), `${key}: ${said} with the address in it`);
    // Highlighted: the snippet is drawn in more than one colour. Other is two lines of prose, and stays plain.
    const colours = await page.getByTestId('mcp-connect-pasted').evaluate((pre) =>
      [...new Set([pre, ...pre.querySelectorAll('span')].map((one) => getComputedStyle(one).color))].length);
    if (key === 'other') record(colours === 1, `${key}: plain, in one colour (${colours})`);
    else record(colours >= 3, `${key}: highlighted, in ${colours} colours`);
  }
  const box = await page.getByTestId('mcp-connect-pasted').boundingBox();
  const frame = await dialog.boundingBox();
  record(box.x + box.width <= frame.x + frame.width, 'what is pasted fits inside the dialog');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  record(!(await dialog.isVisible()), 'Escape closes it');
}

// Not in a chat.
await page.goto(`${BASE}/chat`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
record((await page.getByTestId('mcp-connect').count()) === 0, 'and there is no Orknux MCP button in the chat, whose corner is the composer\'s');

await finish(browser);
