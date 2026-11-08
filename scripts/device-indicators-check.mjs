/**
 * The corner shows the Orknux client for where the page is being read: the
 * Chrome extension in Chrome, Orknux for Windows on Windows - a link to get it
 * until it is connected, and a word that it is once it is - in the same row as
 * Orknux MCP and drawn like it.
 *
 * Which clients a person has is read off the browser, so each case is a
 * context with its own user agent; whether each is connected is stubbed in the
 * browser, because a check cannot connect a real Chrome extension and a real
 * Windows desktop to the server it runs against. Makes nothing and removes nothing.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const CHROME_ON_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const FIREFOX_ON_LINUX = 'Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0';

const NO_DESKTOP = { connected: false, client: null, version: null, installUrl: 'https://example.invalid/windows' };

async function corner(userAgent, path = `/workspace/${WORKSPACE}/integrations`, desktops = []) {
  const desktop = desktops[0] ?? NO_DESKTOP;
  const { browser, page } = await open({ viewport: { width: 1440, height: 900 }, context: { userAgent } });
  await page.route('**/graphql', async (route) => {
    if ((route.request().postData() ?? '').includes('myDevices')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            myDevices: {
              browser: { connected: true, client: 'Chrome', version: '1.0.0', installUrl: 'https://example.invalid/chrome' },
              desktop,
              desktops,
              claude: { connected: false, client: null, version: null, installUrl: 'https://example.invalid/claude' },
              claudeAvailable: true,
              mcp: true,
            },
          },
        }),
      });
    }
    return route.continue();
  });
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="corner-buttons"]', { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const drawn = await page.evaluate(() => {
    const row = document.querySelector('[data-testid="corner-buttons"]');
    const pill = (el) => {
      if (!el) return null;
      const box = el.getBoundingClientRect();
      const mark = el.querySelector('img');
      const logo = mark === null ? null : {
        // Decoded: a small SVG is inlined into the bundle as a data URI, so the mark is known by its colours, not a file name.
        src: decodeURIComponent(mark.getAttribute('src') ?? ''),
        loaded: mark.complete && mark.naturalWidth > 0,
        size: Math.round(mark.getBoundingClientRect().width),
        light: el.querySelector('[data-state]')?.getAttribute('data-state') ?? null,
      };
      return { logo, tag: el.tagName, href: el.getAttribute('href'), text: el.textContent.trim(), top: Math.round(box.top), height: Math.round(box.height), right: Math.round(box.right) };
    };
    const mcp = [...(row?.querySelectorAll('button') ?? [])].find((b) => b.textContent.includes('Orknux MCP'));
    return {
      chrome: pill(row?.querySelector('[data-testid="device-chrome"]')),
      windows: pill(row?.querySelector('[data-testid="device-windows"]')),
      claude: pill(row?.querySelector('[data-testid="device-claude"]')),
      linux: pill(row?.querySelector('[data-testid="device-linux"]')),
      mcpLight: row?.querySelector('[data-testid="mcp-connect"] [data-state]')?.getAttribute('data-state') ?? null,
      mcpMark: row?.querySelector('[data-testid="mcp-connect"] svg[data-orknux-mark]') !== null && row?.querySelector('[data-testid="mcp-connect"] img') === null,
      footer: (() => {
        const strip = document.querySelector('[data-shell-footer]');
        const clients = document.querySelector('[data-testid="footer-clients"]');
        if (strip === null || clients === null) return null;
        const outer = strip.getBoundingClientRect();
        const inner = clients.getBoundingClientRect();
        return {
          pills: [...clients.querySelectorAll('[data-testid^="device-"], [data-testid="mcp-connect"]')].map((el) => el.textContent.trim()),
          inside: inner.top >= outer.top - 0.5 && inner.bottom <= outer.bottom + 0.5,
          atRight: Math.round(outer.right - inner.right),
          mcpLight: clients.querySelector('[data-testid="mcp-connect"] [data-state]')?.getAttribute('data-state') ?? null,
          floating: document.querySelector('[data-testid="corner-buttons"]') !== null,
          height: Math.round(clients.querySelector('[data-testid^="device-"]')?.getBoundingClientRect().height ?? 0),
        };
      })(),
      mcp: pill(mcp),
      width: window.innerWidth,
    };
  });
  // The hint is the application's own, drawn inside the window, not the browser's title.
  const windowsPill = page.locator('[data-testid="device-windows"]').first();
  if (await windowsPill.count() === 0) {
    await browser.close();
    return drawn;
  }
  await windowsPill.hover();
  const hint = await page.waitForSelector('[data-hover-hint]', { timeout: 3_000 }).then(async (el) => {
    const box = await el.boundingBox();
    return { text: (await el.textContent()) ?? '', box };
  }, () => null);
  drawn.title = await windowsPill.getAttribute('title');
  // A connected pill is a link to its client's page as well, and lights up under the pointer like any other.
  const chromePill = page.locator('[data-testid="device-chrome"]').first();
  const resting = await chromePill.evaluate((el) => getComputedStyle(el).borderColor);
  await chromePill.hover();
  drawn.chromeHover = { resting, hovered: await chromePill.evaluate((el) => getComputedStyle(el).borderColor) };
  drawn.hint = hint;
  await browser.close();
  return drawn;
}

