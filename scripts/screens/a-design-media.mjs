/**
 * Group A of the manual (#684): the pictures of 10-images.md, 11-videos.md and
 * 17-desktop.md. The workspace is filled by ../seed/a-design-media.mjs.
 *
 * Every editor picture opens "Spring sale banner" and sets one tool up the way
 * the chapter describes it - a selection drawn, a menu open - before the
 * camera. Nothing is applied or saved, so the next shot opens the picture as
 * the seed left it.
 */

/**
 * An input object written into the query: the capture's `gql` takes no
 * variables. A string is JSON's spelling, which is GraphQL's; an id or a number
 * is written bare.
 */
function literal(input) {
  return `{ ${Object.entries(input)
    .map(([key, value]) => `${key}: ${typeof value === 'string' && !/^\d+$/.test(value) ? JSON.stringify(value) : value}`)
    .join(', ')} }`;
}

/** Waits for a picture to be drawn on the editor's canvas, and answers its box on the screen. */
async function pictureBox(page) {
  const picture = page.locator('[data-testid="editor-picture"]').first();
  await picture.waitFor({ timeout: 15_000 });
  await page.waitForFunction(() => {
    const img = document.querySelector('[data-testid="editor-picture"]');
    return img instanceof HTMLImageElement ? img.complete && img.naturalWidth > 0 : true;
  }, undefined, { timeout: 15_000 }).catch(() => {});
  return picture.boundingBox();
}

/** A drag across the picture, from and to fractions of its width and height. */
async function drag(page, box, from, to) {
  await page.mouse.move(box.x + box.width * from[0], box.y + box.height * from[1]);
  await page.mouse.down();
  const steps = 12;
  for (let step = 1; step <= steps; step += 1) {
    const x = from[0] + ((to[0] - from[0]) * step) / steps;
    const y = from[1] + ((to[1] - from[1]) * step) / steps;
    await page.mouse.move(box.x + box.width * x, box.y + box.height * y);
  }
  await page.mouse.up();
}

/** Picks an option of the product's own Select, found by the trigger, by the words it shows. */
async function choose(page, trigger, words) {
  await page.locator(trigger).first().click();
  await page.locator('[role="listbox"] [role="option"]', { hasText: words }).first().click();
  await page.waitForTimeout(200);
}

