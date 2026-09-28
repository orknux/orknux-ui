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
  /**
   * Where the same bytes can be read rather than saved, or null for a file
   * nothing renders.
   *
   * Its own address, so what a link is does not depend on what the file inside
   * it turns out to be: `url` hands the file over, always, and this one opens.
   */
  previewUrl: string | null;
  drawnAt: string;
}

const ARTIFACT_FIELDS = `
  id kind source sourcePath prompt filename contentType sizeBytes url previewUrl drawnAt
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
/**
 * One artifact, by the id the list gave it.
 *
 * What a link to an artifact resolves to. Null for one that is not there or
 * not this workspace's - the same answer for both, so an address cannot be
 * used to find out what another team has produced.
 */
export async function fetchWorkspaceArtifact(workspaceId: string, id: string): Promise<Artifact | null> {
  const data = await graphql<{ workspaceArtifact: Artifact | null }>(
    `query WorkspaceArtifact($workspaceId: ID!, $id: ID!) {
       workspaceArtifact(workspaceId: $workspaceId, id: $id) { ${ARTIFACT_FIELDS} }
     }`,
    { workspaceId, id },
  );
  return data.workspaceArtifact;
}

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

/** Where a saved artifact's bytes are, by the number a link to it carries. */
export function savedArtifactUrl(id: string): string {
  return `/api/artifacts/${id}`;
}

/** Where the same bytes are read rather than saved. */
export function savedArtifactPreviewUrl(id: string): string {
  return `/api/artifacts/${id}/preview`;
}

/**
 * What a saved artifact is, asked of the file itself.
 *
 * A link in an answer carries only the number and whatever the model called
 * it, and a title is a model's word for the file rather than the file's own
 * type. A HEAD request answers with the type the server holds without handing
 * the bytes over; a file it will not open for reading answers
 * application/octet-stream. Null for one that is not there or not this caller's.
 */
export async function fetchSavedArtifactType(id: string): Promise<string | null> {
  // The reading address, because the file's own answers every document as
  // application/octet-stream - it is a download - and says nothing of what it is.
  const answer = await fetch(savedArtifactPreviewUrl(id), { method: 'HEAD', credentials: 'same-origin' });
  if (!answer.ok) return null;
  return (answer.headers.get('Content-Type') ?? '').toLowerCase().split(';')[0].trim();
}

/** A saved artifact's bytes, for a page that draws them itself. */
export async function fetchSavedArtifactBytes(id: string): Promise<ArrayBuffer> {
  const answer = await fetch(savedArtifactUrl(id), { credentials: 'same-origin' });
  if (!answer.ok) throw new Error(`Artifact ${id} answered ${answer.status}`);
  return answer.arrayBuffer();
}
