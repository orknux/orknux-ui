/**
 * Admin -> Settings -> Bulkheads. Issue #616.
 *
 * A few fat agent turns at once filled a 2 GB heap and the server died with
 * everything in it. The walls that stop that are an administrator's to set,
 * each a switch with its numbers beneath it.
 *
 * What is measured:
 *
 *   it is on the page  - the heading and the three switches are drawn with a
 *                        size, below Watchers, and the boxes show what the
 *                        server holds.
 *   a number is kept   - a number typed and saved with the page's Save is what
 *                        the server holds afterwards, and what a reload shows.
 *   a switch is kept   - flipping one is stored at once, with no Save, and a
 *                        reload shows it flipped.
 *
 * Put back at the end. Changes an installation-wide setting, so it runs alone.
 */
import { BASE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const FIELDS = 'turnsEnabled turnsAtOnce turnWaitSeconds heapEnabled heapPercent memoryEnabled turnMemoryMb toolResultKb';

async function stored() {
  const { bulkheads } = await graphql(`query { bulkheads { ${FIELDS} } }`);
  return bulkheads;
}

const started = await stored();
record(Number.isInteger(started.turnsAtOnce), `the server holds ${started.turnsAtOnce} turns at once`);
const wanted = started.turnsAtOnce === 6 ? 5 : 6;

const field = () => page.getByLabel('Agent turns at once', { exact: true });
const heapSwitch = () => page.getByRole('switch', { name: 'Stop turns when memory is short', exact: true });
const save = () => page.getByRole('button', { name: 'Save the settings on this page', exact: true });

await page.goto(`${BASE}/admin/settings`, { waitUntil: 'domcontentloaded' });
if (await drawn(page, 'admin settings')) {
  const visible = await field()
    .waitFor({ state: 'visible', timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  record(visible, 'the turns box is on the page');

  if (visible) {
    const placed = await page.evaluate(() => {
      const heading = document.getElementById('bulkheads');
      const watchers = document.getElementById('watchers');
      const switches = ['turnsEnabled', 'heapEnabled', 'memoryEnabled'].map((key) =>
        document.getElementById(`bulkhead-${key}`)?.getBoundingClientRect(),
      );
      if (heading === null || watchers === null || switches.some((one) => one === undefined)) return null;
      const top = heading.getBoundingClientRect().top;
      return {
        belowWatchers: top > watchers.getBoundingClientRect().bottom,
        switchesSized: switches.every((one) => one.width > 10 && one.height > 10),
        switchesBelowHeading: switches.every((one) => one.top > heading.getBoundingClientRect().bottom),
      };
    });
    record(
      placed !== null && placed.belowWatchers && placed.switchesSized && placed.switchesBelowHeading,
      `the section sits under Watchers, its switches drawn (${JSON.stringify(placed)})`,
    );

    const shown = await field().inputValue();
    record(shown === String(started.turnsAtOnce), `shows what is stored (${shown})`);

    await field().fill(String(wanted));
    await save().click();
    await page.getByText('Saved.', { exact: true }).waitFor({ timeout: 10_000 }).catch(() => {});
    const after = await stored();
    record(after.turnsAtOnce === wanted, `the server holds ${wanted} after a save (${after.turnsAtOnce})`);

    const before = (await heapSwitch().getAttribute('aria-checked')) === 'true';
    await heapSwitch().click();
    await page
      .waitForFunction(
        (was) => document.getElementById('bulkhead-heapEnabled')?.getAttribute('aria-checked') === String(!was),
        before,
        { timeout: 10_000 },
      )
      .catch(() => {});
    record((await stored()).heapEnabled === !before, `flipping the heap switch is stored at once (${!before})`);

    await page.reload({ waitUntil: 'domcontentloaded' });
    if (await drawn(page, 'admin settings after a reload')) {
      const shownAgain = await field()
        .waitFor({ state: 'visible', timeout: 20_000 })
        .then(() => field().inputValue())
        .catch(() => null);
      record(shownAgain === String(wanted), `a reload shows ${shownAgain}`);
      const switchedAgain = (await heapSwitch().getAttribute('aria-checked')) === 'true';
      record(switchedAgain === !before, `a reload shows the switch ${switchedAgain ? 'on' : 'off'}`);
    }
  }
}

await graphql(
  'mutation($input: BulkheadsInput!) { setBulkheads(input: $input) { turnsAtOnce } }',
  { input: started },
);
const back = await stored();
record(JSON.stringify(back) === JSON.stringify(started), 'put back to what it was');

await finish(browser);
