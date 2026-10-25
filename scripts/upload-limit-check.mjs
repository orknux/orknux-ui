/**
 * The upload limit is Admin Settings' Largest file, and a file past it is said
 * to be past it - in words that name its size, the limit and where to raise it -
 * never as the browser's "Failed to fetch".
 *
 * Three halves:
 *   - Largest file is a box under Attachments on Admin Settings showing what the
 *     server holds, and Save Changes writes what is typed;
 *   - a chat file past the limit is refused before anything is sent: no upload
 *     request leaves the page, and the line under the composer names the file's
 *     size, the limit and Admin Settings → Attachments;
 *   - a file the page believes is under the limit and the server does not is
 *     answered by the server in the same words. The page is told the limit is
 *     2048 MB, and the file is 26 MB - past the 25 MB Spring's multipart cap
 *     used to be, where Tomcat dropped the connection and this said "Failed to
 *     fetch" - with the server's own limit at 1 MB.
 *
 * Sets the installation-wide limit and puts it back, so `alone`.
 */
import { BASE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const stored = async () =>
  (await graphql('query { installationSettings { attachmentMaxFileSizeMb attachmentMaxFileSizeMbConfigured } }'))
    .installationSettings;
const setLimit = (megabytes) =>
  graphql('mutation($m: Int!) { setAttachmentMaxFileSizeMb(megabytes: $m) { attachmentMaxFileSizeMb } }', { m: megabytes });

const started = await stored();
const wanted = started.attachmentMaxFileSizeMb === 3 ? 4 : 3;
const MB = 1024 * 1024;

/** Every upload request the page sends to the chat's attachments. */
const uploads = [];
page.on('request', (request) => {
  if (request.method() === 'POST' && /\/api\/workspaces\/[^/]+\/attachments$/.test(request.url())) uploads.push(request.url());
});

/** What is said on the page about the file: the line that mentions it, or nothing. */
const saidAbout = (name) =>
  page.evaluate((wanted) => {
    const text = document.body.innerText;
    const line = text.split('\n').find((one) => one.includes(wanted));
    return { line: line ?? null, failedToFetch: text.includes('Failed to fetch') };
  }, name);

/** Picks [name] of [bytes] in the chat's file input and waits for the page to answer. */
async function attach(name, bytes) {
  await page.goto(`${BASE}/chat`, { waitUntil: 'domcontentloaded' });
  const input = page.locator('input[type="file"]').first();
  await input.waitFor({ state: 'attached', timeout: 20_000 }).catch(() => undefined);
  if ((await input.count()) === 0) return null;
  await input.setInputFiles({ name, mimeType: 'application/octet-stream', buffer: Buffer.alloc(bytes) });
  await page
    .waitForFunction((wanted) => document.body.innerText.includes(wanted) || document.body.innerText.includes('Failed to fetch'), name, {
      timeout: 60_000,
    })
    .catch(() => undefined);
  return saidAbout(name);
}

try {
  /* ---------------------------------------------------------- Admin Settings */

  const field = () => page.getByLabel('Largest file', { exact: true });
  await page.goto(`${BASE}/admin/settings`, { waitUntil: 'domcontentloaded' });
  if (await drawn(page, 'admin settings')) {
    const visible = await field()
      .waitFor({ state: 'visible', timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    record(visible, 'Largest file is a box on Admin Settings');
    if (visible) {
      const placed = await page.evaluate(() => {
        const heading = document.getElementById('attachments')?.getBoundingClientRect();
        const next = document.getElementById('metrics')?.getBoundingClientRect();
        const box = document.getElementById('attachment-max-file-size-mb')?.getBoundingClientRect();
        return heading && next && box ? box.top > heading.bottom && box.bottom < next.top : null;
      });
      record(placed === true, 'under Attachments, before Metrics');
      record((await field().inputValue()) === String(started.attachmentMaxFileSizeMb), `it shows what is stored (${started.attachmentMaxFileSizeMb} MB)`);
      await field().fill(String(wanted));
      await page.getByRole('button', { name: 'Save the settings on this page', exact: true }).click();
      await page.getByText('Saved.', { exact: true }).waitFor({ timeout: 10_000 }).catch(() => {});
      const after = await stored();
      record(after.attachmentMaxFileSizeMb === wanted, `the server holds ${wanted} MB after a save (${after.attachmentMaxFileSizeMb})`);
    }
  }

  /* ------------------------------------------- refused before it is sent */

  await setLimit(1);
  const early = await attach('two-megabytes.bin', 2 * MB);
  record(early !== null, 'the chat offers a file input');
  record(
    early?.line?.includes('two-megabytes.bin is 2 MB; uploads are limited to 1 MB') === true,
    `a file past the limit is said by its size and the limit (${early?.line})`,
  );
  record(early?.line?.includes('Admin Settings → Attachments') === true, 'and where the limit is raised');
  record(early?.failedToFetch === false, 'never as "Failed to fetch"');
  record(uploads.length === 0, `and nothing was sent (${uploads.length} upload requests)`);

  /* -------------------------------------------------- refused by the server */

  // The page is told the limit is the largest it can be, so the server is what refuses.
  await page.route('**/graphql', async (route) => {
    const body = route.request().postData() ?? '';
    if (!body.includes('installationSettings')) return route.continue();
    const answer = await route.fetch();
    const json = await answer.json();
    if (json?.data?.installationSettings) json.data.installationSettings.attachmentMaxFileSizeMb = 2048;
    return route.fulfill({ response: answer, json });
  });
  const late = await attach('twenty-six.bin', 26 * MB);
  record(uploads.length === 1, `this one went up (${uploads.length} upload requests)`);
  record(
    late?.line?.includes('twenty-six.bin is 26 MB; uploads are limited to 1 MB') === true,
    `the server's refusal is shown in the same words (${late?.line})`,
  );
  record(late?.line?.includes('Admin Settings → Attachments') === true, 'naming where the limit is raised');
  record(late?.failedToFetch === false, 'and not as "Failed to fetch"');
  await page.unroute('**/graphql');
} finally {
  await setLimit(started.attachmentMaxFileSizeMb).catch(() => undefined);
}
record((await stored()).attachmentMaxFileSizeMb === started.attachmentMaxFileSizeMb, 'put back to what it was');

await finish(browser);
