/**
 * Admin -> Settings -> HTTP tools, as drawn. Issue #602.
 *
 * The section is edited the way an administrator would: the allow list chosen,
 * two rules added and filled in, and the tester asked about an address the
 * first rule allows, one it matches for another method, and one no rule
 * matches - each answer has to be drawn, and the rule it names has to be the
 * row marked on screen. Saved, the server has to hold both rules. A pattern
 * that is not a regular expression has to be refused where the rule is, with
 * the stored rule left as it was. The switch is flipped off and on, and the
 * tester has to say what an agent would meet while it is off.
 *
 * Everything it changes is installation-wide, so it is put back however the
 * run ends.
 */
import { BASE, open, record, drawn, shot, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1280, height: 1000 } });

async function putBack() {
  await graphql('mutation { setHttpToolsEnabled(enabled: true) { enabled } }').catch(() => undefined);
  await graphql('mutation { saveHttpToolPolicy(input: { policy: ANY, rules: [] }) { policy } }').catch(() => undefined);
}

async function held() {
  const answer = await graphql('query { httpToolSettings { enabled policy rules { url methods } } }');
  return answer.httpToolSettings;
}

/** A locator's drawn box, or null when it has none. */
async function box(locator) {
  return locator.boundingBox().catch(() => null);
}

/** Asks the tester, and waits for its answer to be drawn. */
async function ask(method, url) {
  await page.locator('#http-tools-test-method').selectOption(method);
  await page.locator('#http-tools-test-url').fill(url);
  await page.locator('#http-tools-test').click();
  const outcome = page.locator('[data-http-test-outcome]');
  await outcome.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => undefined);
  const shown = await box(outcome);
  return {
    outcome: (await outcome.getAttribute('data-http-test-outcome').catch(() => null)) ?? null,
    text: (await outcome.textContent().catch(() => '')) ?? '',
    drawn: shown !== null && shown.height > 0 && shown.width > 0,
  };
}

await putBack();

