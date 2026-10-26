/**
 * What the chapters on models and agents, administration and reports need
 * (#684, group E): conversations that cost something, a model whose provider
 * reports its speed, a review, a reminder that comes back on its own, an
 * agent's question with options, a failed run, templates, members and a share.
 *
 * Every model here is the stand-in screenshots.ps1 runs (`ORKNUX_DEMO_ENDPOINT`):
 * no model on the network is asked anything. What the stand-in says in these
 * conversations is in orknux-server's scripts/screens-draw/e-ai-admin.mjs,
 * matched on the questions below word for word - the two containers share no
 * directory, so a question changed here is changed there too.
 */

/** Who asks what, of which agent. */
const TALKS = [
  {
    person: 'alice', agent: 'desk', title: 'Contoso this week',
    asks: ['How many tickets did Contoso open this week, and how many are still waiting on us?'],
  },
  {
    person: 'alice', agent: 'desk', title: 'Reply to Fabrikam about the export',
    asks: [
      'Draft a reply to Fabrikam about the delayed nightly export. Apologetic, but brief.',
      'That was exactly right - five stars, I sent it without changing a word.',
    ],
  },
  {
    person: 'dana', agent: 'nightShift', title: 'Escalations for the stand-up',
    asks: [
      'Summarise yesterday\'s escalations for the morning stand-up.',
      'Good, but it missed the Tailspin ticket. Four stars.',
    ],
  },
  {
    person: 'alice', agent: 'desk', title: 'Renewal reminder for Litware',
    asks: ['Send the renewal reminder for Litware.'],
  },
  {
    person: 'alice', agent: 'nightShift', title: 'Export queue every weekday',
    asks: ['Remind me every weekday at nine to look at the export queue.'],
  },
  {
    person: 'dana', agent: 'desk', title: 'Upgrade quote for Wingtip',
    asks: [
      'Quote Wingtip the upgrade to the Business plan for 40 seats.',
      "Two stars - it quoted the legacy price list, not this year's.",
    ],
  },
  {
    person: 'dana', agent: 'nightShift', title: 'Escalations channel every two hours',
    asks: ['Check the Slack escalations channel every two hours and tell me if anything is waiting.'],
  },
  {
    person: 'dana', agent: 'nightShift', title: 'Handover for the night shift',
    asks: ['Write the handover for tonight: what is still open and who is waiting.'],
  },
];

const STAND_IN = process.env.ORKNUX_DEMO_ENDPOINT ?? 'http://localhost:8299';
const COLLEAGUE = { username: 'dana', password: process.env.ORKNUX_DEMO_COLLEAGUE_PASSWORD ?? 'demo-password' };

