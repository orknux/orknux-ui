import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import type { SessionUser } from '../../api/session';
import { fetchDesignVideos, onTheWay, playable } from '../../api/videos';
import type { DesignVideo } from '../../api/videos';
import { AppShell } from '../../components/AppShell';
import { Loader } from '../../components/Loader';
import { SearchBox, SearchRow } from '../../components/SearchBox';
import { WorkspaceSidebar } from '../../components/WorkspaceSidebar';
import { shellUser } from '../../session/user';
import table from '../workspace/CatalogueTable.module.css';
import gallery from '../workspace/WorkspaceArtifactsPage.module.css';
import styles from './DesignVideos.module.css';
import { t, tf } from '../../i18n';
import filmIcon from '../../assets/film.svg';
import { moveDesignVideo } from '../../api/designCatalogs';
import { ALL_CATALOGS, DesignCatalogActions, DesignCatalogRail, useDesignCatalogs } from '../../components/DesignCatalogRail';
import { MoveToCatalog } from '../../components/MoveToCatalog';
import rail from '../workspace/WorkspaceMemoryPage.module.css';

export interface DesignVideosPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

/** How often the list is asked about while a video on it is still on its way. */
const ASK_EVERY_MS = 2000;

/** 3.5 -> "0:04", 75 -> "1:15": how long a video plays, as a player says it. */
export function playingTime(seconds: number): string {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** What a video's state is called on its card. */
export function statusLabel(video: DesignVideo): string {
  switch (video.status) {
    case 'QUEUED':
      return (video.ahead ?? 0) > 0 ? tf('Queued, {ahead} ahead', { ahead: video.ahead ?? 0 }) : t('Queued');
    case 'GENERATING':
      if (video.framesTotal !== null) {
        return tf('Upscaling… {done} of {total} frames', { done: video.framesDone ?? 0, total: video.framesTotal });
      }
      return video.progress !== null && video.progress > 0 ? tf('Making… {progress}%', { progress: video.progress }) : t('Making…');
    case 'DONE':
      return t('Made');
    case 'FAILED':
      return t('Not made');
    case 'STOPPED':
      return t('Stopped');
  }
}

/**
 * Every video made in this workspace - and those on their way, failed or
 * stopped - newest first, each with its poster, prompt, model, length and
 * where it is. A card opens the video editor at that video, which plays it,
 * or follows it until it is made.
 */
export function DesignVideosPage({ session, onSignOut }: DesignVideosPageProps) {
  const { workspaceId = '' } = useParams();
  const navigate = useNavigate();
  const [videos, setVideos] = useState<DesignVideo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hunting, setHunting] = useState('');
  const [asked, setAsked] = useState('');
  /** Which read is the newest, so a late answer to an old search is dropped. */
  const reading = useRef(0);
  /** The video catalogs down the left, and the one being looked at. */
  const catalog = useDesignCatalogs(workspaceId, 'VIDEO');

  useEffect(() => {
    const waiting = setTimeout(() => setAsked(hunting), 300);
    return () => clearTimeout(waiting);
  }, [hunting]);

  const read = useCallback(() => {
    if (workspaceId === '') return;
    const which = ++reading.current;
    fetchDesignVideos(workspaceId, asked, catalog.filter)
      .then((found) => {
        if (which !== reading.current) return;
        setVideos(found);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (which !== reading.current) return;
        setError(cause instanceof Error ? cause.message : t('Could not load the videos.'));
      });
  }, [workspaceId, asked, catalog.filter]);
  useEffect(read, [read]);

  const waiting = videos?.some(onTheWay) ?? false;
  useEffect(() => {
    if (!waiting) return;
    const ask = window.setInterval(read, ASK_EVERY_MS);
    return () => window.clearInterval(ask);
  }, [waiting, read]);

  const open = (video: DesignVideo) => navigate(`/workspace/${workspaceId}/design/videos/${video.id}`);

  return (
    <AppShell
      user={shellUser(session)}
      workspacePath={`/workspace/${workspaceId}`}
      showAdmin={session.admin}
      onSignOut={onSignOut}
      sidebar={<WorkspaceSidebar workspaceId={workspaceId} />}
    >
      <div className={rail.split}>
      <DesignCatalogRail
        workspaceId={workspaceId}
        kind="VIDEO"
        catalogs={catalog.catalogs}
        selected={catalog.selected}
        onSelect={catalog.select}
        onChanged={catalog.reload}
        title={t('VIDEO CATALOGS')}
        allLabel={t('All videos')}
        allIcon={filmIcon}
      />
      <section className={rail.panel}>
      <header className={table.header}>
        <div className={table.titleGroup}>
          <h1 className={table.title}>{t('Videos')}</h1>
          <p className={table.subtitle}>{t('Every video a model made in this workspace.')}</p>
          <div className={styles.catalogLine}>
            <span className={styles.catalogHeading} data-testid="design-catalog-heading">
              {catalog.current?.name ?? t('All videos')}
            </span>
            <DesignCatalogActions
              workspaceId={workspaceId}
              kind="VIDEO"
              current={catalog.current}
              onChanged={catalog.reload}
              onDeleted={() => catalog.select(ALL_CATALOGS)}
            />
          </div>
        </div>
        <button
          type="button"
          className={table.createButton}
          onClick={() =>
            // Only a catalog chosen goes along: with every catalog shown, the server files it in the default by itself.
            navigate(`/workspace/${workspaceId}/design/videos/new${catalog.current === null ? '' : `?catalog=${catalog.current.id}`}`)
          }
          data-testid="new-video"
        >
          {t('+ New video')}
        </button>
      </header>

      <SearchRow>
        <SearchBox value={hunting} onChange={setHunting} placeholder={t('Search videos...')} label={t('Search videos')} />
      </SearchRow>

      {error !== null && (
        <p className={table.pageError} role="alert">
          {error}
        </p>
      )}

      <section className={table.card} data-testid="video-gallery-column">
        {videos === null && error === null && (
          <p className={table.notice}>
            <Loader />
          </p>
        )}
        {videos?.length === 0 && (
          <p className={table.notice}>{asked === '' ? t('Nothing yet. New video makes one.') : t('No video matches what you typed.')}</p>
        )}
        {videos !== null && videos.length > 0 && (
          <div className={gallery.gallery} data-testid="video-gallery">
            {videos.map((video) => (
              <figure key={video.id} className={gallery.card} data-video-status={video.status} data-testid="video-card">
                <button
                  type="button"
                  className={`${gallery.thumb} ${styles.thumbHolder}`}
                  onClick={() => open(video)}
                  aria-label={`${t('Open in editor')}: ${video.name}`}
                  title={t('Open in editor')}
                >
                  {video.status === 'DONE' && video.posterUrl !== null ? (
                    <img src={video.posterUrl} alt={video.prompt} className={styles.thumbVideo} loading="lazy" data-testid="video-poster" />
                  ) : video.status === 'DONE' && video.url !== null && playable(video) ? (
                    // No poster kept: the file's own first frame, which a browser draws from its metadata alone.
                    <video src={`${video.url}#t=0.1`} className={styles.thumbVideo} preload="metadata" muted playsInline data-testid="video-poster" />
                  ) : video.status === 'DONE' && video.url !== null ? (
                    <img src={video.url} alt={video.prompt} className={styles.thumbVideo} loading="lazy" data-testid="video-poster" />
                  ) : onTheWay(video) ? (
                    <span className={styles.thumbState}>
                      <Loader label={statusLabel(video)} delay={0} size={48} />
                    </span>
                  ) : (
                    <span className={`${styles.thumbState} ${video.status === 'FAILED' ? styles.thumbFailed : ''}`}>{statusLabel(video)}</span>
                  )}
                </button>
                <figcaption className={gallery.caption}>
                  <span className={gallery.prompt} title={video.prompt} data-testid="video-prompt">
                    {video.prompt}
                  </span>
                  <span className={gallery.facts} title={video.reason ?? undefined}>
                    <span data-testid="video-model">{video.model}</span>
                    {video.scale !== null && (
                      <>
                        <span className={gallery.dot}>·</span>
                        <span data-testid="video-scale">{`${video.scale}×`}</span>
                      </>
                    )}
                    {video.durationSeconds !== null && (
                      <>
                        <span className={gallery.dot}>·</span>
                        <span data-testid="video-duration">{playingTime(video.durationSeconds)}</span>
                      </>
                    )}
                    <span className={gallery.dot}>·</span>
                    <span data-testid="video-status">{statusLabel(video)}</span>
                  </span>
                  {catalog.catalogs !== null && (
                    <span className={styles.cardActions}>
                      <MoveToCatalog
                        name={video.name}
                        catalogs={catalog.catalogs}
                        currentCatalogId={video.catalogId}
                        className={styles.cardAction}
                        move={(target) => moveDesignVideo(workspaceId, video.id, target)}
                        onMoved={async () => {
                          read();
                          await catalog.reload();
                        }}
                      />
                    </span>
                  )}
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </section>
      </section>
      </div>
    </AppShell>
  );
}
