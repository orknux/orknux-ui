import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import type { PageOf } from '../../api/client';
import { fetchWorkspaceArtifact, fetchWorkspaceArtifacts } from '../../api/artifacts';
import type { Artifact } from '../../api/artifacts';
import type { SessionUser } from '../../api/session';
import { timeAgo } from '../../api/tools';
import { AppShell } from '../../components/AppShell';
import { CompactPagination } from '../../components/CompactPagination';
import { Loader } from '../../components/Loader';
import { SearchBox, SearchRow } from '../../components/SearchBox';
import { WorkspaceSidebar } from '../../components/WorkspaceSidebar';
import { PAGE_SIZES, usePageSize } from '../../components/pageSize';
import { usePageWithin } from '../../components/pageWithin';
import { shellUser } from '../../session/user';
import table from '../workspace/CatalogueTable.module.css';
import gallery from '../workspace/WorkspaceArtifactsPage.module.css';
import styles from './DesignImagesPage.module.css';
import { t } from '../../i18n';

export interface DesignImagesPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

/**
 * Every picture a model drew in this workspace, and the one being looked at.
 *
 * The first piece of Design: the gallery, and an image opened above it - which
 * is where "Open in Design" on the Artifacts page lands. What it was made with,
 * generating a new one and editing a region come next, as the mockup settles
 * them; the Artifacts page keeps listing everything, files included.
 *
 * Only what was drawn (`drawn: true`): a file an agent saved may be a picture,
 * and nothing says a model made it. One opened by address is shown whatever it
 * is, because somebody asked for that one.
 */
export function DesignImagesPage({ session, onSignOut }: DesignImagesPageProps) {
  const { workspaceId = '', artifactId } = useParams();
  const navigate = useNavigate();
  const [images, setImages] = useState<PageOf<Artifact> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = usePageWithin(workspaceId);
  const [pageSize, setPageSize] = usePageSize('design-images');
  const [hunting, setHunting] = useState('');
  const [asked, setAsked] = useState('');
  /** The one the address names, when the page in view does not hold it. */
  const [addressed, setAddressed] = useState<Artifact | null>(null);

  useEffect(() => {
    const waiting = setTimeout(() => setAsked(hunting), 300);
    return () => clearTimeout(waiting);
  }, [hunting]);
  useEffect(() => setPage(1), [asked]);

  const load = useCallback(() => {
    if (workspaceId === '') return;
    setError(null);
    fetchWorkspaceArtifacts(workspaceId, page - 1, pageSize, asked, true)
      .then(setImages)
      .catch((cause: unknown) => {
        setImages(null);
        setError(cause instanceof Error ? cause.message : t('Could not load the images.'));
      });
  }, [workspaceId, page, pageSize, asked]);

  useEffect(load, [load]);

  useEffect(() => {
    if (artifactId === undefined || workspaceId === '') return;
    if (images?.content.some((one) => one.id === artifactId) === true) return;
    if (addressed?.id === artifactId) return;
    let left = false;
    void fetchWorkspaceArtifact(workspaceId, artifactId)
      .then((found) => {
        if (!left) setAddressed(found);
      })
      .catch(() => {
        if (!left) setAddressed(null);
      });
    return () => {
      left = true;
    };
  }, [artifactId, workspaceId, images, addressed]);

  const open =
    artifactId === undefined
      ? null
      : (images?.content.find((one) => one.id === artifactId) ?? (addressed?.id === artifactId ? addressed : null));

  return (
    <AppShell
      user={shellUser(session)}
      workspacePath={`/workspace/${workspaceId}`}
      showAdmin={session.admin}
      onSignOut={onSignOut}
      sidebar={<WorkspaceSidebar workspaceId={workspaceId} />}
    >
      <header className={table.header}>
        <div className={table.titleGroup}>
          <h1 className={table.title}>{t('Images')}</h1>
          <p className={table.subtitle}>{t('Every picture a model drew in this workspace.')}</p>
        </div>
      </header>

      {open !== null && (
        <section className={styles.focus} data-design-image={open.id}>
          <img src={open.url} alt={open.prompt} className={styles.focusImage} />
          <div className={styles.focusFacts}>
            <p className={styles.focusPrompt}>{open.prompt}</p>
            <p className={gallery.facts}>
              {open.sourcePath === '' ? (
                <span>{open.source}</span>
              ) : (
                <Link className={gallery.runLink} to={`/workspace/${workspaceId}/${open.sourcePath}`}>
                  {open.source}
                </Link>
              )}
              <span className={gallery.dot}>·</span>
              {timeAgo(open.drawnAt)}
            </p>
          </div>
        </section>
      )}

      <SearchRow>
        <SearchBox value={hunting} onChange={setHunting} placeholder={t('Search images...')} label={t('Search images')} />
      </SearchRow>

      {error !== null && (
        <p className={table.pageError} role="alert">
          {error}
        </p>
      )}

      <section className={table.card}>
        {images === null && error === null && (
          <p className={table.notice}>
            <Loader />
          </p>
        )}
        {images?.content.length === 0 && (
          <p className={table.notice}>
            {asked === ''
              ? t('Nothing yet. An image node or a task that draws fills this.')
              : t('No image matches what you typed.')}
          </p>
        )}
        {images !== null && images.content.length > 0 && (
          <div className={gallery.gallery}>
            {images.content.map((image) => (
              <figure
                key={image.id}
                className={`${gallery.card} ${image.id === artifactId ? styles.chosen : ''}`}
              >
                <button
                  type="button"
                  className={gallery.thumb}
                  onClick={() => navigate(`/workspace/${workspaceId}/design/images/${image.id}`)}
                  aria-label={image.prompt}
                  aria-pressed={image.id === artifactId}
                >
                  <img src={image.url} alt={image.prompt} className={gallery.image} loading="lazy" />
                </button>
                <figcaption className={gallery.caption}>
                  <span className={gallery.prompt} title={image.prompt}>
                    {image.prompt}
                  </span>
                  <span className={gallery.facts}>
                    {image.source}
                    <span className={gallery.dot}>·</span>
                    {timeAgo(image.drawnAt)}
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
        {images !== null && images.totalElements > 0 && (
          <CompactPagination
            page={page}
            pageSize={pageSize}
            totalItems={images.totalElements}
            unit={t('images')}
            onPageChange={setPage}
            pageSizes={PAGE_SIZES}
            onPageSizeChange={setPageSize}
          />
        )}
      </section>
    </AppShell>
  );
}