const both = await corner(CHROME_ON_WINDOWS);
record(both.chrome !== null && both.windows !== null, 'Chrome on Windows shows both clients in the corner');
record(both.chrome?.tag === 'A' && both.chrome.href === 'https://example.invalid/chrome' && both.chrome.text === 'Chrome',
  `a connected client is a link to its own page too (${JSON.stringify(both.chrome)})`);
record(both.windows?.tag === 'A' && both.windows.href === 'https://example.invalid/windows' && both.windows.text === 'Windows',
  `a client not connected is a link to get it (${JSON.stringify(both.windows)})`);
record(both.mcp !== null && both.chrome?.top === both.mcp.top && both.windows?.top === both.mcp.top,
  `they sit level with Orknux MCP (tops ${both.chrome?.top}, ${both.windows?.top}, ${both.mcp?.top})`);
record(both.mcp !== null && both.chrome?.height === both.mcp.height, `and are as tall as it (${both.chrome?.height} and ${both.mcp?.height})`);
record(both.mcp !== null && both.mcp.right <= both.width, 'nothing is pushed off the right edge');
record(/d93025|chrome-logo/.test(both.chrome?.logo?.src ?? '') && both.chrome.logo.loaded && both.chrome.logo.size === 14,
  `Chrome is shown with its own logo, drawn (${JSON.stringify(both.chrome?.logo)})`);
record(/0078d4|windows-logo/.test(both.windows?.logo?.src ?? '') && both.windows.logo.loaded && both.windows.logo.size === 14,
  `Windows is shown with its own logo, drawn (${JSON.stringify(both.windows?.logo)})`);
