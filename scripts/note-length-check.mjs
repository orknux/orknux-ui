/**
 * How long a note an agent writes to itself may be, set from Admin.
 *
 * It was five hundred characters, written into the code, and an agent keeping
 * track of a long review wrote seven hundred and was refused twice running,
 * spending its rounds shortening its own memory.
 *
 * Driven against the server rather than against the box: a field that shows a
 * number and stores nothing is the failure this is for. Also holds the rounds
 * box to its new ceiling, since both were raised together. Leaves the
 * installation on the numbers it found.
 */
import { BASE, open, drawn, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const held = async () => (await graphql(
  `{ installationSettings { noteMaxCharacters noteMaxCharactersConfigured } }`,
)).installationSettings;

const was = await held();
const WANTED = was.noteMaxCharacters === 2400 ? 2500 : 2400;

await page.goto(`${BASE}/admin/settings`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the settings page'), 'the admin settings page is on screen');

const box = page.locator('#note-max-characters');
const there = await box.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
record(there, 'the installation has a box for how long a note to self may be');

if (there) {
  record(Number(await box.inputValue()) === was.noteMaxCharacters, `and it opens on what the server holds (${await box.inputValue()})`);
  record(was.noteMaxCharactersConfigured === 1000, `a fresh installation allows a thousand characters (${was.noteMaxCharactersConfigured})`);
  record(await box.getAttribute('max') === '10000', 'and the box goes up to ten thousand');

  await box.fill(String(WANTED));
  await page.getByRole('button', { name: /^Save/ }).first().click();
  await page.waitForTimeout(2000);
  const stored = await held();
  record(stored.noteMaxCharacters === WANTED, `the number typed is the number stored (${stored.noteMaxCharacters})`);
}

const rounds = page.locator('#chat-max-rounds');
record(await rounds.getAttribute('max').catch(() => null) === '10000', 'the tool rounds box goes up to ten thousand too');

await graphql(`mutation($c: Int!) { setNoteMaxCharacters(characters: $c) { noteMaxCharacters } }`, {
  c: was.noteMaxCharacters,
});

await finish(browser);