export async function seed(ctx) {
  const { gql, ws, log, signIn, slack } = ctx;

  /*
   * What is optional is warned about rather than thrown: a missing template or
   * share costs one picture, and the run going on photographs the rest. What
   * every picture of this group depends on - the models and the conversations -
   * still throws.
   */
  const tryTo = async (what, act) => {
    try {
      return await act();
    } catch (failure) {
      console.warn(`  ${what}: ${failure.message.split('\n')[0]}`);
      return null;
    }
  };

  /* ----------------------------------------------------- recording on */

  await gql('mutation { setUsageTracking(enabled: true) { enabled } }');
  await tryTo('session ratings', () => gql('mutation { setSessionRatings(enabled: true) { enabled } }'));
  await tryTo('chat reviews', () => gql('mutation { setChatReviews(enabled: true) { enabled } }'));
  log('usage tracking, session ratings and chat reviews on');

  /* ---------------------------------------------------------- the models */

  // A llama.cpp server reports how fast it read and wrote, so its model has a speed.
  const { createModelProvider: gpuBox } = await gql(
    'mutation($input: CreateModelProviderInput!) { createModelProvider(input: $input) { id name } }',
    { input: { workspaceId: ws, name: 'GPU box (llama.cpp)', endpoint: STAND_IN, type: 'LLAMA_CPP', secret: 'none' } },
  );
  const { createModel: qwen } = await gql(
    'mutation($input: CreateModelInput!) { createModel(input: $input) { id name } }',
    {
      input: {
        providerId: gpuBox.id, name: 'Qwen3 32B', modelId: 'writer', kind: 'CHAT',
        contextWindow: 65536, maxOutput: 8192, inputCostPerMillion: 0, outputCostPerMillion: 0,
      },
    },
  );
  // A hosted model priced the way a hosted one is: input, cached input, cache writes and output.
  const { createModelProvider: hosted } = await gql(
    'mutation($input: CreateModelProviderInput!) { createModelProvider(input: $input) { id name } }',
    { input: { workspaceId: ws, name: 'OpenAI (Northwind account)', endpoint: STAND_IN, type: 'OPENAI', secret: 'sk-demo' } },
  );
  const { createModel: gpt } = await gql(
    'mutation($input: CreateModelInput!) { createModel(input: $input) { id name } }',
    {
      input: {
        providerId: hosted.id, name: 'GPT-4.1', modelId: 'writer', kind: 'CHAT',
        contextWindow: 1047576, maxOutput: 32768,
        inputCostPerMillion: 2, cachedInputCostPerMillion: 0.5, cacheWriteCostPerMillion: 2.5, outputCostPerMillion: 8,
      },
    },
  );
  log(`models: ${qwen.name} on ${gpuBox.name}, ${gpt.name} on ${hosted.name}`);

  /* ---------------------------------------------------------- the agents */

  const agentOn = async (model, name, description, systemPrompt) => {
    const { createAgentForModel: made } = await gql(
      'mutation($modelId: ID!) { createAgentForModel(modelId: $modelId) { id name tools } }',
      { modelId: model.id },
    );
    const tools = [...new Set([...(made.tools ?? []), 'ask_person', 'rate_session', 'remove_session_rating', 'schedule_set', 'schedule_cancel'])];
    const { updateAgent } = await gql(
      'mutation($id: ID!, $input: UpdateAgentInput!) { updateAgent(id: $id, input: $input) { id name } }',
      {
        id: made.id,
        input: {
          name, description, systemPrompt, modelId: model.id, type: 'LLM', tools,
          requiredTools: ['ask_person', 'rate_session', 'schedule_set'],
        },
      },
    );
    return updateAgent;
  };
  const desk = await agentOn(
    gpt, 'Account desk', 'Answers the account managers: renewals, plans, what a customer is owed.',
    'You work for Northwind Support\'s account managers. Be brief and exact; ask when a choice is theirs to make.',
  );
  const nightShift = await agentOn(
    qwen, 'Night shift', 'Runs on the GPU box overnight: summaries, handovers, queue checks.',
    'You keep the overnight queue in order for Northwind Support. Summaries are short and name every ticket.',
  );
  log(`agents: ${desk.name} on ${gpt.name}, ${nightShift.name} on ${qwen.name}`);

  /* ------------------------------------------------- the conversations */

  const dana = await tryTo('signing in as dana', () => signIn(COLLEAGUE.username, COLLEAGUE.password));
  const agents = { desk, nightShift };
  for (const talk of TALKS) {
    const as = talk.person === 'dana' ? dana : null;
    if (talk.person === 'dana' && !dana) continue;
    const { startChat: chat } = await gql(
      'mutation($input: StartChatInput!) { startChat(input: $input) { id } }',
      { input: { workspaceId: ws, title: talk.title, agentId: agents[talk.agent].id } },
      as,
    );
    for (const said of talk.asks) {
      await tryTo(`"${talk.title}"`, () =>
        gql(
          'mutation($id: ID!, $text: String!) { sendChatMessage(id: $id, text: $text) { inputTokens outputTokens cost } }',
          { id: chat.id, text: said },
          as,
        ),
      );
    }
    log(`  chat: ${talk.title} (${talk.person}, ${agents[talk.agent].name})`);
  }

  /*
   * A model's speed is charted per minute at the finest, and the conversations
   * above all happen within one: a few short questions to the GPU box a little
   * apart give the chart a line rather than a dot. Two minutes of the seed.
   */
  const queue = await gql(
    'mutation($input: StartChatInput!) { startChat(input: $input) { id } }',
    { input: { workspaceId: ws, title: 'Queue checks through the evening', agentId: nightShift.id } },
  );
  for (let at = 1; at <= 6; at++) {
    await tryTo('a queue check', () =>
      gql('mutation($id: ID!, $text: String!) { sendChatMessage(id: $id, text: $text) { cost } }', {
        id: queue.startChat.id,
        text: `Queue check ${at}: how many tickets are waiting, and how old is the oldest?`,
      }),
    );
    if (at < 6) await new Promise((wait) => setTimeout(wait, 25_000));
  }
  log('  six queue checks to the GPU box, a little apart');

  /* ------------------------------------------ something that failed */

  /*
   * A model whose server has gone: an agent on it cannot answer, and a run that
   * asks it fails - the Errors report's two kinds. Port 9 is discard, which
   * nothing on a developer's machine answers HTTP on.
   */
  const { createModelProvider: retired } = await gql(
    'mutation($input: CreateModelProviderInput!) { createModelProvider(input: $input) { id name } }',
    { input: { workspaceId: ws, name: 'Old GPU box (retired)', endpoint: 'http://127.0.0.1:9', type: 'LLAMA_CPP', secret: 'none' } },
  );
  const { createModel: old } = await gql(
    'mutation($input: CreateModelInput!) { createModel(input: $input) { id name } }',
    { input: { providerId: retired.id, name: 'Llama 3.1 8B', modelId: 'llama3.1:8b', kind: 'CHAT' } },
  );
  const ghost = await agentOn(old, 'Triage (old box)', 'Sorted the inbox before the GPU box was replaced.', 'Sort each ticket into a queue.');
  for (const text of ['Sort the tickets that came in overnight.', 'Which queue does ticket 4471 belong in?']) {
    const { startChat: chat } = await gql(
      'mutation($input: StartChatInput!) { startChat(input: $input) { id } }',
      { input: { workspaceId: ws, title: text, agentId: ghost.id } },
    );
    await tryTo('a chat with the retired model (expected to fail)', () =>
      gql('mutation($id: ID!, $text: String!) { sendChatMessage(id: $id, text: $text) { cost } }', { id: chat.id, text }),
    );
  }
  const failing = await tryTo('the overnight triage workflow', async () => {
    const { createWorkflow: made } = await gql(
      'mutation($input: CreateWorkflowInput!) { createWorkflow(input: $input) { workflowId } }',
      { input: { workspaceId: ws, name: 'Overnight triage', description: 'Sorts the night\'s tickets into queues before the morning shift.' } },
    );
    await gql(
      `mutation($w: ID!, $f: ID!, $input: WorkflowGraphInput!) { saveWorkflowGraph(workspaceId: $w, workflowId: $f, input: $input) { nodes { key } } }`,
      {
        w: ws,
        f: made.workflowId,
        input: {
          nodes: [{ key: 'sort', kind: 'AGENT', name: 'Sort the tickets', agentId: ghost.id, x: 0, y: 0 }],
          edges: [],
        },
      },
    );
    for (let attempt = 0; attempt < 3; attempt++) {
      await gql('mutation($w: ID!, $f: ID!) { startExecution(workspaceId: $w, workflowId: $f, input: "{}") { id } }', {
        w: ws,
        f: made.workflowId,
      });
    }
    return made;
  });
  log(`failures: two chats on ${old.name}, ${failing ? 'three runs of Overnight triage' : 'no runs'}`);

  /* ---------------------------------------------------------- templates */

  await tryTo('agent template', () =>
    gql(
      'mutation($w: ID!, $id: ID!, $input: ComponentTemplateInput!) { saveComponentAsTemplate(workspaceId: $w, kind: AGENT, id: $id, input: $input) { id } }',
      { w: ws, id: desk.id, input: { name: 'Account desk', description: 'An agent for account managers: renewals, plans, what a customer is owed.' } },
    ),
  );
  await tryTo('workflow template', async () => {
    // The component a template names is the workflow itself, not the workspace's entry for it.
    const { workspaceWorkflows } = await gql(`{ workspaceWorkflows(workspaceId: "${ws}") { content { id workflowId name } } }`);
    const listed = workspaceWorkflows.content.find((one) => one.id === ctx.flagship.id) ?? workspaceWorkflows.content[0];
    return gql(
      'mutation($w: ID!, $id: ID!, $input: ComponentTemplateInput!) { saveComponentAsTemplate(workspaceId: $w, kind: WORKFLOW, id: $id, input: $input) { id } }',
      {
        w: ws,
        id: listed.workflowId ?? listed.id,
        input: { name: 'Answer a question asked in Slack', description: 'A Slack mention answered by the support agent in its thread, escalated when it cannot.' },
      },
    );
  });
  if (slack?.id) {
    await tryTo('connection template', () =>
      gql(
        'mutation($w: ID!, $id: ID!, $n: String!, $d: String) { saveConnectionAsTemplate(workspaceId: $w, id: $id, name: $n, description: $d) { id } }',
        { w: ws, id: slack.id, n: 'Slack (Northwind workspace)', d: 'The support Slack, with the bot\'s scopes; the tokens are given again where it is used.' },
      ),
    );
  }
  log('templates: Account desk, and the Slack connection');

  /* ------------------------------------------------- members and a share */

  await tryTo('dana as workspace admin', () =>
    gql(
      'mutation($w: ID!, $u: String!) { setWorkspaceMemberRole(workspaceId: $w, username: $u, role: ADMIN) { username } }',
      { w: ws, u: 'dana' },
    ),
  );
  await tryTo('Tool Rounds for this workspace', () =>
    gql('mutation($w: ID!) { setWorkspaceChatMaxRounds(workspaceId: $w, count: 40) { id } }', { w: ws }),
  );
  const borrower = await tryTo('a workspace to lend to', async () => {
    const { createWorkspace: made } = await gql(
      'mutation($input: CreateWorkspaceInput!) { createWorkspace(input: $input) { id name } }',
      { input: { name: 'Field Engineering', description: 'The questions that arrive from site, and what answers them.' } },
    );
    return made;
  });
  if (borrower) {
    await tryTo('lending the GPU box', () =>
      gql(
        'mutation($input: ShareInput!) { shareWithWorkspace(input: $input) { id } }',
        { input: { workspaceId: ws, granteeWorkspaceId: borrower.id, kind: 'MODEL_PROVIDER', componentId: gpuBox.id } },
      ),
    );
    log(`shared: ${gpuBox.name} with ${borrower.name}`);
  }

  /*
   * A report uploaded to the Artifacts page, for the viewer's Replace and the
   * artifact's /content address (04, Artifacts). A page rather than a PDF: the
   * viewer draws a page itself, and the capture browser's PDF reader never got
   * past Loading for group C. Uploaded as the person, with the session the seed
   * signs in with, as the page's own Upload would.
   */
  await tryTo('a report on the Artifacts page', async () => {
    const page = `<!doctype html><html><head><meta charset="utf-8"><title>Weekly support report</title>
<style>body{font:15px/1.5 system-ui,sans-serif;margin:40px;color:#1f2328}h1{font-size:24px}table{border-collapse:collapse}td,th{border:1px solid #d0d7de;padding:6px 12px;text-align:left}</style></head>
<body><h1>Weekly support report</h1><p>Northwind Support, week 43.</p>
<table><tr><th>Customer</th><th>Opened</th><th>Waiting on us</th></tr>
<tr><td>Contoso</td><td>14</td><td>3</td></tr><tr><td>Fabrikam</td><td>9</td><td>1</td></tr><tr><td>Litware</td><td>6</td><td>0</td></tr></table>
<p>The nightly billing export failed three nights running; the fix shipped on Thursday and every night since has gone through.</p></body></html>`;
    const form = new FormData();
    form.append('file', new Blob([page], { type: 'text/html' }), 'weekly-support-report.html');
    form.append('description', 'The week in tickets, for the Monday call.');
    const cookie = await signIn('alice', 'password');
    const answer = await fetch(`${ctx.BASE}/api/workspaces/${ws}/artifacts`, { method: 'POST', headers: { cookie }, body: form });
    if (!answer.ok) throw new Error(`${answer.status} ${await answer.text()}`);
    log('uploaded: weekly-support-report.html');
  });
}
