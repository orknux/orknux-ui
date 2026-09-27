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
   * Whether a key is set — never the key itself.
   *
   * The server will not answer with it: the column encrypts it, and a screen
   * that could read one back is a screen that puts a credential in somebody's
   * browser history. So the form shows "set" or "not set" and offers to replace
   * it, which is the whole of what anybody needs from a page.
   */
  keySet: boolean;
  /** Whether tavily also composes a short answer over the results, at more cost. */
  composeAnswer: boolean;
  /** The indexes this workspace may choose, and the sentence for each. */
  engines: SearchEngineChoice[];
}

export interface SearchEngineChoice {
  name: string;
  description: string;
}

const FIELDS = `engine keySet composeAnswer engines { name description }`;

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
 * `apiKey` left undefined leaves the key alone and an empty string clears it,
 * which is what lets the form save the engine without sending back a secret it
 * was never shown.
 */
export async function saveWorkspaceSearch(
  workspaceId: string,
  changes: { engine?: string; apiKey?: string; composeAnswer?: boolean },
): Promise<WorkspaceSearch> {
  const data = await graphql<{ setWorkspaceSearch: WorkspaceSearch }>(
    `mutation SetWorkspaceSearch($workspaceId: ID!, $engine: String, $apiKey: String, $composeAnswer: Boolean) {
       setWorkspaceSearch(
         workspaceId: $workspaceId, engine: $engine, apiKey: $apiKey, composeAnswer: $composeAnswer
       ) { ${FIELDS} }
     }`,
    { workspaceId, ...changes },
  );
  return data.setWorkspaceSearch;
}
