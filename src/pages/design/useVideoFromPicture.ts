import { useEffect, useState } from 'react';

import { fetchVideoModelsFromPicture } from '../../api/videos';

/**
 * Whether this workspace has a video model that starts from a picture: what
 * Convert to video needs to lead anywhere. False until known, so the button
 * never appears and then turns out to have nowhere to go.
 */
export function useVideoFromPicture(workspaceId: string): boolean {
  const [can, setCan] = useState(false);
  useEffect(() => {
    if (workspaceId === '') return;
    let left = false;
    fetchVideoModelsFromPicture(workspaceId)
      .then((models) => {
        if (!left) setCan(models.length > 0);
      })
      .catch(() => undefined);
    return () => {
      left = true;
    };
  }, [workspaceId]);
  return can;
}

/** Where Convert to video goes: the video editor, with the picture to start from in the address so a reload keeps it. */
export function videoFromPicturePath(workspaceId: string, pictureId: string): string {
  return `/workspace/${workspaceId}/design/videos/new?from=${encodeURIComponent(pictureId)}`;
}
