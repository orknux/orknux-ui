import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { deleteArtifact, dismissDesignImageJob, fetchDesignImageQueue, fetchWorkspaceArtifact, fetchWorkspaceArtifacts } from '../../api/artifacts';
import type { Artifact, DesignImageJob } from '../../api/artifacts';
import type { SessionUser } from '../../api/session';
import { timeAgo } from '../../api/tools';
import { AppShell } from '../../components/AppShell';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { TrashIcon } from '../../components/TrashIcon';
import { Loader } from '../../components/Loader';
import { SearchBox, SearchRow } from '../../components/SearchBox';
import { WorkspaceSidebar } from '../../components/WorkspaceSidebar';
import { shellUser } from '../../session/user';
import table from '../workspace/CatalogueTable.module.css';
import gallery from '../workspace/WorkspaceArtifactsPage.module.css';
import styles from './DesignImagesPage.module.css';
import { t, tf } from '../../i18n';

export interface DesignImagesPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

/** How often the queue is asked about while something on it is waiting or being drawn. */
const ASK_EVERY_MS = 2000;

/** How many pictures one read brings; the next comes as the end of the gallery scrolls into view. */
const BATCH = 48;

/**
 * Every picture a model drew in this workspace, the one being looked at, and
 * drawing another.
 *
 * A gallery that fills the width and grows as it is scrolled, not a page of ten
 * with a pager under it: pictures are found by looking along them, and a pager
 * on a wide screen was one row. The one opened - from here, or by "Open in
 * Design" on Artifacts - stands above it with what it was drawn from, and goes
 * back to the gallery by its close button or Escape.
 *
 * Only what was drawn (`drawn: true`): a file an agent saved may be a picture,
 * and nothing says a model made it. One opened by address is shown whatever it
 * is, because somebody asked for that one.
 */
