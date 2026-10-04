import { useCallback, useEffect, useRef, useState } from 'react';

import {
  activateImageRelease,
  activateServerRelease,
  dismissServerReleaseDownload,
  removeServerRelease,
  fetchServerReleaseDownload,
  fetchServerUpdates,
  installServerRelease,
  installServerReleaseFromUrl,
  serverAnswers,
  serverReleasesAtUrl,
  uploadServerRelease,
} from '../../api/serverUpdates';
import type {
  ListedServerRelease,
  ServerReleaseDownload,
  ServerReleaseDownloadState,
  ServerUpdates,
  StoredServerRelease,
} from '../../api/serverUpdates';
import type { SessionUser } from '../../api/session';
import { AdminSidebar } from '../../components/AdminSidebar';
import { AppShell } from '../../components/AppShell';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Loader } from '../../components/Loader';
import { Markdown } from '../../components/Markdown';
import { shellUser } from '../../session/user';
import styles from './AdminUpdatesPage.module.css';
import { t, tf } from '../../i18n';

export interface AdminUpdatesPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

/** What pressing a button is about to do, held while the dialog asks. */
type Pending =
  | { kind: 'install'; version: string }
  | { kind: 'stored'; release: StoredServerRelease }
  | { kind: 'image'; version: string }
  | { kind: 'remove'; release: StoredServerRelease };

/**
 * Server updates, issue #584.
 *
 * Nothing here happens by itself: an administrator presses Update on a release
 * the official server offers, uploads a jar, fetches one from a URL (#589), or
 * goes back to one the database keeps. Each one is checked against the release
 * key the image carries, and every server restarts on it - so after pressing,
 * this page waits for the server to go and come back, and reloads. Each source
 * can be switched off by the installation, and then says so in one line.
 *
 * Update and Fetch download in the background (#602): the server answers at
 * once and writes where the download stands, and this page polls that - a bar
 * while bytes arrive, then the steps after it, then the reason if one failed.
 * Leaving the page and coming back finds the same download where it got to.
 */
