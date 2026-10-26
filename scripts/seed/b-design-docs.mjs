/**
 * Group B of the manual (#684): Documents, Wireframes and Diagrams.
 *
 * Northwind Support's own paperwork - a handbook with a table, a code block,
 * a highlight with its note and a link to a checklist; a portal sketched as
 * two phone screens; the support platform drawn as a diagram with groups,
 * databases and people - made through the API, so the pictures show real
 * content rather than an empty editor. A few saves are made after the first,
 * some as Dana, so a document has a history worth opening.
 */

const text = (words, marks) => (marks ? { type: 'text', text: words, marks } : { type: 'text', text: words });
const para = (...parts) => ({ type: 'paragraph', content: parts.map((one) => (typeof one === 'string' ? text(one) : one)) });
const heading = (level, words) => ({ type: 'heading', attrs: { level }, content: [text(words)] });
const bullets = (...items) => ({ type: 'bulletList', content: items.map((item) => ({ type: 'listItem', content: [para(item)] })) });
const numbered = (...items) => ({ type: 'orderedList', attrs: { start: 1 }, content: items.map((item) => ({ type: 'listItem', content: [para(item)] })) });
const cell = (words, header = false) => ({ type: header ? 'tableHeader' : 'tableCell', attrs: { colspan: 1, rowspan: 1 }, content: [para(words)] });
const table = (head, ...rows) => ({
  type: 'table',
  content: [
    { type: 'tableRow', content: head.map((one) => cell(one, true)) },
    ...rows.map((row) => ({ type: 'tableRow', content: row.map((one) => cell(one)) })),
  ],
});
const code = (language, body) => ({ type: 'codeBlock', attrs: { language }, content: [text(body)] });
const doc = (...content) => JSON.stringify({ type: 'doc', content });
const linkTo = (id, name) => ({ type: 'documentLink', attrs: { document: Number(id), name } });

