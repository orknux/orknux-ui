/** Where Convert to video goes: the video editor, with the picture to start from in the address so a reload keeps it. */
export function videoFromPicturePath(workspaceId: string, pictureId: string): string {
  return `/workspace/${workspaceId}/design/videos/new?from=${encodeURIComponent(pictureId)}`;
}
