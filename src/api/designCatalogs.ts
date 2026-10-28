import { graphql } from './client';
import type { Artifact } from './artifacts';
import type { DesignVideo } from './videos';
import type { Wireframe } from './wireframes';

/** What a Design catalog holds: one table per kind on the server, one set of calls here. */
export type DesignCatalogKind = 'IMAGE' | 'WIREFRAME' | 'VIDEO';

/** A folder of one kind of Design's things. */
export interface DesignCatalog {
  id: string;
  name: string;
  /** The workspace's default of its kind: where anything not filed elsewhere is. It cannot be deleted. */
  isDefault: boolean;
  /** How many things it holds. */
  count: number;
}

const FIELDS = 'id name isDefault count';

/** A workspace's catalogs of one kind: the default first, made the first time it is asked for. */
export async function fetchDesignCatalogs(workspaceId: string, kind: DesignCatalogKind): Promise<DesignCatalog[]> {
  const data = await graphql<{ designCatalogs: DesignCatalog[] }>(
    `query ($workspaceId: ID!, $kind: DesignCatalogKind!) { designCatalogs(workspaceId: $workspaceId, kind: $kind) { ${FIELDS} } }`,
    { workspaceId, kind },
  );
  return data.designCatalogs;
}

export async function createDesignCatalog(workspaceId: string, kind: DesignCatalogKind, name: string): Promise<DesignCatalog> {
  const data = await graphql<{ createDesignCatalog: DesignCatalog }>(
    `mutation ($workspaceId: ID!, $kind: DesignCatalogKind!, $name: String!) {
       createDesignCatalog(workspaceId: $workspaceId, kind: $kind, name: $name) { ${FIELDS} }
     }`,
    { workspaceId, kind, name },
  );
  return data.createDesignCatalog;
}

export async function renameDesignCatalog(workspaceId: string, kind: DesignCatalogKind, id: string, name: string): Promise<DesignCatalog> {
  const data = await graphql<{ renameDesignCatalog: DesignCatalog }>(
    `mutation ($workspaceId: ID!, $kind: DesignCatalogKind!, $id: ID!, $name: String!) {
       renameDesignCatalog(workspaceId: $workspaceId, kind: $kind, id: $id, name: $name) { ${FIELDS} }
     }`,
    { workspaceId, kind, id, name },
  );
  return data.renameDesignCatalog;
}

/** Refused for the default catalog, and while the catalog holds anything. */
export async function deleteDesignCatalog(workspaceId: string, kind: DesignCatalogKind, id: string): Promise<boolean> {
  const data = await graphql<{ deleteDesignCatalog: boolean }>(
    `mutation ($workspaceId: ID!, $kind: DesignCatalogKind!, $id: ID!) { deleteDesignCatalog(workspaceId: $workspaceId, kind: $kind, id: $id) }`,
    { workspaceId, kind, id },
  );
  return data.deleteDesignCatalog;
}

export async function moveWireframe(id: string, catalogId: string): Promise<Pick<Wireframe, 'id' | 'catalogId'>> {
  const data = await graphql<{ moveWireframe: Pick<Wireframe, 'id' | 'catalogId'> }>(
    `mutation ($id: ID!, $catalogId: ID!) { moveWireframe(id: $id, catalogId: $catalogId) { id catalogId } }`,
    { id, catalogId },
  );
  return data.moveWireframe;
}

/** A video, and the versions made of it, filed in another catalog. */
export async function moveDesignVideo(workspaceId: string, id: string, catalogId: string): Promise<Pick<DesignVideo, 'id' | 'catalogId'>> {
  const data = await graphql<{ moveDesignVideo: Pick<DesignVideo, 'id' | 'catalogId'> }>(
    `mutation ($workspaceId: ID!, $id: ID!, $catalogId: ID!) { moveDesignVideo(workspaceId: $workspaceId, id: $id, catalogId: $catalogId) { id catalogId } }`,
    { workspaceId, id, catalogId },
  );
  return data.moveDesignVideo;
}

/** A picture on the Images page, whatever drew it, filed in another catalog. */
export async function moveDesignImage(workspaceId: string, id: string, catalogId: string): Promise<Pick<Artifact, 'id' | 'catalogId'>> {
  const data = await graphql<{ moveDesignImage: Pick<Artifact, 'id' | 'catalogId'> }>(
    `mutation ($workspaceId: ID!, $id: ID!, $catalogId: ID!) { moveDesignImage(workspaceId: $workspaceId, id: $id, catalogId: $catalogId) { id catalogId } }`,
    { workspaceId, id, catalogId },
  );
  return data.moveDesignImage;
}
