/**
 * The window a model's usage metrics are for, chosen on the page.
 *
 * Issue #370. Thirty days was fixed, and the graph and the token breakdown were
 * pinned to the same window with no way to ask for another. Every question
 * somebody actually brings to this page is about a different one - what
 * yesterday's run cost, what was spent last month, whether the spike on the 14th
 * was this model - and none of them could be asked.
 *
 * Driven against a model that has actually been used, because the figures only
 * draw at all where something was recorded: a model nothing has called shows a
 * sentence saying so, and a check that made its own model would be measuring
 * that sentence. Nothing is written - there is no API that records a call
 * against a past day, the counter is fed by real calls, and adding one so a
 * check could stage a chart would be a write path in the product that exists for
 * the test.
 *
 * So what is measured here is the window: that the page asks the server for the
 * days somebody picked, that both headings say which days those are, and that
 * there is a way back. What lands inside a window is pinned in ModelAPITest,
 * which can write the rows directly.
 *
 * Makes nothing and changes nothing.
 */
import { BASE, WORKSPACE, open, drawn, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1200 } });

/* --------------------------------------------- a model with usage on it ---- */

const dayOf = (back) => {
  const at = new Date();
  at.setDate(at.getDate() - back);
  return at.toISOString().slice(0, 10);
};

const { models } = await graphql(`query($w: ID!) { models(workspaceId: $w) { id name } }`, { w: WORKSPACE });

let MODEL = null;
for (const one of models) {
  const { modelUsage } = await graphql(`query($id: ID!) { modelUsage(id: $id) { empty } }`, { id: one.id });
  if (!modelUsage.empty) {
    MODEL = one;
    break;
  }
}

if (MODEL === null) {
  /*
   * Said rather than passed quietly. The controls exist either way, but what
   * this check is for is the figures following the window - and with nothing
   * recorded there are no figures to follow it.
   */
  record(false, 'there is a model with recorded usage to measure the window against');
  await finish(browser);
}

console.log(`measuring against ${MODEL.name} (#${MODEL.id})`);

/* -------------------------------------------------------------------- drive */

await page.goto(`${BASE}/workspace/${WORKSPACE}/models/${MODEL.id}`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, "the model's page"), "the model's page is on screen");

const fromBox = page.locator('#usage-from');
const there = await fromBox
  .waitFor({ timeout: 20_000 })
  .then(() => true)
  .catch(() => false);
record(there, 'the usage metrics have a From date');
record(await page.locator('#usage-to').count().then((many) => many > 0), 'and a To date beside it');
if (!there) await finish(browser);

/* The window it opens on is the thirty days it always showed. */
const opened = await page.locator('[class*="_chartTitle_"]').first().innerText().catch(() => '');
console.log(`opened on: ${opened}`);
record(opened.includes('30 days'), `it opens on the thirty days it always showed (${opened})`);
record((await fromBox.inputValue()) === '', 'with the dates empty, which is what "the last thirty days" is');

/* ------------------------------------------- a window somebody picked ---- */

await fromBox.fill(dayOf(4));
await page.locator('#usage-to').fill(dayOf(1));
await page.getByRole('button', { name: /^Apply$/ }).first().click();

/*
 * Waited for rather than slept past: the figures are a second request, and a
 * fixed pause measures whatever happened to be on screen when it ended.
 */
const narrowed = await page
  .waitForFunction(
    () => {
      const title = document.querySelector('[class*="_chartTitle_"]');
      return title !== null && title.textContent.includes('(4 days)');
    },
    { timeout: 20_000 },
  )
  .then(() => true)
  .catch(() => false);
record(narrowed, 'the graph heading says the window that was picked, not the thirty days');

const breakdown = await page.locator('[class*="_breakdownTitle_"]').first().innerText().catch(() => '');
console.log(`breakdown: ${breakdown}`);
record(
  breakdown.includes(dayOf(4)) && breakdown.includes(dayOf(1)),
  `the token breakdown follows the same window (${breakdown})`,
);

/* The chart's own dates, which are what the line is drawn between. */
const edges = await page.locator('[class*="_chartDates_"]').first().innerText().catch(() => '');
record(edges.includes(dayOf(4)) && edges.includes(dayOf(1)), `the graph is drawn between them (${edges})`);

/* And the server answers for that window rather than for the thirty days. */
const inWindow = await graphql(
  `query($id: ID!, $from: String, $to: String) { modelUsage(id: $id, from: $from, to: $to) { days requests } }`,
  { id: MODEL.id, from: dayOf(4), to: dayOf(1) },
);
const whole = await graphql(`query($id: ID!) { modelUsage(id: $id) { days requests } }`, { id: MODEL.id });
console.log(`window ${JSON.stringify(inWindow.modelUsage)} against ${JSON.stringify(whole.modelUsage)}`);
record(inWindow.modelUsage.days === 4, 'the server answers for four days when four were asked for');
record(
  inWindow.modelUsage.requests <= whole.modelUsage.requests,
  'and a narrower window cannot hold more than the wider one',
);

/* A date that is not one is refused, rather than quietly becoming thirty days. */
const refused = await graphql(`query($id: ID!) { modelUsage(id: $id, from: "last tuesday") { days } }`, {
  id: MODEL.id,
}).then(
  () => null,
  (cause) => String(cause?.message ?? cause),
);
console.log(`refusal: ${refused}`);
record(
  refused !== null && refused.includes('is not a date'),
  'a date the server cannot read is refused rather than silently ignored',
);

/* ------------------------------------------------- and the way back ------ */

await page.getByRole('button', { name: /^Last 30 days$/ }).first().click();
const back = await page
  .waitForFunction(
    () => {
      const title = document.querySelector('[class*="_chartTitle_"]');
      return title !== null && title.textContent.includes('(30 days)');
    },
    { timeout: 20_000 },
  )
  .then(() => true)
  .catch(() => false);
record(back, 'and there is a way back to the thirty days it opened on');

await finish(browser);
