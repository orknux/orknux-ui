/**
 * Group B of the manual (#684): the pictures of the Documents, Wireframes and
 * Diagrams chapters, of what `seed/b-design-docs.mjs` made. Each `prepare`
 * sets the state the paragraph beside it describes - the menu open, the link
 * hovered, the chat answered - before the frame is taken.
 */

const settle = (page, millis = 400) => page.waitForTimeout(millis);

/** Types into an editor's chat and waits for the model's answer to be drawn. */
async function ask(page, prefix, words) {
  const box = page.getByTestId(`${prefix}-chat-input`);
  await box.click();
  await box.fill(words);
  await box.press('Enter');
  await page.waitForFunction(
    (who) => document.querySelectorAll(`[data-testid="${who}-chat-message"]`).length >= 2 && !document.querySelector(`[data-testid="${who}-chat-working"]`),
    prefix,
    { timeout: 60_000 },
  );
  await settle(page, 1200);
}

/** The diagram panel's settings scrolled to their end: the selected node's notes, or a line's two ends. */
async function settingsToEnd(page) {
  await page.evaluate(() => {
    const held = document.querySelector('[class*="_panelSettings_"]');
    if (held) held.scrollTop = held.scrollHeight;
  });
  await settle(page);
}

/** Dana, in a browser of her own, with the same page open and her pointer on it. */
async function colleagueOn(browser, BASE, path, waitFor, point) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const signed = await context.request.post(`${BASE}/api/session`, {
    data: { username: process.env.ORKNUX_DEMO_COLLEAGUE ?? 'dana', password: process.env.ORKNUX_DEMO_COLLEAGUE_PASSWORD ?? 'demo-password' },
  });
  if (!signed.ok()) throw new Error(`Dana could not sign in: ${signed.status()}`);
  const page = await context.newPage();
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(waitFor, { timeout: 20_000 });
  await settle(page, 1000);
  for (const [x, y] of point) {
    await page.mouse.move(x, y, { steps: 8 });
    await settle(page, 250);
  }
  return context;
}

