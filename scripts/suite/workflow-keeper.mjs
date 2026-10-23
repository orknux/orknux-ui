/**
 * The fixture workflow, put back the way it was after every check.
 *
 * The editor saves as it is edited (issue #645), so a check that adds a node to
 * look at it, types into a name, or copies a trigger has changed the workflow
 * every later check opens - where before, leaving without pressing Save threw
 * all of that away. A copied trigger left lying on top of the real one is the
 * kind of thing that then fails forty checks that never touched it, for a
 * reason none of them is about.
 *
 * So the runner keeps the graph as it found it and saves it back whenever a
 * check moved its revision. Kept here rather than in each check, for the reason
 * the fixture is resolved once: a check written later cannot forget to.
 */

export const GRAPH = `
  revision
  nodes {
    key kind name description agentId triggerId actionId conditionId objectId outputObjectId outputNodeKey
    imageModelId imageSize imageQuality imageStyle outputName icon orientation shape
    decisionModelId decisionBranchQuestion decisionThreshold calledWorkflowId
    decisionQuestions { key kind instructions options { name description } }
    yesLabel noLabel fallbackEnabled streamOutput retryAttempts retryBackoffSeconds
    retryMultiplier retryMaxWaitSeconds retryJitter retryBudgetSeconds enabled x y
    mappings { name expression mode sourceNodeKey fieldKind fieldElementKind fieldRefObjectId
      fieldProperties { name kind refObjectId elementKind description
        properties { name kind refObjectId elementKind description
          properties { name kind refObjectId elementKind description } } } }
  }
  edges { source target branch option }
`;

/** Drops what GraphQL answers with nulls for, so the input carries only what was there. */
export function trimmed(value) {
  if (Array.isArray(value)) return value.map(trimmed);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([, held]) => held !== null).map(([key, held]) => [key, trimmed(held)]));
}

/**
 * Signs in as the checks do and reads the workflow; `restore()` puts it back
 * when anything has saved over it. Quiet where there is no workflow to keep.
 */
export async function workflowKeeper(env) {
  const base = env.ORKNUX_UI_URL ?? 'http://localhost:5173';
  const workspaceId = env.ORKNUX_WORKSPACE;
  const workflowId = env.ORKNUX_WORKFLOW;
  if (workspaceId === undefined || workflowId === undefined) return { restore: async () => false };

  let cookie = '';
  async function signIn() {
    const answer = await fetch(`${base}/api/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: env.ORKNUX_USER ?? 'alice', password: env.ORKNUX_PASSWORD ?? 'password' }),
    });
    cookie = (answer.headers.getSetCookie?.() ?? [answer.headers.get('set-cookie') ?? ''])
      .map((one) => one.split(';')[0])
      .join('; ');
  }
  async function graphql(query, variables) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const answer = await fetch(`${base}/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ query, variables }),
      });
      // A session the server forgot - a restart between checks - is signed in again once.
      if (answer.status === 401 || answer.status === 403) {
        await signIn();
        continue;
      }
      const body = await answer.json();
      if (body.errors !== undefined) throw new Error(JSON.stringify(body.errors));
      return body.data;
    }
    throw new Error('could not sign in to keep the fixture workflow');
  }
  const read = async () =>
    (
      await graphql(`query($w: ID!, $f: ID!) { workflowGraph(workspaceId: $w, workflowId: $f) { ${GRAPH} } }`, {
        w: workspaceId,
        f: workflowId,
      })
    ).workflowGraph;

  try {
    await signIn();
  } catch {
    return { restore: async () => false };
  }
  const kept = await read().catch(() => null);
  if (kept === null) return { restore: async () => false };
  let revision = kept.revision;

  return {
    /** @returns whether it had to be put back. */
    async restore() {
      const now = await read().catch(() => null);
      if (now === null || now.revision === revision) return false;
      const saved = await graphql(
        `mutation($w: ID!, $f: ID!, $input: WorkflowGraphInput!) {
           saveWorkflowGraph(workspaceId: $w, workflowId: $f, input: $input) { revision }
         }`,
        { w: workspaceId, f: workflowId, input: { nodes: trimmed(kept.nodes), edges: trimmed(kept.edges) } },
      );
      revision = saved.saveWorkflowGraph.revision;
      return true;
    },
  };
}