export async function seed(ctx) {
  const { gql, ws, log, signIn, chatModel } = ctx;

  /* ---------------------------------------------------------------- documents */

  const catalog = async (name) =>
    (await gql('mutation($w: ID!, $n: String!) { createDocumentCatalog(workspaceId: $w, name: $n) { id } }', { w: ws, n: name }))
      .createDocumentCatalog.id;
  const runbooks = await catalog('Runbooks');
  const letters = await catalog('Customer letters');
  const notes = await catalog('Team notes');

  const make = async (catalogId, name, content) =>
    (await gql(
      'mutation($w: ID!, $c: ID, $n: String!, $d: String) { createDocument(workspaceId: $w, catalogId: $c, name: $n, content: $d) { id revision } }',
      { w: ws, c: catalogId, n: name, d: content },
    )).createDocument;

  const checklist = await make(
    runbooks,
    'P1 outage checklist',
    doc(
      heading(1, 'P1 outage checklist'),
      para('Work down this list the moment a P1 is declared. Tick each line in the incident channel as it is done.'),
      numbered(
        'Page the on-call lead and open #incident-live in Slack.',
        'Post the first customer update on the status page within 15 minutes.',
        'Freeze deploys to the affected service.',
        'Name one person to talk to customers and one to fix.',
        'Every 30 minutes, post what changed - even when nothing did.',
      ),
      heading(2, 'When it is over'),
      para('Write the timeline while it is fresh, and book the review within two working days.'),
    ),
  );

  const handbook = await make(
    runbooks,
    'Escalation handbook',
    doc(
      heading(1, 'Escalation handbook'),
      para(
        'How a ticket moves from the first answer to the engineer who can fix it. Read it once end to end; after that, the table in ',
        text('Severities', [{ type: 'bold' }]),
        ' is all most people need.',
      ),
      heading(2, 'Severities'),
      table(
        ['Severity', 'First answer', 'Who is paged'],
        ['P1 - outage', '15 minutes', 'On-call lead and the service owner'],
        ['P2 - degraded', '1 hour', 'On-call lead'],
        ['P3 - one customer', '4 working hours', 'Nobody; the queue'],
        ['P4 - question', '1 working day', 'Nobody; the queue'],
      ),
      para(
        'For a P1, follow the ',
        linkTo(checklist.id, 'P1 outage checklist'),
        ' line by line. ',
        text('Never close a P1 before the customer has confirmed the fix', [{ type: 'note', attrs: { note: 'Agreed with the account team in the March review: a P1 closed on our word alone was reopened four times last quarter.', id: 'n-confirm' } }]),
        '.',
      ),
      heading(2, 'Handing a ticket on'),
      bullets(
        'Say what the customer sees, in their words, before what you think the cause is.',
        'Attach the request id from the error page.',
        'Name what you already tried, so nobody tries it again.',
      ),
      heading(2, 'Looking a customer up'),
      para('The support CLI finds an account by the email on the ticket and prints its plan, region and open incidents:'),
      code('bash', 'nw-support account find --email "jo.martin@contoso.example" \\\n  --show plan,region,incidents'),
      heading(2, 'After the handover'),
      para('Stay on the ticket as its owner until the engineer has answered the customer once. Customers recieves fewer updates when the owner changes, so keep the thread in one pair of hands.'),
    ),
  );

  await make(runbooks, 'Refund policy', doc(
    heading(1, 'Refund policy'),
    para('A refund within 30 days of a charge is approved by the agent who handles the ticket. Past 30 days it needs a team lead.'),
    bullets('Refund to the card that paid.', 'Never refund to another account.', 'Note the ticket number on the refund.'),
  ));
  await make(letters, 'Welcome letter for new customers', doc(
    heading(1, 'Welcome to Northwind'),
    para('Thank you for choosing Northwind. Your support plan starts today, and your account team is one email away at support@northwind.example.'),
  ));
  await make(letters, 'Apology for the March outage', doc(
    heading(1, 'About the outage on 14 March'),
    para('On 14 March the ticket portal was unavailable for 47 minutes. We are sorry, and this letter says what happened and what we changed.'),
  ));
  await make(notes, 'Weekly support review', doc(
    heading(1, 'Weekly support review'),
    table(['Queue', 'Opened', 'Closed', 'Oldest'], ['Billing', '42', '45', '2 days'], ['Technical', '118', '101', '6 days'], ['Accounts', '27', '30', '1 day']),
  ));

  // A history: two later saves, one of them Dana's, each keeping the version it replaced.
  const save = async (id, revision, content, as = null) =>
    (await gql('mutation($id: ID!, $c: String!, $r: Int) { saveDocument(id: $id, content: $c, revision: $r) { revision } }', { id, c: content, r: revision }, as))
      .saveDocument.revision;
  const held = JSON.parse((await gql('query($id: ID!) { document(id: $id) { content } }', { id: handbook.id })).document.content);
  const firstAdded = { ...held, content: [...held.content.slice(0, 2), para('Updated after the March outage review.'), ...held.content.slice(2)] };
  let revision = await save(handbook.id, handbook.revision, JSON.stringify(firstAdded));
  const dana = await signIn('dana', process.env.ORKNUX_DEMO_COLLEAGUE_PASSWORD ?? 'demo-password').catch(() => null);
  const secondAdded = { ...firstAdded, content: firstAdded.content.map((block) => block) };
  secondAdded.content[2] = para('Updated after the March outage review, with the P1 rule agreed with the account team.');
  revision = await save(handbook.id, revision, JSON.stringify(secondAdded), dana);
  log(`documents: handbook ${handbook.id} at revision ${revision}, checklist ${checklist.id}`);

  // Suggestions while typing come from the workspace's completion model: the stand-in here.
  await gql('mutation($w: ID!, $m: ID) { setWorkspaceCompletionModel(workspaceId: $w, modelId: $m) { id } }', { w: ws, m: chatModel.id });

  /* --------------------------------------------------------------- wireframes */

  const el = (id, type, x, y, w, h, words = '', props = {}) => ({ id, type, x, y, w, h, text: words, props });
  const portal = {
    elements: [
      el('signin', 'frame', 0, 0, 390, 760, 'Sign in'),
      el('logo', 'image', 145, 60, 100, 100, ''),
      el('title', 'text', 32, 190, 326, 40, 'Northwind Support', { size: 26, weight: 'bold' }),
      el('email', 'input', 32, 260, 326, 44, 'Work email'),
      el('password', 'input', 32, 320, 326, 44, 'Password'),
      el('remember', 'checkbox', 32, 380, 200, 24, 'Keep me signed in', { checked: true }),
      el('go', 'button', 32, 430, 326, 48, 'Sign in', { variant: 'primary' }),
      el('forgot', 'text', 120, 500, 200, 24, 'Forgot your password?'),
      el('sso', 'button', 32, 560, 326, 44, 'Sign in with your company'),
      el('tickets', 'frame', 460, 0, 390, 760, 'My tickets'),
      el('search', 'input', 492, 40, 326, 40, 'Search tickets'),
      el('open', 'toggle', 492, 96, 200, 24, 'Open only', { checked: true }),
      el('t1', 'rect', 492, 140, 326, 84, 'TCK-1042  Invoice shows the wrong VAT\nWaiting for you · 2h'),
      el('t2', 'rect', 492, 236, 326, 84, 'TCK-1039  Cannot add a second admin\nIn progress · 1d'),
      el('t3', 'rect', 492, 332, 326, 84, 'TCK-1031  Export to CSV times out\nWith engineering · 3d'),
      el('new', 'button', 492, 680, 326, 48, 'New ticket', { variant: 'primary' }),
      el('why', 'note', 900, 120, 220, 120, 'Open only is on by default: most people come back for the ticket they are waiting on.'),
      el('to', 'arrow', 900, 180, -200, -70),
    ],
  };
  const { createWireframe: wireframe } = await gql(
    'mutation($w: ID!, $n: String!, $d: String) { createWireframe(workspaceId: $w, name: $n, document: $d) { id } }',
    { w: ws, n: 'Customer portal', d: JSON.stringify(portal) },
  );
  await gql('mutation($w: ID!, $n: String!, $d: String) { createWireframe(workspaceId: $w, name: $n, document: $d) { id } }', {
    w: ws,
    n: 'Agent dashboard',
    d: JSON.stringify({ elements: [
      el('desk', 'frame', 0, 0, 1280, 800, 'Queue'),
      el('nav', 'rect', 0, 40, 220, 760, 'Queues\nBilling\nTechnical\nAccounts'),
      el('c1', 'rect', 250, 70, 230, 110, 'Waiting\n42'),
      el('c2', 'rect', 500, 70, 230, 110, 'Due today\n9'),
      el('c3', 'rect', 750, 70, 230, 110, 'Breached\n2'),
      el('chart', 'image', 250, 210, 980, 360, 'Tickets opened and closed, last 30 days'),
    ] }),
  });
  await gql('mutation($w: ID!, $n: String!, $d: String) { createWireframe(workspaceId: $w, name: $n, document: $d) { id } }', {
    w: ws,
    n: 'Refund request form',
    d: JSON.stringify({ elements: [
      el('form', 'frame', 0, 0, 600, 520, 'Request a refund'),
      el('amount', 'input', 40, 60, 520, 44, 'Amount'),
      el('reason', 'input', 40, 120, 520, 100, 'Why are you asking?'),
      el('card', 'radio', 40, 240, 300, 24, 'Back to the card that paid', { checked: true }),
      el('credit', 'radio', 40, 276, 300, 24, 'As credit on the account'),
      el('send', 'button', 400, 440, 160, 44, 'Send request', { variant: 'primary' }),
    ] }),
  });
  log(`wireframes: customer portal ${wireframe.id}`);

  /* ----------------------------------------------------------------- diagrams */

  const diagramCatalog = async (name) =>
    (await gql('mutation($w: ID!, $n: String!) { createDiagramCatalog(workspaceId: $w, name: $n) { id } }', { w: ws, n: name }))
      .createDiagramCatalog.id;
  const architecture = await diagramCatalog('Architecture');
  const processes = await diagramCatalog('Processes');
  const diagram = async (catalogId, name, description, drawing) =>
    (await gql(
      'mutation($w: ID!, $n: String!, $c: ID, $d: String, $about: String) { createDiagram(workspaceId: $w, name: $n, catalogId: $c, document: $d, description: $about) { id } }',
      { w: ws, n: name, c: catalogId, d: JSON.stringify(drawing), about: description },
    )).createDiagram.id;

  const node = (id, kind, label, x, y, w, h, extra = {}) => ({ id, kind, label, x, y, w, h, ...extra });
  const platform = await diagram(architecture, 'Northwind support platform', 'How a customer request reaches the people and systems that answer it: the portal, the ticket service and its stores, the email provider, and who works where.', {
    nodes: [
      node('customer', 'actor', 'Customer', 40, 160, 90, 120),
      node('platform', 'group', 'Support platform', 200, 40, 620, 420),
      node('portal', 'component', 'Customer portal', 240, 100, 200, 70, { parent: 'platform', color: '#bfdbfe' }),
      node('api', 'component', 'Ticket service', 520, 100, 200, 70, {
        parent: 'platform',
        color: '#bfdbfe',
        notes: 'Owns every ticket and its history. Rate limited to 50 requests a second per customer; anything above that is answered 429 and retried by the portal.',
      }),
      node('db', 'database', 'Tickets', 520, 260, 200, 110, { parent: 'platform', color: '#bbf7d0' }),
      node('search', 'database', 'Search index', 240, 260, 200, 110, { parent: 'platform', color: '#e4e4e7' }),
      node('mail', 'cloud', 'Email provider', 900, 90, 200, 110, { color: '#fef08a' }),
      node('agent', 'actor', 'Support agent', 980, 300, 90, 120),
      node('rule', 'note', 'P1 tickets page the on-call lead through the email provider.', 880, 480, 240, 90),
    ],
    edges: [
      { id: 'e1', from: 'customer', to: 'portal', label: 'opens a ticket' },
      { id: 'e2', from: 'portal', to: 'api', label: 'REST' },
      { id: 'e3', from: 'api', to: 'db', label: 'writes' },
      { id: 'e4', from: 'api', to: 'search', label: 'indexes', line: 'dashed' },
      { id: 'e5', from: 'api', to: 'mail', label: 'notifies', line: 'dashed', end: 'open' },
      { id: 'e6', from: 'mail', to: 'agent', label: 'pages' },
    ],
  });
  await gql('mutation($id: ID!) { setDiagramAgentAccess(id: $id, access: CHANGE) { id } }', { id: platform });

  const refunds = await diagram(processes, 'Refund decision', 'Who may approve a refund, and what the customer is sent.', {
    nodes: [
      node('in', 'parallelogram', 'Refund requested', 40, 40, 200, 64),
      node('age', 'diamond', 'Charged within 30 days?', 300, 20, 200, 110),
      node('agent', 'rounded', 'Agent approves', 580, 40, 180, 64, { color: '#bbf7d0' }),
      node('lead', 'rounded', 'Team lead decides', 300, 200, 200, 64, { color: '#fed7aa' }),
      node('letter', 'document', 'Confirmation letter', 580, 190, 180, 84),
    ],
    edges: [
      { id: 'r1', from: 'in', to: 'age' },
      { id: 'r2', from: 'age', to: 'agent', label: 'yes' },
      { id: 'r3', from: 'age', to: 'lead', label: 'no' },
      { id: 'r4', from: 'agent', to: 'letter' },
      { id: 'r5', from: 'lead', to: 'letter', label: 'if approved', line: 'dashed' },
    ],
  });
  await gql('mutation($id: ID!) { setDiagramAgentAccess(id: $id, access: READ) { id } }', { id: refunds });

  await diagram(processes, 'Support team map', 'Which team owns which queue, and who they hand on to.', {
    nodes: [
      node('first', 'group', 'First line', 40, 40, 300, 220),
      node('billing', 'box', 'Billing queue', 70, 90, 240, 60, { parent: 'first' }),
      node('accounts', 'box', 'Accounts queue', 70, 170, 240, 60, { parent: 'first' }),
      node('second', 'group', 'Engineering liaison', 420, 40, 300, 220),
      node('technical', 'box', 'Technical queue', 450, 90, 240, 60, { parent: 'second' }),
      node('oncall', 'actor', 'On-call lead', 540, 160, 70, 90, { parent: 'second' }),
    ],
    edges: [{ id: 't1', from: 'billing', to: 'technical', label: 'hands on', line: 'dashed' }],
  });
  log(`diagrams: platform ${platform}, refunds ${refunds}`);
}
