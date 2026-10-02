/**
 * Admin -> Updates, as drawn. Issues #584 and #589.
 *
 * Two things a person reads off this page before pressing anything: which
 * version this server runs, and which releases the database keeps to roll back
 * to. Both are asserted against what the server answers, so a page that drew a
 * stale or empty list is caught rather than looking tidy.
 *
 * And the refusals: a file that is not a signed Orknux jar is uploaded, and a
 * URL the server will not fetch is typed, and each reason has to be on the
 * screen, in a line somebody can see - measured, not just present in the DOM.
 * A garbage file and a file: URL are the two this check can make anywhere: a
 * real release needs the release key, which no test holds.
 *
 * The file picker is the page's own button, not the browser's grey one: the
 * native input is hidden, and what is drawn in its place says pointer like
 * every other button on the page.
 *
 * Each source can be switched off by the installation (#589); a source that is
 * off is asserted to say so in one line instead of drawing its controls.
 *
 * The restart itself is not here - it needs a container the server can leave
 * and come back to, which is what scripts/self-update/lib.sh in the server
 * repository drives.
 */
import { BASE, open, record, drawn, shot, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open();

const answer = await graphql(
  'query { serverUpdates { enabled runningVersion officialEnabled uploadEnabled urlEnabled sourceUrl stored { id version } } }',
);
const updates = answer.serverUpdates;
record(typeof updates.runningVersion === 'string' && updates.runningVersion !== '', `the server runs ${updates.runningVersion}`);

/** A line that is on the screen with a size, not only in the DOM. */
async function seen(locator) {
  const box = await locator.boundingBox();
  return box !== null && box.height > 0 && box.width > 0;
}

await page.goto(`${BASE}/admin/updates`, { waitUntil: 'domcontentloaded' });
if (await drawn(page, 'the updates page')) {
  const running = page.getByTestId('running-version');
  await running.waitFor({ state: 'visible', timeout: 20_000 });
  const said = (await running.textContent()) ?? '';
  record(said.includes(updates.runningVersion), `the page says what runs: "${said}"`);
  record(await seen(running), 'and the line is drawn, not just in the page');

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

    record(
      (await page.getByRole('heading', { name: 'From official server', exact: true }).count()) === 1,
      'the official source is headed "From official server"',
    );
    if (!updates.officialEnabled) {
      record(await seen(page.getByTestId('official-off')), 'the official server is off here, and the page says so');
    }

    // ---- Upload ----------------------------------------------------------
    if (!updates.uploadEnabled) {
      record(await seen(page.getByTestId('upload-off')), 'uploading is off here, and the page says so in one line');
    } else {
      const native = page.getByTestId('release-file');
      record(!(await native.isVisible()), "the browser's own file input is not what is drawn");
      const choose = page.getByTestId('release-choose');
      record(await seen(choose), 'a Choose button is drawn in its place');
      const cursor = await choose.evaluate((element) => getComputedStyle(element).cursor);
      record(cursor === 'pointer', `and it says pointer, like the page's other buttons: ${cursor}`);
      const background = await choose.evaluate((element) => getComputedStyle(element).backgroundColor);
      record(
        background !== 'rgb(239, 239, 239)' && background !== 'rgb(240, 240, 240)',
        `and it is not the browser's grey: ${background}`,
      );
      record((await page.getByTestId('release-chosen').count()) === 0, 'with nothing chosen, no file name is drawn');

      // Something that is not a jar: refused, and the reason is on screen.
      await native.setInputFiles({
        name: 'not-a-release.jar',
        mimeType: 'application/java-archive',
        buffer: Buffer.from('this is not a jar at all'),
      });
      const chosen = page.getByTestId('release-chosen');
      record(((await chosen.textContent()) ?? '').includes('not-a-release.jar'), 'the chosen file is named beside the button');
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
        record(await seen(refusal), 'and it is drawn where it can be read');
      }
    }

    // ---- From a URL --------------------------------------------------------
    if (!updates.urlEnabled) {
      record(await seen(page.getByTestId('url-off')), 'fetching from a URL is off here, and the page says so in one line');
    } else {
      const field = page.getByTestId('release-url');
      const credential = page.getByTestId('release-credential');
      record(await seen(field), 'the URL field is drawn');
      record(await seen(credential), 'and the credential field beside it');
      record((await credential.getAttribute('type')) === 'password', 'the credential is typed into a password field, never shown');
      record(
        (await field.inputValue()) === (updates.sourceUrl ?? ''),
        `the field starts at the configured source: "${await field.inputValue()}"`,
      );
      const fieldBox = await field.boundingBox();
      const credentialBox = await credential.boundingBox();
      record(
        fieldBox !== null && credentialBox !== null && Math.abs(fieldBox.y - credentialBox.y) < fieldBox.height,
        'the two fields sit on one line',
      );

      // A URL the server refuses to fetch: the refusal is one line, on screen.
      await field.fill('file:///etc/passwd');
      await page.getByRole('button', { name: 'Fetch', exact: true }).click();
      const refusal = page.getByTestId('url-error');
      const shown = await refusal
        .waitFor({ state: 'visible', timeout: 30_000 })
        .then(() => true)
        .catch(() => false);
      record(shown, 'a file: URL shows a refusal');
      if (shown) {
        const text = (await refusal.textContent()) ?? '';
        record(text.includes('only http and https'), `the refusal says why: "${text}"`);
        const box = await refusal.boundingBox();
        const lineHeight = await refusal.evaluate((element) => parseFloat(getComputedStyle(element).lineHeight) || 20);
        record(box !== null && box.height > 0 && box.height < lineHeight * 2.5, `and it is drawn, in a line or so (${box?.height}px)`);
      }
    }

    const after = await graphql('query { serverUpdates { stored { id } } }');
    record(after.serverUpdates.stored.length === updates.stored.length, 'and nothing was stored');
  }

  await page.screenshot({ path: shot('server-updates.png'), fullPage: true });
}

await finish(browser);
