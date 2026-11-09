/**
 * The MCP pages list the AI clients that connected, and say under their title
 * how to connect one: a link in the text opening the same instructions the
 * Orknux MCP corner button does, with this workspace's address in them.
 *
 * Read off what is drawn: the link is under the subtitle on both pages, the
 * dialog opens from it, and the address it shows is the workspace's own. It
 * writes nothing.
 */
import { BASE, WORKSPACE, open, record, shot, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 1000 } });

async function check(path, where, workspace) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  const link = page.getByTestId('mcp-connect-link');
  await link.waitFor({ timeout: 20_000 }).catch(() => {});
  const placed = await page.evaluate(() => {
    const link = document.querySelector('[data-testid="mcp-connect-link"]');
    const title = document.querySelector('h1');
    if (link === null || title === null) return null;
    const a = link.getBoundingClientRect();
    return { below: a.top >= title.getBoundingClientRect().bottom, width: a.width, height: a.height };
  });
  record(placed !== null && placed.width > 0 && placed.height > 0, `${where}: a link says how to connect an AI client`);
  record(placed?.below === true, `${where}: under the page's title`);
  if (placed === null) return;

  await link.click();
  // The open one: the corner button keeps a closed dialog of its own on the page.
  const dialog = page.locator('dialog[open][data-testid="mcp-connect-dialog"]');
  await dialog.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
  record(await dialog.isVisible(), `${where}: it opens the MCP connection instructions`);
  const address = (await dialog.getByTestId('mcp-connect-address').innerText().catch(() => '')).trim();
  record(address.endsWith(`/mcp/${workspace}`), `${where}: with the workspace's MCP address (${address})`);
  shot(`mcp-pages-connect-link-${where.replace(/\W+/g, '-').toLowerCase()}`);
  await page.keyboard.press('Escape');
}

// The workspace's page first, which also makes it the workspace Admin -> MCP remembers.
await check(`/workspace/${WORKSPACE}/mcp`, 'workspace MCP', WORKSPACE);
await check('/admin/mcp', 'Admin MCP', WORKSPACE);

await finish(browser);
