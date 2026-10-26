import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { fetchWorkspaceArtifact } from '../../api/artifacts';
import { t } from '../../i18n';

/**
 * An artifact on its own, with nothing of Orknux around it: an address that
 * stays the same as the artifact is replaced, which goes on to the file the
 * server serves - the page a report is, rather than the list it sits in.
 */
export function ArtifactContentPage() {
  const { workspaceId = '', artifactId = '' } = useParams();
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let live = true;
    void fetchWorkspaceArtifact(workspaceId, artifactId)
      .then((artifact) => {
        if (!live) return;
        const address = artifact?.previewUrl ?? artifact?.url ?? null;
        if (address === null) setMissing(true);
        else window.location.replace(address);
      })
      .catch(() => live && setMissing(true));
    return () => {
      live = false;
    };
  }, [workspaceId, artifactId]);

  return <p data-testid="artifact-content">{missing ? t('There is no such artifact in this workspace.') : t('Opening…')}</p>;
}
