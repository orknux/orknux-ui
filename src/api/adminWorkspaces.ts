import { graphql } from './client';

/** What an admin workspace's agents may read in the workspaces it reaches. Read only, every one. */
export type AdminWorkspaceScope = 'SESSIONS' | 'CHATS' | 'AGENTS' | 'ACTIONS' | 'WORKFLOWS' | 'RUNS' | 'REPORTS';

/** One of the installation's admin pages, read by an admin workspace's agents as a tool of its own. */
export type AdminWorkspaceTool = 'REPORTS' | 'DOCTOR' | 'ROLES' | 'MONITORING' | 'TEMPLATES' | 'PLUGINS' | 'AUDIT' | 'USERS';

export const ADMIN_WORKSPACE_SCOPES: AdminWorkspaceScope[] = ['SESSIONS', 'CHATS', 'AGENTS', 'ACTIONS', 'WORKFLOWS', 'RUNS', 'REPORTS'];

export const ADMIN_WORKSPACE_TOOLS: AdminWorkspaceTool[] = ['REPORTS', 'DOCTOR', 'ROLES', 'MONITORING', 'TEMPLATES', 'PLUGINS', 'AUDIT', 'USERS'];

/**
 * What one workspace may read as an admin workspace. Kept while it is switched
 * off, so switching it on again finds what was chosen before.
 */
export interface AdminWorkspaceSettings {
  workspaceId: string;
  enabled: boolean;
  /** Every workspace, or only those in `reach`. */
  reachAll: boolean;
  reach: string[];
  scopes: AdminWorkspaceScope[];
  tools: AdminWorkspaceTool[];
}

export type AdminWorkspaceInput = Omit<AdminWorkspaceSettings, 'workspaceId'>;

const FIELDS = 'workspaceId enabled reachAll reach scopes tools';

export async function fetchAdminWorkspace(workspaceId: string): Promise<AdminWorkspaceSettings> {
  const data = await graphql<{ adminWorkspace: AdminWorkspaceSettings }>(
    `query AdminWorkspace($workspaceId: ID!) { adminWorkspace(workspaceId: $workspaceId) { ${FIELDS} } }`,
    { workspaceId },
  );
  return data.adminWorkspace;
}

/** Writes the whole card. Refused, in words, while somebody who is not an administrator can open the workspace. */
export async function setAdminWorkspace(workspaceId: string, input: AdminWorkspaceInput): Promise<AdminWorkspaceSettings> {
  const data = await graphql<{ setAdminWorkspace: AdminWorkspaceSettings }>(
    `mutation SetAdminWorkspace($workspaceId: ID!, $input: AdminWorkspaceInput!) {
       setAdminWorkspace(workspaceId: $workspaceId, input: $input) { ${FIELDS} }
     }`,
    { workspaceId, input },
  );
  return data.setAdminWorkspace;
}
