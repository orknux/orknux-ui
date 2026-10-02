/**
 * Talking over an answer stops it.
 *
 * Issue #342. Voice mode holds the microphone open while the answer is read
 * aloud, so anything said over it was already heard and queued as the next turn
 * - but the answer went on to the end regardless, which is the one thing a
 * person cannot do in a conversation: say "no, not that" and be listened to.
 * They had to reach for the panel and press, in the one mode whose whole point
 * is not touching anything.
 *
 * What is measured here is the setting rather than the microphone; the loop
 * itself, with a voice the browser is told to believe, is voice-talk-over-check.
 * This one measures the decision around it: that a workspace
 * can set how long somebody has to keep talking, that the bounds hold, and that
 * zero is a thing somebody can choose - which is the setting that matters most,
 * because a room with poor echo cancellation hears the panel's own voice and
 * would stop on every answer.
 *
 * Leaves the workspace on the setting it found.
 */
import { BASE, WORKSPACE, open, drawn, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1100 } });

const held = async () => {
  const { workspace } = await graphql(`query($id: ID!) { workspace(id: $id) { voiceBargeInMs } }`, {
    id: WORKSPACE,
  });
  return workspace.voiceBargeInMs;
};

const was = await held();
console.log(`workspace holds: ${was}`);

const set = async (ms) =>
  graphql(`mutation($w: ID!, $ms: Int) { setWorkspaceVoiceTurnTaking(workspaceId: $w, bargeInMs: $ms) { id } }`, {
    w: WORKSPACE,
    ms,
  });

const clean = async () => {
  await set(was).catch(() => undefined);
  await finish(browser);
};

/* --------------------------------------------------- the box on the page -- */

await page.goto(`${BASE}/workspace/${WORKSPACE}/settings`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the workspace settings'), 'the workspace settings are on screen');

const box = page.locator('#voice-barge-in');
const there = await box
  .waitFor({ timeout: 20_000 })
  .then(() => true)
  .catch(() => false);
record(there, 'the Voice card has a box for talking over the answer');
if (!there) await clean();

/*
 * Empty is the workspace having decided nothing, and the placeholder is what
 * voice mode would use - which is how the other three on this card read, and
 * what lets "the default" be a thing somebody can choose by clearing the box.
 */
const placeholder = await box.getAttribute('placeholder');
console.log(`placeholder: ${placeholder}`);
record(
  (placeholder ?? '').startsWith('Default'),
  `it names the default rather than leaving the box blank and unexplained (${placeholder})`,
);

/* ------------------------------------------------ what it stores ---------- */

await set(null);
await page.reload({ waitUntil: 'domcontentloaded' });
await box.waitFor({ timeout: 20_000 });
record(await box.inputValue().then((v) => v === ''), 'nothing decided leaves the box empty');

await box.fill('0.8');
await page.getByRole('button', { name: /^Save/ }).first().click();
await page.waitForTimeout(2500);

const stored = await held();
console.log(`after saving 0.8s: ${stored}`);
record(stored === 800, `what was typed in seconds is stored in milliseconds (${stored})`);

/* ---------------------------------------------- and that it can be off ---- */

/*
 * The setting that matters most. A room with poor echo cancellation hears the
 * panel's own voice over the answer and would stop on every one - and no number
 * inside the range can say "do not do this".
 */
await box.fill('0');
await page.getByRole('button', { name: /^Save/ }).first().click();
await page.waitForTimeout(2500);

const off = await held();
console.log(`after saving 0: ${off}`);
record(off === 0, 'zero is stored as zero rather than read as nothing decided');

/* ------------------------------------------------------ and the bounds ---- */

/*
 * Asked of the server rather than typed: the box takes anything, and the bound
 * that matters is the one behind the screen since the same mutation is
 * reachable from the API.
 */
const refused = await set(100).then(
  () => null,
  (cause) => String(cause?.message ?? cause),
);
console.log(`refusal: ${refused}`);
record(
  refused !== null && refused.includes('250'),
  'a hold short enough for a cough to clear is refused',
);
record(
  refused !== null && refused.includes('0 to leave the answer alone'),
  'and the refusal names the way to turn it off, which is what somebody typing 100 may have wanted',
);

await clean();
