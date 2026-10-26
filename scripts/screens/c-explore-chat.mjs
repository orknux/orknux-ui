/**
 * The pictures of the Research and Chat chapters (#684, group C).
 *
 * The chats come first, the list before any chat is opened here, since opening
 * one marks it read. The research list is taken after the running research is
 * started, so it holds a running one beside the finished ones: the stand-in
 * holds that one in Gather sources for long enough
 * (`scripts/screens-draw/c-explore-chat.mjs`), and answers nothing else
 * meanwhile, which is why no chat picture comes after it.
 */

const RUNNING = 'How quickly do Pro plan customers get a first reply on weekends?';
const REVIEWED = 'Which support channels missed their first-reply target in the third quarter, and why?';

export async function shots(ctx) {
  const { ws, gql } = ctx;
  // The capture's own gql takes a query alone; this one carries variables too.
  const ask = async (query, variables) => {
    const response = await ctx.context.request.post(`${ctx.BASE}/graphql`, { data: { query, variables } });
    const body = await response.json();
    if (body.errors?.length) throw new Error(body.errors[0].message);
    return body.data;
  };
  const { researches } = await gql(`{ researches(workspaceId: ${ws}, size: 50) { content { id question status } } }`);
  const reviewed = researches.content.find((one) => one.question === REVIEWED) ?? null;
  const { researchModes } = await gql(`{ researchModes(workspaceId: ${ws}) { kind workflowId } }`);
  const shallow = researchModes.find((mode) => mode.kind === 'SHALLOW');
  const { chatSessions } = await gql(`{ chatSessions(workspaceId: ${ws}) { id title } }`);
  const chat = (title) => chatSessions.find((one) => one.title === title) ?? null;
  const planning = chat('Retiring the legacy billing webhook');
  const numbers = chat('First-reply targets in numbers');
  const filing = chat('Filing the billing export failure');
  const login = chat('First checks for a login failure');
  const research = `/workspace/${ws}/explore/research`;
  const tall = { width: 1440, height: 1200 };
  const wide = { width: 1920, height: 1080 };

  return [
    /* ---------------------------------------------------------------- chat */

    // The list, with answers waiting: the plan's chat is the one opened, so it alone is read.
    planning && {
      name: 'chat-list',
      path: `/chat/${planning.id}`,
      waitFor: 'textarea[aria-label="Message"]',
      prepare: async (page) => {
        await page.waitForTimeout(800);
      },
    },
    planning && {
      name: 'chat-plan',
      path: `/chat/${planning.id}`,
      waitFor: 'textarea[aria-label="Message"]',
      prepare: async (page) => {
        await page.getByRole('button', { name: 'Approve' }).first().waitFor({ timeout: 15_000 });
        await page.waitForTimeout(500);
      },
    },
    numbers && {
      name: 'chat-rich',
      path: `/chat/${numbers.id}`,
      waitFor: '.katex',
      viewport: tall,
      prepare: async (page) => {
        await page.waitForSelector('audio', { timeout: 10_000 }).catch(() => undefined);
        await page.waitForTimeout(800);
      },
    },
    filing && {
      name: 'chat-item-link',
      path: `/chat/${filing.id}`,
      waitFor: 'textarea[aria-label="Message"]',
      prepare: async (page) => {
        await page.waitForSelector('a[href*="/issues/"]', { timeout: 15_000 });
        await page.waitForTimeout(500);
      },
    },
    // A suggestion of how the sentence goes on, in grey after the caret.
    filing && {
      name: 'chat-completion',
      path: `/chat/${filing.id}`,
      waitFor: 'textarea[aria-label="Message"]',
      prepare: async (page) => {
        const box = page.locator('textarea[aria-label="Message"]');
        await box.click();
        await box.pressSequentially('Could you draft the reply to the customer about', { delay: 20 });
        await page.waitForSelector('[data-testid="chat-composer-suggestion"]', { timeout: 15_000 });
        await page.waitForTimeout(600);
      },
    },
    // Replies offered under the latest answer.
    login && {
      name: 'chat-suggested-replies',
      path: `/chat/${login.id}`,
      waitFor: 'textarea[aria-label="Message"]',
      prepare: async (page) => {
        await page.waitForSelector('[data-testid="chat-reply-suggestions"]', { timeout: 15_000 });
        await page.evaluate(() => document.querySelector('[data-testid="chat-reply-suggestions"]')?.scrollIntoView({ block: 'end' }));
        await page.waitForTimeout(500);
      },
    },

    /* ------------------------------------------------------------ research */

    // A research while it runs: started here, photographed reading its documents with about how long it has left.
    {
      name: 'research-running',
      path: research,
      waitFor: 'button:has-text("New research")',
      viewport: tall,
      prepare: async (page) => {
        const { startResearch } = await ask('mutation($input: StartResearchInput!) { startResearch(input: $input) { id } }', {
          input: await runningInput(ask, ws),
        });
        await page.goto(`${ctx.BASE}${research}/${startResearch.id}`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('[data-source-reading]', { timeout: 40_000 });
        await page.waitForSelector('[data-time-left]', { timeout: 8_000 }).catch(() => undefined);
        await page.waitForTimeout(800);
      },
    },
    // The list, with that one still running beside the finished ones.
    {
      name: 'research',
      path: research,
      waitFor: 'a[href*="/explore/research/"]',
      viewport: wide,
      prepare: async (page) => {
        await page.waitForSelector('[data-status="RUNNING"]', { timeout: 10_000 }).catch(() => undefined);
        await page.waitForTimeout(400);
      },
    },
    // New research, filled in, with one (?) open.
    {
      name: 'research-new',
      path: research,
      waitFor: 'button:has-text("New research")',
      viewport: { width: 1440, height: 1100 },
      prepare: async (page) => {
        await page.getByRole('button', { name: 'New research' }).first().click();
        await page.locator('#research-question').waitFor({ timeout: 10_000 });
        await page.locator('#research-question').fill('Which onboarding questions reach the support desk in a customer\'s first week?');
        await page.waitForTimeout(500);
        await page.locator('form:has(#research-question) button[data-hint="Use web search"]').first().click();
        await page.waitForTimeout(500);
      },
    },
    // The finished, reviewed research's report, with its sources above it.
    reviewed && {
      name: 'research-report',
      path: `${research}/${reviewed.id}`,
      waitFor: '[data-report] article',
      viewport: tall,
      prepare: async (page) => {
        await page.evaluate(() => {
          const sources = document.querySelector('[data-sources]')?.closest('section');
          (sources ?? document.querySelector('[data-report]'))?.scrollIntoView({ block: 'start' });
        });
        await page.waitForTimeout(800);
      },
    },
    // The end of the same page: the review round, what to research next, and the one already started from it.
    reviewed && {
      name: 'research-follow-ups',
      path: `${research}/${reviewed.id}`,
      waitFor: '[data-follow-ups]',
      viewport: tall,
      prepare: async (page) => {
        await page.waitForSelector('[data-review-panel]', { timeout: 10_000 }).catch(() => undefined);
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.evaluate(() => document.querySelector('[data-follow-ups]')?.scrollIntoView({ block: 'start' }));
        await page.waitForTimeout(800);
      },
    },
    // A mode is a workflow: Shallow's, in the editor, fitted to the frame.
    shallow?.workflowId && {
      name: 'research-mode',
      path: `/workspace/${ws}/workflows/${shallow.workflowId}/editor`,
      waitFor: '.react-flow__node',
      viewport: wide,
      prepare: async (page) => {
        /*
         * The seeded mode is laid out wider than the editor zooms out to (its
         * floor is half size), so its ends fall outside any fitted frame. The
         * side panel is closed, and the canvas is set further out than the
         * buttons go: the same graph, all of it in the picture.
         */
        await page.waitForTimeout(1500);
        await page.locator('aside#workflow-node-properties button[aria-label="Close"], aside#workflow-node-properties button:has-text("×")').first().click().catch(() => undefined);
        await page.waitForTimeout(500);
        await page.evaluate(() => {
          const pane = document.querySelector('.react-flow');
          const viewport = document.querySelector('.react-flow__viewport');
          const nodes = [...document.querySelectorAll('.react-flow__node')];
          if (!pane || !viewport || nodes.length === 0) return;
          const read = (one) => {
            const [, x, y] = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(one.style.transform) ?? [];
            return { x: Number(x), y: Number(y), w: one.offsetWidth, h: one.offsetHeight };
          };
          const boxes = nodes.map(read);
          const left = Math.min(...boxes.map((b) => b.x));
          const top = Math.min(...boxes.map((b) => b.y));
          const right = Math.max(...boxes.map((b) => b.x + b.w));
          const bottom = Math.max(...boxes.map((b) => b.y + b.h));
          const frame = pane.getBoundingClientRect();
          const scale = Math.min((frame.width - 80) / (right - left), (frame.height - 80) / (bottom - top), 1);
          const dx = (frame.width - (right - left) * scale) / 2 - left * scale;
          const dy = (frame.height - (bottom - top) * scale) / 2 - top * scale;
          viewport.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
        });
        await page.waitForTimeout(600);
      },
    },
  ];
}

/** The running research: the same agents and documents as the finished ones, so it reads the weekend rota last. */
async function runningInput(ask, ws) {
  const { researchModes } = await ask(`{ researchModes(workspaceId: ${ws}) { id kind } }`);
  const { researchDocuments } = await ask(`{ researchDocuments(workspaceId: ${ws}, limit: 100) { id name } }`);
  const { workspaceAgents } = await ask(`{ workspaceAgents(workspaceId: ${ws}, size: 100) { content { id name } } }`);
  const agent = (name) => workspaceAgents.content.find((one) => one.name === name)?.id;
  const document = (name) => researchDocuments.find((one) => one.name === name)?.id;
  return {
    workspaceId: ws,
    question: RUNNING,
    modeId: researchModes.find((mode) => mode.kind === 'SHALLOW').id,
    plannerAgentId: agent('Research planner'),
    writerAgentId: agent('Research writer'),
    reviewerAgentId: agent('Research reviewer'),
    language: 'FORMAL',
    outputFormat: 'PDF',
    useWebSearch: false,
    includeImages: false,
    review: false,
    followUps: 3,
    documentsInclude: [document('Support SLA 2026.md'), document('Q3 ticket volume review.md'), document('Weekend rota notes.md')].filter(Boolean),
  };
}
