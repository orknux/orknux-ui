/**
 * What the Research and Chat chapters photograph (#684, group C).
 *
 * Research: three documents on the Artifacts page for a research to read, the
 * planner, writer and reviewer thinking with the stand-in model, and four
 * finished research in Shallow - one reviewed, one a follow-up of it, two read
 * from the documents alone - so the list has a history and a running one can
 * say about how long it has left. None searches the web: no search engine is
 * reached from here. A search key is set all the same, so New research is
 * photographed as it is in a workspace that has one.
 *
 * Chat: a conversation in plan mode with a plan waiting to be approved, one
 * whose answer holds maths, a shell block and a table, one
 * where an agent filed an issue, and a Completion model so the composer
 * suggests and an answer offers replies. What each model says is in
 * `../../scripts/screens-draw/c-explore-chat.mjs`.
 */

const DOCUMENTS = {
  'Support SLA 2026.md': [
    '# Northwind support targets, 2026',
    '',
    '- Chat: a first reply within 2 minutes.',
    '- Email: a first reply within 4 business hours.',
    '- Phone: answered within 60 seconds.',
    '',
    'Pro plan customers have the same targets on every day of the week, weekends included.',
    'A target is met in a month when 90% of that month\'s first replies are inside it.',
  ].join('\n'),
  'Q3 ticket volume review.md': [
    '# Third quarter: volume and first replies',
    '',
    '| Channel | Tickets | July | August | September |',
    '| --- | --- | --- | --- | --- |',
    '| Email | 18,400 | 93% | 71% | 91% |',
    '| Chat | 11,900 | 95% weekdays, 64% weekends | | |',
    '| Phone | 2,100 | 96% | 96% | 96% |',
    '',
    'August: the price-page change doubled email volume for nine days and left a backlog.',
  ].join('\n'),
  'Weekend rota notes.md': [
    '# Weekend rota',
    '',
    'From July weekend cover is two agents, down from four: two moved to onboarding.',
    'Median weekend chat first reply: 9 minutes on Sundays, 6 on Saturdays.',
    'The priority queue is off outside weekday hours, so Pro plan chats wait with everybody else.',
  ].join('\n'),
  'Help centre top articles.md': [
    '# Articles opened in the hour before a ticket',
    '',
    '1. Resetting two-factor sign-in',
    '2. Exporting invoices',
    '3. Changing the billing contact',
    '4. Why my export failed',
    '5. Adding a seat',
    '',
    'Why my export failed and Resetting two-factor sign-in end without a next step; 38% of their readers open a ticket.',
  ].join('\n'),
};

const AGENTS = [
  { name: 'Research planner', description: 'Plans a research: breaks its question into search queries.' },
  { name: 'Research writer', description: 'Writes a research\'s report from its sources.' },
  { name: 'Research reviewer', description: 'Reads a research\'s report against its sources before it is saved.' },
];

const PASSWORD = process.env.ORKNUX_PASSWORD ?? 'password';

