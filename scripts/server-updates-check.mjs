/**
 * Admin -> Updates, as drawn. Issue #584.
 *
 * Two things a person reads off this page before pressing anything: which
 * version this server runs, and which releases the database keeps to roll back
 * to. Both are asserted against what the server answers, so a page that drew a
 * stale or empty list is caught rather than looking tidy.
 *
 * And the refusal: a file that is not a signed Orknux jar is uploaded, and the
 * reason has to be on the screen, in a line somebody can see - measured, not
 * just present in the DOM. A garbage file is the one upload this check can
 * make anywhere: a real release needs the release key, which no test holds.
 *
 * The restart itself is not here - it needs a container the server can leave
 * and come back to, which is what scripts/self-update/lib.sh in the server
 * repository drives.
 */
import { BASE, open, record, drawn, shot, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open();

const answer = await graphql(
  'query { serverUpdates { enabled runningVersion stored { id version } } }',
);
const updates = answer.serverUpdates;
record(typeof updates.runningVersion === 'string' && updates.runningVersion !== '', `the server runs ${updates.runningVersion}`);

await page.goto(`${BASE}/admin/updates`, { waitUntil: 'domcontentloaded' });
if (await drawn(page, 'the updates page')) {
  const running = page.getByTestId('running-version');
  await running.waitFor({ state: 'visible', timeout: 20_000 });
  const said = (await running.textContent()) ?? '';
  record(said.includes(updates.runningVersion), `the page says what runs: "${said}"`);
  const box = await running.boundingBox();
  record(box !== null && box.height > 0 && box.width > 0, 'and the line is drawn, not just in the page');

  if (!updates.enabled) {
    record(await page.getByTestId('updates-disabled').isVisible(), 'updates are off, and the page says so in one line');
  } else {
    const list = page.getByTestId('stored-releases');
    await list.waitFor({ state: 'visible', timeout: 20_000 });
    const rows = await page.getByTestId('stored-release').count();
    record(rows === updates.stored.length, `the page draws ${rows} kept releases, and the server keeps ${updates.stored.length}`);
    for (const release of updates.stored) {
      const drawnRow = await page.getByTestId('stored-release').filter({ hasText: release.version }).count();
      record(drawnRow > 0, `kept release ${release.version} has a row`);
    }

    // Something that is not a jar: refused, and the reason is on screen.
    await page.getByTestId('release-file').setInputFiles({
      name: 'not-a-release.jar',
      mimeType: 'application/java-archive',
      buffer: Buffer.from('this is not a jar at all'),
    });
    await page.getByRole('button', { name: 'Upload', exact: true }).click();
    const refusal = page.getByTestId('upload-error');
    const shown = await refusal
      .waitFor({ state: 'visible', timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    record(shown, 'uploading garbage shows a refusal');
    if (shown) {
      const text = (await refusal.textContent()) ?? '';
      record(text.includes('not a jar'), `the refusal says why: "${text}"`);
      const drawnBox = await refusal.boundingBox();
      record(drawnBox !== null && drawnBox.height > 0, 'and it is drawn where it can be read');
    }

    const after = await graphql('query { serverUpdates { stored { id } } }');
    record(after.serverUpdates.stored.length === updates.stored.length, 'and nothing was stored');
  }

  await page.screenshot({ path: shot('server-updates.png'), fullPage: true });
}

await finish(browser);
