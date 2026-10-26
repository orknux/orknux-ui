/**
 * The pictures of the chapters on models and agents, administration and
 * reports (#684, group E). What they show is made by ../seed/e-ai-admin.mjs and
 * found here by the names it gave it.
 */
import { writeFile } from 'node:fs/promises';

/** Brings the first element holding `text` into view, so a long page is photographed at the part the chapter is about. */
async function scrollTo(page, text, { offset = 80 } = {}) {
  const target = page.getByText(text, { exact: true }).first();
  await target.waitFor({ timeout: 10_000 });
  await target.evaluate((element, gap) => {
    let scroller = element.parentElement;
    while (scroller && !(scroller.scrollHeight > scroller.clientHeight && /(auto|scroll)/.test(getComputedStyle(scroller).overflowY))) {
      scroller = scroller.parentElement;
    }
    const into = scroller ?? document.scrollingElement;
    const top = element.getBoundingClientRect().top - (scroller ? scroller.getBoundingClientRect().top : 0);
    into.scrollTop += top - gap;
  }, offset);
  await page.waitForTimeout(300);
}

/** Scrolls an element - a section, a field - to near the top of the frame, whatever scrolls it. */
async function scrollToElement(page, selector, { offset = 80 } = {}) {
  const target = page.locator(selector).first();
  await target.waitFor({ timeout: 10_000 });
  await target.evaluate((element, gap) => {
    let scroller = element.parentElement;
    while (scroller && !(scroller.scrollHeight > scroller.clientHeight && /(auto|scroll)/.test(getComputedStyle(scroller).overflowY))) {
      scroller = scroller.parentElement;
    }
    const into = scroller ?? document.scrollingElement;
    const top = element.getBoundingClientRect().top - (scroller ? scroller.getBoundingClientRect().top : 0);
    into.scrollTop += top - gap;
  }, offset);
  await page.waitForTimeout(400);
}

