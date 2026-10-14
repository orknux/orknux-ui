/**
 * A chat timer sounds when it reaches nought - as the workspace says, unless
 * its agent chose otherwise for that one timer.
 *
 * The chime is synthesised on the page, so what is counted is the tones it
 * starts: `AudioContext` is wrapped and every oscillator started is counted,
 * three to a chime. The widgets and the workspace's setting are stubbed; the
 * setting itself is asked of the running server for its contract, and the
 * agent's per-timer choice is WidgetToolsTest's.
 *
 *   on, chosen nothing     sounds
 *   on, chosen silence     does not
 *   already done on load   does not - it ended while nobody was looking
 *   off, chosen nothing    does not
 *   off, chosen sound      sounds
 *
 * Makes nothing and removes nothing.
 */
import { BASE, open, record, finish } from './suite/harness.mjs';

const { browser, context, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const served = await graphql(`query { __type(name: "Workspace") { fields { name } } }`).catch(() => null);
record((served?.__type?.fields ?? []).some((one) => one.name === 'widgetTimerSound'), 'the server answers widgetTimerSound');
const widget = await graphql(`query { __type(name: "ChatWidget") { fields { name } } }`).catch(() => null);
record((widget?.__type?.fields ?? []).some((one) => one.name === 'sound'), 'and a widget says whether its agent chose a sound');

await context.addInitScript(() => {
  const workspaceOn = !location.hash.includes('off');
  window.__tones = 0;
  const Real = window.AudioContext;
  window.AudioContext = class extends Real {
    createOscillator() {
      const tone = super.createOscillator();
      const start = tone.start.bind(tone);
      tone.start = (...args) => {
        window.__tones += 1;
        return start(...args);
      };
      return tone;
    }
  };

  const now = () => new Date().toISOString();
  const timer = (id, label, sound, inMs) => ({
    id, kind: 'TIMER', label, createdBy: 'Reviewer', running: inMs > 0, done: inMs <= 0, asOf: now(),
    durationSeconds: 60, endsAt: inMs > 0 ? new Date(Date.now() + inMs).toISOString() : new Date(Date.now() - 5_000).toISOString(),
    remainingSeconds: inMs > 0 ? Math.ceil(inMs / 1000) : 0, wake: false, sound,
    startedAt: null, accumulatedMillis: null, elapsedMillis: null, laps: null,
  });
  const held = workspaceOn
    ? [timer('801', 'Tea', null, 2_500), timer('802', 'Quiet', false, 2_500), timer('803', 'Ended', true, 0)]
    : [timer('811', 'Follows', null, 2_500), timer('812', 'Asked for', true, 2_500)];

  const real = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const address = typeof input === 'string' ? input : input.url;
    const body = typeof init?.body === 'string' ? init.body : '';
    if (address.includes('/graphql') && body.includes('chatWidgets(')) {
      return new Response(JSON.stringify({ data: { chatWidgets: held } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    const answer = await real(input, init);
    if (address.includes('/graphql') && body.includes('widgetTimerSound') && body.includes('workspace(')) {
      const read = await answer.clone().json().catch(() => null);
      if (read?.data?.workspace) {
        read.data.workspace.widgetTimerSound = workspaceOn;
        return new Response(JSON.stringify(read), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
    }
    return answer;
  };
});

async function run(hash) {
  await page.goto(`${BASE}/chat${hash}`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-chat-widgets]').waitFor({ timeout: 20_000 }).catch(() => {});
  // A click, as a person's would be: a browser holds audio back until the page has been touched.
  await page.locator('#chat-composer').click().catch(() => {});
  await page.waitForTimeout(5_000);
  return page.evaluate(() => ({
    tones: window.__tones,
    sounds: Object.fromEntries([...document.querySelectorAll('[data-chat-widget]')].map((one) => [one.getAttribute('data-chat-widget'), one.getAttribute('data-widget-sound')])),
  }));
}

const on = await run('');
console.log(`workspace on: ${JSON.stringify(on)}`);
record(on.sounds['801'] === 'on' && on.sounds['802'] === 'off', `with the workspace on, a timer follows it unless its agent chose silence (${JSON.stringify(on.sounds)})`);
record(on.tones === 3, `and exactly one chime sounded: the timer that ran out, not the silenced one nor the one already done (${on.tones} tones)`);

const off = await run('#off');
console.log(`workspace off: ${JSON.stringify(off)}`);
record(off.sounds['811'] === 'off' && off.sounds['812'] === 'on', `with the workspace off, a timer is silent unless its agent chose a sound (${JSON.stringify(off.sounds)})`);
record(off.tones === 3, `and the one chosen to sound did (${off.tones} tones)`);

await finish(browser);
