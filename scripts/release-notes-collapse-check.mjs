/**
 * Admin -> Updates: a release the official server offers opens and closes its
 * changes. Issue #598.
 *
 * Reported: every offered release drew its whole changelog, so one release
 * filled the screen and Upload, From a URL and the kept releases were pushed
 * a long way down. What is measured is what that cost - where the Upload
 * heading sits - with the notes open and with them closed, and that only the
 * newest is open on arrival.
 *
 * The releases are the server's own answer with two offered ones put into it,
 * because no installation a check runs against has an official server that
 * offers anything newer than itself.
 */
import { BASE, open, record, finish } from './suite/harness.mjs';

const NOTES = (version) =>
  `### Added\n\n${Array.from({ length: 12 }, (_, i) => `- ${version}: a change worth a line of its own, number ${i + 1}.`).join('\n')}`;

const { browser, page } = await open({ viewport: { width: 1400, height: 1000 } });

await page.route('**/graphql', async (route) => {
  const body = route.request().postData() ?? '';
  if (!body.includes('query ServerUpdates')) return route.continue();
  const response = await route.fetch();
  const json = await response.json();
  const updates = json?.data?.serverUpdates;
  if (updates) {
    Object.assign(updates, {
      enabled: true,
      officialEnabled: true,
      offered: true,
      offeredError: null,
      available: [
        { version: '9.9.9.2', publishedAt: '2026-10-03T00:00:00Z', changelog: NOTES('9.9.9.2'), size: 1, stored: false },
        { version: '9.9.9.1', publishedAt: '2026-10-02T00:00:00Z', changelog: NOTES('9.9.9.1'), size: 1, stored: false },
      ],
    });
  }
  await route.fulfill({ response, json });
});

await page.goto(`${BASE}/admin/updates`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => window.localStorage.removeItem('orknux.updates.notesOpen'));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.getByTestId('offered-release').first().waitFor({ timeout: 20_000 });

const toggles = page.getByTestId('offered-release-toggle');
const notes = page.getByTestId('offered-release-notes');
const upload = page.getByRole('heading', { name: 'Upload a jar' });

record((await toggles.count()) === 2, `each offered release has a toggle (${await toggles.count()})`);
record((await notes.count()) === 1, `only one release's changes are open on arrival (${await notes.count()})`);
record(
  (await toggles.nth(0).getAttribute('aria-expanded')) === 'true' &&
    (await toggles.nth(1).getAttribute('aria-expanded')) === 'false',
  'and it is the newest, as the toggles say',
);
const cursor = await toggles.first().evaluate((element) => getComputedStyle(element).cursor);
record(cursor === 'pointer', `the toggle says it can be pressed (${cursor})`);

const openTop = (await upload.boundingBox())?.y ?? 0;
await toggles.nth(0).click();
await page.waitForTimeout(200);
const closedTop = (await upload.boundingBox())?.y ?? 0;
record((await notes.count()) === 0, 'closing the newest leaves no changes drawn');
record(
  closedTop < openTop - 150,
  `and Upload a jar moves up by what they took (${Math.round(openTop)}px -> ${Math.round(closedTop)}px)`,
);

// From the keyboard too: Enter on a focused toggle opens it.
await toggles.nth(1).focus();
await page.keyboard.press('Enter');
await page.waitForTimeout(200);
record((await toggles.nth(1).getAttribute('aria-expanded')) === 'true', 'Enter on the older one opens it');
record(((await notes.first().textContent()) ?? '').includes('9.9.9.1'), 'and what opens is its own changes');

// What somebody chose is kept across a reload.
await page.reload({ waitUntil: 'domcontentloaded' });
await page.getByTestId('offered-release').first().waitFor({ timeout: 20_000 });
record(
  (await toggles.nth(0).getAttribute('aria-expanded')) === 'false' &&
    (await toggles.nth(1).getAttribute('aria-expanded')) === 'true',
  'and the choice survives a reload',
);

await page.evaluate(() => window.localStorage.removeItem('orknux.updates.notesOpen'));
await finish(browser);
