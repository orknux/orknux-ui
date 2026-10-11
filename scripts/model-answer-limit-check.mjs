/**
 * How long a model may take to answer is set on Admin Settings, and saved.
 *
 * It was the OpenAI SDK's ten minutes, never chosen anywhere, and it cut a
 * thinking model on llama.cpp off at exactly 600 seconds - mid-thought, well
 * inside its output limit, reported as the server being unreachable. The
 * number belongs to whoever knows how slow their hardware is.
 */
import { BASE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const stored = async () =>
  (await graphql('query { installationSettings { modelAnswerLimitMinutes modelAnswerLimitMinutesConfigured } }'))
    .installationSettings;

const started = await stored();
record(
  started.modelAnswerLimitMinutesConfigured === 60,
  `a fresh installation lets a model take an hour (${started.modelAnswerLimitMinutesConfigured} minutes)`,
);
const wanted = started.modelAnswerLimitMinutes === 90 ? 45 : 90;

const field = () => page.getByLabel('Model Answer Time Limit', { exact: true });
await page.goto(`${BASE}/admin/settings`, { waitUntil: 'domcontentloaded' });
if (await drawn(page, 'admin settings')) {
  const visible = await field()
    .waitFor({ state: 'visible', timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  record(visible, 'the box is on the page');
  if (visible) {
    const placed = await page.evaluate(() => {
      const after = document.getElementById('unusable-reply-retries')?.getBoundingClientRect();
      const box = document.getElementById('model-answer-limit-minutes')?.getBoundingClientRect();
      return after && box ? box.top > after.bottom : null;
    });
    record(placed === true, 'beside the retry settings, under Unusable Reply Retries');
    record((await field().inputValue()) === String(started.modelAnswerLimitMinutes), 'it shows what is stored');

    await field().fill(String(wanted));
    await page.getByRole('button', { name: 'Save the settings on this page', exact: true }).click();
    await page.getByText('Saved.', { exact: true }).waitFor({ timeout: 10_000 }).catch(() => {});
    const after = await stored();
    record(after.modelAnswerLimitMinutes === wanted, `the server holds ${wanted} after a save (${after.modelAnswerLimitMinutes})`);
  }
}

await graphql('mutation($m: Int!) { setModelAnswerLimitMinutes(minutes: $m) { modelAnswerLimitMinutes } }', {
  m: started.modelAnswerLimitMinutes,
});
record((await stored()).modelAnswerLimitMinutes === started.modelAnswerLimitMinutes, 'put back to what it was');

await finish(browser);
