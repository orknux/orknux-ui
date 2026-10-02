/**
 * Admin -> Settings -> Logging, as drawn. Issue #591.
 *
 * A logger is added at DEBUG from the page, and the page is reloaded: the row
 * has to come back at DEBUG, drawn, with the server saying the same - which is
 * what "kept" means to the person who chose it. Then Reset to defaults, through
 * its confirmation, and the row has to be gone from the page and from the
 * server alike. A logger of its own, so turning it up makes nothing louder.
 */
import { BASE, open, record, drawn, shot, finish } from './suite/harness.mjs';

const LOGGER = 'io.mszymanski.orknux.loglevelcheck';

const { browser, page, graphql } = await open({ viewport: { width: 1280, height: 1000 } });

/** The level the server holds for the check's logger, or null when it holds none. */
async function held() {
  const answer = await graphql('query { logLevels { loggers { name level } } }');
  return answer.logLevels.loggers.find((logger) => logger.name === LOGGER)?.level ?? null;
}

/** Puts the installation back however this run ends: it changes a real server's logging. */
async function putBack() {
  await graphql(`mutation { clearLogLevel(name: "${LOGGER}") { followSeconds } }`).catch(() => undefined);
}

await putBack();

await page.goto(`${BASE}/admin/settings#logging`, { waitUntil: 'domcontentloaded' });
if (await drawn(page, 'the settings page')) {
  const heading = page.locator('h2#logging');
  await heading.waitFor({ state: 'visible', timeout: 20_000 });
  record(await heading.isVisible(), 'the Logging section has a heading');

  const root = page.locator('[data-logger="ROOT"]');
  await root.waitFor({ state: 'visible', timeout: 20_000 });
  const rootBox = await root.boundingBox();
  record(rootBox !== null && rootBox.height > 0, 'the root level is drawn');

  // Add the logger at DEBUG.
  await page.locator('#log-logger-name').fill(LOGGER);
  await page.locator('#log-logger-level').selectOption('DEBUG');
  await page.getByRole('button', { name: 'Add logger' }).click();
  const row = page.locator(`[data-logger="${LOGGER}"]`);
  const added = await row.waitFor({ state: 'visible', timeout: 20_000 }).then(() => true).catch(() => false);
  record(added, 'adding a logger draws its row');
  record((await held()) === 'DEBUG', 'and the server holds it at DEBUG');

  // Reload: still DEBUG, on the page and on the server.
  await page.reload({ waitUntil: 'domcontentloaded' });
  const back = await row.waitFor({ state: 'visible', timeout: 20_000 }).then(() => true).catch(() => false);
  record(back, 'after a reload the row is still there');
  if (back) {
    const chosen = await row.locator('select').inputValue();
    record(chosen === 'DEBUG', `and its level reads DEBUG: "${chosen}"`);
    const effective = (await row.textContent()) ?? '';
    record(effective.includes('DEBUG'), 'and it says it logs at DEBUG');
    const box = await row.boundingBox();
    record(box !== null && box.height > 0 && box.width > 0, 'and the row is drawn, not just in the page');
  }
  await page.screenshot({ path: shot('log-levels.png'), fullPage: false });

  // Reset to defaults, through the confirmation.
  await page.locator('#log-levels-reset').click();
  const dialog = page.locator('dialog[open]');
  await dialog.waitFor({ state: 'visible', timeout: 10_000 });
  await dialog.getByRole('button', { name: 'Reset', exact: true }).click();
  const gone = await row.waitFor({ state: 'detached', timeout: 20_000 }).then(() => true).catch(() => false);
  record(gone, 'Reset to defaults takes the row away');
  record((await held()) === null, 'and the server holds no level for it');
}

await putBack();
await finish(browser);
