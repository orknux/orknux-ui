import { useState } from 'react';
import { Link } from 'react-router-dom';

import { hostDesignImage, unhostDesignImage } from '../../api/artifacts';
import type { Artifact } from '../../api/artifacts';
import { t } from '../../i18n';
import styles from './DesignImagesPage.module.css';

export interface HostAsArtifactProps {
  workspaceId: string;
  picture: Artifact;
  /** Read again once it is hosted or no longer is, so the picture says which. */
  onChanged: () => void;
}

/** The address a hosted picture is served at: its artifact's own, without the version a list adds, and whole. */
export function hostedAddress(artifactId: string): string {
  return `${window.location.origin}/api/artifacts/${artifactId.replace(/^SAVED-/, '')}`;
}

/**
 * A picture drawn in Design, hosted as an artifact - or offered to be.
 *
 * Hosted, it has a place on the Artifacts page and an address that always
 * serves it as it is saved here: the artifact shares the picture's file, so a
 * change saved in the editor is what the address serves next, with nothing to
 * do again. Shown with that address, a way to copy it, and a way to stop - which
 * takes the artifact away and leaves the picture.
 *
 * Only for a picture of Design's own: one a run or a task drew is already an
 * artifact, at its own address.
 */
export function HostAsArtifact({ workspaceId, picture, onChanged }: HostAsArtifactProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  if (picture.kind !== 'DESIGN' || (picture.versionOf ?? null) !== null) return null;

  async function act(doing: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await doing();
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('That did not work.'));
    } finally {
      setBusy(false);
    }
  }

  const hostedAs = picture.hostedAs ?? null;
  if (hostedAs === null) {
    return (
      <div className={styles.hosting} data-testid="design-image-hosting" data-hosted="false">
        <span className={styles.hostingNote}>{t('Give this picture an address on the Artifacts page that always shows it as it is saved here.')}</span>
        <button
          type="button"
          className={styles.bringButton}
          onClick={() => void act(() => hostDesignImage(workspaceId, picture.id))}
          disabled={busy}
          data-testid="design-image-host"
        >
          {busy ? t('Hosting…') : t('Host as artifact')}
        </button>
        {error !== null && (
          <span className={styles.hostingError} role="alert">
            {error}
          </span>
        )}
      </div>
    );
  }

  const address = hostedAddress(hostedAs);
  return (
    <div className={styles.hosting} data-testid="design-image-hosting" data-hosted="true" data-artifact={hostedAs}>
      <span className={styles.hostingNote}>
        {t('Hosted as artifact')}{' '}
        <Link to={`/workspace/${workspaceId}/artifacts/${hostedAs}`} data-testid="design-image-hosted-artifact">
          {hostedAs}
        </Link>
        {' · '}
        {t('changes saved here show there.')}
      </span>
      <a className={styles.hostingLink} href={address} target="_blank" rel="noreferrer" data-testid="design-image-hosted-link">
        {address}
      </a>
      <button
        type="button"
        className={styles.bringButton}
        onClick={() => {
          void navigator.clipboard
            ?.writeText(address)
            .then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            })
            .catch(() => setError(t('The link could not be copied; select it and copy it instead.')));
        }}
        data-testid="design-image-copy-link"
      >
        {copied ? t('Copied') : t('Copy link')}
      </button>
      <button
        type="button"
        className={styles.bringButton}
        onClick={() => void act(() => unhostDesignImage(workspaceId, picture.id))}
        disabled={busy}
        title={t('Take the artifact off the Artifacts page; the picture stays here')}
        data-testid="design-image-unhost"
      >
        {t('Stop hosting')}
      </button>
      {error !== null && (
        <span className={styles.hostingError} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