export async function shots(ctx) {
  const { ws, gql } = ctx;

  /*
   * The numbers the chapters quote, read off the installation being photographed
   * rather than copied from the code by hand: asked for by naming
   * `e-ai-admin-values` among the pictures, and written beside the plan.
   */
  if ((process.env.ORKNUX_ONLY ?? '').split(',').includes('e-ai-admin-values')) {
    const { __type: type } = await gql('{ __type(name: "InstallationSettings") { fields { name type { kind name ofType { name } } } } }');
    const SCALARS = ['Int', 'Boolean', 'String', 'Float', 'ID'];
    const scalar = type.fields.filter((field) => SCALARS.includes(field.type.name ?? field.type.ofType?.name));
    const names = scalar.map((field) => field.name).join(' ');
    const settings = await gql(`{ installationSettings { ${names} } }`).catch((failure) => ({ failed: failure.message }));
    const { tunables } = await gql('{ tunables { key section sectionTitle label hint unit value configured least most } }');
    await writeFile(new URL('../../docs-plan/e-ai-admin-values.json', import.meta.url), JSON.stringify({ settings, tunables }, null, 1));
    console.log('e-ai-admin-values written to docs-plan/');
  }

  const { models: workspaceModels } = await gql(`{ models(workspaceId: "${ws}") { id name } }`);
  const { workspaceAgents } = await gql(`{ workspaceAgents(workspaceId: "${ws}") { content { id name } } }`);
  const { chatSessions } = await gql(`{ chatSessions(workspaceId: "${ws}") { id title } }`);
  const model = (name) => (workspaceModels ?? []).find((one) => one.name === name) ?? null;
  const agent = (name) => workspaceAgents.content.find((one) => one.name === name) ?? null;
  const chat = (title) => chatSessions.find((one) => one.title === title) ?? null;

  const qwen = model('Qwen3 32B');
  const gpt = model('GPT-4.1');
  const desk = agent('Account desk');
  const litware = chat('Renewal reminder for Litware');
  const fabrikam = chat('Reply to Fabrikam about the export');
  const { workspaceArtifacts } = await gql(
    `{ workspaceArtifacts(workspaceId: "${ws}", page: 0, size: 20, search: "weekly-support-report") { content { id filename } } }`,
  ).catch(() => ({ workspaceArtifacts: { content: [] } }));
  const report = workspaceArtifacts.content.find((one) => one.filename === 'weekly-support-report.html') ?? null;

  return [
    qwen && {
      name: 'model-speed',
      path: `/workspace/${ws}/models/${qwen.id}`,
      prepare: async (page) => {
        await scrollTo(page, 'Speed over time', { offset: 330 });
        await page.getByRole('button', { name: 'Minute', exact: true }).click().catch(() => {});
        await page.waitForTimeout(800);
      },
    },
    gpt && {
      name: 'model-prices',
      path: `/workspace/${ws}/models/${gpt.id}`,
      prepare: async (page) => scrollTo(page, 'Prices'),
    },
    { name: 'templates', path: '/admin/templates' },
    {
      name: 'use-template',
      path: `/workspace/${ws}/agents`,
      prepare: async (page) => {
        await page.getByRole('button', { name: 'Use template' }).first().click();
        await page.locator('[data-testid="template-choice"]').first().waitFor({ timeout: 10_000 });
        await page.locator('[data-testid="template-choice"]').first().click();
        await page.waitForTimeout(500);
      },
    },
    {
      name: 'use-template-plan',
      path: `/workspace/${ws}/agents`,
      prepare: async (page) => {
        await page.getByRole('button', { name: 'Use template' }).first().click();
        await page.locator('[data-testid="template-choice"]').first().waitFor({ timeout: 10_000 });
        await page.locator('[data-testid="template-choice"]').first().click();
        await page.getByRole('button', { name: 'Use template', exact: true }).last().click();
        await page.getByText('Leave out').first().waitFor({ timeout: 10_000 });
        await page.waitForTimeout(600);
      },
    },
    desk && {
      name: 'agent-settings-menu',
      path: `/workspace/${ws}/agents/${desk.id}/settings`,
      prepare: async (page) => scrollToElement(page, '#agent-chattiness', { offset: 420 }),
    },
    litware && {
      name: 'chat-options',
      path: `/chat/${litware.id}`,
      waitFor: 'textarea[aria-label="Message"]',
      prepare: async (page) => page.waitForTimeout(1200),
    },
    fabrikam && {
      name: 'session-rating',
      path: `/chat/${fabrikam.id}`,
      waitFor: 'textarea[aria-label="Message"]',
      prepare: async (page) => page.waitForTimeout(1200),
    },
    { name: 'schedules', path: `/workspace/${ws}/schedules` },
    {
      name: 'workspace-members',
      path: `/workspace/${ws}/settings`,
      waitFor: '[data-testid="workspace-members"]',
      prepare: async (page) => scrollToElement(page, '[data-testid="workspace-members"]', { offset: 40 }),
    },
    {
      name: 'workspace-sharing',
      path: `/workspace/${ws}/settings`,
      waitFor: '[data-testid="workspace-sharing"]',
      prepare: async (page) => scrollToElement(page, '[data-testid="workspace-sharing"]', { offset: 40 }),
    },
    {
      name: 'admin-settings-limits',
      path: '/admin/settings',
      prepare: async (page) => scrollToElement(page, 'h2#limits', { offset: 40 }),
    },
    {
      name: 'admin-settings-transcript',
      path: '/admin/settings',
      prepare: async (page) => scrollToElement(page, 'h2#sessions', { offset: 40 }),
    },
    {
      name: 'reports-usage',
      path: '/admin/reports?report=usage',
      waitFor: '[data-testid="usage-person"]',
      prepare: async (page) => {
        await page.getByLabel('Period').selectOption('7').catch(() => {});
        await page.waitForTimeout(1500);
      },
    },
    {
      name: 'reports-person',
      path: '/admin/reports?report=usage',
      waitFor: '[data-testid="usage-person"]',
      prepare: async (page) => {
        await page.locator('[data-testid="usage-person"] button').first().click();
        await page.locator('[data-testid="usage-session"]').first().waitFor({ timeout: 10_000 });
        await scrollTo(page, 'Their share', { offset: 260 });
      },
    },
    { name: 'reports-ratings', path: '/admin/reports?report=ratings', prepare: async (page) => page.waitForTimeout(1500) },
    { name: 'reports-errors', path: '/admin/reports?report=errors', prepare: async (page) => page.waitForTimeout(1500) },
    /*
     * The uploaded report open in the Artifacts viewer: its bar with Open in a
     * tab, Replace and Download over the page itself (04, Artifacts).
     */
    report && {
      name: 'artifact-saved',
      path: `/workspace/${ws}/artifacts/${report.id}`,
      prepare: async (page) => {
        await page.waitForSelector('dialog[open] [data-reading-replace]', { timeout: 15_000 });
        await page.waitForTimeout(1500);
      },
    },
  ].filter(Boolean);
}
