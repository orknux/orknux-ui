/**
 * The Flow chapters' pictures (#684, group D): getting started, workflows,
 * variables. Two of them replace core ones the chapters were rewritten around -
 * `command-palette` and `preferences`.
 */

/** Fits the graph to the frame, then lets go of whatever is selected. */
async function fitAndClear(page) {
  const fit = page.locator('.react-flow__controls-fitview');
  if (await fit.count()) await fit.first().click();
  await page.waitForTimeout(400);
  await page.locator('.react-flow__pane').click({ position: { x: 20, y: 20 } }).catch(() => {});
  await page.waitForTimeout(300);
}

/** The node on the canvas whose card says this. */
const nodeCard = (page, text) => page.locator('.react-flow__node', { hasText: text }).first();

export async function shots(ctx) {
  const { ws, gql, BASE, browser, flagship, responder, internal } = ctx;

  const { workspaceWorkflows } = await gql(`{ workspaceWorkflows(workspaceId: ${ws}, size: 100) { content { id name } } }`)
    .catch(() => ({ workspaceWorkflows: { content: [] } }));
  const triage = workspaceWorkflows.content.find((one) => one.name === 'Triage a refund request');

  // A run of the Slack workflow whose agent step finished, for the run panel.
  const { workspaceExecutions } = await gql(`{ workspaceExecutions(workspaceId: ${ws}, page: 0, size: 50) { content { id workflowId status } } }`)
    .catch(() => ({ workspaceExecutions: { content: [] } }));
  const answered = workspaceExecutions.content.find((one) => String(one.workflowId) === String(flagship.id) && one.status === 'COMPLETED')
    ?? workspaceExecutions.content.find((one) => String(one.workflowId) === String(flagship.id));

  const editorOf = (id) => `/workspace/${ws}/workflows/${id}/editor`;

  return [
    // Somebody else in the editor: their initials beside the name, their pointer on the canvas.
    {
      name: 'workflow-together',
      path: editorOf(flagship.id),
      waitFor: '.react-flow__node',
      prepare: async (page) => {
        await fitAndClear(page);
        const colleague = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const signedIn = await colleague.request.post(`${BASE}/api/session`, {
          data: { username: internal.username, password: process.env.ORKNUX_DEMO_COLLEAGUE_PASSWORD ?? 'demo-password' },
        });
        if (!signedIn.ok()) throw new Error(`could not sign in as ${internal.username}`);
        const theirs = await colleague.newPage();
        await theirs.goto(`${BASE}${editorOf(flagship.id)}`, { waitUntil: 'domcontentloaded' });
        await theirs.locator('.react-flow__node').first().waitFor({ timeout: 15_000 });
        const fit = theirs.locator('.react-flow__controls-fitview');
        if (await fit.count()) await fit.first().click();
        await theirs.waitForTimeout(500);
        // Over the agent, as somebody reading it would be.
        const box = await nodeCard(theirs, 'Support responder').boundingBox();
        if (box !== null) {
          for (let step = 0; step < 6; step += 1) {
            await theirs.mouse.move(box.x + box.width * (0.3 + step * 0.08), box.y + box.height + 30 - step * 4);
            await theirs.waitForTimeout(120);
          }
        }
        await page.waitForSelector('[data-testid="presence"]', { timeout: 10_000 });
        await page.waitForTimeout(1200);
      },
    },

    // The Add menu, drawn where the pointer is by A, an entry under focus with its note beside it.
    triage && {
      name: 'workflow-add-menu',
      path: editorOf(triage.id),
      waitFor: '.react-flow__node',
      prepare: async (page) => {
        await fitAndClear(page);
        await page.mouse.move(520, 640);
        await page.keyboard.press('a');
        await page.waitForSelector('[data-add-kind]', { timeout: 5_000 });
        await page.locator('[data-add-kind="WORKFLOW"]').hover();
        await page.waitForTimeout(400);
      },
    },

    // A rectangle drawn over two nodes with Rectangle select on.
    triage && {
      name: 'workflow-select',
      path: editorOf(triage.id),
      waitFor: '.react-flow__node',
      prepare: async (page) => {
        await fitAndClear(page);
        await page.getByRole('button', { name: 'Rectangle select' }).first().click();
        const from = await nodeCard(page, 'Find the order').boundingBox();
        const to = await nodeCard(page, 'Judge the refund').boundingBox();
        if (from === null || to === null) throw new Error('triage nodes not drawn');
        await page.mouse.move(from.x - 30, Math.min(from.y, to.y) - 30);
        await page.mouse.down();
        await page.mouse.move(to.x + to.width + 30, Math.max(from.y + from.height, to.y + to.height) + 30, { steps: 12 });
        await page.mouse.up();
        await page.waitForTimeout(500);
      },
    },

    // Every shape on one graph, nothing selected.
    triage && {
      name: 'workflow-node-shapes',
      path: editorOf(triage.id),
      waitFor: '.react-flow__node',
      prepare: fitAndClear,
    },

    // A Workflow node selected: the workflow it runs, and the way to open it.
    triage && {
      name: 'workflow-node',
      path: editorOf(triage.id),
      waitFor: '.react-flow__node',
      editor: true,
      select: 'Answer in the thread',
    },

    // An agent node's own settings, scrolled to them.
    triage && {
      name: 'agent-node',
      path: editorOf(triage.id),
      waitFor: '.react-flow__node',
      editor: true,
      select: 'Judge the refund',
      prepare: async (page) => {
        await page.locator('[data-stream-output]').scrollIntoViewIfNeeded();
        await page.locator('#node-chattiness').scrollIntoViewIfNeeded();
        await page.waitForTimeout(400);
      },
    },

    // What uses the responder and what it uses, from its Used by panel.
    responder && {
      name: 'dependency-graph',
      path: `/workspace/${ws}/agents/${responder.id}/settings`,
      prepare: async (page) => {
        await page.getByRole('button', { name: 'Dependency graph' }).first().click({ timeout: 10_000 });
        await page.waitForSelector('[aria-label="Dependency graph"]', { timeout: 10_000 });
        await page.waitForTimeout(1200);
      },
    },

    // A finished run's agent step, its Parameters open: the prompt it was handed and Output streaming.
    answered && {
      name: 'execution-parameters',
      path: `/workspace/${ws}/executions/${answered.id}`,
      waitFor: '.react-flow__node',
      prepare: async (page) => {
        await nodeCard(page, 'Support responder').click();
        await page.waitForSelector('[data-step-parameters]', { timeout: 10_000 });
        await page.locator('[data-step-streaming]').scrollIntoViewIfNeeded().catch(() => {});
        await page.waitForTimeout(500);
      },
    },

    // Replaces the core picture: one word finding a workflow, a document and a diagram's node at once.
    {
      name: 'command-palette',
      path: `/workspace/${ws}`,
      prepare: async (page) => {
        const box = 'input[aria-label="Quick actions"]';
        await page.click(box);
        await page.type(box, 'refund', { delay: 40 });
        await page.waitForSelector('ul[role="listbox"]', { timeout: 10_000 });
        // Documents and diagrams are asked for a moment after the pages are.
        await page.waitForTimeout(1500);
      },
    },

    // Replaces the core picture: the Chat and Appearance sections, where the newer settings are.
    {
      name: 'preferences',
      path: '/preferences',
      waitFor: '#palette-shortcut',
      prepare: async (page) => {
        await page.getByRole('heading', { name: 'Chat' }).first().scrollIntoViewIfNeeded();
        await page.evaluate(() => {
          const heading = [...document.querySelectorAll('h2')].find((one) => one.textContent?.trim() === 'Chat');
          heading?.scrollIntoView({ block: 'start' });
          window.scrollBy(0, -24);
        });
        await page.waitForTimeout(400);
      },
    },

    // A variable's Move to, open on its row.
    {
      name: 'variables-move',
      path: `/workspace/${ws}/variables`,
      waitFor: '[data-move-to]',
      prepare: async (page) => {
        await page.locator('[data-move-to]').first().click();
        await page.waitForSelector('[data-move-menu]', { timeout: 5_000 });
        await page.waitForTimeout(300);
      },
    },
  ];
}