export function DesignImagesPage({ session, onSignOut }: DesignImagesPageProps) {
  const { workspaceId = '', artifactId } = useParams();
  const navigate = useNavigate();
  const [images, setImages] = useState<Artifact[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hunting, setHunting] = useState('');
  const [asked, setAsked] = useState('');
  /** The one the address names, when the pictures read so far do not hold it. */
  const [addressed, setAddressed] = useState<Artifact | null>(null);
  const end = useRef<HTMLDivElement | null>(null);
  /** Which list a read belongs to, so a late answer to an old search is dropped. */
  const reading = useRef(0);

  useEffect(() => {
    const waiting = setTimeout(() => setAsked(hunting), 300);
    return () => clearTimeout(waiting);
  }, [hunting]);

  const readFrom = useCallback(
    (from: number) => {
      if (workspaceId === '') return;
      const which = ++reading.current;
      setLoading(true);
      setError(null);
      fetchWorkspaceArtifacts(workspaceId, Math.floor(from / BATCH), BATCH, asked, true)
        .then((page) => {
          if (which !== reading.current) return;
          setImages((held) => (from === 0 || held === null ? page.content : [...held, ...page.content]));
          setTotal(page.totalElements);
        })
        .catch((cause: unknown) => {
          if (which !== reading.current) return;
          setError(cause instanceof Error ? cause.message : t('Could not load the images.'));
        })
        .finally(() => {
          if (which === reading.current) setLoading(false);
        });
    },
    [workspaceId, asked],
  );

  // A new search, or another workspace, is a new list from its start.
  useEffect(() => {
    setImages(null);
    readFrom(0);
  }, [readFrom]);

  /*
   * What is queued, being drawn, or failed - at the front of the gallery, each
   * marked for what it is. Asked again while anything on it is still on its
   * way, and the gallery read again when something leaves it drawn.
   */
  const [queue, setQueue] = useState<DesignImageJob[]>([]);
  const readQueue = useCallback(() => {
    if (workspaceId === '') return;
    fetchDesignImageQueue(workspaceId)
      .then((now) => {
        setQueue((held) => {
          const before = held.filter((one) => one.status !== 'FAILED').length;
          const after = now.filter((one) => one.status !== 'FAILED').length;
          if (after < before) readFrom(0);
          return now;
        });
      })
      .catch(() => undefined);
  }, [workspaceId, readFrom]);
  useEffect(readQueue, [readQueue]);
  const onTheWay = queue.some((one) => one.status === 'QUEUED' || one.status === 'DRAWING');
  useEffect(() => {
    if (!onTheWay) return;
    const ask = window.setInterval(readQueue, ASK_EVERY_MS);
    return () => window.clearInterval(ask);
  }, [onTheWay, readQueue]);

  /*
   * The next batch when the end of the gallery comes near the bottom of the
   * window - asked on every scroll and after every render, because the end
   * also moves without a scroll: closing the picture above lifts the gallery
   * by its whole height. An IntersectionObserver missed exactly that.
   */
  const more = images !== null && images.length < total;
  const nearEnd = useRef(() => {});
  nearEnd.current = () => {
    const mark = end.current;
    if (mark === null || !more || loading) return;
    if (mark.getBoundingClientRect().top < window.innerHeight + 400) readFrom(images?.length ?? 0);
  };
  useEffect(() => nearEnd.current());
  useEffect(() => {
    const scrolled = () => nearEnd.current();
    window.addEventListener('scroll', scrolled, { passive: true });
    window.addEventListener('resize', scrolled);
    return () => {
      window.removeEventListener('scroll', scrolled);
      window.removeEventListener('resize', scrolled);
    };
  }, []);

  useEffect(() => {
    if (artifactId === undefined || workspaceId === '') return;
    if (images?.some((one) => one.id === artifactId) === true) return;
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
      : (images?.find((one) => one.id === artifactId) ?? (addressed?.id === artifactId ? addressed : null));

  const back = () => navigate(`/workspace/${workspaceId}/design/images`);
  useEffect(() => {
    if (open === null) return;
    const pressed = (event: KeyboardEvent) => {
      if (event.key === 'Escape') back();
    };
    document.addEventListener('keydown', pressed);
    return () => document.removeEventListener('keydown', pressed);
  }, [open?.id]);

  const drawnWith = open?.drawnWith ?? null;
  /** The picture a remove has been asked about, held until it is confirmed. */
  const [removing, setRemoving] = useState<Artifact | null>(null);

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
        <button
          type="button"
          className={table.createButton}
          onClick={() => navigate(`/workspace/${workspaceId}/design/images/new`)}
          data-testid="new-image"
        >
          {t('+ New image')}
        </button>
      </header>

      <SearchRow>
        <SearchBox value={hunting} onChange={setHunting} placeholder={t('Search images...')} label={t('Search images')} />
      </SearchRow>

      {error !== null && (
        <p className={table.pageError} role="alert">
          {error}
        </p>
      )}

      <div className={open !== null ? styles.split : undefined}>
      <section
        className={`${table.card} ${open !== null ? styles.side : ''}`}
        // Its own scroll, with a picture open: the end of the gallery comes into view by it too.
        onScroll={() => nearEnd.current()}
        data-testid="design-gallery-column"
      >
        {images === null && error === null && (
          <p className={table.notice}>
            <Loader />
          </p>
        )}
        {images?.length === 0 && queue.length === 0 && (
          <p className={table.notice}>
            {asked === ''
              ? t('Nothing yet. An image node or a task that draws fills this.')
              : t('No image matches what you typed.')}
          </p>
        )}
        {images !== null && (images.length > 0 || queue.length > 0) && (
          <div className={gallery.gallery} data-testid="design-gallery">
            {queue.map((one) => (
              <figure key={`job-${one.id}`} className={`${gallery.card} ${styles.pending}`} data-job-status={one.status}>
                <div
                  className={`${gallery.thumb} ${styles.pendingThumb}`}
                  role="link"
                  tabIndex={0}
                  title={t('Open in editor')}
                  aria-label={`${t('Open in editor')}: ${one.prompt}`}
                  onClick={() => navigate(`/workspace/${workspaceId}/design/images/new?job=${one.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') navigate(`/workspace/${workspaceId}/design/images/new?job=${one.id}`);
                  }}
                  data-testid="queued-open"
                >
                  {one.status === 'FAILED' ? (
                    <span className={styles.pendingFailed}>{t('Not drawn')}</span>
                  ) : (
                    <Loader
                      label={one.status === 'DRAWING' ? t('Drawing…') : t('Queued')}
                      delay={0}
                      size={48}
                    />
                  )}
                  {one.status !== 'DRAWING' && (
                    <button
                      type="button"
                      className={styles.pendingDismiss}
                      onClick={(event) => {
                        event.stopPropagation();
                        void dismissDesignImageJob(one.id).then(readQueue);
                      }}
                      aria-label={t('Take it off')}
                      title={t('Take it off')}
                    >
                      ×
                    </button>
                  )}
                </div>
                <figcaption className={gallery.caption}>
                  <span className={gallery.prompt} title={one.prompt}>
                    {one.prompt}
                  </span>
                  <span className={gallery.facts} title={one.reason ?? undefined}>
                    {one.status === 'FAILED'
                      ? (one.reason ?? t('the model gave no reason'))
                      : one.status === 'QUEUED' && (one.ahead ?? 0) > 0
                        ? tf('{model} · {ahead} ahead', { model: one.model, ahead: one.ahead ?? 0 })
                        : one.model}
                  </span>
                </figcaption>
              </figure>
            ))}
            {images.map((image) => (
              <figure
                key={image.id}
                className={`${gallery.card} ${image.id === artifactId ? styles.chosen : ''}`}
              >
                <button
                  type="button"
                  className={`${gallery.thumb} ${styles.thumbHolder}`}
                  onClick={() => navigate(`/workspace/${workspaceId}/design/images/${image.id}`)}
                  aria-label={image.prompt}
                  aria-pressed={image.id === artifactId}
                >
                  <img src={image.url} alt={image.prompt} className={gallery.image} loading="lazy" />
                </button>
                <figcaption className={gallery.caption}>
                  <span className={gallery.prompt} title={image.prompt}>
                    {image.name ?? image.prompt}
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
        <div ref={end} className={styles.end}>
          {loading && images !== null && <Loader />}
        </div>
      </section>
      {open !== null && (
        <section className={styles.focus} data-design-image={open.id}>
          {/*
            Its name across the top, and what can be done with it in the
            corner - so the picture underneath has nothing drawn over it, and
            what it was drawn with reads under it.
          */}
          <div className={styles.focusBar}>
          <div className={styles.focusStatus}>
            <span className={styles.focusName}>{open.name ?? open.prompt}</span>
          </div>
          <div className={styles.focusActions}>
            <button
              type="button"
              className={styles.focusRemove}
              onClick={() => setRemoving(open)}
              aria-label={t('Remove this picture')}
              title={t('Remove this picture')}
              data-testid="design-image-remove"
            >
              <TrashIcon />
            </button>
            <button
              type="button"
              className={`${table.createButton} ${styles.focusEdit}`}
              onClick={() => navigate(`/workspace/${workspaceId}/design/images/${open.id}/edit`)}
              title={t('Open in editor')}
              data-testid="design-image-edit"
            >
              {t('Edit')}
            </button>
            <button
              type="button"
              className={styles.focusClose}
              onClick={back}
              aria-label={t('Back to the gallery')}
              title={t('Back to the gallery')}
              data-testid="design-image-close"
            >
              ×
            </button>
          </div>
          </div>
          <img src={open.url} alt={open.prompt} className={styles.focusImage} />
          <div className={styles.focusFacts}>
            <dl className={styles.drawnWith}>
              <dt>{t('Prompt')}</dt>
              <dd className={styles.focusPrompt}>
                {open.prompt}
              </dd>
              <dt>{t('From')}</dt>
              <dd>
                {open.kind === 'DESIGN' || open.sourcePath === '' ? (
                  open.source
                ) : (
                  <Link className={gallery.runLink} to={`/workspace/${workspaceId}/${open.sourcePath}`}>
                    {open.source}
                  </Link>
                )}
              </dd>
              {drawnWith !== null && (
                <>
                  <dt>{t('Model')}</dt>
                  <dd>{drawnWith.model}</dd>
                  <dt>{t('Size')}</dt>
                  <dd>{drawnWith.size ?? t('Model default')}</dd>
                  {drawnWith.quality !== null && (
                    <>
                      <dt>{t('Quality')}</dt>
                      <dd>{drawnWith.quality}</dd>
                    </>
                  )}
                  {drawnWith.style !== null && (
                    <>
                      <dt>{t('Style')}</dt>
                      <dd>{drawnWith.style}</dd>
                    </>
                  )}
                  <dt>{t('Drawn by')}</dt>
                  <dd>{drawnWith.drawnBy}</dd>
                </>
              )}
              <dt>{t('When')}</dt>
              <dd>{timeAgo(open.drawnAt)}</dd>
            </dl>
          </div>
        </section>
      )}

      </div>

      <ConfirmDialog
        subject={removing?.filename ?? null}
        kind="remove"
        detail={removing === null ? undefined : <span>{t('The file is deleted from disk as well as from this list.')}</span>}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (removing === null) return;
          await deleteArtifact(removing.id);
          setRemoving(null);
          setImages((held) => held?.filter((one) => one.id !== removing.id) ?? held);
          setTotal((count) => Math.max(0, count - 1));
          back();
        }}
      />
    </AppShell>
  );
}