try {
  await page.goto(`${BASE}/admin/settings#http-tools`, { waitUntil: 'domcontentloaded' });
  if (await drawn(page, 'the settings page')) {
    const heading = page.locator('h2#http-tools');
    const there = await heading.waitFor({ state: 'visible', timeout: 20_000 }).then(() => true).catch(() => false);
    record(there, 'the HTTP tools section has a heading');

    if (there) {
      const toggle = page.locator('#http-tools-enabled');
      record((await toggle.getAttribute('aria-checked')) === 'true', 'the tools are on for an installation nobody touched');

      // The allow list, and two rules.
      await page.locator('[data-http-policy="LIST"]').check();
      const add = page.locator('#http-tools-add-rule');
      await add.click();
      await add.click();
      const rows = page.locator('[data-http-rule]');
      record((await rows.count()) === 2, `two rule rows are drawn: ${await rows.count()}`);

      const first = rows.nth(0);
      const second = rows.nth(1);
      await first.locator('input').fill('https://api\\.example\\.com/.*');
      await first.locator('[data-http-method="POST"]').click();
      await second.locator('input').fill('https://status\\.example\\.com/');

      const one = await box(first);
      const two = await box(second);
      record(
        one !== null && two !== null && one.height > 0 && two.height > 0 && two.y >= one.y + one.height,
        'each rule is a row of its own, the second drawn under the first',
      );
      record(
        (await first.locator('[data-http-method="POST"]').getAttribute('aria-pressed')) === 'true' &&
          (await first.locator('[data-http-method="GET"]').getAttribute('aria-pressed')) === 'true' &&
          (await first.locator('[data-http-method="PUT"]').getAttribute('aria-pressed')) === 'false',
        'the first rule reads GET and POST, and nothing else',
      );

      // The tester, on the rules as they are on screen - not saved yet.
      const allowed = await ask('POST', 'https://api.example.com/v1/tickets');
      record(allowed.outcome === 'ALLOWED' && allowed.drawn, `an address rule 1 allows is drawn as allowed: ${allowed.text}`);
      record(allowed.text.includes('1'), 'and the answer names rule 1');
      record((await first.getAttribute('data-http-rule-matched')) === 'allows', 'and rule 1 is the row marked as allowing it');

      const method = await ask('DELETE', 'https://api.example.com/v1/tickets');
      record(
        method.outcome === 'METHOD_NOT_LISTED' && method.drawn,
        `the same URL for a method no rule lists is drawn as refused: ${method.text}`,
      );
      record((await first.getAttribute('data-http-rule-matched')) === 'url', 'and rule 1 is marked as matching the URL only');

      const none = await ask('GET', 'https://elsewhere.example.org/');
      record(none.outcome === 'NO_RULE_MATCHES' && none.drawn, `an address no rule matches is drawn as refused: ${none.text}`);
      record((await rows.locator('[data-http-rule-matched]').count()) === 0 &&
        (await page.locator('[data-http-rule-matched]').count()) === 0, 'and no rule is marked');

      // Saved with the page's one Save.
      await page.getByRole('button', { name: 'Save the settings on this page' }).click();
      await page.waitForTimeout(1_000);
      const saved = await held();
      record(
        saved.policy === 'LIST' && saved.rules.length === 2 &&
          saved.rules[0].url === 'https://api\\.example\\.com/.*' &&
          saved.rules[0].methods.join(',') === 'GET,POST' && saved.rules[1].methods.join(',') === 'GET',
        `the server holds the list as it was drawn: ${JSON.stringify(saved)}`,
      );
      await page.screenshot({ path: shot('http-tools.png'), fullPage: false });

      // A pattern that is not a regular expression is refused, beside the rules.
      await second.locator('input').fill('https://(broken');
      await page.getByRole('button', { name: 'Save the settings on this page' }).click();
      const error = page.locator('[data-http-tools-error]');
      const refused = await error.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false);
      const said = refused ? ((await error.textContent()) ?? '') : '';
      const errorBox = await box(error);
      record(
        refused && errorBox !== null && errorBox.height > 0 && said.includes('rule 2') && said.includes('not a regular expression'),
        `an invalid pattern is refused on screen, naming its rule: ${said}`,
      );
      const headingBox = await box(heading);
      record(
        errorBox !== null && headingBox !== null && errorBox.y > headingBox.y,
        'and the refusal is drawn in the HTTP tools section, under its heading',
      );
      record((await held()).rules[1]?.url === 'https://status\\.example\\.com/', 'and the stored rule is left as it was');
      await page.screenshot({ path: shot('http-tools-refused.png'), fullPage: false });
      await second.locator('input').fill('https://status\\.example\\.com/');

      // Off, and on again.
      await toggle.click();
      await page.waitForFunction(() => document.querySelector('#http-tools-enabled')?.getAttribute('aria-checked') === 'false', null, { timeout: 15_000 }).catch(() => undefined);
      record((await toggle.getAttribute('aria-checked')) === 'false', 'the switch is drawn off once pressed');
      record((await held()).enabled === false, 'and the server holds them off');
      const off = await ask('GET', 'https://api.example.com/v1/tickets');
      record(off.outcome === 'SWITCHED_OFF' && off.drawn, `the tester says they are switched off: ${off.text}`);
      record((await rows.count()) === 2, 'and the rules being edited are still on screen');

      await toggle.click();
      await page.waitForFunction(() => document.querySelector('#http-tools-enabled')?.getAttribute('aria-checked') === 'true', null, { timeout: 15_000 }).catch(() => undefined);
      record((await toggle.getAttribute('aria-checked')) === 'true', 'the switch is drawn on again');
      const back = await held();
      record(back.enabled === true && back.rules.length === 2, 'and the server holds them on, with the list it had');
    }
  }
} finally {
  await putBack();
}

await finish(browser);
