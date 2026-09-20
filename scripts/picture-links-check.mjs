/**
 * An answer that links to pictures shows the pictures.
 *
 * A model asked for images has no bytes to attach - it writes the URLs it
 * knows - so the answer arrives as six blue link titles and somebody opens six
 * tabs to see what was asked for. The links stay (the title is what says which
 * one it is) and a strip of previews is drawn beneath them.
 *
 * The answer is stubbed rather than asked for: a seeded installation has no
 * model it can reach, and what is being measured here is the rendering, not
 * the model. The pictures are stubbed too, for the same reason and one more -
 * a check must not fetch from somebody else's server to pass.
 */
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });

const { chatSessions } = await graphql(
  `query ($w: ID!) { chatSessions(workspaceId: $w) { id title } }`,
  { w: WORKSPACE },
);
const chat = chatSessions[0];
if (chat === undefined) {
  record(false, 'the workspace has a chat to open; the seed builds one');
  await finish(browser);
}

/** One red pixel, so a preview that draws has bytes that are ours. */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
await page.route('https://pictures.invalid/**', (route) =>
  route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }),
);

const ANSWER = [
  'Here are some images of cars:',
  '',
  '- [BMW i4](https://pictures.invalid/i4.jpg)',
  '- [Rolls-Royce Spectre](https://pictures.invalid/spectre.png?width=800)',
  '- [Lightning McQueen](https://pictures.invalid/mcqueen.webp)',
  '',
  'And one already drawn, which must not be shown twice:',
  '',
  '![drawn](https://pictures.invalid/drawn.png)',
].join('\n');

await page.route('**/graphql', async (route) => {
  const body = route.request().postData() ?? '';
  if (!body.includes('ChatMessages')) {
    await route.continue();
    return;
  }
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      data: {
        chatMessages: [
          { role: 'user', content: 'Give me some images of cars', actor: null, takes: [], thinking: null, thinkingMillis: null, at: '2026-09-20T10:00:00Z' },
          { role: 'assistant', content: ANSWER, actor: null, takes: [], thinking: null, thinkingMillis: null, at: '2026-09-20T10:00:05Z' },
        ],
      },
    }),
  });
});

await page.goto(`${BASE}/chat/${chat.id}`, { waitUntil: 'domcontentloaded' });
if (await drawn(page, 'the chat log')) {
  await page.waitForSelector('[class*="_gallery_"]', { timeout: 15_000 }).catch(() => null);

  const strip = await page.evaluate(() => {
    const gallery = document.querySelector('[class*="_gallery_"]');
    if (gallery === null) return null;
    const shown = [...gallery.querySelectorAll('figure')].map((one) => {
      const image = one.querySelector('img');
      return {
        src: image.getAttribute('src'),
        wide: Math.round(image.getBoundingClientRect().width),
        tall: Math.round(image.getBoundingClientRect().height),
        referrer: image.getAttribute('referrerpolicy'),
        alt: image.getAttribute('alt'),
        caption: one.querySelector('figcaption')?.innerText.trim() ?? '',
        // Under the picture it names, the same place the enlarged view puts
        // it, so the words do not move when one is opened.
        titleLast:
          one.querySelector('figcaption') !== null &&
          one.lastElementChild === one.querySelector('figcaption'),
      };
    });
    return {
      shown,
      // The prose keeps its links: the strip is an addition, not a replacement.
      links: [...document.querySelectorAll('a')].filter((one) =>
        one.href.startsWith('https://pictures.invalid/'),
      ).length,
      // Every frame is a control, so it is reachable from a keyboard.
      buttons: gallery.querySelectorAll('button').length,
    };
  });

  record(strip !== null, 'an answer that links to pictures draws a strip of them');

  if (strip !== null) {
    record(
      strip.shown.length === 3,
      `the three linked pictures are previewed (${strip.shown.length})`,
    );
    record(
      !strip.shown.some((one) => one.src.includes('drawn.png')),
      'one the prose already draws is not drawn again in the strip',
    );
    record(strip.links === 3, `the links stay in the prose (${strip.links})`);
    record(
      strip.buttons === strip.shown.length,
      `each preview is a button (${strip.buttons} for ${strip.shown.length})`,
    );
    record(
      strip.shown.every((one) => one.referrer === 'no-referrer'),
      'a picture is fetched without saying which page asked for it',
    );
    const sized = strip.shown.every((one) => one.wide > 80 && one.tall > 60);
    record(sized, `a preview is big enough to see (${JSON.stringify(strip.shown[0])})`);

    /*
     * The titles are what the strip is for: three cars at 130 pixels look
     * alike, and the words the answer wrote beside each link are what say
     * which is which.
     */
    const captions = strip.shown.map((one) => one.caption);
    record(
      captions.join(' | ') === 'BMW i4 | Rolls-Royce Spectre | Lightning McQueen',
      `each preview says what the link called it (${captions.join(' | ')})`,
    );
    record(
      strip.shown.every((one) => one.alt === one.caption),
      'and a reader who cannot see it is told the same words',
    );
    record(
      strip.shown.every((one) => one.titleLast),
      'the title is under the picture it names',
    );
  }

  // Clicking one opens it larger, through the viewer the manual already uses.
  if (strip !== null && strip.shown.length > 0) {
    await page.locator('[class*="_gallery_"] button').first().click();
    await page.waitForTimeout(400);
    const open = await page.evaluate(() => {
      const dialog = document.querySelector('dialog[open]');
      return dialog === null ? null : dialog.querySelector('img')?.getAttribute('src') ?? '';
    });
    record(
      open !== null && open.startsWith('https://pictures.invalid/'),
      `clicking a preview opens it larger (${open})`,
    );

    /*
     * And the enlarged view captions it in the same place the strip does,
     * so the words do not jump from over the picture to under it.
     */
    const enlarged = await page.evaluate(() => {
      const dialog = document.querySelector('dialog[open]');
      const said = dialog?.querySelector('p');
      const image = dialog?.querySelector('img');
      if (!said || !image) return null;
      return {
        said: said.innerText.trim(),
        under: said.getBoundingClientRect().top >= image.getBoundingClientRect().bottom,
        // Beside the picture, not at the foot of the window: centred as one
        // block, the words sit a gap below the plate however tall the screen is.
        gap: Math.round(said.getBoundingClientRect().top - image.getBoundingClientRect().bottom),
      };
    });
    record(
      enlarged !== null && enlarged.said === 'BMW i4' && enlarged.under,
      `the enlarged picture is captioned under it (${JSON.stringify(enlarged)})`,
    );
    record(
      enlarged !== null && enlarged.gap <= 40,
      `the caption stays with the picture rather than the window (${enlarged?.gap}px below it)`,
    );
  }
}

await finish(browser);
