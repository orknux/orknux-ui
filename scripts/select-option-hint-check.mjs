/**
 * A choice says what it means beside its row, not in its name.
 *
 * An auth type was offered as "Basic (username:password)": the name and an
 * explanation of it run together into one label. The label is the name now,
 * and what each type sends is a one-line hint drawn beside the list next to
 * the row - while the pointer is on it, and while the arrows have it.
 *
 * Opens Add Server on Integrations and the auth type list in it, reads, and
 * cancels; nothing is saved.
 */
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 900 } });

await page.goto(`${BASE}/workspace/${WORKSPACE}/integrations`, { waitUntil: 'domcontentloaded' });
if (await drawn(page, 'integrations', { where: 'main' })) {
  await page.getByRole('button', { name: /Add Server/ }).first().click();
  const auth = page.locator('#mcp-server-auth');
  await auth.waitFor({ timeout: 10_000 }).catch(() => undefined);
  await auth.click().catch(() => undefined);
  const menu = page.locator('[role="listbox"][data-select-menu="mcp-server-auth"]');
  const opened = await menu.waitFor({ timeout: 5000 }).then(() => true).catch(() => false);
  record(opened, 'the auth type list opens');

  const labels = await menu.locator('[role="option"]').allTextContents().catch(() => []);
  record(labels.length === 4, `it offers four types (${JSON.stringify(labels)})`);
  record(labels.every((one) => !one.includes('(') && !one.includes('—')), 'no row carries an explanation in its name');
  record(labels.map((one) => one.trim()).includes('Basic'), 'Basic is called Basic');

  const hint = page.locator('[role="tooltip"][data-select-hint]');
  const basic = menu.locator('[role="option"][data-value="BASIC"]');
  await basic.hover().catch(() => undefined);
  const shown = await hint.waitFor({ timeout: 3000 }).then(() => true).catch(() => false);
  record(shown, 'pointing at Basic draws a hint');
  record(
    (await hint.textContent().catch(() => '')) === 'Sends username:password, base64-encoded, as Basic authorization.',
    `and it says what Basic sends (${await hint.textContent().catch(() => null)})`,
  );
  const beside = async (value) =>
    page.evaluate((wanted) => {
      const row = document.querySelector(`[role="option"][data-value="${wanted}"]`)?.getBoundingClientRect();
      const list = document.querySelector('[data-select-menu="mcp-server-auth"]')?.parentElement?.getBoundingClientRect();
      const tip = document.querySelector('[role="tooltip"][data-select-hint]')?.getBoundingClientRect();
      if (!row || !list || !tip) return null;
      const middle = (box) => box.top + box.height / 2;
      return {
        level: Math.abs(middle(tip) - middle(row)) < 6,
        outside: tip.left >= list.right - 1 || tip.right <= list.left + 1,
        onScreen: tip.left >= 0 && tip.right <= window.innerWidth,
      };
    }, value);
  const atBasic = await beside('BASIC');
  record(atBasic?.level && atBasic?.outside && atBasic?.onScreen, `drawn beside the list, level with Basic's row (${JSON.stringify(atBasic)})`);
  const described = await basic.getAttribute('aria-describedby').catch(() => null);
  record(described !== null && described === (await hint.getAttribute('id').catch(() => undefined)), 'and the row is described by it');

  // The keys move the hint with them.
  await page.mouse.move(5, 5);
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(200);
  record((await hint.getAttribute('data-select-hint').catch(() => null)) === 'API_KEY', `ArrowDown onto API Key moves the hint to it (${await hint.getAttribute('data-select-hint').catch(() => null)})`);
  record(
    (await hint.textContent().catch(() => '')) === 'Sends the key as the Authorization header, as it is.',
    `and it says what an API key sends (${await hint.textContent().catch(() => null)})`,
  );
  const atKey = await beside('API_KEY');
  record(atKey?.level === true, `level with API Key's row (${JSON.stringify(atKey)})`);

  await page.keyboard.press('Escape');
  record(await hint.waitFor({ state: 'detached', timeout: 3000 }).then(() => true).catch(() => false), 'closing the list takes the hint with it');
  await page.keyboard.press('Escape');
}

await finish(browser);
