/**
 * The workspace settings page saves from its header, not from a footer.
 *
 * The page is several screens of cards, so a Save at the foot of it is a Save
 * somebody scrolls past on the way out - which is the argument #386 made for
 * every other editor. This is that page: the one Save Changes is in the title
 * row beside the heading, with the note that says which state the page is in
 * beside it, and nothing at the end of the page is an actions bar.
 *
 * Changes nothing: it types into a field, reads the note, and puts the field
 * back without saving.
 */
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 900 } });

await page.goto(`${BASE}/workspace/${WORKSPACE}/settings`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the workspace settings page'), 'the workspace settings page is on screen');
await page.waitForSelector('h1', { timeout: 20_000 });

const save = page.getByRole('button', { name: /^Save Changes$/ });
record((await save.count()) === 1, `there is one Save Changes on the page (${await save.count()})`);

/* In the header: the button and the heading share a row. */
const inHeader = await save.first().evaluate((button) => {
  const header = button.closest('header');
  return header !== null && header.querySelector('h1') !== null;
});
record(inHeader, 'and it sits in the header beside the heading');

/* The note is beside it, and says nothing until something is changed. */
/* The page's own header, which is the one with the heading in it - not the
   application's bar at the top of the window. */
const headerText = () =>
  page.evaluate(() => {
    const heading = document.querySelector('h1');
    return heading?.closest('header')?.innerText ?? '';
  });
const quiet = await headerText();
record(!quiet.includes('Not saved yet'), 'with nothing to say while the page is as it was saved');

const marker = page.locator('#workspace-description');
if ((await marker.count()) === 1) {
  const was = await marker.inputValue();
  await marker.fill(`${was} zz`);
  await page.waitForTimeout(400);
  const busy = await headerText();
  record(busy.includes('Not saved yet'), 'a change says so in the header, beside the button');
  await marker.fill(was);
} else {
  record(false, 'the description box, which this uses to make a change');
}

/* And nothing below the cards is a bar of buttons. */
const belowTheFold = await page.evaluate(() => {
  const saves = Array.from(document.querySelectorAll('button')).filter(
    (one) => one.textContent?.trim() === 'Save Changes',
  );
  return saves.filter((one) => one.closest('header') === null).length;
});
record(belowTheFold === 0, `no Save Changes outside the header (${belowTheFold})`);

await finish(browser);
