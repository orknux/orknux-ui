/**
 * The sign-in page looks like orknux.ai: its sky, its lower-case wordmark in the
 * page's own face, and its filled white button, rather than a violet wash and a
 * spaced-out capital wordmark under the same name. Read off what is drawn.
 *
 * Signs nobody in and changes nothing.
 */
import { BASE, open, record, finish, shot } from './suite/harness.mjs';

const { browser } = await open();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
const page = await context.newPage();
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.getByRole('heading', { name: 'Sign in' }).waitFor({ timeout: 20_000 });
await page.waitForTimeout(800);

const drawn = await page.evaluate(() => {
  const style = (one) => getComputedStyle(one);
  const word = [...document.querySelectorAll('p')].find((one) => one.textContent === 'orknux');
  const label = document.querySelector('label');
  const button = document.querySelector('button[type="submit"]');
  const layers = [...document.querySelectorAll('[aria-hidden="true"] > span')].map((one) => style(one).backgroundImage.split('radial-gradient').length - 1);
  const wash = style(document.querySelector('main'), '::before');
  return {
    word: word === undefined ? null : { font: style(word).fontFamily, spacing: style(word).letterSpacing },
    label: { transform: style(label).textTransform, font: style(label).fontFamily },
    button: { fill: style(button).backgroundColor, radius: style(button).borderRadius },
    layers,
    washViolet: getComputedStyle(document.querySelector('main'), '::before').backgroundImage.includes('124, 58, 237'),
    wash: getComputedStyle(document.querySelector('main'), '::before').backgroundImage.includes('111, 152, 214'),
    wide: document.documentElement.scrollWidth > innerWidth,
    headingAlign: getComputedStyle(document.querySelector('h1')).textAlign,
    headingLeft: Math.round(document.querySelector('h1').getBoundingClientRect().left),
    labelLeft: Math.round(document.querySelector('label').getBoundingClientRect().left),
    versions: (document.querySelector('main').innerText.match(/\d+\.\d+\.\d+/g) ?? []).length,
  };
});
record(drawn.word !== null && drawn.word.font.includes('Geist'), `the wordmark is lower case, in the page's face (${JSON.stringify(drawn.word)})`);
record(drawn.layers.length === 3 && drawn.layers.every((one) => one >= 5), `three layers of stars are behind it (${drawn.layers})`);
record(drawn.wash && !drawn.washViolet, 'the wash is the site\'s blue, not violet');
record(drawn.label.transform === 'none' && drawn.label.font.includes('Geist'), `field labels are in the page's face, not capitals (${JSON.stringify(drawn.label)})`);
record(drawn.button.radius === '6px', `the button has the site's corners (${drawn.button.radius})`);
record(drawn.versions === 1, `the version is said once, in the attribution (${drawn.versions})`);
record(drawn.headingLeft === drawn.labelLeft, `the heading starts where the fields' labels do (${drawn.headingLeft}, ${drawn.labelLeft})`);
record(!drawn.wide, 'nothing runs off the side');
await page.screenshot({ path: shot('login-look.png') });
await context.close();
await finish(browser);
