/**
 * How long an agent may wait, and how many times, set from the screen.
 *
 * Issue #367. A turn could end two ways: an answer, or `finish_answer`. Neither
 * fits work that is not finished and is not failing either - a build running, a
 * colleague who has been asked, a job that lands at six. What an agent did with
 * that was hold the round open, billed by the minute and lost the moment the
 * worker died, or answer as though the work were done. It can now end its turn
 * with a wake-up instead: the step stops there and the run comes back to it.
 *
 * Two numbers, because the dangerous one is not the first wait but the
 * twentieth: waiting is a decision the model takes again every time it wakes.
 * Both are the installation's, and both are here.
 *
 * Driven against the server rather than against the boxes: a field that shows a
 * number and stores nothing is the failure this is for. Leaves the installation
 * on the numbers it found.
 */
import { BASE, open, drawn, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

/** What the server holds for the installation. */
const held = async () => {
  const { installationSettings } = await graphql(
    `{ installationSettings {
         agentSleepSeconds agentSleepSecondsConfigured
         agentSleepTimes agentSleepTimesConfigured
       } }`,
  );
  return installationSettings;
};

const was = await held();
console.log(`installation: ${JSON.stringify(was)}`);

/*
 * Numbers this installation is not already on. Save is disabled until a box
 * differs from what the server holds - which is right, and which means a check
 * typing the number already there would press a control that is correctly dead.
 */
const SECONDS = was.agentSleepSeconds === 420 ? 480 : 420;
const TIMES = was.agentSleepTimes === 6 ? 7 : 6;

await page.goto(`${BASE}/admin/settings`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the settings page'), 'the admin settings page is on screen');

/* --------------------------------------------- the longest one wait may be */

const longest = page.locator('#agent-sleep-seconds');
const hasLongest = await longest
  .waitFor({ timeout: 20_000 })
  .then(() => true)
  .catch(() => false);
record(hasLongest, 'the installation has a box for the longest an agent may wait');

const times = page.locator('#agent-sleep-times');
const hasTimes = await times
  .waitFor({ timeout: 20_000 })
  .then(() => true)
  .catch(() => false);
record(hasTimes, 'and one for how many times in a row it may do it');

if (hasLongest && hasTimes) {
  record(Number(await longest.inputValue()) === was.agentSleepSeconds, 'the first opens on what the server holds');
  record(Number(await times.inputValue()) === was.agentSleepTimes, 'and so does the second');

  /*
   * Both typed before one save, which is the shape this page has: every changed
   * number goes in its own call, in order, behind one button. Two settings
   * saved together is the case a page that only ever wrote one would get wrong.
   */
  await longest.fill(String(SECONDS));
  await times.fill(String(TIMES));
  await page.getByRole('button', { name: /^Save/ }).first().click();
  await page.waitForTimeout(2500);

  const stored = await held();
  console.log(`after saving ${SECONDS}s / ${TIMES}: ${JSON.stringify(stored)}`);
  record(stored.agentSleepSeconds === SECONDS, `the length typed is the length stored (${stored.agentSleepSeconds})`);
  record(stored.agentSleepTimes === TIMES, `and the count with it (${stored.agentSleepTimes})`);

  /*
   * What the file says is untouched. The screen stores an answer beside the
   * configured one rather than over it, so an operator can see the two differ
   * rather than wonder why the file they edited appears to be ignored.
   */
  record(
    stored.agentSleepSecondsConfigured === was.agentSleepSecondsConfigured &&
      stored.agentSleepTimesConfigured === was.agentSleepTimesConfigured,
    'and what the configuration file says is left alone',
  );
}

/* ------------------------------------ a number outside the bounds is refused */

/*
 * Asked of the server rather than typed, because the box's own min and max stop
 * a person before it gets this far - and the bound that matters is the one
 * behind the screen, since the same mutation is reachable from the API.
 */
const refused = await graphql(
  `mutation { setAgentSleepSeconds(seconds: 999999) { agentSleepSeconds } }`,
).then(
  () => null,
  (cause) => String(cause?.message ?? cause),
);
console.log(`refusal: ${refused}`);
record(
  refused !== null && refused.includes('not a length of time'),
  'a wait longer than a day is refused in words, not stored',
);

/* --------------------------------------------- leave it as it was found ---- */

await graphql(`mutation($seconds: Int!) { setAgentSleepSeconds(seconds: $seconds) { agentSleepSeconds } }`, {
  seconds: was.agentSleepSeconds,
});
await graphql(`mutation($times: Int!) { setAgentSleepTimes(times: $times) { agentSleepTimes } }`, {
  times: was.agentSleepTimes,
});

await finish(browser);