export function AdminUpdatesPage({ session, onSignOut }: AdminUpdatesPageProps) {
  const [updates, setUpdates] = useState<ServerUpdates | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [restarting, setRestarting] = useState(false);
  const [storedOnly, setStoredOnly] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<string | null>(null);
  const [chosenName, setChosenName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  /** From a URL, #589. The credential lives in this field only and is cleared once used. */
  const [url, setUrl] = useState<string | null>(null);
  const [credential, setCredential] = useState('');
  const [fetching, setFetching] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [listed, setListed] = useState<ListedServerRelease[] | null>(null);
  /** The newest download nobody put away: under way, or how it ended. #602. */
  const [download, setDownload] = useState<ServerReleaseDownload | null>(null);
  /*
   * Which offered releases have their changes open, by version. Every one starts
   * closed, the newest included - a page that opens on a whole changelog pushes
   * Upload and the kept releases off the screen - and a version is opened by
   * clicking it. What somebody chose is remembered. Issue #1.
   */
  const [notesOpen, setNotesOpen] = useState<Record<string, boolean>>(readNotesOpen);

  const load = useCallback(() => {
    setError(null);
    fetchServerUpdates()
      .then(setUpdates)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : t('Could not read the updates.')));
    fetchServerReleaseDownload()
      .then(setDownload)
      .catch(() => undefined);
  }, []);

  useEffect(load, [load]);

  const downloading = download !== null && WORKING.includes(download.state);

  /*
   * While a download is under way, where it stands is asked for every second;
   * once it has ended the page is read again, so a release just stored appears
   * in the list below. A poll that fails - the server restarting, a proxy
   * hiccup - is simply asked again next time.
   */
  useEffect(() => {
    if (!downloading) return;
    let cancelled = false;
    const timer = window.setInterval(() => {
      void fetchServerReleaseDownload()
        .then((next) => {
          if (cancelled) return;
          setDownload(next);
          if (next === null || !WORKING.includes(next.state)) load();
        })
        .catch(() => undefined);
    }, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [downloading, load]);

  // An update that stored its release restarts the server, and the page waits that out as for any other.
  useEffect(() => {
    if (download?.state === 'RESTARTING') setRestarting(true);
  }, [download?.state]);

  // The configured source fills the field once, and whatever is typed after that stays.
  useEffect(() => {
    if (updates !== null && url === null) setUrl(updates.sourceUrl ?? '');
  }, [updates, url]);

  /*
   * Waiting out a restart: first for the server to go, then for it to answer
   * again, and then the page reloads - the interface it serves may be the new
   * release's. A server that never seems to go (a fast restart between two
   * polls) is waited for a while and then simply asked again.
   */
  useEffect(() => {
    if (!restarting) return;
    let cancelled = false;
    let wentAway = false;
    let polls = 0;
    const timer = window.setInterval(() => {
      void serverAnswers().then((answers) => {
        if (cancelled) return;
        polls += 1;
        if (!answers) wentAway = true;
        if (answers && (wentAway || polls > 30)) {
          cancelled = true;
          window.clearInterval(timer);
          window.location.reload();
        }
      });
    }, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [restarting]);

  async function confirm() {
    if (pending === null) return;
    if (pending.kind === 'remove') {
      try {
        await removeServerRelease(pending.release.id);
      } finally {
        setPending(null);
        load();
      }
      return;
    }
    if (pending.kind === 'install') {
      setDownload(await installServerRelease(pending.version));
      setPending(null);
      return;
    }
    const restarts =
      pending.kind === 'stored' ? await activateServerRelease(pending.release.id) : await activateImageRelease();
    setPending(null);
    if (restarts) {
      setRestarting(true);
    } else {
      setStoredOnly(true);
      load();
    }
  }

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (file === undefined || uploading) return;
    setUploadError(null);
    setUploaded(null);
    // Refused here rather than after sending a third of a gigabyte to be told the same.
    if (updates !== null && file.size > updates.maxMb * 1024 * 1024) {
      setUploadError(tf('That jar is larger than the {mb} MB this installation takes.', { mb: updates.maxMb }));
      return;
    }
    setUploading(true);
    try {
      setUploaded(await uploadServerRelease(file));
      if (fileRef.current !== null) fileRef.current.value = '';
      setChosenName(null);
      load();
    } catch (cause: unknown) {
      setUploadError(cause instanceof Error ? cause.message : t('The jar could not be uploaded.'));
    } finally {
      setUploading(false);
    }
  }

  async function fetchFromUrl(from: string) {
    if (fetching || from.trim() === '') return;
    setFetching(true);
    setUrlError(null);
    try {
      setDownload(await installServerReleaseFromUrl(from.trim(), credential));
      setCredential('');
      setListed(null);
    } catch (cause: unknown) {
      setUrlError(cause instanceof Error ? cause.message : t('Nothing could be fetched from that URL.'));
    } finally {
      setFetching(false);
    }
  }

  async function check() {
    if (fetching || url === null || url.trim() === '') return;
    setFetching(true);
    setUrlError(null);
    try {
      setListed(await serverReleasesAtUrl(url.trim(), credential));
    } catch (cause: unknown) {
      setListed(null);
      setUrlError(cause instanceof Error ? cause.message : t('Nothing could be fetched from that URL.'));
    } finally {
      setFetching(false);
    }
  }

  const subject =
    pending === null
      ? null
      : pending.kind === 'install'
        ? pending.version
        : pending.kind === 'stored' || pending.kind === 'remove'
          ? pending.release.version
          : tf('the image\'s own {version}', { version: pending.version });

  return (
    <AppShell
      user={shellUser(session)}
      showAdmin={session.admin}
      onSignOut={onSignOut}
      scrollContent
      sidebar={<AdminSidebar active="updates" />}
    >
      <section className={styles.card} data-testid="server-updates">
        <header className={styles.header}>
          <h1 className={styles.title}>{t('Updates')}</h1>
          {updates !== null && (
            <p className={styles.subtitle} data-testid="running-version">
              {updates.runningRelease === null
                ? tf('Running {version}, the image\'s own jar.', { version: updates.runningVersion })
                : tf('Running {version}, from a stored release.', { version: updates.runningVersion })}
            </p>
          )}
        </header>

        {error !== null && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {updates === null && error === null && (
          <p className={styles.notice}>
            <Loader />
          </p>
        )}

        {download !== null && updates !== null && (
          <DownloadPanel
            download={download}
            runningVersion={updates.runningVersion}
            onDismiss={() => {
              void dismissServerReleaseDownload(download.id)
                .then(() => setDownload(null))
                .catch(() => undefined);
            }}
          />
        )}

        {restarting && (
          <p className={styles.restarting} role="status" data-testid="restarting">
            {t('Restarting… the page reloads once the server answers.')}
          </p>
        )}
        {storedOnly && (
          <p className={styles.notice} role="status">
            {t('Chosen. This server was not started by the image, so restart it to run the release.')}
          </p>
        )}

        {updates !== null && !updates.enabled && (
          <p className={styles.notice} data-testid="updates-disabled">
            {t('Updates are turned off on this installation (ORKNUX_SELF_UPDATE).')}
          </p>
        )}

        {updates !== null && updates.enabled && !restarting && (
          <>
            {!updates.restartable && (
              <p className={styles.notice}>
                {t('This server was not started by the image; after an update, restart it yourself.')}
              </p>
            )}
            {updates.pin !== null && (
              <p
                className={updates.pinRefusal === null ? styles.notice : styles.error}
                data-testid="release-pin"
              >
                {updates.pinRefusal === null
                  ? tf('Pinned to {version} by ORKNUX_RELEASE_PIN; unset it to choose a release here.', {
                      version: updates.pin,
                    })
                  : tf('Pinned to {version} by ORKNUX_RELEASE_PIN, which cannot run: {why}. The jar in the image runs instead.', {
                      version: updates.pin,
                      why: updates.pinRefusal,
                    })}
              </p>
            )}

            <h2 className={styles.sectionHeading}>{t('From official server')}</h2>
            {!updates.officialEnabled ? (
              <p className={styles.notice} data-testid="official-off">
                {t('Turned off for this installation.')}
              </p>
            ) : updates.offeredError !== null ? (
              <p className={styles.error}>{updates.offeredError}</p>
            ) : !updates.offered ? (
              <p className={styles.notice}>{t('The official server offers no releases yet.')}</p>
            ) : updates.available.length === 0 ? (
              <p className={styles.notice}>{t('This is the newest release.')}</p>
            ) : (
              <ul className={styles.list}>
                {updates.available.map((offered) => {
                  const hasNotes = offered.changelog.trim() !== '';
                  const open = hasNotes && (notesOpen[offered.version] ?? false);
                  const notesId = `release-notes-${offered.version}`;
                  return (
                  <li key={offered.version} className={styles.offered} data-testid="offered-release">
                    <div className={styles.row}>
                      {hasNotes ? (
                        <button
                          type="button"
                          className={styles.toggle}
                          aria-expanded={open}
                          aria-controls={notesId}
                          title={open ? t('Hide the changes') : t('Show the changes')}
                          data-testid="offered-release-toggle"
                          onClick={() => {
                            const next = { ...notesOpen, [offered.version]: !open };
                            setNotesOpen(next);
                            writeNotesOpen(next);
                          }}
                        >
                          <span className={styles.chevron} aria-hidden="true">{open ? '▾' : '▸'}</span>
                          <span className={styles.version}>{offered.version}</span>
                        </button>
                      ) : (
                        <span className={styles.version}>{offered.version}</span>
                      )}
                      <span className={styles.meta}>{offered.publishedAt.slice(0, 10)}</span>
                      <button
                        type="button"
                        className={styles.primary}
                        disabled={downloading}
                        onClick={() => setPending({ kind: 'install', version: offered.version })}
                      >
                        {t('Update')}
                      </button>
                    </div>
                    {open && (
                      <div className={styles.changelog} id={notesId} data-testid="offered-release-notes">
                        <Markdown>{offered.changelog}</Markdown>
                      </div>
                    )}
                  </li>
                  );
                })}
              </ul>
            )}

            <h2 className={styles.sectionHeading}>{t('Upload a jar')}</h2>
            {!updates.uploadEnabled ? (
              <p className={styles.notice} data-testid="upload-off">
                {t('Turned off for this installation.')}
              </p>
            ) : (
              <div className={styles.row}>
                {/*
                 * The real input is hidden and driven by the button beside it, as on
                 * Libraries and Plugins: a native file input draws in the browser's
                 * own grey whatever the theme says.
                 */}
                <input
                  ref={fileRef}
                  type="file"
                  accept=".jar"
                  className={styles.picker}
                  data-testid="release-file"
                  disabled={uploading}
                  onChange={(event) => {
                    setChosenName(event.target.files?.[0]?.name ?? null);
                    setUploadError(null);
                    setUploaded(null);
                  }}
                />
                <button
                  type="button"
                  className={styles.secondary}
                  data-testid="release-choose"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  {t('Choose a jar')}
                </button>
                {chosenName !== null && (
                  <span className={styles.chosen} data-testid="release-chosen">
                    {chosenName}
                  </span>
                )}
                <button
                  type="button"
                  className={styles.primary}
                  onClick={() => void upload()}
                  disabled={uploading || chosenName === null}
                >
                  {uploading ? t('Uploading…') : t('Upload')}
                </button>
              </div>
            )}
            {uploadError !== null && (
              <p className={styles.error} role="alert" data-testid="upload-error">
                {uploadError}
              </p>
            )}
            {uploaded !== null && (
              <p className={styles.notice} role="status">
                {tf('Stored {version}; press Update beside it below to run it.', { version: uploaded })}
              </p>
            )}

            <h2 className={styles.sectionHeading}>{t('From a URL')}</h2>
            {!updates.urlEnabled ? (
              <p className={styles.notice} data-testid="url-off">
                {t('Turned off for this installation.')}
              </p>
            ) : (
              <form
                className={styles.row}
                data-testid="release-url-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void fetchFromUrl(url ?? '');
                }}
              >
                <input
                  type="url"
                  className={styles.field}
                  data-testid="release-url"
                  aria-label={t('URL of a server jar, or of a directory holding releases.json')}
                  placeholder="https://artifactory.example.com/orknux/orknux-server.jar"
                  value={url ?? ''}
                  onChange={(event) => {
                    setUrl(event.target.value);
                    setListed(null);
                  }}
                  disabled={fetching}
                />
                <input
                  type="password"
                  className={styles.credential}
                  data-testid="release-credential"
                  aria-label={t('Credential for that URL: a token, or user:password')}
                  placeholder={t('Token or user:password')}
                  autoComplete="new-password"
                  value={credential}
                  onChange={(event) => setCredential(event.target.value)}
                  disabled={fetching}
                />
                {(url ?? '').trim().endsWith('/') ? (
                  <button type="button" className={styles.primary} disabled={fetching} onClick={() => void check()}>
                    {fetching ? t('Checking…') : t('Check')}
                  </button>
                ) : (
                  <button
                    type="submit"
                    className={styles.primary}
                    disabled={fetching || downloading || (url ?? '').trim() === ''}
                  >
                    {fetching ? t('Fetching…') : t('Fetch')}
                  </button>
                )}
              </form>
            )}
            {urlError !== null && (
              <p className={styles.error} role="alert" data-testid="url-error">
                {urlError}
              </p>
            )}
            {listed !== null &&
              (listed.length === 0 ? (
                <p className={styles.notice} role="status">
                  {t('It lists nothing newer than what runs.')}
                </p>
              ) : (
                <ul className={styles.list} data-testid="listed-releases">
                  {listed.map((one) => (
                    <li key={one.jarUrl} className={styles.offered}>
                      <div className={styles.row}>
                        <span className={styles.version}>{one.version}</span>
                        <span className={styles.meta}>{one.stored ? t('already kept') : ''}</span>
                        <button
                          type="button"
                          className={styles.secondary}
                          disabled={fetching || downloading || one.stored}
                          onClick={() => void fetchFromUrl(one.jarUrl)}
                        >
                          {t('Fetch')}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ))}

            <h2 className={styles.sectionHeading}>
              {tf('Kept in the database (the last {count})', { count: updates.kept })}
            </h2>
            <ul className={styles.list} data-testid="stored-releases">
              {updates.stored.map((release) => (
                <li key={release.id} className={styles.stored} data-testid="stored-release">
                  <div className={styles.row}>
                    <span className={styles.version}>{release.version}</span>
                    <span className={styles.meta}>
                      {sourceLabel(release)} · {release.storedBy} ·{' '}
                      {release.storedAt.slice(0, 10)}
                    </span>
                    <span className={styles[`state${release.state}` as keyof typeof styles]}>{stateLabel(release)}</span>
                    {!release.running && (
                      <button
                        type="button"
                        // Going forward is the action this row is for; rolling back and re-applying stay quiet.
                        className={
                          olderThan(updates.runningVersion, release.version) ? styles.primary : styles.secondary
                        }
                        disabled={!release.activatable}
                        title={release.refusal ?? undefined}
                        onClick={() => setPending({ kind: 'stored', release })}
                      >
                        {olderThan(release.version, updates.runningVersion)
                          ? t('Roll back')
                          : olderThan(updates.runningVersion, release.version) ? t('Update') : t('Re-apply')}
                      </button>
                    )}
                    {/*
                      Not for the one running or chosen: removing it would leave
                      a start loop choosing a jar that is gone. The server
                      refuses the fallback too, and says so if pressed.
                    */}
                    {!release.running && release.state !== 'ACTIVE' && release.state !== 'ACTIVATING' && (
                      <button
                        type="button"
                        className={styles.secondary}
                        onClick={() => setPending({ kind: 'remove', release })}
                        aria-label={tf('Remove {version}', { version: release.version })}
                      >
                        {t('Remove')}
                      </button>
                    )}
                  </div>
                  {release.state === 'FAILED' && release.failure !== null && (
                    <p className={styles.error}>{release.failure}</p>
                  )}
                  {!release.running && release.refusal !== null && (
                    <p className={styles.reason}>{release.refusal}</p>
                  )}
                </li>
              ))}
              {updates.stored.length === 0 && <li className={styles.notice}>{t('No release is kept yet.')}</li>}
              {updates.runningRelease !== null && (
                <li className={styles.stored} data-testid="image-release">
                  <div className={styles.row}>
                    <span className={styles.version}>{updates.imageVersion}</span>
                    <span className={styles.meta}>{t('the image\'s own jar')}</span>
                    <button
                      type="button"
                      className={styles.secondary}
                      disabled={!updates.imageActivatable}
                      title={updates.imageRefusal ?? undefined}
                      onClick={() => setPending({ kind: 'image', version: updates.imageVersion })}
                    >
                      {t('Roll back')}
                    </button>
                  </div>
                  {updates.imageRefusal !== null && <p className={styles.reason}>{updates.imageRefusal}</p>}
                </li>
              )}
            </ul>
          </>
        )}
      </section>

      <ConfirmDialog
        subject={subject}
        kind={
          pending?.kind === 'install'
            ? 'updateServer'
            : pending?.kind === 'remove' ? 'removeServerRelease' : 'switchServerRelease'
        }
        onClose={() => setPending(null)}
        onConfirm={confirm}
      />
    </AppShell>
  );
}

/** The states a download is still being worked on in, which the page polls through. */
const WORKING: ServerReleaseDownloadState[] = ['DOWNLOADING', 'WAITING', 'VERIFYING', 'STORING'];

/** The steps of an update, or of a fetch, in the order they happen. */
type Step = 'download' | 'verify' | 'store' | 'restart' | 'end';

function stepOf(state: ServerReleaseDownloadState): Step {
  switch (state) {
    case 'DOWNLOADING':
    case 'WAITING':
      return 'download';
    case 'VERIFYING':
      return 'verify';
    case 'STORING':
      return 'store';
    case 'RESTARTING':
      return 'restart';
    default:
      return 'end';
  }
}

/**
 * A release on its way in, #602: the steps it goes through, a bar of bytes of
 * total and the speed while it downloads, and how it ended - back on the
 * version it went for, stored, or the reason it was given up on.
 */
function DownloadPanel({
  download,
  runningVersion,
  onDismiss,
}: {
  download: ServerReleaseDownload;
  runningVersion: string;
  onDismiss: () => void;
}) {
  const version = download.version ?? t('a jar');
  const failed = download.state === 'FAILED';
  const ended = download.state === 'DONE' || failed;
  const back = download.activate && download.state === 'DONE' && download.version === runningVersion;

  /*
   * Where it failed is the step it had reached; the row does not say, so it is
   * read off what was done: nothing stored and bytes short of the total is the
   * download, a whole jar is a check or the store.
   */
  const reached: Step = failed
    ? download.releaseId !== null
      ? 'restart'
      : download.total !== null && download.received >= download.total
        ? 'verify'
        : 'download'
    : stepOf(download.state);

  const order: Step[] = download.activate
    ? ['download', 'verify', 'store', 'restart', 'end']
    : ['download', 'verify', 'store', 'end'];
  const labels: Record<Step, string> = {
    download: t('Downloading'),
    verify: t('Verifying'),
    store: t('Storing'),
    restart: t('Restarting'),
    end: download.activate
      ? tf('Back on {version}', { version })
      : t('Stored'),
  };
  const at = order.indexOf(reached);

  const fraction =
    download.total !== null && download.total > 0 ? Math.min(1, download.received / download.total) : null;

  return (
    <div className={styles.download} data-testid="release-download" data-state={download.state}>
      <p className={styles.downloadTitle}>
        {download.activate
          ? tf('Updating to {version} from {host}', { version, host: download.host })
          : tf('Fetching {version} from {host}', { version, host: download.host })}
      </p>
      <ol className={styles.steps} data-testid="download-steps">
        {order.map((step, index) => {
          const state =
            failed && index === at
              ? 'failed'
              : index < at || (step === 'end' && download.state === 'DONE' && (back || !download.activate))
                ? 'done'
                : index === at && !ended
                  ? 'current'
                  : 'pending';
          return (
            <li key={step} className={styles.step} data-step={step} data-state={state}>
              {labels[step]}
            </li>
          );
        })}
      </ol>

      {(download.state === 'DOWNLOADING' || download.state === 'WAITING') && (
        <>
          <div
            className={styles.bar}
            data-testid="download-bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={download.total ?? undefined}
            aria-valuenow={download.received}
          >
            <div
              className={styles.fill}
              data-testid="download-fill"
              style={{ width: `${((fraction ?? 0) * 100).toFixed(2)}%` }}
            />
          </div>
          <p className={styles.progress} data-testid="download-progress">
            {download.total !== null
              ? tf('{received} of {total}', { received: bytes(download.received), total: bytes(download.total) })
              : tf('{received} so far', { received: bytes(download.received) })}
            {download.state === 'DOWNLOADING' && ` · ${bytes(download.bytesPerSecond)}/s`}
          </p>
          {download.state === 'WAITING' && (
            <p className={styles.reason} data-testid="download-waiting">
              {tf('The connection broke ({why}); it goes on from {received} shortly.', {
                why: download.lastError ?? t('no reason given'),
                received: bytes(download.received),
              })}
            </p>
          )}
        </>
      )}

      {failed && (
        <p className={styles.error} role="alert" data-testid="download-failure">
          {download.failure ?? t('It was given up on, and no reason was recorded.')}
        </p>
      )}
      {download.state === 'DONE' && (
        <p className={styles.notice} role="status" data-testid="download-done">
          {back
            ? tf('Back on {version}.', { version })
            : download.activate
              ? t('Chosen. This server was not started by the image, so restart it to run the release.')
              : tf('Stored {version}; press Update beside it below to run it.', { version })}
        </p>
      )}
      {ended && (
        <div className={styles.row}>
          <button type="button" className={styles.secondary} onClick={onDismiss} data-testid="download-dismiss">
            {t('Dismiss')}
          </button>
        </div>
      )}
    </div>
  );
}

/** Bytes as a person reads them: 348.2 MB, not 365112832. */
function bytes(count: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = count;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

/** Where a kept release came from, in a word or a host. */
function sourceLabel(release: StoredServerRelease): string {
  switch (release.source) {
    case 'ORKNUX_AI':
      return t('official server');
    case 'URL':
      try {
        return release.sourceUrl === null ? t('from a URL') : new URL(release.sourceUrl).host;
      } catch {
        return t('from a URL');
      }
    default:
      return t('uploaded');
  }
}

function stateLabel(release: StoredServerRelease): string {
  if (release.running) return t('running');
  switch (release.state) {
    case 'ACTIVATING':
      return t('starting');
    case 'ACTIVE':
      return t('chosen');
    case 'FAILED':
      return t('failed');
    default:
      return t('kept');
  }
}

/** Whether [version] is an older release than [than], positionally: 0.9.9.7 before 1.0. */
function olderThan(version: string, than: string): boolean {
  const parts = (text: string) => text.split('-')[0].split('.').map((part) => Number(part) || 0);
  const a = parts(version);
  const b = parts(than);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const difference = (a[i] ?? 0) - (b[i] ?? 0);
    if (difference !== 0) return difference < 0;
  }
  return false;
}

/*
 * Which releases somebody opened or closed, kept in this browser only: it is a
 * way of reading the page, not a setting, and losing it costs one click.
 */
const NOTES_KEY = 'orknux.updates.notesOpen';

function readNotesOpen(): Record<string, boolean> {
  try {
    const kept = window.localStorage.getItem(NOTES_KEY);
    const parsed: unknown = kept === null ? null : JSON.parse(kept);
    return parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function writeNotesOpen(open: Record<string, boolean>) {
  try {
    window.localStorage.setItem(NOTES_KEY, JSON.stringify(open));
  } catch {
    // Storage refused (a private window): the choice lasts until the page is left.
  }
}
