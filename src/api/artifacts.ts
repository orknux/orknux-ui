import { graphql } from './client';
import type { PageOf } from './client';

/**
 * Where it came from.
 *
 * IMAGE and TASK are drawn - by a workflow's image node and by an agent
 * working a task. SAVED is not drawn at all: a file an agent made and decided
 * was worth keeping.
 */
export type ArtifactKind = 'IMAGE' | 'TASK' | 'SAVED';

/**
 * One thing a run produced.
 *
 * Today that is a picture an image node drew, which was reachable only from the
 * run that drew it - fine while somebody remembers which run that was, useless
 * afterwards, and no way at all to see what is filling the disk.
 */
export interface Artifact {
  /** Prefixed with the kind: the two tables number their rows separately. */
  id: string;
  kind: ArtifactKind;
  /** Where it came from, named the way the page says it: "Run #12", "Task #4". */
  source: string;
  /** The rest of that address, under the workspace; blank where there is nothing to open. */
  sourcePath: string;
  /** What was asked for - the picture's caption. */
  prompt: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  /** Where the bytes are: the same address the run graph's `<img>` uses. */
  url: string;
  drawnAt: string;
}

const ARTIFACT_FIELDS = `
  id kind source sourcePath prompt filename contentType sizeBytes url drawnAt
`;

const WORKSPACE_ARTIFACTS_QUERY = `
  query WorkspaceArtifacts($workspaceId: ID!, $page: Int!, $size: Int!, $search: String) {
    workspaceArtifacts(workspaceId: $workspaceId, page: $page, size: $size, search: $search) {
      content { ${ARTIFACT_FIELDS} }
      page
      size
      totalElements
      totalPages
    }
  }
`;

const DELETE_ARTIFACT_MUTATION = `
  mutation DeleteArtifact($id: ID!) {
    deleteArtifact(id: $id)
  }
`;

/**
 * @param search narrows to what a word appears in - the prompt or the filename.
 *
 * Asked of the server rather than sieved here, because the list is paged:
 * narrowing what arrived on page one would hide matches on page four.
 */
export async function fetchWorkspaceArtifacts(
  workspaceId: string,
  page = 0,
  size = 24,
  search = '',
): Promise<PageOf<Artifact>> {
  const data = await graphql<{ workspaceArtifacts: PageOf<Artifact> }>(WORKSPACE_ARTIFACTS_QUERY, {
    workspaceId,
    page,
    size,
    search: search.trim() === '' ? null : search.trim(),
  });
  return data.workspaceArtifacts;
}

/** Gone from the list and gone from the disk. False if there was no such artifact. */
export async function deleteArtifact(id: string): Promise<boolean> {
  const data = await graphql<{ deleteArtifact: boolean }>(DELETE_ARTIFACT_MUTATION, { id });
  return data.deleteArtifact;
}