record(/hsl\(14.8|claude-logo/.test(both.claude?.logo?.src ?? '') && both.claude.logo.loaded && both.claude.logo.size === 14,
  `Claude Code is shown with its own logo, drawn (${JSON.stringify(both.claude?.logo)})`);
record(both.hint !== null && both.title === null && both.hint.text.includes('Orknux for Windows'),
  `hovering a pill shows the application's own hint, not the browser's title (${JSON.stringify(both.hint?.text)})`);
record(both.hint?.box != null && both.hint.box.x >= 0 && both.hint.box.y >= 0
  && both.hint.box.x + both.hint.box.width <= both.width && both.hint.box.y + both.hint.box.height <= 900,
  `and the hint is drawn inside the window, though the pill is in its corner (${JSON.stringify(both.hint?.box)})`);
record(both.chrome?.logo?.light === 'on' && both.windows?.logo?.light === 'off' && both.claude?.logo?.light === 'off' && both.claude?.text === 'Claude Code', 'each says only its name, then a light: green when connected, grey when not');

record(both.mcpMark === true, 'Orknux MCP wears the Orknux mark in its colours, not a plug');
record(both.chromeHover != null && both.chromeHover.resting !== both.chromeHover.hovered, `a connected pill's border lights up under the pointer too (${JSON.stringify(both.chromeHover)})`);
record(both.mcpLight === 'on', `Orknux MCP has a light too, green while an MCP client is connected (${both.mcpLight})`);

// The chat page: the composer owns the corner, so the same pills stand in the footer strip.
const chat = await corner(CHROME_ON_WINDOWS, '/chat');
chat.footerHeight = chat.footer?.height ?? -1;
record(chat.footer !== null && !chat.footer.floating, 'the chat page shows them in the footer strip, not floating over the composer');
record(chat.footer !== null && ['Chrome', 'Claude Code', 'Windows', 'Orknux MCP'].every((one) => chat.footer.pills.includes(one)),
  `all four are there: ${JSON.stringify(chat.footer?.pills)}`);
record(chat.footer?.inside === true, 'and they fit inside the strip, which does not grow for them');
record(chat.footer != null && chat.footer.atRight >= 0 && chat.footer.atRight <= 24,
  `at its right end, where the corner is on every other page (${chat.footer?.atRight}px from the edge)`);
record(chat.footer?.mcpLight === 'on', 'Orknux MCP has its light there as well');
record(both.chrome != null && both.chrome.height === chat.footerHeight,
  `the corner's pills are the chat footer's size, not stretched to Ask AI (${both.chrome?.height} and ${chat.footerHeight})`);

const neither = await corner(FIREFOX_ON_LINUX);
record(neither.chrome === null && neither.windows === null, 'Firefox on Linux shows neither Chrome nor Windows');
record(neither.linux?.text === 'Linux' && /orknux-linux/.test(neither.linux?.href ?? ''), `and offers Orknux for Linux instead (${JSON.stringify(neither.linux?.href)})`);
record(neither.mcp !== null, 'and Orknux MCP is still there');

// A computer connected is shown by its own system, wherever the page is read: Orknux for Linux connected, read in
// Chrome on Windows, is a lit Linux pill - and Windows, this computer's own, is still offered beside it.
const LINUX = { connected: true, client: 'Linux', version: null, installUrl: 'https://example.invalid/windows', name: 'Linux on studio' };
const WINDOWS = { connected: true, client: 'Windows', version: null, installUrl: 'https://example.invalid/windows', name: 'Windows on PC' };
const linuxFromWindows = await corner(CHROME_ON_WINDOWS, undefined, [LINUX]);
record(linuxFromWindows.linux?.text === 'Linux' && linuxFromWindows.linux.tag === 'A' && /github\.com\/orknux\/orknux-linux/.test(linuxFromWindows.linux.href ?? '') && linuxFromWindows.linux.logo?.light === 'on',
  `a Linux computer connected shows as Linux, lit, and opens Orknux for Linux's repository (${JSON.stringify(linuxFromWindows.linux)})`);
record(linuxFromWindows.windows?.tag === 'A' && linuxFromWindows.windows.logo?.light === 'off',
  `and Windows, not connected, is still offered beside it (${JSON.stringify(linuxFromWindows.windows)})`);

// Both connected at once are two lit pills, not one for whichever spoke last.
const twoComputers = await corner(CHROME_ON_WINDOWS, undefined, [WINDOWS, LINUX]);
record(twoComputers.windows?.logo?.light === 'on' && twoComputers.linux?.logo?.light === 'on'
  && twoComputers.windows.href === 'https://example.invalid/windows' && /orknux-linux/.test(twoComputers.linux.href ?? ''),
  `Windows and Linux connected at once are both lit (${twoComputers.windows?.logo?.light}, ${twoComputers.linux?.logo?.light})`);

finish();
