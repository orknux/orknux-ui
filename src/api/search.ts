import { graphql } from './client';

/**
 * What a workspace searches the web with. Issue #510.
 *
 * A workspace's own rather than the installation's: the key is billed to
 * whoever set it, and two teams in one installation may reasonably search
 * different indexes.
 */
export interface WorkspaceSearch {
  /** `tavily` or `brave`. */
  engine: string;
  /**
   * Whether a key of its own is kept - never the key itself. False for one
   * reading a workspace variable secret; `revealWorkspaceSearchKey` shows it.
   */
  keySet: boolean;
  /** The workspace variable secret the key is read from, or null for its own copy. */
  apiKeyVariableId: string | null;
  apiKeyVariableName: string | null;
  apiKeyVariableCatalog: string | null;
  /** A reference pointing at a variable that is gone. */
  apiKeyVariableMissing: boolean;
  /** Whether tavily also composes a short answer over the results, at more cost. */
  composeAnswer: boolean;
  /** The indexes this workspace may choose, and the sentence for each. */
  engines: SearchEngineChoice[];
}

export interface SearchEngineChoice {
  /** What is stored and sent: `tavily`, `brave`. */
  name: string;
  /** What a person reads: Tavily, Brave. */
  title: string;
  description: string;
}

const FIELDS = `engine keySet apiKeyVariableId apiKeyVariableName apiKeyVariableCatalog apiKeyVariableMissing
  composeAnswer engines { name title description }`;

export async function fetchWorkspaceSearch(workspaceId: string): Promise<WorkspaceSearch> {
  const data = await graphql<{ workspaceSearch: WorkspaceSearch }>(
    `query WorkspaceSearch($workspaceId: ID!) { workspaceSearch(workspaceId: $workspaceId) { ${FIELDS} } }`,
    { workspaceId },
  );
  return data.workspaceSearch;
}

/**
 * Saves what a workspace searches with.
 *
 * `apiKey` left undefined leaves the key alone and an empty string clears it;
 * `apiKeyVariableId` reads it from a workspace secret instead. Never both: the
 * server refuses the pair.
 */
export async function saveWorkspaceSearch(
  workspaceId: string,
  changes: { engine?: string; apiKey?: string; apiKeyVariableId?: string; composeAnswer?: boolean },
): Promise<WorkspaceSearch> {
  const data = await graphql<{ setWorkspaceSearch: WorkspaceSearch }>(
    `mutation SetWorkspaceSearch(
       $workspaceId: ID!, $engine: String, $apiKey: String, $apiKeyVariableId: ID, $composeAnswer: Boolean
     ) {
       setWorkspaceSearch(
         workspaceId: $workspaceId, engine: $engine, apiKey: $apiKey,
         apiKeyVariableId: $apiKeyVariableId, composeAnswer: $composeAnswer
       ) { ${FIELDS} }
     }`,
    { workspaceId, ...changes },
  );
  return data.setWorkspaceSearch;
}

/** The workspace's own search key, for the field's Show; recorded. Null where it reads a variable. */
export async function revealWorkspaceSearchKey(workspaceId: string): Promise<string | null> {
  const data = await graphql<{ revealWorkspaceSearchKey: string | null }>(
    'mutation RevealWorkspaceSearchKey($workspaceId: ID!) { revealWorkspaceSearchKey(workspaceId: $workspaceId) }',
    { workspaceId },
  );
  return data.revealWorkspaceSearchKey;
}
