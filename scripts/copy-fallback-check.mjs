/**
 * A copy button copies over plain http. Issue #589.
 *
 * Reported: pressing copy on a chat message copied nothing on an installation
 * reached as `http://192.168.0.190:8090`. Browsers expose `navigator.clipboard`
 * only on a secure origin - https, or localhost - so on a LAN address over http
 * it is undefined, and `navigator.clipboard?.writeText(text)` silently did
 * nothing while the button went on looking pressed.
 *
 * What is asserted is the clipboard itself, read back from a page that may read
 * it, and that the button said "Copied". The page under test is a plain-http
 * origin: really, where the suite is pointed at `host.docker.internal`, and by
 * removing the API before the page loads where it is pointed at localhost, as
 * CI is - so the fallback is what is measured either way, never the API.
 */
import { BASE, WORKSPACE, open, record, drawn, finish, clipboardText, setClipboardText, asPlainHttp } from './suite/harness.mjs';

const { browser, context, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });
await asPlainHttp(page);

// The seed builds this one; found by name, because a database built from nothing hands out other ids.
const { chatSessions } = await graphql(`query ($w: ID!) { chatSessions(workspaceId: $w) { id title } }`, { w: WORKSPACE });
const wanted = 'First checks for a login failure';
const chat = chatSessions.find((one) => one.title === wanted);
if (chat === undefined) {
  record(false, `no chat called ${JSON.stringify(wanted)} in workspace ${WORKSPACE}; the seed builds it`);
  await finish(browser);
}

await page.goto(`${BASE}/chat/${chat.id}`, { waitUntil: 'domcontentloaded' });
if (await drawn(page, 'the chat log')) {
  const insecure = await page.evaluate(() => ({ secure: window.isSecureContext, api: navigator.clipboard !== undefined }));
  record(
    !insecure.secure && !insecure.api,
    `the page is a plain-http origin to the browser: no secure context, no clipboard API (${JSON.stringify(insecure)})`,
  );

  const button = page.locator('button[aria-label="Copy this message"]').first();
  await button.waitFor({ timeout: 20_000 });
  const said = (
    (await page.evaluate(() => {
      const bubble = [...document.querySelectorAll('div')].find((one) => one.className.includes('userBubble'));
      return bubble?.textContent ?? '';
    })) ?? ''
  ).trim();
  record(said.length > 0, `there is a sent message to copy (${said.length} characters)`);

  await setClipboardText(context, 'nothing copied yet');
  await page.bringToFront();
  await button.hover();
  await button.click();

  const status = page.locator('[role="status"]', { hasText: 'Copied' }).first();
  const confirmed = await status
    .waitFor({ timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  record(confirmed, 'the button says Copied beside it');

  const held = (await clipboardText(context)).trim();
  record(held === said, `and the clipboard holds the message (${JSON.stringify(held.slice(0, 60))})`);
}

await finish(browser);
