import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import type { PageOf } from '../../api/client';
import { deleteArtifact, fetchWorkspaceArtifacts } from '../../api/artifacts';
import type { Artifact } from '../../api/artifacts';
import type { SessionUser } from '../../api/session';
import downloadIcon from '../../assets/download.svg';
import { timeAgo } from '../../api/tools';
import { AppShell } from '../../components/AppShell';
import { CompactPagination } from '../../components/CompactPagination';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ImageZoom } from '../../components/ImageZoom';
import type { Picture } from '../../components/ImageZoom';
import { Loader } from '../../components/Loader';
import { SearchBox, SearchRow } from '../../components/SearchBox';
import { TrashIcon } from '../../components/TrashIcon';
import { WorkspaceSidebar } from '../../components/WorkspaceSidebar';
import { PAGE_SIZES, usePageSize } from '../../components/pageSize';
import { usePageWithin } from '../../components/pageWithin';
import { shellUser } from '../../session/user';
import table from './CatalogueTable.module.css';
import styles from './WorkspaceArtifactsPage.module.css';
import { t } from '../../i18n';

export interface WorkspaceArtifactsPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

/**
 * What a size is, in the units somebody reads rather than the one it is stored in.
 *
 * Binary rather than decimal, because these are files on a disk and the disk
 * will be reporting the same number back.
 */
function readableSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let size = bytes / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size < 10 ? size.toFixed(1) : Math.round(size)} ${units[unit]}`;
}

/**
 * Everything this workspace's runs have produced.
 *
 * A gallery rather than the table every other catalogue here uses, because what
 * is on it is pictures: a row of filenames answers "how many" and "how big",
 * and nothing at all about which one somebody is looking for. The thumbnail is
 * the identifying thing, so it is what the page is made of - the prompt under
 * it, and the two things wanted from a file being looked at beside that.
 *
 * Not a run's own view of its pictures, which stays where it is: that one
 * answers "what did this run draw", and this one answers "what is in here" -
 * across both the runs' pictures and the tasks', including everything drawn by
 * runs and tasks nobody remembers.
 */
/** What the gallery can draw as a picture, which is what the server shows inline. */
function drawable(contentType: string): boolean {
  const type = contentType.toLowerCase().split(';')[0].trim();
  return ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp'].includes(type);
}

/** A glyph standing in for the thing, where there is no thumbnail to draw. */
function markFor(contentType: string): string {
  const type = contentType.toLowerCase().split(';')[0].trim();
  if (type === 'application/pdf') return '📕';
  if (type === 'text/html') return '🌐';
  if (type.startsWith('text/')) return '📄';
  if (type.startsWith('audio/')) return '🎵';
  if (type.startsWith('video/')) return '🎞️';
  if (type === 'image/svg+xml') return '🖊️';
  return '📦';
}

/**
 * What to call it in three or four characters.
 *
 * The extension where the name has one, because that is what somebody
 * recognises - `report.html` is an HTML file whatever its content type says -
 * and the type's own subtype otherwise.
 */
function kindOf(filename: string, contentType: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot > 0 && dot < filename.length - 1) return filename.slice(dot + 1).toUpperCase().slice(0, 5);
  const type = contentType.toLowerCase().split(';')[0].trim();
  return (type.split('/')[1] ?? 'file').toUpperCase().slice(0, 5);
}

export function WorkspaceArtifactsPage({ session, onSignOut }: WorkspaceArtifactsPageProps) {
  const { workspaceId = '' } = useParams();

  const [artifacts, setArtifacts] = useState<PageOf<Artifact> | null>(null);
  const [page, setPage] = usePageWithin(workspaceId);
  const [pageSize, setPageSize] = usePageSize('artifacts');
  const [error, setError] = useState<string | null>(null);
  /** Which artifact is open over the page at full size, or null while none is. */
  const [zoomed, setZoomed] = useState<Picture | null>(null);
  /** Which one a delete has been asked about, held until it is confirmed. */
  const [removing, setRemoving] = useState<Artifact | null>(null);
  /**
   * What is being typed, and what has actually been asked for.
   *
   * Two, because the ask is a round trip: sending one per keystroke would be a
   * query per letter and a list that flickers behind the typing. `hunting` is
   * what the box shows; `asked` is what the server was told, a short pause
   * after the typing stops.
   */
  const [hunting, setHunting] = useState('');
  const [asked, setAsked] = useState('');

  useEffect(() => {
    const waiting = setTimeout(() => setAsked(hunting), 300);
    return () => clearTimeout(waiting);
  }, [hunting]);

  // A new search is a new list, so it starts at its first page rather than at
  // page four of the previous one.
  useEffect(() => setPage(1), [asked]);

  const load = useCallback(() => {
    if (workspaceId === '') return;
    setError(null);
    fetchWorkspaceArtifacts(workspaceId, page - 1, pageSize, asked)
      .then(setArtifacts)
      .catch((cause: unknown) => {
        setArtifacts(null);
        setError(cause instanceof Error ? cause.message : t('Could not load the artifacts.'));
      });
  }, [workspaceId, page, pageSize, asked]);

  useEffect(load, [load]);

  /*
   * Back a page when the last thing on this one goes.
   *
   * Deleting the only artifact on page three leaves somebody looking at an
   * empty grid that says there are none, on a page that no longer exists.
   */
  async function remove(artifact: Artifact) {
    await deleteArtifact(artifact.id);
    if (artifacts?.content.length === 1 && page > 1) setPage(page - 1);
    else load();
  }

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
          <h1 className={table.title}>{t('Artifacts')}</h1>
          <p className={table.subtitle}>{t('Every artifact this workspace has produced.')}</p>
        </div>
      </header>

      <SearchRow>
        <SearchBox
          value={hunting}
          onChange={setHunting}
          placeholder={t('Search artifacts...')}
          label={t('Search artifacts')}
        />
      </SearchRow>

      {error !== null && (
        <p className={table.pageError} role="alert">
          {error}
        </p>
      )}

      <section className={table.card}>
        {artifacts === null && error === null && (
          <p className={table.notice}>
            <Loader />
          </p>
        )}

        {artifacts?.content.length === 0 && (
          <p className={table.notice}>
            {/* Which of the two empties this is: nothing here at all, or
                nothing matching - they are different problems and the second
                one has an obvious way out. */}
            {asked === ''
              ? t('Nothing yet. A workflow with an image node fills this as it runs.')
              : t('No artifact matches what you typed.')}
          </p>
        )}

        {artifacts !== null && artifacts.content.length > 0 && (
          <div className={styles.gallery}>
            {artifacts.content.map((artifact) => (
              <figure key={artifact.id} className={styles.card}>
                {/*
                  A picture opens at full size, here, in the viewer a picture
                  in a chat and a picture on a run both answer to.

                  Anything else opens in a tab, because that is where a browser
                  reads a document - and drawing one as an `<img>` was drawing
                  the broken-image icon, which says "this file is gone" about a
                  file that is perfectly fine. The server serves a document
                  sandboxed, so a page an agent wrote cannot reach anything of
                  ours; see `AttachmentDownloads`.
                */}
                {drawable(artifact.contentType) ? (
                  <button
                    type="button"
                    className={styles.thumb}
                    onClick={() => setZoomed({ src: artifact.url, alt: artifact.prompt })}
                    aria-label={t('Open this picture larger')}
                    title={t('Click to open this picture larger')}
                  >
                    {/* A row whose bytes have been swept draws the broken-image
                        icon, which is what says the file is gone. */}
                    <img src={artifact.url} alt={artifact.prompt} className={styles.image} loading="lazy" />
                  </button>
                ) : artifact.previewUrl !== null ? (
                  <a
                    className={`${styles.thumb} ${styles.document}`}
                    // The reading address, not the file's own. An artifact's
                    // url hands the bytes over whatever they are, so a link
                    // somebody copies and sends is a download; this one is the
                    // server rendering something deliberately, at an address
                    // that says so.
                    href={artifact.previewUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    title={t('Open this in a new tab')}
                  >
                    <span className={styles.documentMark} aria-hidden="true">
                      {markFor(artifact.contentType)}
                    </span>
                    <span className={styles.documentKind}>{kindOf(artifact.filename, artifact.contentType)}</span>
                  </a>
                ) : (
                  /*
                    A file nothing renders: the same tile, saying what it is,
                    and no way in. A link that downloads from a place that
                    looks like it opens is worse than no link - the row's own
                    download button is right there and says what it does.
                  */
                  <span className={`${styles.thumb} ${styles.document} ${styles.unopenable}`}>
                    <span className={styles.documentMark} aria-hidden="true">
                      {markFor(artifact.contentType)}
                    </span>
                    <span className={styles.documentKind}>{kindOf(artifact.filename, artifact.contentType)}</span>
                  </span>
                )}

                <figcaption className={styles.caption}>
                  <span className={styles.prompt} title={artifact.prompt}>
                    {artifact.prompt}
                  </span>
                  <span className={styles.facts}>
                    {/*
                      Where it came from, as a link: the run or the task is the
                      context for why this picture exists, and without it a
                      thumbnail is a file with no history. The server names it
                      and gives the rest of the address, so the page does not
                      hold a second copy of which kinds there are.
                    */}
                    {artifact.sourcePath === '' ? (
                      // A file an agent saved has no run and no task behind
                      // it, so its origin is named and not linked: a link to
                      // the workspace's front page would be a link that looks
                      // like it goes where the file came from and does not.
                      <span>{artifact.source}</span>
                    ) : (
                      <Link
                        className={styles.runLink}
                        to={`/workspace/${workspaceId}/${artifact.sourcePath}`}
                      >
                        {artifact.source}
                      </Link>
                    )}
                    <span className={styles.dot}>·</span>
                    {readableSize(artifact.sizeBytes)}
                    <span className={styles.dot}>·</span>
                    {timeAgo(artifact.drawnAt)}
                  </span>
                </figcaption>

                <div className={styles.actions}>
                  {/*
                    Two icons rather than a word and an icon.

                    A card is 220px wide and the row held "Download" beside a
                    trash can - a pill and a square, which read as two
                    different kinds of control and never lined up however
                    their padding was set. As a pair of squares they are
                    obviously the two things you can do to the file.
                  */}
                  <a
                    className={styles.action}
                    href={artifact.url}
                    download={artifact.filename}
                    aria-label={`Download ${artifact.filename}`}
                    title={t('Download this artifact')}
                  >
                    <img src={downloadIcon} alt="" width={14} height={14} />
                  </a>
                  <button
                    type="button"
                    className={`${styles.action} ${styles.remove}`}
                    onClick={() => setRemoving(artifact)}
                    aria-label={`Delete ${artifact.filename}`}
                    title={t('Delete this artifact')}
                  >
                    <TrashIcon />
                  </button>
                </div>
              </figure>
            ))}
          </div>
        )}

        {/*
          Shown whenever there is anything, not only when there is more than
          one page.

          It carries the page-size control as well as the page numbers, and
          gating it on `totalPages > 1` meant choosing a size large enough to
          fit everything removed the control that had just been used - the
          setting was gone and there was no way back to it.
        */}
        {artifacts !== null && artifacts.totalElements > 0 && (
          <CompactPagination
            page={page}
            pageSize={pageSize}
            totalItems={artifacts.totalElements}
            unit={t('artifacts')}
            onPageChange={setPage}
            pageSizes={PAGE_SIZES}
            onPageSizeChange={setPageSize}
          />
        )}
      </section>

      <ImageZoom picture={zoomed} onClose={() => setZoomed(null)} />

      <ConfirmDialog
        subject={removing?.filename ?? null}
        kind="remove"
        detail={
          removing === null ? undefined : (
            <span>{t('The file is deleted from disk as well as from this list.')}</span>
          )
        }
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (removing !== null) await remove(removing);
          setRemoving(null);
        }}
      />
    </AppShell>
  );
}
