import { graphql } from './client';
import type { PageOf } from './client';

/** Which kind of object a bin entry holds; the screens it is listed under on the server. */
export type RecycleBinKind =
  | 'AGENT'
  | 'TOOL'
  | 'FUNCTION'
  | 'SKILL'
  | 'DOCUMENT'
  | 'DIAGRAM'
  | 'SHEET'
  | 'ACTION'
  | 'WIREFRAME'
  | 'MEMORY'
  | 'IMAGE'
  | 'ISSUE'
  | 'WORKFLOW'
  | 'MEMORY_CATALOG'
  | 'SKILL_CATALOG'
  | 'CONDITION'
  | 'TRIGGER'
  | 'OBJECT'
  | 'VARIABLE';

/** One deleted object, as the bin lists it. What it held is read only when it is restored. */
export interface RecycleBinEntry {
  id: string;
  kind: RecycleBinKind;
  name: string;
  deletedAt: string;
  deletedBy: string;
}

const RECYCLE_BIN_QUERY = `
  query RecycleBin($workspaceId: ID!, $page: Int!, $size: Int!) {
    recycleBin(workspaceId: $workspaceId, page: $page, size: $size) {
      content { id kind name deletedAt deletedBy }
      page
      size
      totalElements
      totalPages
    }
  }`;

export async function fetchRecycleBin(
  workspaceId: string,
  page: number,
  size: number,
): Promise<PageOf<RecycleBinEntry>> {
  const data = await graphql<{ recycleBin: PageOf<RecycleBinEntry> }>(RECYCLE_BIN_QUERY, {
    workspaceId,
    page,
    size,
  });
  return data.recycleBin;
}

const RESTORE_MUTATION = `
  mutation RestoreRecycleBinEntry($id: ID!) { restoreRecycleBinEntry(id: $id) }`;

export async function restoreRecycleBinEntry(id: string): Promise<boolean> {
  const data = await graphql<{ restoreRecycleBinEntry: boolean }>(RESTORE_MUTATION, { id });
  return data.restoreRecycleBinEntry;
}

const PURGE_MUTATION = `
  mutation PurgeRecycleBinEntry($id: ID!) { purgeRecycleBinEntry(id: $id) }`;

export async function purgeRecycleBinEntry(id: string): Promise<boolean> {
  const data = await graphql<{ purgeRecycleBinEntry: boolean }>(PURGE_MUTATION, { id });
  return data.purgeRecycleBinEntry;
}

const EMPTY_MUTATION = `
  mutation EmptyRecycleBin($workspaceId: ID!) { emptyRecycleBin(workspaceId: $workspaceId) }`;

export async function emptyRecycleBin(workspaceId: string): Promise<number> {
  const data = await graphql<{ emptyRecycleBin: number }>(EMPTY_MUTATION, { workspaceId });
  return data.emptyRecycleBin;
}
