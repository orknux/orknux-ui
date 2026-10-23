/**
 * User Preferences reaches its own end, and has room under it (issue #102).
 *
 * The page bounced twice: first it was truncated - the shell pinned the row to
 * the window height and the flush content hid what would not fit - and then,
 * once it scrolled, its last control sat hard against the foot with no room
 * under it, which is what "still missing padding to bottom" was about.
 *
 * Both halves are measured here rather than looked at: that the end is reachable
 * by wheel and by End, and that the gap under the last card is the same
 * clearance the rest of the app leaves for the floating launcher. The second
 * pass forces that clearance away again, so the number the fix is worth is in
 * the output beside the number it replaced.
 */
/*
 * A context per viewport rather than one from `open()`: this check is about
 * what the page does at two window sizes, and a resized context is not the same
 * thing as a context that was that size when the shell measured itself. So it
 * takes the harness's sign-in and screenshot folder and leaves the rest.
 */
import { BASE, chromium, record, shot, signIn, finish } from './suite/harness.mjs';

const SIZES = [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
];

/** Scroll to the foot the way a person does, not with scrollTo: a scroller that
 *  swallows the wheel would still pass a programmatic scroll. */
async function toTheFoot(page, viewport) {
  await page.mouse.move(viewport.width / 2, viewport.height / 2);
  for (let i = 0; i < 40; i += 1) await page.mouse.wheel(0, 300);
  await page.waitForTimeout(400);
}

async function measure(page) {
  return page.evaluate(() => {
    const pageEl = document.querySelector('[class*="_page_"]');
    const cards = pageEl.querySelectorAll('[class*="_card_"]');
    const last = cards[cards.length - 1].getBoundingClientRect();
    const strip = document.querySelector('[class*="_attributionBar_"]');
    return {
      atTheEnd:
        Math.round(window.scrollY) >=
        document.documentElement.scrollHeight - window.innerHeight - 1,
      sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      lastCardInView: last.bottom <= window.innerHeight && last.top < window.innerHeight,
      underLastCard: strip ? Math.round(strip.getBoundingClientRect().top - last.bottom) : null,
    };
  });
}

const browser = await chromium.launch();
let ok = true;

