import { graphql } from './client';

/**
 * A named width and height a workspace's image nodes can pick in one click.
 *
 * Per workspace, editable and ordered - the workspace's own menu, the way its
 * issue statuses are. Picking one fills the node's Width and Height; the node
 * stores the numbers, never the preset, so renaming or removing one changes no
 * saved node. Issue #431.
 */
export interface ImageSizePreset {
  id: string;
  workspaceId: string;
  name: string;
  width: number;
  height: number;
  /** Menu order. */
  position: number;
}

const FIELDS = 'id workspaceId name width height position';

/** The workspace's presets in menu order. Anybody who can see the workspace. */
export async function fetchImageSizePresets(workspaceId: string): Promise<ImageSizePreset[]> {
  const data = await graphql<{ imageSizePresets: ImageSizePreset[] }>(
    `query ($workspaceId: ID!) { imageSizePresets(workspaceId: $workspaceId) { ${FIELDS} } }`,
    { workspaceId },
  );
  return data.imageSizePresets;
}

/** At the end of the menu. Sides are pixels, 1 to 8192, and the server's to check. */
export async function addImageSizePreset(
  workspaceId: string,
  name: string,
  width: number,
  height: number,
): Promise<ImageSizePreset> {
  const data = await graphql<{ addImageSizePreset: ImageSizePreset }>(
    `mutation ($workspaceId: ID!, $name: String!, $width: Int!, $height: Int!) {
       addImageSizePreset(workspaceId: $workspaceId, name: $name, width: $width, height: $height) { ${FIELDS} }
     }`,
    { workspaceId, name, width, height },
  );
  return data.addImageSizePreset;
}

/** Each field left alone when absent. */
export async function updateImageSizePreset(
  id: string,
  changes: { name?: string; width?: number; height?: number },
): Promise<ImageSizePreset> {
  const data = await graphql<{ updateImageSizePreset: ImageSizePreset }>(
    `mutation ($id: ID!, $name: String, $width: Int, $height: Int) {
       updateImageSizePreset(id: $id, name: $name, width: $width, height: $height) { ${FIELDS} }
     }`,
    { id, name: changes.name ?? null, width: changes.width ?? null, height: changes.height ?? null },
  );
  return data.updateImageSizePreset;
}

/** The whole menu in its new order - every one of the workspace's, once each. */
export async function reorderImageSizePresets(workspaceId: string, ids: string[]): Promise<ImageSizePreset[]> {
  const data = await graphql<{ reorderImageSizePresets: ImageSizePreset[] }>(
    `mutation ($workspaceId: ID!, $ids: [ID!]!) {
       reorderImageSizePresets(workspaceId: $workspaceId, ids: $ids) { ${FIELDS} }
     }`,
    { workspaceId, ids },
  );
  return data.reorderImageSizePresets;
}

export async function removeImageSizePreset(id: string): Promise<boolean> {
  const data = await graphql<{ removeImageSizePreset: boolean }>(
    `mutation ($id: ID!) { removeImageSizePreset(id: $id) }`,
    { id },
  );
  return data.removeImageSizePreset;
}
