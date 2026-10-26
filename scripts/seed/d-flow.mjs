/**
 * What the Flow chapters photograph that the core seed does not hold (#684,
 * group D): a workflow drawn to show what a node can be told about itself -
 * its shape, the workflow it runs, an agent's own settings, a placeholder in a
 * written value - and a document and a diagram for Quick actions to find.
 *
 * Everything is made through the API, and nothing here is run: the core seed's
 * Slack runs are what the run pictures are taken of.
 */

/** Asks for one of the workspace's things by name, or stops the seed saying which. */
async function named(gql, ws, list, name) {
  const { [list]: found } = await gql(`{ ${list}(workspaceId: ${ws}, size: 100) { content { id name } } }`);
  const one = found.content.find((item) => item.name === name);
  if (one === undefined) throw new Error(`d-flow: no ${list} called "${name}" - the core seed names it`);
  return one;
}

export async function seed(ctx) {
  const { gql, ws, log, responder, flagship } = ctx;

  const mention = await named(gql, ws, 'workspaceTriggers', 'Slack message received');
  const findTicket = await named(gql, ws, 'workspaceActions', 'Find the ticket referred to');
  const pageOnCall = await named(gql, ws, 'workspaceActions', 'Page the on-call');
  const outage = await named(gql, ws, 'workspaceConditions', 'Mentions an outage');

  /*
   * One graph, drawn to be read: the trigger as a pill, the lookup rounded,
   * the agent notched, the check a hexagon, the hand-over to another workflow
   * a star - so the shapes picture shows what a shape is for. The agent carries
   * its own settings, set away from their defaults so the panel reads them.
   */
  const { createWorkflow: triage } = await gql(
    'mutation($input: CreateWorkflowInput!) { createWorkflow(input: $input) { id name } }',
    {
      input: {
        workspaceId: ws,
        name: 'Triage a refund request',
        description: 'A refund request is looked up, judged by an agent, and handed to the Slack workflow to answer.',
      },
    },
  );
  const T = 'trigger-refund';
  const LOOKUP = 'action-lookup';
  const CHECK = 'condition-outage';
  const JUDGE = 'agent-judge';
  const HANDOVER = 'workflow-answer';
  const PAGE = 'action-page';
  const { saveWorkflowGraph } = await gql(
    `mutation($ws: ID!, $id: ID!, $input: WorkflowGraphInput!) {
       saveWorkflowGraph(workspaceId: $ws, workflowId: $id, input: $input) { workflowId problems { message } }
     }`,
    {
      ws,
      id: triage.id,
      input: {
        nodes: [
          { key: T, kind: 'TRIGGER', name: 'A refund is asked for', triggerId: mention.id, icon: 'slack', shape: 'PILL', x: 0, y: 260 },
          {
            key: LOOKUP,
            kind: 'ACTION',
            name: 'Find the order',
            actionId: findTicket.id,
            outputName: 'order',
            icon: 'clipboard-list',
            shape: 'ROUNDED',
            // A placeholder in a written value: the ticket the mention named, read when the step runs.
            mappings: [{ name: 'text', expression: 'Refund asked for in {{trigger.channel}}: {{trigger.text}}', mode: 'VALUE' }],
            x: 460,
            y: 300,
          },
          ...(outage
            ? [{ key: CHECK, kind: 'CONDITION', name: 'Is it an outage?', conditionId: outage.id, icon: 'alert-triangle', shape: 'HEXAGON', x: 880, y: 40 }]
            : []),
          {
            key: JUDGE,
            kind: 'AGENT',
            name: 'Judge the refund',
            agentId: responder.id,
            outputName: 'verdict',
            icon: 'bot',
            shape: 'NOTCHED',
            streamOutput: false,
            timeoutSeconds: 120,
            retryAttempts: 3,
            retryBackoffSeconds: 10,
            retryMultiplier: 2,
            mappings: [
              { name: 'prompt', expression: 'order', mode: 'REFERENCE', sourceNodeKey: LOOKUP },
              { name: 'chattiness', expression: 'LOW', mode: 'VALUE' },
            ],
            x: 880,
            y: 420,
          },
          {
            key: HANDOVER,
            kind: 'WORKFLOW',
            name: 'Answer in the thread',
            calledWorkflowId: flagship.id,
            icon: 'git-branch',
            shape: 'STAR',
            x: 1320,
            y: 400,
          },
          {
            key: PAGE,
            kind: 'ACTION',
            name: 'Page the on-call',
            actionId: pageOnCall.id,
            icon: 'bell',
            shape: 'CIRCLE',
            repeatTimes: 2,
            x: 1320,
            y: 20,
          },
        ],
        edges: [
          { source: T, target: LOOKUP },
          ...(outage ? [{ source: LOOKUP, target: CHECK }, { source: CHECK, target: PAGE, branch: 'YES' }] : []),
          { source: LOOKUP, target: JUDGE },
          { source: JUDGE, target: HANDOVER },
        ],
      },
    },
  );
  const problems = saveWorkflowGraph.problems?.map((one) => one.message) ?? [];
  log(`workflow ${triage.id}: ${triage.name}${problems.length ? ` (${problems.join('; ')})` : ''}`);

  // A document and a diagram with a word in common, for Quick actions to find beside a workflow.
  const content = JSON.stringify({
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Refund policy' }] },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'A refund under 200 EUR is approved by the support desk; anything larger goes to finance with the order attached.' }],
      },
    ],
  });
  const { createDocument: policy } = await gql(
    'mutation($ws: ID!, $name: String!, $content: String) { createDocument(workspaceId: $ws, name: $name, content: $content) { id } }',
    { ws, name: 'Refund policy', content },
  );
  const { createDiagram: flow } = await gql(
    'mutation($ws: ID!, $name: String!, $document: String) { createDiagram(workspaceId: $ws, name: $name, document: $document) { id } }',
    {
      ws,
      name: 'Refund escalation',
      document: JSON.stringify({
        nodes: [
          { id: 'asked', kind: 'rounded', label: 'Refund asked for', x: 0, y: 0 },
          { id: 'approved', kind: 'box', label: 'Refund approved by the desk', x: 260, y: 0 },
        ],
        edges: [{ id: 'e1', from: 'asked', to: 'approved', kind: 'arrow' }],
      }),
    },
  );
  log(`document ${policy.id}, diagram ${flow.id} for Quick actions`);
}