for (const viewport of SIZES) {
  const context = await signIn(await browser.newContext({ viewport }));
  const page = await context.newPage();

  const name = `${viewport.width}x${viewport.height}`;
  await page.goto(`${BASE}/preferences`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('h1');
  await page.waitForTimeout(600);

  await toTheFoot(page, viewport);
  const after = await measure(page);
  await page.screenshot({ path: shot(`preferences-foot-${name}.png`) });

  /*
   * The same page with the frame held to the window - the shape the shell was
   * in when this was reported, and the one #106 is putting back. This is where
   * the page does its own scrolling, and where a stretched column used to drop
   * everything under the last card. Injected rather than checked out so both
   * numbers come off one run of one build.
   */
  await page.addStyleTag({
    content: `
      [class*="_shell_"] { height: 100%; min-height: 0; overflow: hidden; }
      [class*="_workspace_"] { min-height: 0; }
    `,
  });
  await page.waitForTimeout(200);
  await toTheFoot(page, viewport);
  const pinned = await measure(page);
  await page.screenshot({ path: shot(`preferences-foot-pinned-${name}.png`) });

  console.log(
    `${name}: under the last card - window scrolling ${after.underLastCard}px, ` +
      `page scrolling ${pinned.underLastCard}px`,
  );
  console.log(`${name}: sideways overflow ${after.sideways}px`);

  const reaches = after.atTheEnd && after.lastCardInView;
  const roomy = after.underLastCard >= 112 && pinned.underLastCard >= 112;
  const straight = after.sideways === 0;

  /*
   * Recorded, not only printed. Six measurements - three at each of two window
   * sizes - were ANDed into one boolean and handed to `finish`, which then
   * reported "ALL PASS (1 checks)" over all of them. The tally is what a suite
   * is read by, and one is not six.
   */
  record(
    reaches,
    reaches
      ? `${name}: the wheel reaches the end and the last card is whole`
      : `${name}: the end is out of reach (${JSON.stringify(after)})`,
  );
  record(
    roomy,
    roomy
      ? `${name}: the launcher's clearance under the last card either way`
      : `${name}: ${after.underLastCard}px under the last card with the window scrolling, ` +
        `${pinned.underLastCard}px with the page scrolling`,
  );
  record(straight, straight ? `${name}: nothing hangs off the side` : `${name}: ${after.sideways}px off the side`);

  ok = ok && reaches && roomy && straight;
  await context.close();
}

/*
 * A change is a draft until Save. Preferences applied each one the moment it
 * was made, with nothing to press and nothing saying it had taken; now a change
 * is counted at the foot, nothing happens until Save, and Save applies it.
 * Driven on the theme, which shows on the page itself.
 */
{
  const context = await signIn(await browser.newContext({ viewport: { width: 1440, height: 900 } }));
  const page = await context.newPage();
  await page.goto(`${BASE}/preferences`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#interface-theme', { timeout: 20_000 });
  const themeNow = () => page.evaluate(() => document.documentElement.getAttribute('data-theme') ?? 'dark');
  const before = await themeNow();
  const other = before === 'light' ? 'Dark Mode' : 'Light Mode';
  const save = page.locator('[class*="_pageSave_"]');
  const unsaved = page.locator('[data-preferences-unsaved]');

  record(await save.isDisabled(), 'nothing changed, Save has nothing to store');
  // In the strip floating at the foot of the window: on screen without scrolling, wherever the page is.
  const placed = await page.evaluate(() => {
    const button = document.querySelector('[class*="_pageSave_"]')?.getBoundingClientRect();
    const strip = document.querySelector('[data-testid="save-bar"]')?.getBoundingClientRect();
    return button && strip ? { save: Math.round(button.top), strip: Math.round(strip.top), stripBottom: Math.round(strip.bottom), window: innerHeight } : null;
  });
  record(
    placed !== null && placed.save >= placed.strip && placed.save < placed.stripBottom && placed.stripBottom <= placed.window,
    `Save is in the strip at the foot of the window, on screen without scrolling (${JSON.stringify(placed)})`,
  );
  await page.getByRole('radio', { name: other }).click();
  await page.waitForTimeout(300);
  record((await unsaved.textContent().catch(() => '')) === '1 unsaved', 'a change is counted at the foot');
  record((await themeNow()) === before, 'and nothing is applied before Save');
  await save.click();
  await page.waitForTimeout(500);
  record((await themeNow()) !== before, 'Save applies it');
  record((await unsaved.count()) === 0 && (await save.isDisabled()), 'and nothing is waiting any more');

  // Put back.
  await page.getByRole('radio', { name: before === 'light' ? 'Light Mode' : 'Dark Mode' }).click();
  await save.click();
  await page.waitForTimeout(300);
  await context.close();
}


/*
 * The accent colour: chosen on a swatch, applied on Save, kept over a reload,
 * and each swatch drawn in the very colour its accent gives the page, in both
 * themes - the discs hold their own copy of the values, so this is what keeps
 * the two from drifting apart.
 */
{
  const context = await signIn(await browser.newContext({ viewport: { width: 1440, height: 900 } }));
  const page = await context.newPage();
  await page.goto(`${BASE}/preferences`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="accent"]', { timeout: 20_000 });
  const save = page.locator('[class*="_pageSave_"]');
  const brand = () => page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--color-accent-brand)';
    document.body.append(probe);
    const said = getComputedStyle(probe).color;
    probe.remove();
    return said;
  });
  const disc = (name) => page.evaluate((one) => getComputedStyle(document.querySelector(`[data-swatch="${one}"]`)).backgroundColor, name);
  const moss = await brand();

  record((await page.locator('[data-accent-option]').count()) >= 5, 'Preferences offers a row of accent colours');
  await page.getByRole('radio', { name: 'Blue' }).click();
  record((await brand()) === moss, 'a swatch picked is not applied before Save');
  await save.click();
  await page.waitForTimeout(300);
  const blue = await brand();
  record(blue !== moss, `Save applies it (${moss} -> ${blue})`);
  record(blue === (await disc('blue')), `the Blue swatch is the colour Blue gives the page (${await disc('blue')})`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="accent"]', { timeout: 20_000 });
  record((await brand()) === blue, 'and it is kept over a reload');
  record((await page.getByRole('radio', { name: 'Blue' }).getAttribute('aria-checked')) === 'true', 'with Blue shown as chosen');
  // The other theme: its own blue, and the disc still the same as the page.
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  const lightBlue = await brand();
  record(lightBlue !== blue && lightBlue === (await disc('blue')), `in the light theme too (${lightBlue} / ${await disc('blue')})`);
  await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));

  // Put back.
  await page.getByRole('radio', { name: 'Moss' }).click();
  await save.click();
  await page.waitForTimeout(300);
  record((await brand()) === moss, 'and Moss puts the brand colour back');
  await context.close();
}
// Everything above is recorded; `ok` is only what the log says out loud.
console.log(ok ? 'both window sizes are right' : 'see the failures above');
await finish(browser);
