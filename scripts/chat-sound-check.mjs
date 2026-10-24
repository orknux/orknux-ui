/**
 * A sound an agent attached plays under its answer, and a MIDI file plays too.
 *
 *   - an mp3 under an answer is the browser's `<audio controls>`, with room on
 *     screen and a download beside it;
 *   - a MIDI file, which no browser plays, has a Play; pressing it asks the
 *     server for the rendering once, says Rendering… while it waits, and then
 *     plays what came back in the same kind of player.
 *
 * The chat's history is stubbed in the page, and the attachments themselves are
 * routed: the mp3 to a real WAV clip so the element has something to load, the
 * rendering to the same clip after a pause long enough to see the caption.
 * Whether the server really renders MIDI is ChatAudioPlayTest's.
 */
import { BASE, open, record, finish } from './suite/harness.mjs';

const { browser, context, page } = await open({
  viewport: { width: 1440, height: 1000 },
  launch: { args: ['--autoplay-policy=no-user-gesture-required'] },
});

const at = (secondsAgo) => new Date(Date.now() - secondsAgo * 1000).toISOString();
const file = (id, filename, contentType) => ({ id, filename, contentType, sizeBytes: 2048 });
const HISTORY = [
  { role: 'user', content: 'Write me a tune', actor: null, takes: [], thinking: null, thinkingMillis: null, at: at(300), attachments: [] },
  {
    role: 'assistant',
    content: 'Here it is, as a recording and as the score.',
    actor: null,
    takes: [],
    thinking: null,
    thinkingMillis: null,
    at: at(280),
    attachments: [file('911', 'tune.mp3', 'audio/mpeg'), file('912', 'tune.mid', 'audio/midi')],
  },
];

/** Two seconds of a quiet tone as a WAV, which every browser's `<audio>` plays. */
function wav(seconds) {
  const rate = 22_050;
  const frames = Math.round(rate * seconds);
  const body = Buffer.alloc(frames * 2);
  for (let i = 0; i < frames; i += 1) body.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 3000), i * 2);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + body.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(body.length, 40);
  return Buffer.concat([header, body]);
}
const CLIP = wav(2);

await context.addInitScript((history) => {
  const real = window.fetch.bind(window);
  const json = (data) => new Response(JSON.stringify({ data }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  window.fetch = async (input, init) => {
    const address = typeof input === 'string' ? input : input.url;
    const body = typeof init?.body === 'string' ? init.body : '';
    if (address.endsWith('/graphql') && body.includes('chatMessages(')) return json({ chatMessages: history });
    if (/\/api\/chats\/[^/]+\/follow/.test(address)) {
      return new Response('event: idle\ndata: {}\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }
    return real(input, init);
  };
}, HISTORY);

let renderings = 0;
await page.route('**/api/attachments/911', (route) =>
  route.fulfill({ status: 200, contentType: 'audio/wav', body: CLIP }),
);
await page.route('**/api/attachments/912/audio', async (route) => {
  renderings += 1;
  await new Promise((ready) => setTimeout(ready, 1_500));
  await route.fulfill({ status: 200, contentType: 'audio/mpeg', body: CLIP });
});

await page.goto(`${BASE}/chat`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-message-file="911"]', { timeout: 20_000 }).catch(() => {});

/* ------------------------------------------------------------ the recording */

const mp3 = await page.evaluate(() => {
  const one = document.querySelector('[data-message-file="911"]');
  if (one === null) return null;
  const box = one.getBoundingClientRect();
  const sound = one.closest('[data-message-sound]');
  return {
    tag: one.tagName.toLowerCase(),
    controls: one.hasAttribute('controls'),
    width: Math.round(box.width),
    height: Math.round(box.height),
    assistant: one.closest('[class*="_assistantRow_"]') !== null,
    download: sound?.querySelector('a[download]')?.getAttribute('download') ?? null,
  };
});
record(mp3?.tag === 'audio' && mp3.controls, `an mp3 under the answer is an <audio> with controls (${JSON.stringify(mp3)})`);
record((mp3?.width ?? 0) >= 200 && (mp3?.height ?? 0) >= 20, `with room on screen (${mp3?.width}x${mp3?.height})`);
record(mp3?.assistant === true, 'under the answer it came with');
record(mp3?.download === 'tune.mp3', `and a download beside it (${mp3?.download})`);

/* ------------------------------------------------------------- the MIDI file */

const play = page.locator('[data-message-file="912"] [data-midi-play]');
record((await play.count()) === 1, 'a MIDI file has a Play');
record((await page.locator('[data-midi-player]').count()) === 0, 'and no player until it is pressed, since no browser plays MIDI');
record(renderings === 0, `nothing is rendered before Play is pressed (${renderings})`);

if ((await play.count()) === 1) {
  await play.click();
  await page.waitForTimeout(400);
  const waiting = await play.textContent().catch(() => null);
  const disabled = await play.isDisabled().catch(() => false);
  record(waiting === 'Rendering…' && disabled, `while the server renders, it says so and cannot be pressed twice (${waiting})`);

  await page.waitForSelector('[data-midi-player]', { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(600);
  const playing = await page.evaluate(() => {
    const one = document.querySelector('[data-midi-player]');
    if (one === null) return null;
    const box = one.getBoundingClientRect();
    return {
      controls: one.hasAttribute('controls'),
      paused: one.paused,
      time: one.currentTime,
      width: Math.round(box.width),
      src: one.getAttribute('src')?.slice(0, 5) ?? null,
    };
  });
  record(playing !== null && playing.controls, `the rendering is in a player with controls (${JSON.stringify(playing)})`);
  record(playing?.paused === false && (playing?.time ?? 0) > 0, 'and it is playing, without a second press');
  record((playing?.width ?? 0) >= 200, `with room on screen (${playing?.width})`);
  record(renderings === 1, `the rendering was asked for once (${renderings})`);
  record((await play.count()) === 0, 'and Play gives way to the player');
}

await finish(browser);
