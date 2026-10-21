import { graphql } from './client';
import { MODEL_FIELDS } from './models';
import type { Model } from './models';

/** What one workspace may lend another. */
export type ShareKind = 'VARIABLE_CATALOG' | 'MODEL_PROVIDER';

/** One component one workspace lends another; see the server's WorkspaceSharing. */
export interface WorkspaceShare {
  id: string;
  kind: ShareKind;
  componentId: string;
  /** Null for a component that has gone since. */
  componentName: string | null;
  /** What an agent's catalog grant holds for a lent catalog: share:<catalog id>. */
  grant: string;
  ownerWorkspaceId: string;
  ownerWorkspaceName: string | null;
  granteeWorkspaceId: string;
  granteeWorkspaceName: string | null;
  createdAt: string;
  createdBy: string;
}

const FIELDS =
  'id kind componentId componentName grant ownerWorkspaceId ownerWorkspaceName granteeWorkspaceId granteeWorkspaceName createdAt createdBy';

/** What [workspaceId] lends, and to whom. Its administrators. */
export async function fetchSharesGiven(workspaceId: string): Promise<WorkspaceShare[]> {
  const data = await graphql<{ workspaceSharesGiven: WorkspaceShare[] }>(
    `query($workspaceId: ID!) { workspaceSharesGiven(workspaceId: $workspaceId) { ${FIELDS} } }`,
    { workspaceId },
  );
  return data.workspaceSharesGiven;
}

/** What other workspaces lend [workspaceId]. */
export async function fetchSharesReceived(workspaceId: string): Promise<WorkspaceShare[]> {
  const data = await graphql<{ workspaceSharesReceived: WorkspaceShare[] }>(
    `query($workspaceId: ID!) { workspaceSharesReceived(workspaceId: $workspaceId) { ${FIELDS} } }`,
    { workspaceId },
  );
  return data.workspaceSharesReceived;
}

/** The models of every provider lent to [workspaceId]. */
export async function fetchSharedModels(workspaceId: string): Promise<Model[]> {
  const data = await graphql<{ sharedModels: Model[] }>(
    `query($workspaceId: ID!) { sharedModels(workspaceId: $workspaceId) { ${MODEL_FIELDS} } }`,
    { workspaceId },
  );
  return data.sharedModels;
}

export async function shareWithWorkspace(
  workspaceId: string,
  granteeWorkspaceId: string,
  kind: ShareKind,
  componentId: string,
): Promise<WorkspaceShare> {
  const data = await graphql<{ shareWithWorkspace: WorkspaceShare }>(
    `mutation($input: ShareInput!) { shareWithWorkspace(input: $input) { ${FIELDS} } }`,
    { input: { workspaceId, granteeWorkspaceId, kind, componentId } },
  );
  return data.shareWithWorkspace;
}

export async function removeWorkspaceShare(id: string): Promise<void> {
  await graphql<{ removeWorkspaceShare: boolean }>('mutation($id: ID!) { removeWorkspaceShare(id: $id) }', { id });
}
