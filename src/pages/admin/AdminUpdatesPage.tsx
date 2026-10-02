import { useCallback, useEffect, useRef, useState } from 'react';

import {
  activateImageRelease,
  activateServerRelease,
  fetchServerUpdates,
  installServerRelease,
  serverAnswers,
  uploadServerRelease,
} from '../../api/serverUpdates';
import type { ServerUpdates, StoredServerRelease } from '../../api/serverUpdates';
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
  | { kind: 'image'; version: string };

/**
 * Server updates, issue #584.
 *
 * Nothing here happens by itself: an administrator presses Update on a release
 * orknux.ai offers, uploads a jar, or goes back to one the database keeps. Each
 * one is checked against the release key the image carries, and every server
 * restarts on it - so after pressing, this page waits for the server to go and
 * come back, and reloads.
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
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    setError(null);
    fetchServerUpdates()
      .then(setUpdates)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : t('Could not read the updates.')));
  }, []);

  useEffect(load, [load]);

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
    const restarts =
      pending.kind === 'install'
        ? await installServerRelease(pending.version)
        : pending.kind === 'stored'
          ? await activateServerRelease(pending.release.id)
          : await activateImageRelease();
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
    setUploading(true);
    setUploadError(null);
    setUploaded(null);
    try {
      setUploaded(await uploadServerRelease(file));
      if (fileRef.current !== null) fileRef.current.value = '';
      load();
    } catch (cause: unknown) {
      setUploadError(cause instanceof Error ? cause.message : t('The jar could not be uploaded.'));
    } finally {
      setUploading(false);
    }
  }

  const subject =
    pending === null
      ? null
      : pending.kind === 'install'
        ? pending.version
        : pending.kind === 'stored'
          ? pending.release.version
          : tf("the image's own {version}", { version: pending.version });

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
                ? tf("Running {version}, the image's own jar.", { version: updates.runningVersion })
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

            <h2 className={styles.sectionHeading}>{t('From orknux.ai')}</h2>
            {updates.offeredError !== null ? (
              <p className={styles.error}>{updates.offeredError}</p>
            ) : !updates.offered ? (
              <p className={styles.notice}>{t('orknux.ai offers no server releases yet.')}</p>
            ) : updates.available.length === 0 ? (
              <p className={styles.notice}>{t('This is the newest release.')}</p>
            ) : (
              <ul className={styles.list}>
                {updates.available.map((offered) => (
                  <li key={offered.version} className={styles.offered} data-testid="offered-release">
                    <div className={styles.row}>
                      <span className={styles.version}>{offered.version}</span>
                      <span className={styles.meta}>{offered.publishedAt.slice(0, 10)}</span>
                      <button
                        type="button"
                        className={styles.primary}
                        onClick={() => setPending({ kind: 'install', version: offered.version })}
                      >
                        {t('Update')}
                      </button>
                    </div>
                    {offered.changelog.trim() !== '' && (
                      <div className={styles.changelog}>
                        <Markdown>{offered.changelog}</Markdown>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <h2 className={styles.sectionHeading}>{t('Upload a jar')}</h2>
            <div className={styles.row}>
              <input
                ref={fileRef}
                type="file"
                accept=".jar"
                className={styles.file}
                data-testid="release-file"
                disabled={uploading}
              />
              <button type="button" className={styles.secondary} onClick={() => void upload()} disabled={uploading}>
                {uploading ? t('Uploading…') : t('Upload')}
              </button>
            </div>
            {uploadError !== null && (
              <p className={styles.error} role="alert" data-testid="upload-error">
                {uploadError}
              </p>
            )}
            {uploaded !== null && (
              <p className={styles.notice} role="status">
                {tf('Stored {version}; start it below.', { version: uploaded })}
              </p>
            )}

            <h2 className={styles.sectionHeading}>
              {tf('Kept in the database (the last {count})', { count: updates.kept })}
            </h2>
            <ul className={styles.list} data-testid="stored-releases">
              {updates.stored.map((release) => (
                <li key={release.id} className={styles.stored} data-testid="stored-release">
                  <div className={styles.row}>
                    <span className={styles.version}>{release.version}</span>
                    <span className={styles.meta}>
                      {release.source === 'ORKNUX_AI' ? 'orknux.ai' : t('uploaded')} · {release.storedBy} ·{' '}
                      {release.storedAt.slice(0, 10)}
                    </span>
                    <span className={styles[`state${release.state}` as keyof typeof styles]}>{stateLabel(release)}</span>
                    {!release.running && (
                      <button
                        type="button"
                        className={styles.secondary}
                        disabled={!release.activatable}
                        title={release.refusal ?? undefined}
                        onClick={() => setPending({ kind: 'stored', release })}
                      >
                        {olderThan(release.version, updates.runningVersion) ? t('Roll back') : t('Re-apply')}
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
                    <span className={styles.meta}>{t("the image's own jar")}</span>
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
        kind={pending?.kind === 'install' ? 'updateServer' : 'switchServerRelease'}
        onClose={() => setPending(null)}
        onConfirm={confirm}
      />
    </AppShell>
  );
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