export async function shots(ctx) {
  const { ws, gql, BASE, browser } = ctx;
  const { documents } = await gql(`{ documents(workspaceId: ${ws}) { id name } }`);
  const { wireframes } = await gql(`{ wireframes(workspaceId: ${ws}) { id name } }`);
  const { diagrams } = await gql(`{ diagrams(workspaceId: ${ws}) { id name } }`);
  const handbook = documents.find((one) => one.name === 'Escalation handbook');
  const checklist = documents.find((one) => one.name === 'P1 outage checklist');
  const portal = wireframes.find((one) => one.name === 'Customer portal');
  const platform = diagrams.find((one) => one.name === 'Northwind support platform');

  /*
   * The document editor at 1920: its left column grows to its longest highlight
   * note, and at 1440 that pushed the page under the chat.
   */
  const WIDE = { width: 1920, height: 1080 };
  const documentPath = (one, view = false) => `/workspace/${ws}/design/documents/${one.id}${view ? '/view' : ''}`;
  const paper = '[data-testid="document-prose"]';
  const wireframePath = portal && `/workspace/${ws}/design/wireframes/${portal.id}`;
  const diagramPath = platform && `/workspace/${ws}/explore/diagrams/${platform.id}`;

  /** The handbook scrolled so its table and its code block are on the page. */
  const toTable = async (page) => {
    await page.locator('table').first().scrollIntoViewIfNeeded().catch(() => {});
    await settle(page);
  };

  return [
    /* ------------------------------------------------------------- documents */
    {
      name: 'documents',
      path: `/workspace/${ws}/design/documents`,
      waitFor: '[data-testid="document-row"]',
    },
    handbook && {
      name: 'document-editor',
      viewport: WIDE,
      path: documentPath(handbook),
      waitFor: paper,
      prepare: async (page) => {
        await toTable(page);
        // The highlight's note, open in its card, as a reader hovering it sees it.
        const highlight = page.getByTestId('document-note').first();
        await highlight.scrollIntoViewIfNeeded();
        await highlight.hover();
        await settle(page, 600);
      },
    },
    handbook && {
      name: 'document-import',
      viewport: WIDE,
      path: documentPath(handbook),
      waitFor: paper,
      prepare: async (page) => {
        await page.getByTestId('document-import').click();
        await settle(page);
      },
    },
    handbook && {
      name: 'document-grammar',
      viewport: WIDE,
      path: documentPath(handbook),
      waitFor: paper,
      prepare: async (page) => {
        // The checker loads its English the first time it is asked, which takes a few seconds.
        const mark = page.getByTestId('document-grammar-mark').filter({ hasText: 'recieves' }).first();
        await mark.waitFor({ timeout: 60_000 });
        await mark.scrollIntoViewIfNeeded();
        await mark.click();
        await page.waitForSelector('[data-testid="document-grammar-card"]', { timeout: 10_000 });
        await settle(page);
      },
    },
    handbook && {
      name: 'document-links',
      viewport: WIDE,
      path: documentPath(handbook),
      waitFor: paper,
      prepare: async (page) => {
        const link = page.getByTestId('document-doc-link').first();
        await link.scrollIntoViewIfNeeded();
        await link.hover();
        await page.waitForSelector('[data-testid="document-link-card"]', { timeout: 10_000 });
        await settle(page, 500);
      },
    },
    checklist && {
      name: 'document-mentioned-by',
      viewport: WIDE,
      path: documentPath(checklist),
      waitFor: '[data-testid="document-mentioned-by-item"]',
    },
    handbook && {
      name: 'document-view',
      viewport: WIDE,
      path: documentPath(handbook, true),
      waitFor: paper,
      prepare: toTable,
    },
    handbook && {
      name: 'document-history',
      viewport: WIDE,
      path: documentPath(handbook),
      waitFor: paper,
      prepare: async (page) => {
        await page.getByTestId('document-history').click();
        const version = page.getByTestId('document-version').nth(1);
        await version.waitFor({ timeout: 10_000 });
        await version.click();
        await page.waitForSelector('[data-testid="document-version-view"]', { timeout: 10_000 });
        await settle(page, 600);
      },
    },
    handbook && {
      name: 'document-export',
      viewport: WIDE,
      path: documentPath(handbook),
      waitFor: paper,
      prepare: async (page) => {
        await page.getByTestId('document-export').click();
        await page.waitForSelector('[data-testid="document-export-menu"]');
        await page.getByTestId('document-export-odt').hover();
        await settle(page, 900);
      },
    },
    handbook && {
      name: 'document-chat',
      viewport: WIDE,
      path: documentPath(handbook),
      waitFor: paper,
      prepare: async (page) => {
        await page.getByTestId('document-summarise').click();
        await page.waitForFunction(
          () => document.querySelectorAll('[data-testid="document-chat-message"]').length >= 2 && !document.querySelector('[data-testid="document-chat-working"]'),
          undefined,
          { timeout: 60_000 },
        );
        await settle(page, 1000);
      },
    },
    // Typing saves itself, so the shot that types goes after every other picture of the handbook.
    handbook && {
      name: 'document-suggestion',
      viewport: WIDE,
      path: documentPath(handbook),
      waitFor: paper,
      prepare: async (page) => {
        // At the end of the checklist sentence, a few words typed, and the model's own in grey after the caret.
        const line = page.locator(`${paper} p`, { hasText: 'line by line' }).first();
        await line.scrollIntoViewIfNeeded();
        await line.click();
        await page.keyboard.press('End');
        await page.keyboard.type(' Then page the on-call lead', { delay: 40 });
        await page.waitForSelector('[data-testid="document-suggestion"]', { timeout: 30_000 });
        await settle(page, 500);
      },
    },
    handbook && {
      name: 'document-together',
      viewport: WIDE,
      path: documentPath(handbook),
      waitFor: paper,
      prepare: async (page) => {
        await colleagueOn(browser, BASE, documentPath(handbook), paper, [[520, 300], [640, 420], [700, 460]]);
        await page.waitForSelector('[data-testid="presence"] *', { timeout: 15_000 });
        await page.mouse.move(1000, 600);
        await settle(page, 1500);
      },
    },

    /* ------------------------------------------------------------ wireframes */
    {
      name: 'wireframes',
      path: `/workspace/${ws}/design/wireframes`,
      waitFor: '[data-testid="wireframe-card"]',
    },
    portal && {
      name: 'wireframe-editor',
      path: wireframePath,
      waitFor: '[data-element-id]',
      prepare: async (page) => {
        await page.getByTestId('wireframe-zoom').click();
        await settle(page);
        await page.locator('[data-element-id="go"]').click();
        await settle(page);
      },
    },
    portal && {
      name: 'wireframe-chat',
      path: wireframePath,
      waitFor: '[data-element-id]',
      prepare: async (page) => {
        await ask(page, 'wireframe', "Add a ticket's own screen beside the list: the conversation, a reply box and a way to close it.");
        await page.getByTestId('wireframe-zoom').click();
        await settle(page, 800);
      },
    },
    portal && {
      name: 'wireframe-export',
      path: wireframePath,
      waitFor: '[data-element-id]',
      prepare: async (page) => {
        await page.getByTestId('wireframe-zoom').click();
        await page.getByTestId('wireframe-export').click();
        await page.waitForSelector('[data-testid="wireframe-export-menu"]');
        await settle(page);
      },
    },

    /* -------------------------------------------------------------- diagrams */
    {
      name: 'diagrams',
      path: `/workspace/${ws}/explore/diagrams`,
      waitFor: '[data-testid="diagram-row"]',
    },
    platform && {
      name: 'diagram-editor',
      path: diagramPath,
      waitFor: '.react-flow__node',
      prepare: async (page) => {
        await page.getByTestId('diagram-zoom').click();
        await settle(page);
        await page.locator('.react-flow__node[data-id="api"]').click();
        await settle(page);
        await settingsToEnd(page);
      },
    },
    platform && {
      name: 'diagram-more-shapes',
      path: diagramPath,
      waitFor: '.react-flow__node',
      prepare: async (page) => {
        await page.getByTestId('diagram-zoom').click();
        await page.getByTestId('diagram-more-shapes').click();
        await settle(page);
      },
    },
    platform && {
      name: 'diagram-line',
      path: diagramPath,
      waitFor: '.react-flow__node',
      prepare: async (page) => {
        await page.getByTestId('diagram-zoom').click();
        await settle(page);
        // The connection from the ticket service to the email provider: dashed, with an open arrowhead.
        const line = page.locator('.react-flow__edge[data-id="e5"], .react-flow__edge[data-testid$="e5"]').first();
        await line.click({ force: true });
        await settle(page);
        await settingsToEnd(page);
      },
    },
    platform && {
      name: 'diagram-settings',
      path: `${diagramPath}/settings`,
      waitFor: '[data-testid="diagram-settings-name"]',
    },
    platform && {
      name: 'diagram-chat',
      path: diagramPath,
      waitFor: '.react-flow__node',
      prepare: async (page) => {
        await ask(page, 'diagram', 'Add the status page customers read during an outage, and connect it.');
        await page.getByTestId('diagram-zoom').click();
        await settle(page, 800);
      },
    },
    platform && {
      name: 'diagram-export',
      path: diagramPath,
      waitFor: '.react-flow__node',
      prepare: async (page) => {
        await page.getByTestId('diagram-zoom').click();
        await page.getByTestId('diagram-export').click();
        await page.waitForSelector('[data-testid="diagram-export-scale"]');
        await settle(page);
      },
    },
  ];
}