export async function shots(ctx) {
  const { ws, gql } = ctx;
  const { workspaceArtifacts: drawn } = await gql(
    `query { workspaceArtifacts(workspaceId: ${ws}, page: 0, size: 50, drawn: true) { content { id name } } }`,
  );
  const banner = drawn.content.find((one) => one.name === 'Spring sale banner');
  const { designVideos: videos } = await gql(`query { designVideos(workspaceId: ${ws}) { id name status } }`);
  const harbour = videos.find((one) => one.name === 'Harbour at golden hour' && one.status === 'DONE');
  const { modelProviders: providers } = await gql(`query { modelProviders(workspaceId: ${ws}) { id name type } }`);
  const studio = providers.find((one) => one.name === 'Studio server');
  const { models } = await gql(`query { models(workspaceId: ${ws}) { id name kind } }`);
  const reels = models.find((one) => one.name === 'Harbour reels');
  const corePictures = models.find((one) => one.kind === 'IMAGE' && one.name !== 'Studio pictures');
  const edit = banner && `/workspace/${ws}/design/images/${banner.id}/edit`;

  // What one shot leaves on its way - a picture or a video kept being made - the next one stops.
  const held = { picture: null, video: null };
  const stopHeld = async () => {
    if (held.picture !== null) {
      await gql(`mutation { stopDesignImageJob(workspaceId: ${ws}, id: ${held.picture}) { id } }`).catch(() => {});
      held.picture = null;
    }
    if (held.video !== null) {
      await gql(`mutation { stopDesignVideo(workspaceId: ${ws}, id: ${held.video}) { id } }`).catch(() => {});
      held.video = null;
    }
  };

  return [
    corePictures && {
      name: 'images',
      path: `/workspace/${ws}/design/images`,
      waitFor: '[data-testid="design-gallery"] img',
      prepare: async (page) => {
        // One more asked for, which the stand-in holds: the gallery shows it waiting on its way.
        const { queueDesignImage: job } = await gql(
          `mutation { queueDesignImage(input: ${literal({
            workspaceId: ws,
            modelId: corePictures.id,
            prompt: 'A lighthouse keeper watching the evening ferry come in, for the shift handover email',
            name: 'Shift handover header',
          })}) { id } }`,
        );
        held.picture = job.id;
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForSelector('[data-testid="design-gallery"] img', { timeout: 15_000 });
        await page.waitForSelector('[data-testid="queued-stop"]', { timeout: 15_000 }).catch(() => {});
        await page.waitForTimeout(4_000);
      },
    },
    {
      name: 'image-new',
      path: `/workspace/${ws}/design/images/new`,
      waitFor: '[data-testid="editor-panel"]',
      prepare: async (page) => {
        await stopHeld();
        await choose(page, '#image-model', 'Studio pictures');
        await page.locator('#image-prompt').fill(
          'A cosy reading corner in a seaside café, rain on the window, warm lamp light, a cup of tea on the sill, for the October newsletter',
        );
        await page.locator('#image-negative').fill('people, text, watermark');
        await page.locator('#image-width').fill('1536');
        await page.locator('input[aria-label="Height"]').fill('640');
        await page.waitForTimeout(400);
      },
    },
    edit && {
      name: 'image-editor',
      path: edit,
      waitFor: '[data-testid="editor-picture"]',
      prepare: async (page) => {
        await pictureBox(page);
        await page.getByTestId('editor-layers').click();
        await page.getByTestId('layers-new').click();
        await page.getByTestId('layers-new').click();
        await page.waitForTimeout(300);
        await page.getByTestId('editor-brush').click();
        await page.waitForTimeout(400);
      },
    },
    edit && {
      name: 'image-magic-edit',
      path: edit,
      waitFor: '[data-testid="editor-picture"]',
      prepare: async (page) => {
        const box = await pictureBox(page);
        await page.getByTestId('magic-rectangle').click();
        await drag(page, box, [0.58, 0.22], [0.9, 0.72]);
        await page.getByTestId('magic-prompt').waitFor({ timeout: 5_000 });
        await page.getByTestId('magic-prompt').fill('Add a small red sailing boat on the water, leaving the houses as they are');
        await page.getByTestId('magic-feather').fill('16');
        await page.waitForTimeout(400);
      },
    },
    edit && {
      name: 'image-layers',
      path: edit,
      waitFor: '[data-testid="editor-picture"]',
      prepare: async (page) => {
        await pictureBox(page);
        await page.getByTestId('editor-layers').click();
        for (const name of ['Headline space', 'Logo mark', 'Price sticker']) {
          await page.getByTestId('layers-new').click();
          await page.waitForTimeout(150);
          const row = page.getByTestId('layer-row').first();
          await row.getByTestId('layer-rename').click();
          await page.getByTestId('layer-name-input').fill(name);
          await page.keyboard.press('Enter');
          await page.waitForTimeout(150);
        }
        // The middle one hidden, as somebody trying the banner without it would.
        await page.getByTestId('layer-row').nth(1).getByTestId('layer-visible').click();
        await page.getByTestId('layer-row').first().click();
        // The picture at the foot of the stack in view, under the three.
        await page.getByTestId('layer-base').evaluate((row) => row.scrollIntoView({ block: 'end' })).catch(() => {});
        await page.waitForTimeout(300);
      },
    },
    edit && {
      name: 'image-crop',
      path: edit,
      waitFor: '[data-testid="editor-picture"]',
      prepare: async (page) => {
        const box = await pictureBox(page);
        await page.getByTestId('editor-crop').click();
        await drag(page, box, [0.08, 0.1], [0.78, 0.92]);
        await page.waitForTimeout(400);
      },
    },
    edit && {
      name: 'image-brush',
      path: edit,
      waitFor: '[data-testid="editor-picture"]',
      prepare: async (page) => {
        const box = await pictureBox(page);
        await page.getByTestId('editor-brush').click();
        await page.getByTestId('brush-style-soft').click().catch(() => {});
        await page.getByTestId('brush-colour').evaluate((input) => {
          const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          set.call(input, '#f5c542');
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await drag(page, box, [0.12, 0.3], [0.42, 0.34]);
        await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
        await page.waitForTimeout(400);
      },
    },
    edit && {
      name: 'image-blur',
      path: edit,
      waitFor: '[data-testid="editor-picture"]',
      prepare: async (page) => {
        const box = await pictureBox(page);
        await page.getByTestId('editor-blur').click();
        await page.getByTestId('blur-gradient').click();
        await drag(page, box, [0.45, 0.25], [0.95, 0.25]);
        await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.8);
        await page.waitForTimeout(400);
      },
    },
    edit && {
      name: 'image-upscale',
      path: edit,
      waitFor: '[data-testid="editor-picture"]',
      prepare: async (page) => {
        await pictureBox(page);
        await page.getByTestId('editor-ai').click();
        await page.getByTestId('editor-upscale').click();
        await page.getByTestId('upscale-dialog').waitFor({ timeout: 10_000 });
        await page.waitForFunction(
          () => !document.querySelector('[data-testid="upscale-dialog"]')?.textContent?.includes('Asking the server'),
          undefined,
          { timeout: 15_000 },
        ).catch(() => {});
        await page.waitForTimeout(400);
      },
    },
    edit && {
      name: 'image-ai-menu',
      path: edit,
      waitFor: '[data-testid="editor-picture"]',
      prepare: async (page) => {
        await pictureBox(page);
        await page.getByTestId('editor-ai').click();
        await page.getByTestId('editor-cleanup').hover();
        await page.waitForTimeout(1_200);
      },
    },
    {
      name: 'image-shortcuts',
      path: '/preferences',
      waitFor: '#palette-shortcut',
      prepare: async (page) => {
        // The image editor's own keys, the rail top to bottom, then the brush and the blur.
        await page.getByText('Rotate Left Shortcut', { exact: true }).first().evaluate((label) => label.scrollIntoView({ block: 'start' }));
        await page.evaluate(() => window.scrollBy(0, -24));
        await page.waitForTimeout(300);
      },
    },
    studio && {
      name: 'model-provider-images',
      path: `/workspace/${ws}/models/providers/${studio.id}`,
      redact: () => {
        // The stand-in's address, said as a studio's server would be.
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (node.nodeValue.includes('127.0.0.1')) node.nodeValue = node.nodeValue.replace(/http:\/\/127\.0\.0\.1:\d+/g, 'http://studio.northwind.internal:1234');
        }
        for (const input of document.querySelectorAll('input')) {
          if (input.value.includes('127.0.0.1')) input.value = input.value.replace(/http:\/\/127\.0\.0\.1:\d+/g, 'http://studio.northwind.internal:1234');
        }
      },
    },
    reels && {
      name: 'videos',
      path: `/workspace/${ws}/design/videos`,
      waitFor: '[data-testid="video-card"]',
      prepare: async (page) => {
        // A second on its way, which the stand-in keeps making a step at a time.
        const { queueDesignVideo: video } = await gql(
          `mutation { queueDesignVideo(input: ${literal({
            workspaceId: ws,
            modelId: reels.id,
            prompt: 'The harbour at dawn, mist lifting off the water as the first boats go out',
            name: 'Harbour at dawn',
            frames: 64,
            fps: 16,
            width: 832,
            height: 480,
          })}) { id } }`,
        );
        held.video = video.id;
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForSelector('[data-testid="video-card"]', { timeout: 15_000 });
        await page.waitForTimeout(9_000);
      },
    },
    reels && {
      name: 'video-new',
      path: `/workspace/${ws}/design/videos/new`,
      waitFor: '[data-testid="video-panel"]',
      prepare: async (page) => {
        await stopHeld();
        await page.getByTestId('video-model').waitFor({ timeout: 10_000 });
        await choose(page, '[data-testid="video-model"]', 'Harbour reels');
        await page.getByTestId('video-prompt').fill(
          'Waves rolling onto a pebble beach under a grey sky, gulls overhead, the camera slowly pulling back',
        );
        await page.waitForTimeout(1_500);
      },
    },
    harbour && {
      name: 'video',
      path: `/workspace/${ws}/design/videos/${harbour.id}`,
      waitFor: '[data-testid="video-player"]',
      prepare: async (page) => {
        await page.getByTestId('video-export').click();
        await page.getByTestId('video-export-menu').waitFor({ timeout: 5_000 }).catch(() => {});
        await page.waitForTimeout(600);
      },
    },
    {
      name: 'admin-settings-network',
      path: '/admin/settings',
      waitFor: 'main',
      prepare: async (page) => {
        /*
         * The card is drawn only by the desktop app's server, and this one is not;
         * so its one query is answered as the desktop app's server answers it, and
         * the page is drawn again. Everything else on the page is this server's.
         */
        await page.route('**/graphql', async (route) => {
          const sent = route.request().postData() ?? '';
          if (!sent.includes('desktopNetwork')) return route.continue();
          return route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({
              data: {
                desktopNetwork: {
                  mode: 'LOCAL',
                  chosen: 'LOCAL',
                  restartRequired: false,
                  addresses: ['http://192.168.1.24:8180'],
                  account: 'alice',
                  restarts: true,
                },
              },
            }),
          });
        });
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.locator('#network-access').waitFor({ timeout: 15_000 });
        // Going to the network, which asks for the password to sign in with.
        await page.getByText('Anyone on the network, and everybody signs in').click();
        await page.locator('#network-access').evaluate((heading) => heading.scrollIntoView({ block: 'start' }));
        await page.evaluate(() => window.scrollBy(0, -40));
        await page.waitForTimeout(500);
        await page.unroute('**/graphql');
      },
    },
  ];
}
