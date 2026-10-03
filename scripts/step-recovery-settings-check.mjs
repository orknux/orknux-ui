/**
 * The two numbers that say how a step a dead server was in is recovered, on
 * the Admin page under Workflow runs. Issue #601.
 *
 * A server killed in the middle of an agent's model call used to leave the run
 * sitting on that step: five minutes on Temporal, which noticed only when the
 * step's whole timeout ran out, and for good on the inline engine, which
 * failed the step and left the message unanswered. Now a step heartbeats on
 * Temporal, and an agent step is asked again on the inline engine - and both
 * numbers are an administrator's to set.
 *
 * What is measured, for each of the two:
 *
 *   it is on the page  - the box is drawn, with a size, below the Workflow
 *                        runs heading, and shows what the server holds.
 *   it is kept         - a number typed and saved is what the server holds
 *                        afterwards, and what a reload shows.
 *
 * Both are put back at the end. Changes installation-wide settings, so it runs
 * alone.
 */
import { BASE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

async function stored() {
  const { installationSettings } = await graphql(
    'query { installationSettings { workflowStepHeartbeatSeconds workflowRestartAttempts } }',
  );
  return installationSettings;
}

const started = await stored();
record(
  Number.isInteger(started.workflowStepHeartbeatSeconds) && Number.isInteger(started.workflowRestartAttempts),
  `the server holds a heartbeat of ${started.workflowStepHeartbeatSeconds}s and ${started.workflowRestartAttempts} goes`,
);

/** The two fields: the label they are found by, the id they carry, and what the server holds. */
const fields = [
  {
    label: 'Step heartbeat',
    id: 'workflow-step-heartbeat-seconds',
    held: (settings) => settings.workflowStepHeartbeatSeconds,
    wanted: started.workflowStepHeartbeatSeconds === 45 ? 20 : 45,
  },
  {
    label: 'Agent step goes after a restart',
    id: 'workflow-restart-attempts',
    held: (settings) => settings.workflowRestartAttempts,
    wanted: started.workflowRestartAttempts === 5 ? 2 : 5,
  },
];

const field = (label) => page.getByLabel(label, { exact: true });
const save = () => page.getByRole('button', { name: 'Save the settings on this page', exact: true });

await page.goto(`${BASE}/admin/settings`, { waitUntil: 'domcontentloaded' });
if (await drawn(page, 'admin settings')) {
  for (const one of fields) {
    const visible = await field(one.label)
      .waitFor({ state: 'visible', timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    record(visible, `${one.label}: the box is on the page`);
    if (!visible) continue;

    const box = await field(one.label).boundingBox();
    record(box !== null && box.width > 20 && box.height > 10, `${one.label}: drawn with a size (${JSON.stringify(box)})`);

    const placed = await page.evaluate((id) => {
      const heading = document.getElementById('workflow-runs');
      const next = document.getElementById('run-history');
      const input = document.getElementById(id);
      if (heading === null || input === null) return null;
      const top = input.getBoundingClientRect().top;
      return {
        below: top > heading.getBoundingClientRect().bottom,
        beforeNext: next === null || top < next.getBoundingClientRect().top,
      };
    }, one.id);
    record(
      placed !== null && placed.below && placed.beforeNext,
      `${one.label}: sits under Workflow runs (${JSON.stringify(placed)})`,
    );

    const shown = await field(one.label).inputValue();
    record(shown === String(one.held(started)), `${one.label}: shows what is stored (${shown})`);

    await field(one.label).fill(String(one.wanted));
  }

  // One Save for both, as the page promises.
  await save().click();
  await page.getByText('Saved.', { exact: true }).waitFor({ timeout: 10_000 }).catch(() => {});
  const after = await stored();
  for (const one of fields) {
    record(one.held(after) === one.wanted, `${one.label}: the server holds ${one.wanted} after a save (${one.held(after)})`);
  }

  await page.reload({ waitUntil: 'domcontentloaded' });
  if (await drawn(page, 'admin settings after a reload')) {
    for (const one of fields) {
      const shownAgain = await field(one.label)
        .waitFor({ state: 'visible', timeout: 20_000 })
        .then(() => field(one.label).inputValue())
        .catch(() => null);
      record(shownAgain === String(one.wanted), `${one.label}: a reload shows ${shownAgain}`);
    }
  }
}

await graphql('mutation($s: Int!) { setWorkflowStepHeartbeatSeconds(seconds: $s) { workflowStepHeartbeatSeconds } }', {
  s: started.workflowStepHeartbeatSeconds,
});
await graphql('mutation($c: Int!) { setWorkflowRestartAttempts(count: $c) { workflowRestartAttempts } }', {
  c: started.workflowRestartAttempts,
});
const restored = await stored();
record(
  restored.workflowStepHeartbeatSeconds === started.workflowStepHeartbeatSeconds &&
    restored.workflowRestartAttempts === started.workflowRestartAttempts,
  'both put back to what they were',
);

await finish(browser);
