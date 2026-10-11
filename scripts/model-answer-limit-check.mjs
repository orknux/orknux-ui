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

/*
 * And the two numbers behind the "Writing..." line: how often it is told how far
 * a model has got, and how long a report is believed. Both were constants.
 */
const writing = async () =>
  (
    await graphql(
      'query { installationSettings { writingProgressMillis writingProgressMillisConfigured writingForgottenSeconds writingForgottenSecondsConfigured } }',
    )
  ).installationSettings;
const before = await writing();
record(
  before.writingProgressMillisConfigured === 1000 && before.writingForgottenSecondsConfigured === 30,
  `a fresh installation reports writing every second and forgets it after thirty (${before.writingProgressMillisConfigured} ms, ${before.writingForgottenSecondsConfigured} s)`,
);
const every = () => page.getByLabel('Writing Progress Interval', { exact: true });
const forgotten = () => page.getByLabel('Writing Progress Forgotten After', { exact: true });
await page.goto(`${BASE}/admin/settings`, { waitUntil: 'domcontentloaded' });
if (await drawn(page, 'admin settings')) {
  const there = await every()
    .waitFor({ state: 'visible', timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  record(there && (await forgotten().isVisible()), 'both writing boxes are on the page');
  if (there) {
    const placed = await page.evaluate(() => {
      const limit = document.getElementById('model-answer-limit-minutes')?.getBoundingClientRect();
      const one = document.getElementById('writing-progress-millis')?.getBoundingClientRect();
      const two = document.getElementById('writing-forgotten-seconds')?.getBoundingClientRect();
      return limit && one && two ? one.top > limit.bottom && two.top > one.bottom : null;
    });
    record(placed === true, 'under Model Answer Time Limit, in that order');
    record(
      (await every().inputValue()) === String(before.writingProgressMillis) &&
        (await forgotten().inputValue()) === String(before.writingForgottenSeconds),
      'they show what is stored',
    );
    const wantEvery = before.writingProgressMillis === 500 ? 750 : 500;
    const wantForgotten = before.writingForgottenSeconds === 90 ? 60 : 90;
    await every().fill(String(wantEvery));
    await forgotten().fill(String(wantForgotten));
    await page.getByRole('button', { name: 'Save the settings on this page', exact: true }).click();
    await page.getByText('Saved.', { exact: true }).waitFor({ timeout: 10_000 }).catch(() => {});
    const saved = await writing();
    record(
      saved.writingProgressMillis === wantEvery && saved.writingForgottenSeconds === wantForgotten,
      `the server holds ${wantEvery} ms and ${wantForgotten} s after a save (${saved.writingProgressMillis}, ${saved.writingForgottenSeconds})`,
    );
  }
}
await graphql('mutation($m: Int!) { setWritingProgressMillis(millis: $m) { writingProgressMillis } }', { m: before.writingProgressMillis });
await graphql('mutation($s: Int!) { setWritingForgottenSeconds(seconds: $s) { writingForgottenSeconds } }', { s: before.writingForgottenSeconds });
const back = await writing();
record(
  back.writingProgressMillis === before.writingProgressMillis && back.writingForgottenSeconds === before.writingForgottenSeconds,
  'both put back to what they were',
);


/*
 * Reading Progress Shown After: how long a prompt is read before "Reading the
 * prompt…" shows. It showed for every read, however short.
 */
const reading = async () =>
  (await graphql('query { installationSettings { readingShownAfterSeconds readingShownAfterSecondsConfigured } }')).installationSettings;
const readBefore = await reading();
record(readBefore.readingShownAfterSecondsConfigured === 5, `a fresh installation shows a read after five seconds (${readBefore.readingShownAfterSecondsConfigured})`);
const after = () => page.getByLabel('Reading Progress Shown After', { exact: true });
await page.goto(`${BASE}/admin/settings`, { waitUntil: 'domcontentloaded' });
if (await drawn(page, 'admin settings')) {
  const there = await after()
    .waitFor({ state: 'visible', timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  const placed = await page.evaluate(() => {
    const above = document.getElementById('writing-forgotten-seconds')?.getBoundingClientRect();
    const box = document.getElementById('reading-shown-after-seconds')?.getBoundingClientRect();
    return above && box ? box.top > above.bottom : null;
  });
  record(there && placed === true, 'its box is on the page, under Writing Progress Forgotten After');
  record(there && (await after().inputValue()) === String(readBefore.readingShownAfterSeconds), 'and shows what is stored');
  const want = readBefore.readingShownAfterSeconds === 0 ? 3 : 0;
  await after().fill(String(want));
  await page.getByRole('button', { name: 'Save the settings on this page', exact: true }).click();
  await page.getByText('Saved.', { exact: true }).waitFor({ timeout: 10_000 }).catch(() => {});
  const savedRead = await reading();
  record(savedRead.readingShownAfterSeconds === want, `the server holds ${want} s after a save (${savedRead.readingShownAfterSeconds})`);
}
await graphql('mutation($s: Int!) { setReadingShownAfterSeconds(seconds: $s) { readingShownAfterSeconds } }', { s: readBefore.readingShownAfterSeconds });
record((await reading()).readingShownAfterSeconds === readBefore.readingShownAfterSeconds, 'and put back to what it was');
await finish(browser);
