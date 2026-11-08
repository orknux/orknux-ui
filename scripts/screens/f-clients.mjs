/**
 * The clients chapter's pictures: what connects a person's own browser,
 * computer and Claude Code to Orknux. None of the clients themselves can run
 * in the photographed installation - the extension needs a real Chrome, the
 * desktop clients a desktop, Claude Code a session - so these are the server's
 * half: the guide the Claude Code pill opens, a pairing link being made under
 * Preferences, and My Claude Code offered in a chat's picker. The clients'
 * own pictures are taken where they run and committed beside these.
 */
export async function shots({ ws }) {
  return [
    {
      name: 'claude-code-guide',
      path: `/workspace/${ws}/integrations`,
      waitFor: '[data-testid="device-claude"]',
      prepare: async (page) => {
        await page.click('[data-testid="device-claude"]');
        await page.waitForSelector('[data-testid="claude-code-guide"][open]', { timeout: 10_000 });
        await page.waitForTimeout(400);
      },
    },
    {
      name: 'preferences-clients',
      path: '/preferences',
      waitFor: '[data-testid="client-pairing-start"]',
      prepare: async (page) => {
        const start = page.locator('[data-testid="client-pairing-start"]').first();
        await start.scrollIntoViewIfNeeded();
        await start.click();
        await page.waitForSelector('[data-testid="client-pairing-link"]', { timeout: 10_000 });
        // The section in view, with the list above it and the link under it.
        await page.locator('[data-testid="client-pairing"]').first().scrollIntoViewIfNeeded();
        await page.waitForTimeout(400);
      },
    },
    {
      name: 'chat-answered-by',
      path: '/chat',
      waitFor: 'textarea[aria-label="Message"]',
      prepare: async (page) => {
        // The picker of what answers, opened: My Claude Code stands first, above the workspace's agents.
        await page.locator('button[aria-expanded]').first().click();
        await page.waitForSelector('text=My Claude Code', { timeout: 10_000 });
        await page.waitForTimeout(300);
      },
    },
  ];
}