export async function seed(ctx) {
  const { BASE, USER, ws, gql, log, signIn, chatModel, responder } = ctx;
  const cookie = await signIn(USER, PASSWORD);

  /* ------------------------------------------------------------ research */

  // The documents, through the same door New research's Upload uses.
  const form = new FormData();
  for (const [name, text] of Object.entries(DOCUMENTS)) form.append('files', new Blob([text], { type: 'text/markdown' }), name);
  const uploaded = await fetch(`${BASE}/api/workspaces/${ws}/research-documents`, { method: 'POST', headers: { cookie }, body: form });
  if (!uploaded.ok) throw new Error(`research documents: ${uploaded.status} ${await uploaded.text()}`);
  const documents = Object.fromEntries((await uploaded.json()).documents.map((one) => [one.name, one.id]));
  log(`research documents: ${Object.keys(documents).length}`);

  // The three a research works with, thinking with the stand-in: found where the workspace has them, made where not.
  const { workspaceAgents } = await gql(`{ workspaceAgents(workspaceId: ${ws}, size: 100) { content { id name type description systemPrompt } } }`);
  const agents = workspaceAgents.content;
  const picked = {};
  for (const wanted of AGENTS) {
    let agent = agents.find((one) => one.name === wanted.name);
    if (!agent) {
      ({ createAgent: agent } = await gql('mutation($input: CreateAgentInput!) { createAgent(input: $input) { id name type description systemPrompt } }', {
        input: { workspaceId: ws, name: wanted.name, type: 'LLM', description: wanted.description },
      }));
    }
    await gql('mutation($id: ID!, $input: UpdateAgentInput!) { updateAgent(id: $id, input: $input) { id } }', {
      id: agent.id,
      input: {
        name: agent.name,
        type: agent.type ?? 'LLM',
        description: agent.description ?? wanted.description,
        systemPrompt: agent.systemPrompt ?? '',
        modelId: chatModel.id,
      },
    });
    picked[wanted.name] = agent.id;
  }

  // A key, so New research is photographed as a workspace with search has it; nothing here searches.
  await gql('mutation($ws: ID!, $key: String) { setWorkspaceSearch(workspaceId: $ws, apiKey: $key) { keySet } }', {
    ws,
    key: 'demo-key-for-the-manual',
  }).catch((failure) => log(`  search key: ${failure.message.split('\n')[0]}`));

  const { researchModes } = await gql(`{ researchModes(workspaceId: ${ws}) { id kind name } }`);
  const shallow = researchModes.find((mode) => mode.kind === 'SHALLOW');

  const start = async (question, extra = {}) => {
    const { startResearch } = await gql('mutation($input: StartResearchInput!) { startResearch(input: $input) { id } }', {
      input: {
        workspaceId: ws,
        question,
        modeId: shallow.id,
        plannerAgentId: picked['Research planner'],
        writerAgentId: picked['Research writer'],
        reviewerAgentId: picked['Research reviewer'],
        language: 'FORMAL',
        outputFormat: 'PDF',
        useWebSearch: false,
        includeImages: false,
        review: false,
        followUps: 3,
        documentsInclude: Object.values(documents),
        ...extra,
      },
    });
    return startResearch.id;
  };
  const finished = async (id, what) => {
    const until = Date.now() + 180_000;
    for (;;) {
      const { research } = await gql('query($id: ID!) { research(id: $id) { status error } }', { id });
      if (research.status !== 'RUNNING') {
        if (research.status !== 'COMPLETED') throw new Error(`research "${what}" ${research.status}: ${research.error}`);
        log(`  research ${id}: ${what}`);
        return;
      }
      if (Date.now() > until) throw new Error(`research "${what}" still running after three minutes`);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  };

  const help = await start('Which help-centre articles do customers open before contacting support?', {
    outputFormat: 'DOCUMENT',
    language: 'COLLOQUIAL',
    documentsInclude: [documents['Help centre top articles.md']],
  });
  await finished(help, 'help-centre articles');
  // A document rather than a PDF: the manual's browser draws a document's report; a PDF it shows still loading.
  const quarter = await start('Which support channels missed their first-reply target in the third quarter, and why?', {
    review: true,
    outputFormat: 'DOCUMENT',
    documentsInclude: [documents['Support SLA 2026.md'], documents['Q3 ticket volume review.md'], documents['Weekend rota notes.md']],
  });
  await finished(quarter, 'the third quarter, reviewed');
  const { startFollowUpResearch: follow } = await gql('mutation($id: ID!, $q: String!) { startFollowUpResearch(parentId: $id, question: $q) { id } }', {
    id: quarter,
    q: 'What should the support desk change before the pricing change in January?',
  });
  await finished(follow.id, 'the follow-up on January');
  // A third finished one in Shallow, so a running one is told about how long it has left.
  const again = await start('Which help-centre articles end without a next step?', {
    outputFormat: 'DOCUMENT',
    documentsInclude: [documents['Help centre top articles.md']],
  });
  await finished(again, 'articles without a next step');

  /* ---------------------------------------------------------------- chat */

  // The Completion model: suggestions while typing, and replies offered under an answer.
  await gql('mutation($ws: ID!, $id: ID) { setWorkspaceCompletionModel(workspaceId: $ws, modelId: $id) { id } }', { ws, id: chatModel.id });
  // Run on a shell block, for the picture of an answer with one.
  await gql('mutation { setCommandRuns(enabled: true) { enabled } }').catch((failure) => log(`  command runs: ${failure.message.split('\n')[0]}`));

  const started = async (title, agentId) =>
    (await gql('mutation($input: StartChatInput!) { startChat(input: $input) { id } }', { input: { workspaceId: ws, title, agentId } })).startChat.id;
  const say = (id, text) => gql('mutation($id: ID!, $text: String!) { sendChatMessage(id: $id, text: $text) { __typename } }', { id, text });

  // Plan mode, with a plan put to the person and not yet answered.
  const planning = await started('Retiring the legacy billing webhook', responder.id);
  await gql('mutation($id: ID!) { setChatMode(id: $id, mode: PLAN) { id } }', { id: planning });
  await say(planning, 'Work out how we retire the legacy billing webhook without breaking anything that still calls it.');
  log('  chat in plan mode');

  /*
   * An answer with maths, a shell block and a table. No recording under the
   * question: the stand-in's model does not take audio, and the product refuses
   * a sound sent to a model that does not, before the model is asked - as the
   * chapter says it does.
   */
  const numbers = await started('First-reply targets in numbers', responder.id);
  await say(numbers, 'Show me the first-reply target, in numbers, for August\'s email.');
  log('  chat with maths, a shell block and a table');

  // An agent that files an issue, so its call links to it.
  const { createAgent: operations } = await gql('mutation($input: CreateAgentInput!) { createAgent(input: $input) { id } }', {
    input: { workspaceId: ws, name: 'Operations assistant', type: 'LLM', description: 'Files and follows up the desk\'s issues.' },
  });
  await gql('mutation($id: ID!, $input: UpdateAgentInput!) { updateAgent(id: $id, input: $input) { id } }', {
    id: operations.id,
    input: {
      name: 'Operations assistant',
      type: 'LLM',
      description: 'Files and follows up the desk\'s issues.',
      systemPrompt: 'You keep the support desk\'s issues: file them, label them and follow them up.',
      modelId: chatModel.id,
      orknuxAccess: true,
    },
  });
  const filing = await started('Filing the billing export failure', operations.id);
  await say(filing, 'File an issue for the billing export that failed three nights running.');
  log('  chat where an issue was filed');
}
