import { graphql } from './client';
import type { DependencyKind } from './dependants';

/** One part of a workspace on its dependency graph. */
export interface DependencyGraphNode {
  /** What the edges name it by. */
  key: string;
  kind: DependencyKind;
  id: string;
  name: string;
  /** Whether a workflow is drawn from its published copy. */
  published: boolean;
  /** Which workspace setting, for a WORKSPACE node. */
  section: string | null;
}

/** `from` uses `to`: removing `to` would break `from`. */
export interface DependencyGraphEdge {
  from: string;
  to: string;
}

export interface DependencyGraph {
  nodes: DependencyGraphNode[];
  edges: DependencyGraphEdge[];
}

/** Every part of a workspace and what uses what: every Used by list at once. */
export async function fetchDependencyGraph(workspaceId: string): Promise<DependencyGraph> {
  const data = await graphql<{ workspaceDependencyGraph: DependencyGraph }>(
    `query($workspaceId: ID!) {
       workspaceDependencyGraph(workspaceId: $workspaceId) {
         nodes { key kind id name published section }
         edges { from to }
       }
     }`,
    { workspaceId },
  );
  return data.workspaceDependencyGraph;
}
