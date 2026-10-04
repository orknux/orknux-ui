/**
 * The cluster lease's length, on the Admin page under Workflow runs. Issue #597.
 *
 * Several servers on one database each ran every timer and opened the Slack
 * sockets; now one of them holds a lease and does that, and how long the
 * lease lasts - how soon a dead server's work moves - is an administrator's
 * to set.
 *
 * What is measured:
 *
 *   it is on the page  - the box is drawn, with a size, below the Workflow
 *                        runs heading and above Run history, and shows what
 *                        the server holds.
 *   it is kept         - a number typed and saved is what the server holds
 *                        afterwards, and what a reload shows.
 *
 * Put back at the end. Changes an installation-wide setting, so it runs alone.
 */
import { BASE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

async function stored() {
  const { installationSettings } = await graphql('query { installationSettings { clusterLeaseSeconds } }');
  return installationSettings.clusterLeaseSeconds;
}

const started = await stored();
record(Number.isInteger(started), `the server holds a lease of ${started}s`);
const wanted = started === 45 ? 20 : 45;

const field = () => page.getByLabel('Cluster lease', { exact: true });
const save = () => page.getByRole('button', { name: 'Save the settings on this page', exact: true });

await page.goto(`${BASE}/admin/settings`, { waitUntil: 'domcontentloaded' });
if (await drawn(page, 'admin settings')) {
  const visible = await field()
    .waitFor({ state: 'visible', timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  record(visible, 'the box is on the page');

  if (visible) {
    const box = await field().boundingBox();
    record(box !== null && box.width > 20 && box.height > 10, `drawn with a size (${JSON.stringify(box)})`);

    const placed = await page.evaluate(() => {
      const heading = document.getElementById('workflow-runs');
      const next = document.getElementById('run-history');
      const input = document.getElementById('cluster-lease-seconds');
      if (heading === null || input === null) return null;
      const top = input.getBoundingClientRect().top;
      return {
        below: top > heading.getBoundingClientRect().bottom,
        beforeNext: next === null || top < next.getBoundingClientRect().top,
      };
    });
    record(placed !== null && placed.below && placed.beforeNext, `sits under Workflow runs (${JSON.stringify(placed)})`);

    const shown = await field().inputValue();
    record(shown === String(started), `shows what is stored (${shown})`);

    await field().fill(String(wanted));
    await save().click();
    await page.getByText('Saved.', { exact: true }).waitFor({ timeout: 10_000 }).catch(() => {});
    const after = await stored();
    record(after === wanted, `the server holds ${wanted} after a save (${after})`);

    await page.reload({ waitUntil: 'domcontentloaded' });
    if (await drawn(page, 'admin settings after a reload')) {
      const shownAgain = await field()
        .waitFor({ state: 'visible', timeout: 20_000 })
        .then(() => field().inputValue())
        .catch(() => null);
      record(shownAgain === String(wanted), `a reload shows ${shownAgain}`);
    }
  }
}

await graphql('mutation($s: Int!) { setClusterLeaseSeconds(seconds: $s) { clusterLeaseSeconds } }', { s: started });
record((await stored()) === started, 'put back to what it was');

await finish(browser);
