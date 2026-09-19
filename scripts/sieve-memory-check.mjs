/**
 * The sieve a list is wearing survives a refresh.
 *
 * Somebody working on one plugin's functions was put back in front of every
 * function in the workspace by every reload - and a choice a screen forgets is
 * a choice somebody makes again and again. Remembered the way the page size
 * already was: per person, per list, in local storage rather than in the
 * address, so a link somebody sends does not force their sieve on whoever
 * opens it.
 *
 * Both lists, because they wear the same sieve and were both forgetting it.
 */
import { BASE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 1000 } });

/*
 * The sieve's own control, by its label rather than by being the first
 * select on the page - the page-size control is a select too, and picking by
 * position found that one.
 */
let labelled = '';
const sieve = () => page.getByLabel(labelled);

for (const [list, where, label] of [
  ['functions', '/workspace/9/functions', 'Which functions to list'],
  ['tools', '/workspace/9/tools', 'Which tools to list'],
]) {
  labelled = label;
  await page.goto(`${BASE}${where}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(`[aria-label="${label}"]`, { timeout: 20_000 });
  await page.waitForTimeout(600);

  // Every list opens on "all of them" until somebody says otherwise.
  record((await sieve().inputValue()) === '', `${list} opens on every origin`);

  await sieve().selectOption('PLUGIN');
  await page.waitForTimeout(500);
  record((await sieve().inputValue()) === 'PLUGIN', `${list} takes the choice`);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector(`[aria-label="${label}"]`, { timeout: 20_000 });
  await page.waitForTimeout(600);
  record((await sieve().inputValue()) === 'PLUGIN', `and ${list} still wears it after a refresh`);

  /*
   * And it is per list: choosing on one does not choose on the other. The two
   * were one `useState('')` each, so this is the part a shared key would
   * quietly break.
   */
  const otherLabel = list === 'functions' ? 'Which tools to list' : 'Which functions to list';
  const other = list === 'functions' ? '/workspace/9/tools' : '/workspace/9/functions';
  await page.goto(`${BASE}${other}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(`[aria-label="${otherLabel}"]`, { timeout: 20_000 });
  await page.waitForTimeout(600);
  const carried = await page.getByLabel(otherLabel).inputValue();

  // Put it back, so the next pass of this loop starts where it expects to.
  await page.goto(`${BASE}${where}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(`[aria-label="${label}"]`, { timeout: 20_000 });
  await sieve().selectOption('');
  await page.waitForTimeout(400);

  if (list === 'functions') {
    record(carried === '', 'and choosing on functions leaves tools alone');
  }
}

await finish(browser);
